"""
VisualWorkFlow LLM API 桥接（独立版）

- 注册 api.call 与 api.get_models 两个函数，供可视化工作流引擎与前端调用
- 使用真实密钥，从当前项目 globals (shared/VisualWorkFlow/globals.py) 读取
- 基于 LLMAPIManager 构造 APIConfiguration，并在 g._llm_managers 缓存
- 不依赖 SmartTavern 的任何模块
"""

from typing import Any, Dict, List, Optional, Iterator
from core.function_registry import register_function
from core.services import get_current_globals
from modules.llm_api_module import LLMAPIManager, APIConfiguration


# --------- 工具函数 ---------

def _norm_provider_name(name: Optional[str]) -> Optional[str]:
    """将 provider 名标准化为小写: gemini/openai/anthropic"""
    if not name:
        return None
    n = str(name).strip().lower()
    if n in ("gemini", "google", "googleai", "google_ai"):
        return "gemini"
    if n in ("openai", "oai", "openai_compatible"):
        return "openai"
    if n in ("anthropic", "claude"):
        return "anthropic"
    return n


def _title_by_provider_key(key: str) -> str:
    """将小写 provider key 转为 VisualWorkFlow globals 中的标题式键名"""
    mapping = {
        "gemini": "Gemini",
        "openai": "OpenAI",
        "anthropic": "Anthropic",
    }
    return mapping.get(key, key.title())


def _ensure_manager(provider_key: str) -> Optional[LLMAPIManager]:
    """
    获取或构建指定 provider 的 LLMAPIManager。
    - 从当前项目 globals 读取 api_providers 与 _llm_managers
    """
    g = get_current_globals()
    if g is None:
        return None

    # 初始化缓存容器
    if not hasattr(g, "_llm_managers"):
        g._llm_managers = {}

    # 命中缓存
    if provider_key in g._llm_managers and isinstance(g._llm_managers[provider_key], LLMAPIManager):
        return g._llm_managers[provider_key]

    title_key = _title_by_provider_key(provider_key)
    providers: Dict[str, Dict[str, Any]] = getattr(g, "api_providers", {})

    if title_key not in providers:
        return None

    cfg = providers[title_key] or {}
    api_key = cfg.get("api_key", "") or ""
    base_url = cfg.get("base_url", "") or ""
    models = cfg.get("models", []) or []

    # 构建配置
    api_config = APIConfiguration(
        provider=provider_key,
        api_key=api_key,
        base_url=base_url,
        models=models,
        enabled=True,
    )

    manager = LLMAPIManager(api_config)
    g._llm_managers[provider_key] = manager
    return manager


def _pick_active_provider(explicit_provider: Optional[str]) -> Optional[str]:
    """优先使用传入 provider，否则读取当前 globals.active_api_provider"""
    g = get_current_globals()
    if explicit_provider:
        return _norm_provider_name(explicit_provider)
    active = getattr(g, "active_api_provider", None) if g else None
    return _norm_provider_name(active) if active else None


def _std_ok(content: str, provider: str, model: Optional[str], raw: Any) -> Dict[str, Any]:
    return {
        "response": {"content": content or ""},
        "provider": provider,
        "model": model,
        "raw": raw,
    }


def _std_error(msg: str, provider: Optional[str] = None, model: Optional[str] = None, raw: Any = None) -> Dict[str, Any]:
    return {
        "response": {"content": f"ERROR: {msg}"},
        "error": msg,
        "provider": provider,
        "model": model,
        "raw": raw,
    }


# --------- 已注册函数 ---------

@register_function(name="api.call", outputs=["response"])
def api_call(messages: List[Dict[str, Any]],
             provider: Optional[str] = None,
             model: Optional[str] = None,
             temperature: Optional[float] = None,
             max_tokens: Optional[int] = None,
             stream: bool = False,
             extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    统一LLM调用入口（同步、非流式）
    返回结构：
    {
      "response": {"content": "LLM输出文本"},
      "provider": "...",
      "model": "...",
      "raw": 原始响应或必要信息
    }
    错误时：
    {
      "response": {"content": "ERROR: ..."},
      "error": "...",
      "provider": "...",
      "model": "...",
      "raw": ...
    }
    """
    try:
        # 解析 provider
        provider_key = _pick_active_provider(provider)
        if not provider_key:
            # 友好错误：提示配置环境变量
            return _std_error(
                "未配置有效的 active_api_provider 或未提供 provider。请设置环境变量："
                "GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY，并在 shared/VisualWorkFlow/globals.py 中可见。",
                provider=None, model=model
            )

        # 获取/构建管理器
        manager = _ensure_manager(provider_key)
        if manager is None:
            return _std_error(f"无法初始化 LLM 管理器（provider={provider_key}）", provider=provider_key, model=model)

        # 校验是否可用（有密钥、base_url）
        if not manager.is_available():
            # 尝试给出友好提示
            g = get_current_globals()
            title_key = _title_by_provider_key(provider_key)
            cfg = getattr(g, "api_providers", {}).get(title_key, {}) if g else {}
            friendly = f"{title_key} 未配置有效密钥或基础URL。请设置环境变量："
            if provider_key == "gemini":
                friendly += "GEMINI_API_KEY, GEMINI_BASE_URL(可选)"
            elif provider_key == "openai":
                friendly += "OPENAI_API_KEY, OPENAI_BASE_URL(可选)"
            elif provider_key == "anthropic":
                friendly += "ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL(可选)"
            return _std_error(friendly, provider=provider_key, model=model, raw={"cfg": cfg})

        # 参数准备
        call_kwargs: Dict[str, Any] = {}
        if temperature is not None:
            call_kwargs["temperature"] = float(temperature)
        if max_tokens is not None:
            call_kwargs["max_tokens"] = int(max_tokens)
        # 不启用流式（即使传入stream=True也按非流式处理，满足本任务要求）
        call_kwargs["stream"] = False

        # 合并额外参数
        if extra and isinstance(extra, dict):
            call_kwargs.update(extra)

        # 发起调用
        resp = manager.call_api(
            messages=messages or [],
            model=model,
            **call_kwargs
        )

        # 处理返回
        # 非流式响应应为 APIResponse
        if hasattr(resp, "success"):
            if getattr(resp, "success", False):
                content = getattr(resp, "content", "") or ""
                model_used = getattr(resp, "model_used", None) or model
                raw = getattr(resp, "raw_response", None)
                return _std_ok(content, provider_key, model_used, raw)
            else:
                err = getattr(resp, "error", "未知错误")
                model_used = getattr(resp, "model_used", None) or model
                raw = getattr(resp, "raw_response", None)
                return _std_error(err, provider=provider_key, model=model_used, raw=raw)

        # 兼容意外返回类型（例如迭代器/生成器）
        if isinstance(resp, Iterator):
            # 聚合所有 chunk 为文本（兜底）
            full_text = ""
            try:
                for chunk in resp:
                    part = getattr(chunk, "content", "")
                    full_text += part or ""
            except Exception as e:
                return _std_error(str(e), provider=provider_key, model=model, raw=None)
            return _std_ok(full_text, provider_key, model, raw=None)

        # 直接是 dict 的情况，尽力标准化
        if isinstance(resp, dict):
            content = resp.get("content") or resp.get("text") or ""
            return _std_ok(str(content), provider_key, model, raw=resp)

        # 其他类型，做字符串化兜底
        return _std_ok(str(resp), provider_key, model, raw={"value": str(resp)})

    except Exception as e:
        return _std_error(str(e), provider=provider, model=model, raw=None)


@register_function(name="api.get_models", outputs=["models"])
def api_get_models(provider: str = None) -> Dict[str, Any]:
    """
    返回 {"models": [...]} 结构
    - 优先调用远端列表接口
    - 失败则回退到 g.api_providers 的静态 models
    """
    try:
        provider_key = _pick_active_provider(provider)
        if not provider_key:
            return {"models": [], "error": "未配置有效的 active_api_provider 或未提供 provider"}

        g = get_current_globals()
        title_key = _title_by_provider_key(provider_key)
        providers: Dict[str, Dict[str, Any]] = getattr(g, "api_providers", {}) if g else {}
        static_models = (providers.get(title_key, {}) or {}).get("models", []) if providers else []

        manager = _ensure_manager(provider_key)
        if manager is None or not manager.is_available():
            return {"models": static_models}

        # 调用远端获取
        remote = manager.list_models()
        # 尝试解析不同 provider 的返回格式
        names: List[str] = []

        if isinstance(remote, dict):
            # Gemini: {"models":[{"name":"models/gemini-2.0-pro"}, ...]}
            if "models" in remote and isinstance(remote["models"], list):
                for m in remote["models"]:
                    name = m.get("name") if isinstance(m, dict) else None
                    if name:
                        # 去掉前缀 "models/"
                        names.append(name.split("/")[-1])
            # OpenAI: {"data":[{"id":"gpt-4o"}, ...]}
            elif "data" in remote and isinstance(remote["data"], list):
                for m in remote["data"]:
                    mid = m.get("id") if isinstance(m, dict) else None
                    if mid:
                        names.append(mid)
            # Anthropic: 自定义 data 列表，通常对象包含 "id"
            elif "data" in remote and isinstance(remote["data"], list):
                for m in remote["data"]:
                    mid = m.get("id") if isinstance(m, dict) else None
                    if mid:
                        names.append(mid)

        # 合并去重，保证至少返回静态配置
        if not names and static_models:
            names = list(static_models)

        # 最终返回
        return {"models": list(dict.fromkeys(names))}

    except Exception as e:
        return {"models": [], "error": str(e)}