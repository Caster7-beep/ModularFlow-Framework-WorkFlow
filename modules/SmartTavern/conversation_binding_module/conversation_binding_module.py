import os
import json
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime
from core.function_registry import register_function
from core.services import get_service_manager, get_current_globals

# 绑定数据文件路径
BINDINGS_FILE = "conversations/conversation_character_bindings.json"
USER_BINDINGS_FILE = "conversations/conversation_user_bindings.json"
FULL_BINDINGS_FILE = "conversations/conversation_full_bindings.json"

@register_function(name="conversation_binding.load_bindings", outputs=["bindings"])
def load_bindings():
    """
    加载对话与角色卡的绑定关系数据
    """
    try:
        service_manager = get_service_manager()
        shared_path = service_manager.get_shared_path()
        
        if not shared_path or not shared_path.exists():
            return {
                "success": False,
                "error": "共享数据路径不存在",
                "bindings": {}
            }
        
        bindings_file = shared_path / BINDINGS_FILE
        
        if not bindings_file.exists():
            # 如果绑定文件不存在，创建空的绑定文件
            bindings_file.parent.mkdir(parents=True, exist_ok=True)
            empty_bindings = {}
            with open(bindings_file, 'w', encoding='utf-8') as f:
                json.dump(empty_bindings, f, ensure_ascii=False, indent=2)
            return {
                "success": True,
                "bindings": empty_bindings,
                "timestamp": datetime.now().isoformat()
            }
        
        with open(bindings_file, 'r', encoding='utf-8') as f:
            bindings = json.load(f)
        
        return {
            "success": True,
            "bindings": bindings,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"加载绑定数据失败: {str(e)}",
            "bindings": {}
        }

@register_function(name="conversation_binding.save_bindings", outputs=["save_result"])
def save_bindings(bindings: Dict[str, Any]):
    """
    保存对话与角色卡的绑定关系数据
    
    Args:
        bindings: 绑定关系字典，格式为 {conversation_path: character_path}
    """
    try:
        service_manager = get_service_manager()
        shared_path = service_manager.get_shared_path()
        
        if not shared_path or not shared_path.exists():
            return {
                "success": False,
                "error": "共享数据路径不存在"
            }
        
        bindings_file = shared_path / BINDINGS_FILE
        bindings_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(bindings_file, 'w', encoding='utf-8') as f:
            json.dump(bindings, f, ensure_ascii=False, indent=2)
        
        return {
            "success": True,
            "message": "绑定数据已保存",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"保存绑定数据失败: {str(e)}"
        }

@register_function(name="conversation_binding.set_binding", outputs=["binding_result"])
def set_binding(conversation_path: str, character_path: str = None):
    """
    设置对话与角色卡的绑定关系
    
    Args:
        conversation_path: 对话文件路径
        character_path: 角色卡文件路径，如果为None则解除绑定
    """
    try:
        # 加载当前绑定数据
        load_result = load_bindings()
        if not load_result["success"]:
            return load_result
        
        bindings = load_result["bindings"]
        
        if character_path is None:
            # 解除绑定
            if conversation_path in bindings:
                del bindings[conversation_path]
                message = f"已解除对话 '{conversation_path}' 的角色卡绑定"
            else:
                message = f"对话 '{conversation_path}' 没有绑定的角色卡"
        else:
            # 设置绑定
            bindings[conversation_path] = character_path
            message = f"已将对话 '{conversation_path}' 绑定到角色卡 '{character_path}'"
        
        # 保存更新后的绑定数据
        save_result = save_bindings(bindings)
        if not save_result["success"]:
            return save_result
        
        return {
            "success": True,
            "message": message,
            "conversation_path": conversation_path,
            "character_path": character_path,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"设置绑定失败: {str(e)}"
        }

@register_function(name="conversation_binding.get_binding", outputs=["binding_info"])
def get_binding(conversation_path: str):
    """
    获取指定对话的角色卡绑定信息
    
    Args:
        conversation_path: 对话文件路径
    """
    try:
        load_result = load_bindings()
        if not load_result["success"]:
            return load_result
        
        bindings = load_result["bindings"]
        character_path = bindings.get(conversation_path)
        
        return {
            "success": True,
            "conversation_path": conversation_path,
            "character_path": character_path,
            "has_binding": character_path is not None,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"获取绑定信息失败: {str(e)}",
            "character_path": None,
            "has_binding": False
        }

@register_function(name="conversation_binding.get_conversations_with_bindings", outputs=["conversations_with_bindings"])
def get_conversations_with_bindings(conversation_storage: str = "shared/SmartTavern/conversations"):
    """
    获取所有对话文件及其绑定的角色卡信息
    
    Args:
        conversation_storage: 对话文件存储目录
    """
    try:
        service_manager = get_service_manager()
        shared_path = service_manager.get_shared_path()
        
        if not shared_path or not shared_path.exists():
            return {
                "success": False,
                "error": "共享数据路径不存在",
                "conversations": []
            }
        
        # 加载绑定数据
        load_result = load_bindings()
        if not load_result["success"]:
            return {
                "success": False,
                "error": load_result["error"],
                "conversations": []
            }
        
        bindings = load_result["bindings"]
        
        # 获取所有对话文件
        conversations_dir = shared_path / "conversations"
        conversations = []
        
        if conversations_dir.exists():
            for root, dirs, files in os.walk(conversations_dir):
                for file in files:
                    if file.endswith('.json') and not file.startswith('conversation_character_bindings'):
                        full_path = os.path.join(root, file)
                        relative_path = os.path.relpath(full_path, conversations_dir)
                        relative_path = relative_path.replace('\\', '/')
                        
                        # 跳过 display_history 目录
                        if 'display_history' in relative_path:
                            continue
                        
                        stat_info = os.stat(full_path)
                        
                        # 尝试读取文件内容获取消息数量
                        try:
                            with open(full_path, 'r', encoding='utf-8') as f:
                                content = json.load(f)
                                message_count = len(content) if isinstance(content, list) else 0
                        except:
                            message_count = 0
                        
                        # 获取绑定的角色卡信息
                        character_path = bindings.get(relative_path)
                        character_info = {}
                        
                        if character_path:
                            try:
                                character_full_path = shared_path / character_path
                                if character_full_path.exists():
                                    with open(character_full_path, 'r', encoding='utf-8') as f:
                                        character_data = json.load(f)
                                        character_info = {
                                            "character_path": character_path,
                                            "character_name": character_data.get("name", "未命名角色"),
                                            "character_description": character_data.get("description", ""),
                                            "character_avatar": character_data.get("avatar", "")
                                        }
                            except Exception as e:
                                print(f"⚠️ 加载角色卡 {character_path} 失败: {e}")
                        
                        conversation_info = {
                            "name": file,
                            "path": relative_path,
                            "display_name": os.path.splitext(file)[0],
                            "size": stat_info.st_size,
                            "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                            "message_count": message_count,
                            **character_info  # 包含角色卡信息
                        }
                        
                        conversations.append(conversation_info)
        
        # 按修改时间排序，最新的在前
        conversations.sort(key=lambda x: x["modified"], reverse=True)
        
        return {
            "success": True,
            "conversations": conversations,
            "total_count": len(conversations),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"获取对话绑定信息失败: {str(e)}",
            "conversations": []
        }

@register_function(name="conversation_binding.load_full_bindings", outputs=["full_bindings"])
def load_full_bindings():
    """
    加载对话的完整绑定关系数据（用户+角色卡）
    """
    try:
        service_manager = get_service_manager()
        shared_path = service_manager.get_shared_path()
        
        if not shared_path or not shared_path.exists():
            return {
                "success": False,
                "error": "共享数据路径不存在",
                "bindings": {}
            }
        
        full_bindings_file = shared_path / FULL_BINDINGS_FILE
        
        if not full_bindings_file.exists():
            # 如果完整绑定文件不存在，创建空的绑定文件
            full_bindings_file.parent.mkdir(parents=True, exist_ok=True)
            empty_bindings = {}
            with open(full_bindings_file, 'w', encoding='utf-8') as f:
                json.dump(empty_bindings, f, ensure_ascii=False, indent=2)
            return {
                "success": True,
                "bindings": empty_bindings,
                "timestamp": datetime.now().isoformat()
            }
        
        with open(full_bindings_file, 'r', encoding='utf-8') as f:
            bindings = json.load(f)
        
        return {
            "success": True,
            "bindings": bindings,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"加载完整绑定数据失败: {str(e)}",
            "bindings": {}
        }

@register_function(name="conversation_binding.save_full_bindings", outputs=["save_result"])
def save_full_bindings(bindings: Dict[str, Any]):
    """
    保存对话的完整绑定关系数据
    
    Args:
        bindings: 完整绑定关系字典，格式为 {conversation_path: {"user_path": "...", "character_path": "..."}}
    """
    try:
        service_manager = get_service_manager()
        shared_path = service_manager.get_shared_path()
        
        if not shared_path or not shared_path.exists():
            return {
                "success": False,
                "error": "共享数据路径不存在"
            }
        
        full_bindings_file = shared_path / FULL_BINDINGS_FILE
        full_bindings_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(full_bindings_file, 'w', encoding='utf-8') as f:
            json.dump(bindings, f, ensure_ascii=False, indent=2)
        
        return {
            "success": True,
            "message": "完整绑定数据已保存",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"保存完整绑定数据失败: {str(e)}"
        }

@register_function(name="conversation_binding.set_full_binding", outputs=["full_binding_result"])
def set_full_binding(conversation_path: str, user_path: str = None, character_path: str = None):
    """
    设置对话的完整绑定关系（用户+角色卡）
    
    Args:
        conversation_path: 对话文件路径
        user_path: 用户文件路径，如果为None则不变更
        character_path: 角色卡文件路径，如果为None则不变更
    """
    try:
        # 加载当前完整绑定数据
        load_result = load_full_bindings()
        if not load_result["success"]:
            return load_result
        
        bindings = load_result["bindings"]
        
        # 获取当前绑定或创建新绑定
        current_binding = bindings.get(conversation_path, {})
        
        # 更新绑定信息
        if user_path is not None:
            current_binding["user_path"] = user_path
        if character_path is not None:
            current_binding["character_path"] = character_path
        
        # 如果绑定为空，删除该条目
        if not current_binding.get("user_path") and not current_binding.get("character_path"):
            if conversation_path in bindings:
                del bindings[conversation_path]
            message = f"已清空对话 '{conversation_path}' 的所有绑定"
        else:
            bindings[conversation_path] = current_binding
            message = f"已更新对话 '{conversation_path}' 的绑定关系"
        
        # 保存更新后的绑定数据
        save_result = save_full_bindings(bindings)
        if not save_result["success"]:
            return save_result
        
        return {
            "success": True,
            "message": message,
            "conversation_path": conversation_path,
            "binding": current_binding,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"设置完整绑定失败: {str(e)}"
        }

@register_function(name="conversation_binding.get_full_binding", outputs=["full_binding_info"])
def get_full_binding(conversation_path: str):
    """
    获取指定对话的完整绑定信息（用户+角色卡）
    
    Args:
        conversation_path: 对话文件路径
    """
    try:
        load_result = load_full_bindings()
        if not load_result["success"]:
            return load_result
        
        bindings = load_result["bindings"]
        binding = bindings.get(conversation_path, {})
        
        return {
            "success": True,
            "conversation_path": conversation_path,
            "user_path": binding.get("user_path"),
            "character_path": binding.get("character_path"),
            "has_binding": bool(binding.get("user_path") or binding.get("character_path")),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"获取完整绑定信息失败: {str(e)}",
            "user_path": None,
            "character_path": None,
            "has_binding": False
        }

@register_function(name="conversation_binding.get_conversations_with_full_bindings", outputs=["conversations_with_full_bindings"])
def get_conversations_with_full_bindings():
    """
    获取所有对话文件及其完整绑定信息（用户+角色卡）
    """
    try:
        service_manager = get_service_manager()
        shared_path = service_manager.get_shared_path()
        
        if not shared_path or not shared_path.exists():
            return {
                "success": False,
                "error": "共享数据路径不存在",
                "conversations": []
            }
        
        # 加载完整绑定数据
        load_result = load_full_bindings()
        if not load_result["success"]:
            return {
                "success": False,
                "error": load_result["error"],
                "conversations": []
            }
        
        bindings = load_result["bindings"]
        
        # 获取所有对话文件
        conversations_dir = shared_path / "conversations"
        conversations = []
        
        if conversations_dir.exists():
            for root, dirs, files in os.walk(conversations_dir):
                for file in files:
                    if file.endswith('.json') and not file.startswith('conversation_'):
                        full_path = os.path.join(root, file)
                        relative_path = os.path.relpath(full_path, conversations_dir)
                        relative_path = relative_path.replace('\\', '/')
                        
                        # 跳过 display_history 目录
                        if 'display_history' in relative_path:
                            continue
                        
                        stat_info = os.stat(full_path)
                        
                        # 尝试读取文件内容获取消息数量
                        try:
                            with open(full_path, 'r', encoding='utf-8') as f:
                                content = json.load(f)
                                message_count = len(content) if isinstance(content, list) else 0
                        except:
                            message_count = 0
                        
                        # 获取绑定信息
                        binding = bindings.get(relative_path, {})
                        user_path = binding.get("user_path")
                        character_path = binding.get("character_path")
                        
                        # 加载用户信息
                        user_info = {}
                        if user_path:
                            try:
                                user_full_path = shared_path / user_path
                                if user_full_path.exists():
                                    with open(user_full_path, 'r', encoding='utf-8') as f:
                                        user_data = json.load(f)
                                        user_info = {
                                            "user_path": user_path,
                                            "user_name": user_data.get("name", "未命名用户"),
                                            "user_description": user_data.get("description", "")
                                        }
                            except Exception as e:
                                print(f"⚠️ 加载用户信息 {user_path} 失败: {e}")
                        
                        # 加载角色卡信息
                        character_info = {}
                        if character_path:
                            try:
                                character_full_path = shared_path / character_path
                                if character_full_path.exists():
                                    with open(character_full_path, 'r', encoding='utf-8') as f:
                                        character_data = json.load(f)
                                        character_info = {
                                            "character_path": character_path,
                                            "character_name": character_data.get("name", "未命名角色"),
                                            "character_description": character_data.get("description", ""),
                                            "character_avatar": character_data.get("avatar", "")
                                        }
                            except Exception as e:
                                print(f"⚠️ 加载角色卡 {character_path} 失败: {e}")
                        
                        conversation_info = {
                            "name": file,
                            "path": relative_path,
                            "display_name": os.path.splitext(file)[0],
                            "size": stat_info.st_size,
                            "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                            "message_count": message_count,
                            **user_info,     # 包含用户信息
                            **character_info  # 包含角色卡信息
                        }
                        
                        conversations.append(conversation_info)
        
        # 按修改时间排序，最新的在前
        conversations.sort(key=lambda x: x["modified"], reverse=True)
        
        return {
            "success": True,
            "conversations": conversations,
            "total_count": len(conversations),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"获取对话完整绑定信息失败: {str(e)}",
            "conversations": []
        }

@register_function(name="conversation_binding.cleanup_invalid_bindings", outputs=["cleanup_result"])
def cleanup_invalid_bindings():
    """
    清理无效的绑定关系（对话文件或角色卡文件不存在）
    """
    try:
        service_manager = get_service_manager()
        shared_path = service_manager.get_shared_path()
        
        if not shared_path or not shared_path.exists():
            return {
                "success": False,
                "error": "共享数据路径不存在"
            }
        
        # 清理旧版绑定数据
        load_result = load_bindings()
        if load_result["success"]:
            bindings = load_result["bindings"]
            cleaned_bindings = {}
            removed_bindings = []
            
            for conversation_path, character_path in bindings.items():
                conv_file = shared_path / "conversations" / conversation_path
                char_file = shared_path / character_path
                
                if conv_file.exists() and char_file.exists():
                    cleaned_bindings[conversation_path] = character_path
                else:
                    removed_bindings.append({
                        "conversation_path": conversation_path,
                        "character_path": character_path,
                        "reason": "文件不存在"
                    })
            
            if removed_bindings:
                save_bindings(cleaned_bindings)
        
        # 清理完整绑定数据
        full_load_result = load_full_bindings()
        if not full_load_result["success"]:
            return full_load_result
        
        full_bindings = full_load_result["bindings"]
        cleaned_full_bindings = {}
        removed_full_bindings = []
        
        for conversation_path, binding_info in full_bindings.items():
            conv_file = shared_path / "conversations" / conversation_path
            user_path = binding_info.get("user_path")
            character_path = binding_info.get("character_path")
            
            # 检查对话文件是否存在
            if not conv_file.exists():
                removed_full_bindings.append({
                    "conversation_path": conversation_path,
                    "reason": "对话文件不存在"
                })
                continue
            
            # 检查绑定文件是否存在
            valid_binding = {}
            if user_path:
                user_file = shared_path / user_path
                if user_file.exists():
                    valid_binding["user_path"] = user_path
                else:
                    print(f"⚠️ 用户文件 {user_path} 不存在")
            
            if character_path:
                char_file = shared_path / character_path
                if char_file.exists():
                    valid_binding["character_path"] = character_path
                else:
                    print(f"⚠️ 角色卡文件 {character_path} 不存在")
            
            if valid_binding:
                cleaned_full_bindings[conversation_path] = valid_binding
            else:
                removed_full_bindings.append({
                    "conversation_path": conversation_path,
                    "reason": "所有绑定文件都不存在"
                })
        
        # 保存清理后的完整绑定数据
        if removed_full_bindings:
            save_result = save_full_bindings(cleaned_full_bindings)
            if not save_result["success"]:
                return save_result
        
        return {
            "success": True,
            "message": f"已清理 {len(removed_full_bindings)} 个无效完整绑定",
            "removed_bindings": removed_full_bindings,
            "remaining_bindings": len(cleaned_full_bindings),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"清理绑定数据失败: {str(e)}"
        }