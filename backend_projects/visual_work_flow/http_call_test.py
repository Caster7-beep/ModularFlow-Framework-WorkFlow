# -*- coding: utf-8 -*-
"""
一键 HTTP 连通性验证脚本（自动启动网关并调用 /api/v1/api/call）

用途：
- 自动化执行“HTTP 连通性验证（/api/v1/api/call）”，尽量减少手工操作
- 脚本可从任意工作目录运行，自动定位仓库根路径、切换 VisualWorkFlow 项目、后台启动 API 网关、注入 Gemini API 配置，并调用 POST /api/v1/api/call
- 最终“仅打印 response.content”作为最后一行，方便上层采集

运行方式（PowerShell 7 示例）：
- $env:GEMINI_API_KEY="YOUR_KEY"
- python backend_projects/visual_work_flow/http_call_test.py
- 指定端口：python backend_projects/visual_work_flow/http_call_test.py --port 9000

可选参数：
- --port  指定 API 网关端口（默认 6502）
"""

import os
import sys
import json
import time
import argparse
import traceback
import socket
from pathlib import Path
from typing import Any, Dict, Optional, List

# 尝试延迟导入第三方 requests（可选），不可用则回退到标准库 urllib
def _try_import_requests():
    try:
        import requests  # type: ignore
        return requests
    except Exception:
        return None

def _http_get_json(url: str, timeout: float = 5.0) -> Dict[str, Any]:
    """
    GET JSON，优先使用 requests（如可用），否则使用 urllib
    返回：{"ok": bool, "status": int, "json": dict or None, "text": str}
    """
    req = _try_import_requests()
    if req is not None:
        try:
            resp = req.get(url, timeout=timeout)
            text = resp.text or ""
            try:
                data = resp.json()
            except Exception:
                data = None
            return {"ok": resp.ok, "status": resp.status_code, "json": data, "text": text}
        except Exception as e:
            return {"ok": False, "status": 0, "json": None, "text": str(e)}
    else:
        # urllib 回退
        try:
            from urllib.request import urlopen, Request
            req_obj = Request(url, method="GET")
            with urlopen(req_obj, timeout=timeout) as r:  # type: ignore
                raw = r.read()
                text = raw.decode("utf-8", errors="ignore")
                try:
                    data = json.loads(text)
                except Exception:
                    data = None
                return {"ok": True, "status": getattr(r, "status", 200), "json": data, "text": text}
        except Exception as e:
            # 尝试从 HTTPError 中读取返回体
            try:
                from urllib.error import HTTPError  # type: ignore
                if isinstance(e, HTTPError):
                    body = (e.read() or b"").decode("utf-8", errors="ignore")
                    try:
                        data = json.loads(body)
                    except Exception:
                        data = None
                    return {"ok": False, "status": e.code, "json": data, "text": body}
            except Exception:
                pass
            return {"ok": False, "status": 0, "json": None, "text": str(e)}

def _http_post_json(url: str, payload: Dict[str, Any], timeout: float = 20.0) -> Dict[str, Any]:
    """
    POST JSON，优先使用 requests（如可用），否则使用 urllib
    返回：{"ok": bool, "status": int, "json": dict or None, "text": str}
    """
    req = _try_import_requests()
    if req is not None:
        try:
            resp = req.post(url, json=payload, timeout=timeout)
            text = resp.text or ""
            try:
                data = resp.json()
            except Exception:
                data = None
            return {"ok": resp.ok, "status": resp.status_code, "json": data, "text": text}
        except Exception as e:
            return {"ok": False, "status": 0, "json": None, "text": str(e)}
    else:
        # urllib 回退
        try:
            from urllib.request import Request, urlopen
            import ssl
            data_bytes = json.dumps(payload).encode("utf-8")
            req_obj = Request(url, data=data_bytes, method="POST")
            req_obj.add_header("Content-Type", "application/json")
            # 允许默认 SSL 上下文
            ctx = ssl.create_default_context()
            with urlopen(req_obj, timeout=timeout, context=ctx) as r:  # type: ignore
                raw = r.read()
                text = raw.decode("utf-8", errors="ignore")
                try:
                    data = json.loads(text)
                except Exception:
                    data = None
                return {"ok": True, "status": getattr(r, "status", 200), "json": data, "text": text}
        except Exception as e:
            # 捕获 HTTPError 并提取返回体
            try:
                from urllib.error import HTTPError  # type: ignore
                if isinstance(e, HTTPError):
                    body = (e.read() or b"").decode("utf-8", errors="ignore")
                    try:
                        data = json.loads(body)
                    except Exception:
                        data = None
                    return {"ok": False, "status": e.code, "json": data, "text": body}
            except Exception:
                pass
            return {"ok": False, "status": 0, "json": None, "text": str(e)}

def _safe_get(d: Optional[Dict[str, Any]], path: List[str], default: Any = None) -> Any:
    cur = d or {}
    try:
        for key in path:
            if cur is None:
                return default
            cur = cur.get(key) if isinstance(cur, dict) else None
        return cur if cur is not None else default
    except Exception:
        return default

def _is_port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except Exception:
        return False

def _wait_for_health(port: int, timeout_secs: float = 15.0) -> bool:
    """
    轮询健康检查直到 healthy 或超时
    优先 /api/v1/health，回退 /health
    """
    start = time.time()
    primary = f"http://localhost:{port}/api/v1/health"
    fallback = f"http://localhost:{port}/health"
    while time.time() - start < timeout_secs:
        for url in (primary, fallback):
            res = _http_get_json(url, timeout=2.5)
            data = res.get("json") or {}
            status = (data.get("status") or "").lower()
            if status == "healthy":
                return True
        time.sleep(0.5)
    return False

def _build_project_config(port: int) -> Dict[str, Any]:
    # 与 backend_projects/visual_work_flow/startserver.py 一致的最小配置
    return {
        "project": {
            "name": "VisualWorkFlow",
            "display_name": "Visual WorkFlow",
            "version": "1.0.0",
            "description": "Visual WorkFlow API Server",
        },
        "backend": {
            "api_gateway": {
                "enabled": True,
                "port": int(port),
                "cors_origins": ["http://localhost:3002"],
            },
            "websocket": {"enabled": True, "path": "/ws"},
        },
    }

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="一键 HTTP 连通性验证（自动启动网关并调用 /api/v1/api/call）")
    parser.add_argument(
        "--port",
        type=int,
        default=6502,
        help="API 网关端口（默认 6502）",
    )
    return parser.parse_args()

def main():
    try:
        # 1) 注入根路径并切换 CWD
        script_path = Path(__file__).resolve()
        root = script_path.parents[2]
        if str(root) not in sys.path:
            sys.path.insert(0, str(root))
        os.chdir(str(root))
        print(f"[boot] Root: {root}")
        print(f"[boot] CWD : {Path.cwd()}")

        # 2) 延后导入框架（此时才导入）
        from core.services import register_project, switch_project, get_service_manager, get_current_globals  # noqa: E402
        from modules.api_gateway_module import get_api_gateway  # noqa: E402
        import modules.visual_workflow_module.visual_workflow_module as vwm  # noqa: F401, E402
        import modules.visual_workflow_module.optimized_visual_workflow_module as ovwm  # noqa: F401, E402
        import modules.visual_workflow_module.llm_api_bridge as llm_bridge  # noqa: F401, E402

        # 3) 解析参数
        args = parse_args()
        port = int(args.port) if args.port else 6502

        # 4) 确保并切换项目 VisualWorkFlow
        sm = get_service_manager()
        projects = sm.list_projects()
        if "VisualWorkFlow" not in projects:
            ok = register_project(
                name="VisualWorkFlow",
                namespace="VisualWorkFlow",
                shared_path="shared/VisualWorkFlow",
                modules_path="modules",
            )
            if not ok:
                # 可能已存在，继续尝试切换
                pass
        switched = switch_project("VisualWorkFlow")
        if not switched:
            print("[error] Failed to switch to project 'VisualWorkFlow'")
            sys.exit(1)

        # 5) 从环境读取 Gemini 配置（密钥必需）
        gemini_api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
        base_url = (os.getenv("GEMINI_BASE_URL") or "").strip() or "https://generativelanguage.googleapis.com/v1beta"
        models_env = (os.getenv("GEMINI_MODELS") or "").strip() or "gemini-2.5-flash"
        models_list = [m.strip() for m in models_env.split(",") if m.strip()]

        if not gemini_api_key:
            print("错误：未检测到 GEMINI_API_KEY 环境变量。请在运行前设置有效的 Gemini API 密钥。")
            sys.exit(2)

        # 6) 注入 g.api_providers 并激活 provider
        g = get_current_globals()
        if g is None:
            print("错误：无法获取当前项目 globals。")
            sys.exit(3)

        if not hasattr(g, "api_providers") or not isinstance(getattr(g, "api_providers"), dict):
            g.api_providers = {}

        cfg = {
            "api_key": gemini_api_key,  # 注意：不回显
            "base_url": base_url,
            "models": models_list,
            "enable_api_key": True,
            "enabled": True,
        }
        # 标题式与小写别名同时注入
        g.api_providers["Gemini"] = cfg
        g.api_providers["gemini"] = cfg
        g.active_api_provider = "gemini"

        # 清理缓存的 LLM 管理器以便使用新配置重建
        if hasattr(g, "_llm_managers") and isinstance(getattr(g, "_llm_managers"), dict):
            g._llm_managers.pop("gemini", None)

        # 7) 创建并后台启动 API 网关
        project_config = _build_project_config(port=port)
        gateway = get_api_gateway(project_config=project_config)
        gateway.start_server(background=True)

        # 8) 健康检查等待（~10-15 秒）
        healthy = _wait_for_health(port=port, timeout_secs=15.0)
        if not healthy:
            # 若端口可连通但未 healthy，提示可能端口被占用或网关异常
            if _is_port_open("127.0.0.1", port):
                print(f"警告：端口 {port} 已被占用且健康检查失败。请尝试使用不同端口，例如：--port 9000")
            else:
                print(f"警告：无法连接到 http://localhost:{port} 或健康检查未通过。")
            sys.exit(4)

        # 9) 构造并发送 HTTP POST /api/v1/api/call
        url = f"http://localhost:{port}/api/v1/api/call"
        payload = {
            "messages": [{"role": "user", "content": "Return a single word: ping"}],
            "provider": "gemini",
            "model": models_list[0] if models_list else "gemini-2.5-flash",
        }
        resp = _http_post_json(url, payload=payload, timeout=30.0)

        # 10) 解析响应，仅打印 response.content
        data = resp.get("json")
        content = None
        # 兼容：可能为 {"success":True, "data":{...}}
        content = _safe_get(data, ["response", "content"])
        if content is None:
            content = _safe_get(data, ["data", "response", "content"])
        if not isinstance(content, str):
            content = "N/A"

        # 最后一行仅打印 response.content
        print(content)

    except SystemExit:
        # 允许上面的 sys.exit 直接生效
        raise
    except Exception as e:
        # 异常处理：打印简洁摘要与 traceback 末尾几行（不回显任何密钥）
        print("[fatal] HTTP 连通性验证失败")
        print(f"Error: {type(e).__name__}: {str(e)}")
        tb_lines = traceback.format_exc().splitlines()
        tail = tb_lines[-10:] if len(tb_lines) > 10 else tb_lines
        print("Traceback (last lines):")
        for line in tail:
            print(line)
        sys.exit(1)

if __name__ == "__main__":
    main()