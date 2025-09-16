# SmartTavern LLM桥接模块

本模块为SmartTavern提供与通用LLM API模块的桥接功能，负责管理API配置、调用通用LLM API，并处理SmartTavern特定的业务逻辑。

## 功能特性

- 🔗 **API桥接**: 连接SmartTavern与通用LLM API模块
- ⚙️ **配置管理**: 管理多个API提供商的配置和切换
- 📊 **统计跟踪**: 维护API使用统计和监控
- 🔄 **智能缓存**: 缓存API管理器实例以提高性能
- 📝 **统一接口**: 提供标准化的LLM API调用接口

## 架构设计

```
SmartTavern模块 --> LLM桥接模块 --> 通用LLM API模块 --> API提供商
     ↑                 ↑                    ↑              ↑
  业务逻辑           配置管理            API调用         实际服务
```

## 提供的函数

### 核心API调用

#### `api.call(messages, stream, model, max_tokens, temperature, provider, **kwargs)`
主要的API调用函数
```python
# 调用示例
response = api.call([
    {"role": "system", "content": "你是一个AI助手"},
    {"role": "user", "content": "你好"}
], model="gpt-4", temperature=0.7)
```

#### `api.call_streaming(messages, provider, **kwargs)`
流式API调用的便捷函数
```python
# 流式调用示例
response = api.call_streaming([
    {"role": "user", "content": "写一个长故事"}
])
```

### 提供商管理

#### `api.get_providers()`
获取所有API提供商信息
```python
providers = api.get_providers()
# 返回: {"providers": [{"name": "openai", "config": {...}}, ...]}
```

#### `api.set_provider(provider_name)`
设置活动的API提供商
```python
result = api.set_provider("anthropic")
# 返回: {"success": True, "message": "已切换到提供商: anthropic"}
```

#### `api.configure_provider(provider_name, api_key, base_url, models, enabled)`
配置API提供商
```python
result = api.configure_provider(
    "openai",
    "sk-...",
    "https://api.openai.com/v1",
    ["gpt-4", "gpt-3.5-turbo"]
)
```

### 辅助功能

#### `api.get_models(provider)`
获取指定提供商的可用模型
```python
models = api.get_models("openai")
# 返回: {"models": ["gpt-4", "gpt-3.5-turbo", ...]}
```

#### `api.get_stats()`
获取API使用统计
```python
stats = api.get_stats()
# 返回统计信息
```

#### `api.reset_stats()`
重置API使用统计
```python
result = api.reset_stats()
```

## 配置要求

桥接模块依赖SmartTavern的全局配置，需要以下配置结构：

```python
# shared/SmartTavern/globals.py
api_providers = {
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1", 
        "api_key": "sk-...",
        "models": ["gpt-4", "gpt-3.5-turbo"],
        "enabled": True
    },
    # 其他提供商...
}

active_api_provider = "openai"

llm_stats = {
    "total_requests": 0,
    "successful_requests": 0,
    "failed_requests": 0,
    "total_tokens_used": 0,
    "last_request_time": None,
    "average_response_time": 0.0
}

api_request_config = {
    "timeout": 60,
    "enable_logging": False
}
```

## 核心功能

本模块提供完整的LLM API管理功能：

- ✅ `api.call()` - 主要API调用接口
- ✅ `api.call_streaming()` - 流式API调用接口
- ✅ `api.get_providers()` - 获取提供商信息
- ✅ `api.set_provider()` - 切换活动提供商
- ✅ `api.configure_provider()` - 配置提供商参数
- ✅ `api.get_stats()` - 获取使用统计
- ✅ `api.reset_stats()` - 重置统计数据
- 🆕 `api.get_models()` - 获取可用模型列表

## 性能优化

- **管理器缓存**: API管理器实例会被缓存，避免重复创建
- **懒加载**: 只在需要时创建API管理器
- **配置变更检测**: 配置变更时自动清理缓存

## 错误处理

桥接模块提供多层错误处理：

1. **配置验证**: 检查API提供商配置的完整性
2. **管理器创建**: 处理API管理器创建失败
3. **API调用**: 传递通用LLM模块的错误信息
4. **统计更新**: 安全的统计信息更新

## 使用示例

```python
from core.services import UnifiedServiceManager

# 初始化服务管理器（会自动注册桥接模块的函数）
service_manager = UnifiedServiceManager()

# 调用API
response = service_manager.call_function("api.call", {
    "messages": [
        {"role": "user", "content": "Hello"}
    ],
    "model": "gpt-4",
    "temperature": 0.7
})

if response["response"]["success"]:
    print(response["response"]["content"])
else:
    print(f"错误: {response['response']['error']}")
```

## 依赖关系

- **通用LLM API模块**: 核心API调用功能
- **SmartTavern全局配置**: 配置数据来源
- **核心服务**: 函数注册和全局变量访问

## 维护说明

- 修改API提供商支持时，只需更新通用LLM API模块
- 新增业务功能时，在此桥接模块中实现
- 配置变更时，记得调用`clear_api_managers()`清理缓存