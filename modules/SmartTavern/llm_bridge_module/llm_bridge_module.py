"""
SmartTavern LLM桥接模块
提供SmartTavern与通用LLM API模块的接口桥梁
"""

import json
import logging
import time
from typing import Dict, List, Any, Optional, Union, Iterator

from core.function_registry import register_function
from core.services import get_current_globals
from modules.llm_api_module import LLMAPIManager, APIConfiguration, APIResponse, StreamChunk

# 设置日志
logger = logging.getLogger(__name__)

# ========== 全局变量管理 ==========

_api_managers: Dict[str, LLMAPIManager] = {}

def get_api_manager(provider_name: str = None) -> Optional[LLMAPIManager]:
    """获取指定提供商的API管理器"""
    g = get_current_globals()
    if not g:
        logger.warning("无法获取全局变量")
        return None
    
    # 使用活动提供商如果未指定
    if not provider_name:
        provider_name = getattr(g, 'active_api_provider', 'openai')
    
    # 检查缓存的管理器
    if provider_name in _api_managers:
        return _api_managers[provider_name]
    
    # 获取提供商配置
    providers = getattr(g, 'api_providers', {})
    if provider_name not in providers:
        logger.error(f"提供商配置 {provider_name} 不存在")
        return None
    
    provider_config = providers[provider_name]
    
    # 确定实际的提供商类型 - 优先使用provider_type字段，如果没有则使用provider_name
    actual_provider_type = provider_config.get('provider_type', provider_name)
    
    # 处理models字段 - 确保兼容性
    models_value = provider_config.get('models', [])
    if isinstance(models_value, str):
        models_list = [models_value] if models_value else []
    elif isinstance(models_value, list):
        models_list = models_value
    else:
        models_list = []
    
    # 创建API配置，使用实际的提供商类型而不是配置名称
    api_config = APIConfiguration(
        provider=actual_provider_type,  # 使用实际的提供商类型
        api_key=provider_config.get('api_key', ''),
        base_url=provider_config.get('base_url', ''),
        models=models_list,
        timeout=getattr(g, 'api_request_config', {}).get('timeout', 60),
        connect_timeout=10,
        enable_logging=getattr(g, 'api_request_config', {}).get('enable_logging', False)
    )
    
    # 创建并缓存API管理器
    manager = LLMAPIManager(api_config)
    _api_managers[provider_name] = manager
    
    logger.info(f"已创建API管理器 - 配置名称: {provider_name}, 提供商类型: {actual_provider_type}")
    return manager

def clear_api_managers():
    """清空API管理器缓存"""
    global _api_managers
    _api_managers.clear()

# ========== 统计管理 ==========

def _update_statistics(success: bool, response_time: float, usage: Optional[Dict] = None):
    """更新API使用统计"""
    g = get_current_globals()
    if not g or not hasattr(g, 'llm_stats'):
        return
    
    stats = g.llm_stats
    stats['total_requests'] += 1
    
    if success:
        stats['successful_requests'] += 1
    else:
        stats['failed_requests'] += 1
    
    if usage and 'total_tokens' in usage:
        stats['total_tokens_used'] += usage['total_tokens']
    
    stats['last_request_time'] = time.time()
    
    # 计算平均响应时间
    if stats['total_requests'] > 0:
        total_time = stats.get('average_response_time', 0) * (stats['total_requests'] - 1) + response_time
        stats['average_response_time'] = total_time / stats['total_requests']

# ========== 注册的函数接口 ==========

@register_function(name="api.call", outputs=["response"])
def call_api(messages: List[Dict[str, str]], 
             stream: bool = False,
             model: Optional[str] = None,
             max_tokens: Optional[int] = None,
             temperature: Optional[float] = None,
             provider: Optional[str] = None,
             **kwargs) -> Dict[str, Any]:
    """
    调用LLM API
    
    Args:
        messages: 消息列表，格式为 [{"role": "user", "content": "hello"}]
        stream: 是否使用流式响应
        model: 模型名称（可选）
        max_tokens: 最大token数（可选）
        temperature: 温度参数（可选）
        provider: 指定使用的提供商（可选，默认使用活动提供商）
        **kwargs: 其他参数
    
    Returns:
        包含响应结果的字典
    """
    try:
        # 获取API管理器
        manager = get_api_manager(provider)
        if not manager:
            return {
                "response": {
                    "success": False,
                    "error": f"无法获取API管理器 (提供商: {provider or 'default'})",
                    "content": "",
                    "response_time": 0.0,
                    "provider": provider or "unknown"
                }
            }
        
        # 准备调用参数
        call_kwargs = kwargs.copy()
        if max_tokens:
            call_kwargs["max_tokens"] = max_tokens
        if temperature is not None:
            call_kwargs["temperature"] = temperature
        
        # 调用API
        response = manager.call_api(
            messages=messages,
            model=model,
            stream=stream,
            **call_kwargs
        )
        
        if stream and hasattr(response, '__iter__'):
            # 流式响应
            return {
                "response": {
                    "success": True,
                    "stream": True,
                    "generator": response
                }
            }
        elif isinstance(response, APIResponse):
            # 非流式响应
            # 更新统计
            _update_statistics(response.success, response.response_time, response.usage)
            
            return {
                "response": {
                    "success": response.success,
                    "content": response.content,
                    "error": response.error,
                    "usage": response.usage,
                    "response_time": response.response_time,
                    "model_used": response.model_used,
                    "finish_reason": response.finish_reason,
                    "raw_response": response.raw_response,
                    "provider": response.provider
                }
            }
        else:
            return {
                "response": {
                    "success": False,
                    "error": "未知的响应类型",
                    "content": "",
                    "response_time": 0.0,
                    "provider": provider or "unknown"
                }
            }
            
    except Exception as e:
        logger.error(f"API调用失败: {str(e)}")
        return {
            "response": {
                "success": False,
                "error": f"API调用失败: {str(e)}",
                "content": "",
                "response_time": 0.0,
                "provider": provider or "unknown"
            }
        }

@register_function(name="api.call_streaming", outputs=["response"])
def call_api_streaming(messages: List[Dict[str, str]], 
                      provider: Optional[str] = None,
                      **kwargs) -> Dict[str, Any]:
    """
    流式调用LLM API（便捷函数）
    """
    return call_api(messages, stream=True, provider=provider, **kwargs)

@register_function(name="api.get_providers", outputs=["providers"])
def get_api_providers() -> Dict[str, Any]:
    """
    获取所有API提供商配置信息
    """
    try:
        g = get_current_globals()
        if not g:
            return {"providers": []}
        
        providers = getattr(g, 'api_providers', {})
        active_provider = getattr(g, 'active_api_provider', 'openai')
        
        provider_list = []
        for name, config in providers.items():
            # 不暴露API密钥
            safe_config = config.copy()
            if 'api_key' in safe_config:
                safe_config['api_key'] = '***' if safe_config['api_key'] else ''
            
            safe_config['is_active'] = (name == active_provider)
            
            # 检查可用性
            manager = get_api_manager(name)
            safe_config['is_available'] = manager.is_available() if manager else False
            
            provider_list.append({
                "name": name,  # 这里的name现在就是配置的键名
                "config": safe_config
            })
        
        return {"providers": provider_list}
        
    except Exception as e:
        logger.error(f"获取提供商列表失败: {str(e)}")
        return {"providers": []}

@register_function(name="api.set_provider", outputs=["success", "message"])
def set_active_provider(provider_name: str) -> Dict[str, Any]:
    """
    设置活动的API提供商
    """
    try:
        g = get_current_globals()
        if not g:
            return {"success": False, "message": "无法访问全局变量"}
        
        providers = getattr(g, 'api_providers', {})
        if provider_name not in providers:
            return {"success": False, "message": f"提供商 {provider_name} 不存在"}
        
        # 设置活动提供商
        g.active_api_provider = provider_name
        
        # 清空缓存以确保使用新的配置
        clear_api_managers()
        
        logger.info(f"已切换到API提供商: {provider_name}")
        return {"success": True, "message": f"已切换到提供商: {provider_name}"}
        
    except Exception as e:
        logger.error(f"设置提供商失败: {str(e)}")
        return {"success": False, "message": f"设置失败: {str(e)}"}

@register_function(name="api.configure_provider", outputs=["success", "message"])
def configure_api_provider(provider_name: str,
                          api_key: str,
                          base_url: Optional[str] = None,
                          models: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    配置API提供商
    """
    try:
        g = get_current_globals()
        if not g:
            return {"success": False, "message": "无法访问全局变量"}
        
        if not hasattr(g, 'api_providers'):
            g.api_providers = {}
        
        # 设置默认值
        from modules.llm_api_module.variables import DEFAULT_MODELS
        
        if provider_name == 'openai':
            default_base_url = "https://api.openai.com/v1"
            default_models = DEFAULT_MODELS['openai']
        elif provider_name == 'anthropic':
            default_base_url = "https://api.anthropic.com/v1"
            default_models = DEFAULT_MODELS['anthropic']
        elif provider_name == 'gemini':
            default_base_url = "https://generativelanguage.googleapis.com/v1beta"
            default_models = DEFAULT_MODELS['gemini']
        else:
            default_base_url = ""
            default_models = []
        
        # 更新配置（不再包含name字段，因为name就是键名）
        existing_config = g.api_providers.get(provider_name, {})
        g.api_providers[provider_name] = {
            "base_url": base_url or default_base_url,
            "api_key": api_key,
            "models": models or existing_config.get("models", default_models)
        }
        
        # 清空该提供商的管理器缓存
        if provider_name in _api_managers:
            del _api_managers[provider_name]
        
        logger.info(f"已配置API提供商: {provider_name}")
        return {"success": True, "message": f"提供商 {provider_name} 配置成功"}
        
    except Exception as e:
        logger.error(f"配置提供商失败: {str(e)}")
        return {"success": False, "message": f"配置失败: {str(e)}"}

@register_function(name="api.get_models", outputs=["models"])
def get_available_models(provider: Optional[str] = None) -> Dict[str, Any]:
    """
    获取指定提供商的可用模型列表
    """
    try:
        manager = get_api_manager(provider)
        if not manager:
            return {"models": []}
        
        models = manager.get_available_models()
        return {"models": models}
        
    except Exception as e:
        logger.error(f"获取模型列表失败: {str(e)}")
        return {"models": []}

@register_function(name="api.get_stats", outputs=["stats"])
def get_api_statistics() -> Dict[str, Any]:
    """
    获取API使用统计
    """
    try:
        g = get_current_globals()
        if not g or not hasattr(g, 'llm_stats'):
            return {"stats": {}}
        
        stats = g.llm_stats.copy()
        if stats.get('last_request_time'):
            import time
            stats['last_request_time'] = time.ctime(stats['last_request_time'])
        
        return {"stats": stats}
        
    except Exception as e:
        logger.error(f"获取统计失败: {str(e)}")
        return {"stats": {}}

@register_function(name="api.reset_stats", outputs=["success", "message"])
def reset_api_statistics() -> Dict[str, Any]:
    """
    重置API使用统计
    """
    try:
        g = get_current_globals()
        if not g:
            return {"success": False, "message": "无法访问全局变量"}
        
        g.llm_stats = {
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "total_tokens_used": 0,
            "last_request_time": None,
            "average_response_time": 0.0
        }
        
        logger.info("API统计已重置")
        return {"success": True, "message": "统计数据已重置"}
        
    except Exception as e:
        logger.error(f"重置统计失败: {str(e)}")
        return {"success": False, "message": f"重置失败: {str(e)}"}