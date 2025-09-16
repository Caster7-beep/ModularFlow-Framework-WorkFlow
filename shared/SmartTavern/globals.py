"""
全局变量 - 所有模块都可以访问的动态数据
这些变量可以在运行时被修改
"""

# ========== 运行时状态 ==========
# 当前会话相关
current_user = None
session_id = None
execution_count = 0
workflow_count = 0

# 执行状态
is_running = False
is_initialized = False
last_error = None
last_executed_function = None
last_executed_workflow = None

# ========== 共享数据容器 ==========
# 数据缓存
data_cache = {}
temp_results = []
result_history = []

# 活动连接和资源
active_connections = {}
loaded_modules = set()
registered_functions = {}

# 用于模块间共享的运行时状态
global_state = {}

# ========== 全局标志 ==========
# 调试和输出控制
debug_mode = False
verbose_output = True
log_enabled = True
trace_execution = False

# 性能监控
enable_profiling = False
collect_metrics = False

# ========== 运行时配置 ==========
# 可以在运行时动态调整的配置
max_retries = 3
current_timeout = 30
batch_size = 100

# ========== 临时存储 ==========
# 用于模块间数据传递
shared_context = {}
workflow_context = {}
module_messages = []

# ========== 内容生成相关 ==========
# 这些变量将由专门的加载模块填充
presets = []
world_book_entries = []
character_data = {}
persona_data = {}
conversation_history = []
regex_rules_files = []
macro_cache = {}

# ========== LLM API配置 ==========
# API提供商配置
api_providers = {
    "gpt": {
        "base_url": "https://api.openai.com/v1",
        "api_key": "",
        "models": "gpt-4",
        "max_tokens": 1024,
        "temperature": 1,
        "custom_fields": "",
        "enable_api_key": True,
        "enable_model_id": True,
        "enable_temperature": True,
        "enable_max_tokens": True,
        "enable_custom_fields": False,
        "provider_type": "openai"
    },
    "Anthropic": {
        "base_url": "",
        "api_key": "",
        "models": "",
        "max_tokens": None,
        "temperature": None,
        "custom_fields": "",
        "enable_api_key": True,
        "enable_model_id": True,
        "enable_temperature": False,
        "enable_max_tokens": True,
        "enable_custom_fields": False,
        "provider_type": "anthropic"
    },
    "Gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "api_key": "1111",
        "models": "gemini-2.5-flash",
        "max_tokens": 1024,
        "temperature": 1.0,
        "custom_fields": "",
        "enable_api_key": True,
        "enable_model_id": True,
        "enable_temperature": True,
        "enable_max_tokens": True,
        "enable_custom_fields": False
    },
    "OpenAI兼容格式": {
        "base_url": "https://api.openai.com/v1",
        "api_key": "1234",
        "models": "gpt-3.5-turbo",
        "max_tokens": 1024,
        "temperature": 1,
        "custom_fields": "",
        "enable_api_key": True,
        "enable_model_id": True,
        "enable_temperature": True,
        "enable_max_tokens": True,
        "enable_custom_fields": False,
        "provider_type": "openai_compatible"
    },
    "ces8": {
        "base_url": "https://api.openai.com/v12",
        "api_key": "",
        "models": "gpt-3.5-turbo1",
        "max_tokens": 10241,
        "temperature": 11,
        "custom_fields": "",
        "enable_api_key": True,
        "enable_model_id": True,
        "enable_temperature": True,
        "enable_max_tokens": True,
        "enable_custom_fields": False,
        "provider_type": "openai"
    }
}

# 当前活动的API提供商
active_api_provider = "openai"

# 默认LLM配置
llm_config = {
    "model": "gpt-3.5-turbo",
    "max_tokens": 2048,
    "temperature": 0.7,
    "top_p": 1.0,
    "presence_penalty": 0.0,
    "frequency_penalty": 0.0,
    "stream": False
}

# API请求配置
api_request_config = {
    "timeout": 60,
    "max_retries": 3,
    "retry_delay": 1.0,
    "enable_streaming": True,
    "enable_logging": True
}

# LLM API统计和监控
llm_stats = {
    "total_requests": 0,
    "successful_requests": 0,
    "failed_requests": 0,
    "total_tokens_used": 0,
    "last_request_time": None,
    "average_response_time": 0.0
}