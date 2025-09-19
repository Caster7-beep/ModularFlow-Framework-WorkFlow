# -*- coding: utf-8 -*-
"""
E2E Gemini 测试脚本（独立后端 VisualWorkFlow）

用途：
- 修复与验证 Gemini API 配置注入与 LLM 调用
- 构建最小可视化工作流并执行，验证端到端流程
- 避免 FunctionRegistry.call() 的 name 形参与注册函数 name 参数冲突

运行方式：
- 直接运行本脚本（确保已安装项目依赖）
  python backend_projects/visual_work_flow/e2e_gemini_test.py

需要的环境变量：
- GEMINI_API_KEY     必需，Google Gemini API 密钥
- GEMINI_BASE_URL    可选，默认 https://generativelanguage.googleapis.com/v1beta
- GEMINI_MODELS      可选，逗号分隔，默认 gemini-2.5-flash

注意：
- 不会打印或回显任何密钥实际值
- 输出包含清晰分隔段落
- 通过 get_registered_function(...) 直接调用注册函数，避免 FunctionRegistry.call 的 name 参数冲突
"""

import os
import sys
import json
import time
import traceback
from pathlib import Path
from typing import Dict, Any, List, Optional


def _print_header(title: str) -> None:
    print("\n" + "=" * 80)
    print(f"{title}")
    print("=" * 80)


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


def main():
    # 1) 设定仓库根目录，注入 sys.path，并 chdir 到 root（如需要）。打印 CWD。
    _print_header("Step 1: 初始化路径")
    root = Path(__file__).resolve().parents[2]
    root_str = str(root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)
        os.chdir(root_str)
    print(f"Root path set to: {root}")
    print(f"CWD: {Path.cwd()}")

    # 现在再导入框架模块（在完成 sys.path 注入与 chdir 根目录之后）
    from core.function_registry import get_registry, get_registered_function  # noqa: E402
    from core.services import (  # noqa: E402
        get_service_manager,
        register_project,
        switch_project,
        get_current_globals,
    )

    # 2) 通过 service_manager 确保项目 VisualWorkFlow 存在并 set_current
    _print_header("Step 2: 确认并切换项目")
    sm = get_service_manager()
    projects = sm.list_projects()
    if "VisualWorkFlow" not in projects:
        print("项目 VisualWorkFlow 未注册，尝试注册...")
        # 明确提供路径，避免默认路径不一致
        register_project(
            name="VisualWorkFlow",
            namespace="VisualWorkFlow",
            shared_path="shared/VisualWorkFlow",
            modules_path="modules"
        )
    switched = switch_project("VisualWorkFlow")
    cur_proj = sm.get_current_project()
    print(f"Project switched: {switched}, Current Project: {cur_proj.name if cur_proj else 'N/A'}")

    # 3) 显式导入模块触发函数注册
    _print_header("Step 3: 导入模块并统计注册函数")
    import modules.visual_workflow_module.visual_workflow_module as vwm  # noqa: F401, E402
    import modules.visual_workflow_module.optimized_visual_workflow_module as ovwm  # noqa: F401, E402
    import modules.visual_workflow_module.llm_api_bridge as llm_bridge  # noqa: F401, E402

    registry = get_registry()
    functions_list = registry.list_functions()
    print(f"已注册函数数量: {len(functions_list)}")
    # 可选：打印部分函数名预览（避免过长）
    preview = functions_list[:20]
    print(f"函数预览(最多20): {preview}")

    # 4) 从环境读取 GEMINI_API_KEY/BASE_URL/MODELS
    _print_header("Step 4: 读取环境变量")
    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    base_url = os.getenv("GEMINI_BASE_URL", "").strip() or "https://generativelanguage.googleapis.com/v1beta"
    models_env = os.getenv("GEMINI_MODELS", "").strip() or "gemini-2.5-flash"
    models_list = [m.strip() for m in models_env.split(",") if m.strip()]

    if not gemini_api_key:
        print("错误：未检测到 GEMINI_API_KEY 环境变量。请在运行前设置有效的 Gemini API 密钥。")
        return

    # 5) 注入 g.api_providers 与 active_api_provider
    _print_header("Step 5: 注入 Gemini API 配置")
    g = get_current_globals()
    if g is None:
        print("错误：无法获取当前项目 globals。")
        return

    if not hasattr(g, "api_providers") or not isinstance(getattr(g, "api_providers"), dict):
        g.api_providers = {}

    cfg = {
        "api_key": gemini_api_key,  # 注意：不回显
        "base_url": base_url,
        "models": models_list,
        "enable_api_key": True,
        "enabled": True,
    }
    # 标题式与小写别名同时注入，增强兼容性
    g.api_providers["Gemini"] = cfg
    g.api_providers["gemini"] = cfg
    # 激活当前 provider
    g.active_api_provider = "gemini"

    # 如果之前已缓存过 LLM 管理器，清理以便使用新配置重建
    if hasattr(g, "_llm_managers") and isinstance(getattr(g, "_llm_managers"), dict):
        g._llm_managers.pop("gemini", None)

    print(f"Active Provider: {getattr(g, 'active_api_provider', None)}")
    print(f"Base URL: {base_url}")
    print(f"Models: {models_list}")
    print(f"Selected Model: {models_list[0] if models_list else 'N/A'}")

    # 6) 测试1：直接 LLM 调用（使用 get_registered_function 避免 call 冲突）
    _print_header("Step 6: 直接 LLM 调用测试")
    try:
        call_fn = get_registered_function("api.call")
    except Exception as e:
        print(f"错误：未找到注册函数 'api.call'，请确认 llm_api_bridge 已加载。详情: {e}")
        return

    payload = {
        "messages": [{"role": "user", "content": "Return a single word: ping"}],
        "provider": "gemini",
        "model": models_list[0] if models_list else None,
    }

    result = call_fn(**payload)
    model_used = result.get("model") or payload["model"]
    provider_used = result.get("provider", "gemini")
    print(f"Provider: {provider_used}")
    print(f"ModelUsed: {model_used}")
    if result.get("error"):
        print(f"Error: {result.get('error')}")
    llm_output = _safe_get(result, ["response", "content"], "N/A")
    print(f"LLM Output: {llm_output}")

    # 7) 测试2：最小可视化工作流（使用 get_registered_function 创建，避免 ‘name’ 冲突）
    _print_header("Step 7: 构建最小可视化工作流并执行")
    try:
        create_fn = get_registered_function("visual_workflow.create")
        add_node_fn = get_registered_function("visual_workflow.add_node")
        connect_fn = get_registered_function("visual_workflow.create_connection")
        execute_fn = get_registered_function("visual_workflow.execute")
    except Exception as e:
        print(f"错误：未找到可视化工作流相关注册函数，请确认 visual_workflow_module 已加载。详情: {e}")
        return

    # 创建工作流（关键：直接调用函数对象，避免 registry.call 的 name 形参与此处 name 参数冲突）
    create_result = create_fn(name="E2E Gemini Test", description="Minimal pipeline")
    if not create_result.get("success"):
        print(f"创建工作流失败: {create_result.get('message')}")
        return
    wf_id = create_result.get("workflow_id")
    print(f"Workflow ID: {wf_id}")

    # 添加节点
    pos_input = {"x": 100, "y": 100}
    n_input = add_node_fn(
        workflow_id=wf_id,
        node_type="input",
        position=pos_input,
        config={"name": "输入", "default_value": "你好，这是测试"}
    )
    if not n_input.get("success"):
        print(f"添加输入节点失败: {n_input.get('message')}")
        return
    print(f"Input Node ID: {n_input.get('node_id')}")

    n_llm = add_node_fn(
        workflow_id=wf_id,
        node_type="llm_call",
        position={"x": 300, "y": 100},
        config={
            "name": "LLM",
            "provider": "gemini",
            "model": models_list[0] if models_list else "gemini-2.5-flash",
            "prompt": "请用20字以内回答：{{input}}",
            "temperature": 0.2,
            "max_tokens": 512
        }
    )
    if not n_llm.get("success"):
        print(f"添加 LLM 节点失败: {n_llm.get('message')}")
        return
    print(f"LLM Node ID: {n_llm.get('node_id')}")

    n_output = add_node_fn(
        workflow_id=wf_id,
        node_type="output",
        position={"x": 500, "y": 100},
        config={"name": "输出", "format": "text"}
    )
    if not n_output.get("success"):
        print(f"添加输出节点失败: {n_output.get('message')}")
        return
    print(f"Output Node ID: {n_output.get('node_id')}")

    # 创建连接
    c1 = connect_fn(
        workflow_id=wf_id,
        source_node_id=n_input["node_id"],
        target_node_id=n_llm["node_id"],
        config={"source_handle": "output", "target_handle": "input"}
    )
    if not c1.get("success"):
        print(f"创建连接(输入->LLM)失败: {c1.get('message')}")
        return

    c2 = connect_fn(
        workflow_id=wf_id,
        source_node_id=n_llm["node_id"],
        target_node_id=n_output["node_id"],
        config={"source_handle": "output", "target_handle": "input"}
    )
    if not c2.get("success"):
        print(f"创建连接(LLM->输出)失败: {c2.get('message')}")
        return

    # 执行工作流
    ex = execute_fn(workflow_id=wf_id, input_data={"input": "用一句话介绍你自己"})
    exec_id = ex.get("execution_id")
    print(f"Execution ID: {exec_id}")

    # 从 ex["result"] 中解析最终输出文本
    state = ex.get("result") or {}
    final_text = "N/A"

    # 优先：results 中 metadata.final_output == True 的项
    results_obj = state.get("results")
    selected_text = None
    if isinstance(results_obj, dict):
        try:
            for v in results_obj.values():
                if isinstance(v, dict):
                    md = v.get("metadata") or {}
                    if md.get("final_output") is True:
                        selected_text = v.get("text", "")
                        break
            if selected_text is None:
                # 取第一个包含 text 的项或合并
                texts = []
                for v in results_obj.values():
                    if isinstance(v, dict) and isinstance(v.get("text"), str):
                        texts.append(v.get("text"))
                if texts:
                    selected_text = texts[0] if len(texts) == 1 else " ".join(texts)
        except Exception:
            selected_text = None

    if isinstance(selected_text, str) and selected_text != "":
        final_text = selected_text

    print(f"Final Output: {final_text}")

    _print_header("完成：E2E 测试结束")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # 异常处理：打印摘要错误行与 traceback 的最后几行（简洁）
        print("\n" + "=" * 80)
        print("异常捕获（摘要）：")
        print(f"{type(e).__name__}: {str(e)}")
        tb_lines = traceback.format_exc().splitlines()
        tail = tb_lines[-8:] if len(tb_lines) > 8 else tb_lines
        print("Traceback (last lines):")
        for line in tail:
            print(line)
        print("=" * 80)