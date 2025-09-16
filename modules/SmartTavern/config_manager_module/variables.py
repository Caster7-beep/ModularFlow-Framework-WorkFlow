# SmartTavern 配置管理模块变量
"""
配置管理模块的常量和配置映射
"""

# 支持的配置文件扩展名
SUPPORTED_CONFIG_EXTENSIONS = ['.json', '.yaml', '.yml']

# 用户偏好设置文件路径
USER_PREFERENCES_FILE = "shared/SmartTavern/user_preferences.json"

# 配置文件夹映射
CONFIG_FOLDER_MAPPING = {
    "presets": {
        "folder": "presets",
        "display_name": "预设配置",
        "description": "LLM预设配置文件",
        "icon": "⚙️",
        "global_var": "preset"
    },
    "world_books": {
        "folder": "world_books",
        "display_name": "世界书",
        "description": "世界书知识文件",
        "icon": "📚",
        "global_var": "world_book_files",
        "is_list": True
    },
    "regex_rules": {
        "folder": "regex_rules",
        "display_name": "正则规则",
        "description": "正则表达式规则文件",
        "icon": "🔧",
        "global_var": "regex_rules_files",
        "is_list": True
    },
    "characters": {
        "folder": "characters",
        "display_name": "角色卡",
        "description": "角色定义文件",
        "icon": "👤",
        "global_var": "character"
    },
    "personas": {
        "folder": "personas",
        "display_name": "用户信息",
        "description": "用户角色定义文件",
        "icon": "🧑",
        "global_var": "persona"
    },
    "conversations": {
        "folder": "conversations",
        "display_name": "对话历史",
        "description": "对话历史文件",
        "icon": "💬",
        "global_var": "conversation_history",
        "is_list": True
    }
}

# 默认配置优先级（用于自动选择）
DEFAULT_CONFIG_PRIORITY = {
    "presets": ["Default.json", "default.json"],
    "world_books": ["main_world.json", "default.json"],
    "regex_rules": ["remove_xml_tags.json", "default.json"],
    "characters": ["许莲笙.json", "default.json"],
    "personas": ["default_user.json", "用户2.json"],
    "conversations": ["current_chat.json", "参考用sample_chat.json"]
}

# 配置类型顺序（用于界面显示）
CONFIG_TYPE_ORDER = ["presets", "world_books", "regex_rules", "characters", "personas", "conversations"]