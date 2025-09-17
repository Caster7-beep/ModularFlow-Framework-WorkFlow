"""file_manager_module 的模块变量"""

# 支持的文件扩展名
SUPPORTED_EXTENSIONS = [
    '.json',
    '.txt',
    '.md',
    '.yaml',
    '.yml',
    '.xml',
    '.csv'
]

# 排除的目录
EXCLUDED_DIRS = [
    '__pycache__',
    '.git',
    '.vscode',
    'node_modules',
    '.DS_Store',
    'Thumbs.db'
]

# 排除的文件模式
EXCLUDED_FILES = [
    '.*',  # 隐藏文件
    '*.tmp',
    '*.temp',
    '*.bak',
    '*.log'
]

# 默认的文件夹结构映射
FOLDER_MAPPING = {
    "characters": {
        "display_name": "角色文件",
        "description": "角色定义文件",
        "icon": "👤"
    },
    "conversations": {
        "display_name": "对话记录", 
        "description": "对话历史文件",
        "icon": "💬"
    },
    "personas": {
        "display_name": "用户角色",
        "description": "用户角色设定文件", 
        "icon": "🎭"
    },
    "presets": {
        "display_name": "预设配置",
        "description": "LLM预设配置文件",
        "icon": "⚙️"
    },
    "world_books": {
        "display_name": "世界书",
        "description": "世界书知识文件",
        "icon": "📚"
    },
    "regex_rules": {
        "display_name": "正则规则",
        "description": "正则表达式规则文件",
        "icon": "🔧"
    },
    "cache": {
        "display_name": "缓存文件",
        "description": "系统缓存文件",
        "icon": "💾"
    }
}