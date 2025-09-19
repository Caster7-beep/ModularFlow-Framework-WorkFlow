"""
VisualWorkFlow 独立项目全局配置 (globals)

- 提供 api_providers 配置（从环境变量读取真实密钥）
- 提供 active_api_provider（默认 gemini，若无密钥则回退）
- 提供运行时容器：visual_workflows、optimized_workflows、_llm_managers
- 与 SmartTavern 的 globals 解耦，供可视化工作流独立后端使用
"""

import os
from typing import Dict, Any, List, Optional


def _get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    """读取环境变量，若未配置返回默认值"""
    val = os.getenv(name)
    if val is None or str(val).strip() == "":
        return default
    return val


# 默认基础配置
DEFAULTS = {
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "models": (_get_env("GEMINI_MODELS", "gemini-2.5-flash") or "gemini-2.5-flash").split(","),
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "models": (_get_env("OPENAI_MODELS", "gpt-4o") or "gpt-4o").split(","),
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com",
        "models": (_get_env("ANTHROPIC_MODELS", "claude-3-5-sonnet-20240620") or "claude-3-5-sonnet-20240620").split(","),
    },
}

# 从环境变量读取真实密钥与可选覆盖的 base_url
_gemini_api_key = _get_env("GEMINI_API_KEY", "")
_gemini_base_url = _get_env("GEMINI_BASE_URL", DEFAULTS["gemini"]["base_url"])

_openai_api_key = _get_env("OPENAI_API_KEY", "")
_openai_base_url = _get_env("OPENAI_BASE_URL", DEFAULTS["openai"]["base_url"])

_anthropic_api_key = _get_env("ANTHROPIC_API_KEY", "")
_anthropic_base_url = _get_env("ANTHROPIC_BASE_URL", DEFAULTS["anthropic"]["base_url"])

# 最小可运行的 providers 结构（键名采用标题式，便于UI展示；桥接层需做不区分大小写匹配）
api_providers: Dict[str, Dict[str, Any]] = {
    "Gemini": {
        "api_key": _gemini_api_key or "",
        "base_url": _gemini_base_url or DEFAULTS["gemini"]["base_url"],
        "models": DEFAULTS["gemini"]["models"],
        "enable_api_key": True,
    },
    "OpenAI": {
        "api_key": _openai_api_key or "",
        "base_url": _openai_base_url or DEFAULTS["openai"]["base_url"],
        "models": DEFAULTS["openai"]["models"],
        "enable_api_key": True,
    },
    "Anthropic": {
        "api_key": _anthropic_api_key or "",
        "base_url": _anthropic_base_url or DEFAULTS["anthropic"]["base_url"],
        "models": DEFAULTS["anthropic"]["models"],
        "enable_api_key": True,
    },
}


def _has_key(provider_cfg: Dict[str, Any]) -> bool:
    """判断 provider 是否配置了有效密钥"""
    key = (provider_cfg or {}).get("api_key", "")
    return isinstance(key, str) and len(key.strip()) > 0


def _resolve_active_provider() -> Optional[str]:
    """
    解析 active_api_provider：
    - 默认 'gemini'
    - 若 gemini 无密钥，则回退到任意一个有密钥的 provider
    - 否则返回 None
    返回统一为小写：['gemini'|'openai'|'anthropic'|None]
    """
    default = "gemini"
    title_map = {
        "gemini": "Gemini",
        "openai": "OpenAI",
        "anthropic": "Anthropic",
    }

    # 默认优先
    if _has_key(api_providers.get(title_map[default], {})):
        return default

    # 回退策略：找到第一个有密钥的 provider
    for low, title in title_map.items():
        if _has_key(api_providers.get(title, {})):
            return low

    return None


# 面向运行时的状态容器（由可视化工作流使用的引擎/管理器复用）
visual_workflows: Dict[str, Any] = {}
optimized_workflows: Dict[str, Any] = {}

# 供 LLM 桥接缓存各 provider 的 LLMAPIManager 实例，键为 provider 小写名
_llm_managers: Dict[str, Any] = {}

# 活动 provider（供桥接模块读取；允许桥接函数提供覆盖 provider 参数）
active_api_provider: Optional[str] = _resolve_active_provider()