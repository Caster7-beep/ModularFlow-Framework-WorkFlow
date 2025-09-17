import os
import json
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime
from core.function_registry import register_function
from core.services import get_service_manager, get_current_globals
from .variables import USER_PREFERENCES_FILE

# 全局配置状态
_active_config = {
    "presets": None,
    "world_books": None,
    "regex_rules": None,
    "conversations": None
}

# UI设置默认值
_ui_settings = {
    "floorCount": 10,
    "messagePanelWidth": 100,
    "inputPanelWidth": 100
}

@register_function(name="config_manager.get_config_options", outputs=["config_options"])
def get_config_options():
    """
    获取所有配置文件选项
    """
    service_manager = get_service_manager()
    shared_path = service_manager.get_shared_path()
    
    if not shared_path or not shared_path.exists():
        return {
            "success": False,
            "error": "共享数据路径不存在",
            "config_options": {}
        }
    
    try:
        config_options = {}
        
        # 定义配置文件夹映射
        config_folders = {
            "presets": {
                "folder": "presets",
                "display_name": "预设配置",
                "icon": "⚙️"
            },
            "world_books": {
                "folder": "world_books",
                "display_name": "世界书",
                "icon": "📚"
            },
            "regex_rules": {
                "folder": "regex_rules",
                "display_name": "正则规则",
                "icon": "🔧"
            },
            "characters": {
                "folder": "characters",
                "display_name": "角色卡",
                "icon": "👤"
            },
            "personas": {
                "folder": "personas",
                "display_name": "用户信息",
                "icon": "🧑"
            },
            "conversations": {
                "folder": "conversations",
                "display_name": "对话历史",
                "icon": "💬"
            }
        }
        
        for config_type, folder_info in config_folders.items():
            folder_path = shared_path / folder_info["folder"]
            files = []
            
            if folder_path.exists() and folder_path.is_dir():
                for file_path in folder_path.iterdir():
                    if file_path.is_file() and file_path.suffix.lower() in ['.json']:
                        stat_info = file_path.stat()
                        files.append({
                            "name": file_path.name,
                            "path": f"{folder_info['folder']}/{file_path.name}",
                            "display_name": file_path.stem,
                            "size": stat_info.st_size,
                            "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat()
                        })
                
                # 按文件名排序
                files.sort(key=lambda x: x["name"].lower())
            
            config_options[config_type] = {
                "display_name": folder_info["display_name"],
                "icon": folder_info["icon"],
                "files": files,
                "has_files": len(files) > 0
            }
        
        return {
            "success": True,
            "config_options": config_options,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"获取配置选项失败: {str(e)}",
            "config_options": {}
        }

@register_function(name="config_manager.set_active_config", outputs=["config_result"])
def set_active_config(config_type: str, file_path: str = None):
    """
    设置活跃配置并自动保存用户偏好设置
    
    Args:
        config_type: 配置类型 (presets, world_books, regex_rules, characters, personas, conversations)
        file_path: 文件路径，如果为None则清空该配置
    """
    global _active_config
    
    if config_type not in _active_config:
        return {
            "success": False,
            "error": f"不支持的配置类型: {config_type}"
        }
    
    try:
        # 设置配置
        _active_config[config_type] = file_path
        
        # 如果是对话历史，需要加载对话内容
        if config_type == "conversations" and file_path:
            load_result = _load_conversation(file_path)
            if not load_result["success"]:
                return load_result
        
        # 自动保存用户偏好设置
        save_success = _save_user_preferences()
        if not save_success:
            print(f"⚠️ 自动保存用户偏好设置失败，但配置已设置")
        
        return {
            "success": True,
            "message": f"已设置 {config_type} 配置为: {file_path or '未选择'}",
            "active_config": _active_config.copy(),
            "preferences_saved": save_success,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"设置配置失败: {str(e)}"
        }

@register_function(name="config_manager.get_active_config", outputs=["active_config"])
def get_active_config():
    """
    获取当前活跃配置
    """
    return {
        "success": True,
        "active_config": _active_config.copy(),
        "timestamp": datetime.now().isoformat()
    }

@register_function(name="config_manager.load_selected_config", outputs=["loaded_config"])
def load_selected_config():
    """
    加载当前选中的配置到全局变量
    """
    service_manager = get_service_manager()
    g = get_current_globals()
    shared_path = service_manager.get_shared_path()
    
    if not shared_path or not g:
        return {
            "success": False,
            "error": "系统未初始化"
        }
    
    try:
        loaded_items = {}
        
        # 加载对话历史
        if _active_config["conversations"]:
            conversation_result = _load_conversation(_active_config["conversations"])
            if conversation_result["success"]:
                loaded_items["conversations"] = _active_config["conversations"]
        
        # 加载预设
        if _active_config["presets"]:
            preset_path = shared_path / _active_config["presets"]
            if preset_path.exists():
                with open(preset_path, 'r', encoding='utf-8') as f:
                    g.preset = json.load(f)
                    loaded_items["presets"] = _active_config["presets"]
        
        # 加载世界书
        world_books = []
        if _active_config["world_books"]:
            wb_path = shared_path / _active_config["world_books"]
            if wb_path.exists():
                with open(wb_path, 'r', encoding='utf-8') as f:
                    wb_data = json.load(f)
                    if isinstance(wb_data, list):
                        world_books.extend(wb_data)
                    else:
                        world_books.append(wb_data)
                    loaded_items["world_books"] = _active_config["world_books"]
        g.world_book_files = world_books
        
        # 加载正则规则
        regex_rules = []
        if _active_config["regex_rules"]:
            regex_path = shared_path / _active_config["regex_rules"]
            if regex_path.exists():
                with open(regex_path, 'r', encoding='utf-8') as f:
                    regex_data = json.load(f)
                    if isinstance(regex_data, list):
                        regex_rules.extend(regex_data)
                    else:
                        regex_rules.append(regex_data)
                    loaded_items["regex_rules"] = _active_config["regex_rules"]
        g.regex_rules_files = regex_rules
        
        return {
            "success": True,
            "loaded_items": loaded_items,
            "active_config": _active_config.copy(),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"加载配置失败: {str(e)}"
        }

def _load_conversation(conversation_path: str):
    """
    加载对话历史
    """
    try:
        service_manager = get_service_manager()
        g = get_current_globals()
        shared_path = service_manager.get_shared_path()
        
        full_path = shared_path / conversation_path
        if not full_path.exists():
            return {
                "success": False,
                "error": f"对话文件不存在: {conversation_path}"
            }
        
        with open(full_path, 'r', encoding='utf-8') as f:
            conversation_data = json.load(f)
        
        # 更新全局对话历史
        if isinstance(conversation_data, list):
            g.conversation_history = conversation_data
        else:
            g.conversation_history = []
        
        return {
            "success": True,
            "message": f"已加载对话: {conversation_path}",
            "conversation_length": len(g.conversation_history)
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"加载对话失败: {str(e)}"
        }

def get_current_config():
    """
    获取当前配置的简单访问接口
    """
    return _active_config.copy()

@register_function(name="config_manager.sync_display_history", outputs=["sync_result"])
def sync_display_history():
    """
    同步对话历史到display_history文件，用于前端显示
    """
    try:
        service_manager = get_service_manager()
        g = get_current_globals()
        shared_path = service_manager.get_shared_path()
        
        # 确保有对话历史
        if not hasattr(g, 'conversation_history') or not g.conversation_history:
            # 如果没有对话历史，清空display_history
            display_history_path = shared_path / "conversations/display_history/display_chat.json"
            os.makedirs(display_history_path.parent, exist_ok=True)
            
            with open(display_history_path, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)
            
            return {
                "success": True,
                "message": "已清空display_history",
                "history_count": 0
            }
        
        # 创建干净的对话历史用于前端显示
        clean_history = []
        for msg in g.conversation_history:
            if isinstance(msg, dict) and msg.get("role") in ["user", "assistant"] and msg.get("content"):
                clean_history.append({
                    "role": msg["role"],
                    "content": str(msg["content"]).strip()
                })
        
        # 保存到display_history文件
        display_history_path = shared_path / "conversations/display_history/display_chat.json"
        os.makedirs(display_history_path.parent, exist_ok=True)
        
        with open(display_history_path, 'w', encoding='utf-8') as f:
            json.dump(clean_history, f, ensure_ascii=False, indent=2)
        
        return {
            "success": True,
            "message": f"已同步 {len(clean_history)} 条对话到display_history",
            "history_count": len(clean_history)
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"同步display_history失败: {str(e)}"
        }

def _load_user_preferences():
    """
    从文件加载用户偏好设置
    """
    global _active_config, _ui_settings
    
    try:
        service_manager = get_service_manager()
        shared_path = service_manager.get_shared_path()
        
        if not shared_path:
            return False
            
        preferences_path = shared_path / "user_preferences.json"
        
        if not preferences_path.exists():
            # 创建默认偏好设置文件
            _create_default_preferences()
            return True
            
        with open(preferences_path, 'r', encoding='utf-8') as f:
            preferences = json.load(f)
            
        # 加载活跃配置
        if "active_configs" in preferences:
            for config_type, file_path in preferences["active_configs"].items():
                if config_type in _active_config:
                    _active_config[config_type] = file_path
        
        # 加载UI设置
        if "ui_settings" in preferences:
            ui_settings = preferences["ui_settings"]
            # 更新UI设置，保留默认值
            for key, value in ui_settings.items():
                if key in _ui_settings:
                    _ui_settings[key] = value
                    
        return True
        
    except Exception as e:
        print(f"❌ 加载用户偏好设置失败: {e}")
        return False

def _save_user_preferences():
    """
    保存用户偏好设置到文件
    """
    try:
        service_manager = get_service_manager()
        shared_path = service_manager.get_shared_path()
        
        if not shared_path:
            return False
            
        preferences_path = shared_path / "user_preferences.json"
        
        # 确保目录存在
        os.makedirs(preferences_path.parent, exist_ok=True)
        
        preferences = {
            "version": "1.0.0",
            "last_updated": datetime.now().isoformat(),
            "active_configs": _active_config.copy(),
            "ui_settings": _ui_settings.copy()  # 添加UI设置
        }
        
        with open(preferences_path, 'w', encoding='utf-8') as f:
            json.dump(preferences, f, ensure_ascii=False, indent=2)
            
        return True
        
    except Exception as e:
        print(f"❌ 保存用户偏好设置失败: {e}")
        return False

def _create_default_preferences():
    """
    创建默认用户偏好设置文件
    """
    try:
        service_manager = get_service_manager()
        shared_path = service_manager.get_shared_path()
        
        if not shared_path:
            return False
            
        preferences_path = shared_path / "user_preferences.json"
        
        # 确保目录存在
        os.makedirs(preferences_path.parent, exist_ok=True)
        
        default_preferences = {
            "version": "1.0.0",
            "last_updated": datetime.now().isoformat(),
            "active_configs": {
                "presets": None,
                "world_books": None,
                "regex_rules": None,
                "conversations": None
            },
            "ui_settings": _ui_settings.copy()  # 添加UI设置
        }
        
        with open(preferences_path, 'w', encoding='utf-8') as f:
            json.dump(default_preferences, f, ensure_ascii=False, indent=2)
            
        return True
        
    except Exception as e:
        print(f"❌ 创建默认用户偏好设置失败: {e}")
        return False

@register_function(name="config_manager.get_ui_settings", outputs=["ui_settings_result"])
def get_ui_settings():
    """
    获取UI设置
    """
    try:
        return {
            "success": True,
            "ui_settings": _ui_settings.copy(),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"获取UI设置失败: {str(e)}",
            "ui_settings": {}
        }

@register_function(name="config_manager.update_ui_settings", outputs=["update_result"])
def update_ui_settings(settings: Dict[str, Any]):
    """
    更新UI设置
    
    Args:
        settings: 要更新的UI设置字典
    """
    global _ui_settings
    
    try:
        # 验证设置
        validated_settings = {}
        
        # 验证并更新楼层数
        if "floorCount" in settings:
            floor_count = int(settings["floorCount"])
            validated_settings["floorCount"] = max(3, min(50, floor_count))
            
        # 验证并更新消息面板宽度
        if "messagePanelWidth" in settings:
            message_width = int(settings["messagePanelWidth"])
            validated_settings["messagePanelWidth"] = max(20, min(100, message_width))
            
        # 验证并更新输入框宽度
        if "inputPanelWidth" in settings:
            input_width = int(settings["inputPanelWidth"])
            validated_settings["inputPanelWidth"] = max(20, min(100, input_width))
        
        # 更新设置
        for key, value in validated_settings.items():
            _ui_settings[key] = value
        
        # 保存设置
        save_success = _save_user_preferences()
        
        return {
            "success": True,
            "message": "UI设置已更新",
            "updated_settings": validated_settings,
            "current_settings": _ui_settings.copy(),
            "preferences_saved": save_success,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"更新UI设置失败: {str(e)}"
        }

@register_function(name="config_manager.load_user_preferences", outputs=["preferences_result"])
def load_user_preferences():
    """
    加载用户偏好设置并应用到当前配置
    """
    try:
        success = _load_user_preferences()
        if success:
            return {
                "success": True,
                "message": "用户偏好设置已加载",
                "active_config": _active_config.copy(),
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "success": False,
                "error": "加载用户偏好设置失败",
                "active_config": _active_config.copy()
            }
    except Exception as e:
        return {
            "success": False,
            "error": f"加载用户偏好设置异常: {str(e)}",
            "active_config": _active_config.copy()
        }

@register_function(name="config_manager.save_user_preferences", outputs=["save_result"])
def save_user_preferences():
    """
    保存当前配置到用户偏好设置文件
    """
    try:
        success = _save_user_preferences()
        if success:
            return {
                "success": True,
                "message": "用户偏好设置已保存",
                "active_config": _active_config.copy(),
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "success": False,
                "error": "保存用户偏好设置失败"
            }
    except Exception as e:
        return {
            "success": False,
            "error": f"保存用户偏好设置异常: {str(e)}"
        }

def set_default_config():
    """
    设置默认配置（选择每个类型的第一个可用文件）
    """
    global _active_config
    
    config_options_result = get_config_options()
    if not config_options_result["success"]:
        return
    
    config_options = config_options_result["config_options"]
    
    for config_type, options in config_options.items():
        if options["has_files"] and len(options["files"]) > 0:
            # 选择第一个文件
            first_file = options["files"][0]
            _active_config[config_type] = first_file["path"]

# 在模块加载时自动加载用户偏好设置
def initialize_config_manager():
    """
    初始化配置管理器，加载用户偏好设置
    """
    print("🔧 初始化配置管理器...")
    success = _load_user_preferences()
    if success:
        print("✓ 用户偏好设置已加载")
    else:
        print("⚠️ 用户偏好设置加载失败，使用默认配置")

# 在模块加载时执行初始化
initialize_config_manager()