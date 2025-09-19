"""
SmartTavern API网关函数模块

该模块负责注册所有SmartTavern的API函数，将API注册逻辑从启动脚本中分离出来，
提高代码的可维护性和可重用性。
"""

import os
import json
from datetime import datetime
from typing import Dict, Any

from core.function_registry import register_function, get_registry
from shared.SmartTavern import globals as g

# 导入UI设置API函数
from .api_gateway_functions_module_ui_settings import get_ui_settings, update_ui_settings
# 导入图片导入API函数
from .image_import_api import register_image_import_api


def setup_smarttavern_api_functions(project_config: Dict[str, Any], llm_manager=None):
    """
    为SmartTavern对话系统设置自定义API函数
    
    Args:
        project_config: 项目配置字典
        llm_manager: LLM管理器实例
    """
    project_info = project_config.get("project", {})
    backend_config = project_config.get("backend", {})
    smarttavern_config = backend_config.get("smarttavern", {})
    
    # 注册图片导入API函数
    register_image_import_api()
    
    # 获取配置参数
    conversation_storage = smarttavern_config.get("conversation_storage", "shared/SmartTavern/conversations")
    default_conversation_file = smarttavern_config.get("default_conversation_file", "current_chat.json")
    character_file = smarttavern_config.get("character_file", "许莲笙.json")
    persona_file = smarttavern_config.get("persona_file", "default_user.json")
    workflow_name = smarttavern_config.get("workflow", "prompt_api_call_workflow")
    
    @register_function(name="SmartTavern.send_message", outputs=["response"])
    def send_message(message: str, stream: bool = False, conversation_file: str = None, llm_config: Dict[str, Any] = None):
        """发送消息给AI并获取回复（使用SmartTavern工作流），直接返回对话历史内容
        
        Args:
            message: 用户消息内容
            stream: 是否流式传输
            conversation_file: 指定的对话文件路径（相对于conversation_storage），如果为None则使用默认文件
            llm_config: LLM配置参数，包含provider, api_url, api_key, model_id等
        """
        try:
            # 0. 首先加载配置管理器的当前配置
            registry = get_registry()
            config_load_result = registry.call("config_manager.load_selected_config")
            if not config_load_result or not config_load_result.get("success"):
                print("⚠️ 加载配置失败，使用默认配置")
            
            # 构建对话文件路径
            if conversation_file:
                # 使用指定的对话文件路径
                conversation_file_path = f"{conversation_storage}/{conversation_file}"
                # 更新当前默认对话文件配置
                smarttavern_config["default_conversation_file"] = conversation_file
            else:
                # 使用默认对话文件
                conversation_file_path = f"{conversation_storage}/{default_conversation_file}"
            
            # 1. 先将用户消息保存到原始对话历史文件中
            user_message = {"role": "user", "content": message}
            _add_message_to_conversation_file(conversation_file_path, user_message)
            
            # 2. 调用SmartTavern工作流处理该对话文件
            workflow = registry.get_workflow(workflow_name)
            
            if not workflow:
                return {
                    "success": False,
                    "error": f"工作流不存在: {workflow_name}",
                    "message": "SmartTavern工作流配置错误",
                    "history": []
                }
            
            # 3. 处理LLM配置
            llm_params = {
                "model": "gemini-2.5-flash",
                "max_tokens": 2048,
                "temperature": 0.7
            }
            
            # 初始化parsed_custom_fields变量
            parsed_custom_fields = {}
            
            # 如果提供了自定义LLM配置，使用自定义配置
            if llm_config:
                if llm_config.get('provider') and llm_config.get('api_key'):
                    # 检查是否是已存在的配置ID
                    config_id = llm_config.get('id')
                    actual_provider_type = llm_config.get('provider')  # 这是真实的提供商类型
                    
                    if not hasattr(g, 'api_providers'):
                        g.api_providers = {}
                    
                    # 如果有配置ID且已存在，使用现有配置；否则创建临时配置
                    if config_id and config_id in g.api_providers:
                        # 使用现有配置，但可能需要更新某些字段
                        existing_config = g.api_providers[config_id].copy()
                        
                        # 始终保存所有字段到配置，无论是否启用或为空（不包含name字段，因为name就是键名）
                        updated_fields = {
                            "base_url": llm_config.get('api_url', existing_config.get('base_url', '')),
                            "provider_type": actual_provider_type,
                            # 始终保存字段内容，即使为空或关闭
                            "api_key": llm_config.get('api_key', existing_config.get('api_key', '')),
                            "models": llm_config.get('model_id', existing_config.get('models', 'gemini-2.5-flash')),
                            "max_tokens": llm_config.get('max_tokens', existing_config.get('max_tokens', 2048)),
                            "temperature": llm_config.get('temperature', existing_config.get('temperature', 0.7)),
                            "custom_fields": llm_config.get('custom_fields', existing_config.get('custom_fields', '')),
                            # 保存开关状态
                            "enable_api_key": llm_config.get('enable_api_key', existing_config.get('enable_api_key', True)),
                            "enable_model_id": llm_config.get('enable_model_id', existing_config.get('enable_model_id', True)),
                            "enable_temperature": llm_config.get('enable_temperature', existing_config.get('enable_temperature', True)),
                            "enable_max_tokens": llm_config.get('enable_max_tokens', existing_config.get('enable_max_tokens', True)),
                            "enable_custom_fields": llm_config.get('enable_custom_fields', existing_config.get('enable_custom_fields', False))
                        }
                        
                        existing_config.update(updated_fields)
                        g.api_providers[config_id] = existing_config
                        temp_provider_id = config_id
                        print(f"🔧 使用已有配置: {llm_config.get('name', config_id)} (类型: {actual_provider_type})")
                    else:
                        # 创建新的临时配置
                        temp_provider_id = config_id or f"custom_{actual_provider_type}_{datetime.now().strftime('%H%M%S')}"
                        
                        # 始终保存所有字段到配置，无论是否启用或为空
                        config_data = {
                            "name": llm_config.get('name', '自定义配置'),
                            "base_url": llm_config.get('api_url', ''),
                            "provider_type": actual_provider_type,
                            # 始终保存所有字段，即使为空或关闭
                            "api_key": llm_config.get('api_key', ''),
                            "models": llm_config.get('model_id', 'gpt-3.5-turbo'),
                            "max_tokens": llm_config.get('max_tokens', 2048),
                            "temperature": llm_config.get('temperature', 0.7),
                            "custom_fields": llm_config.get('custom_fields', ''),
                            # 保存开关状态
                            "enable_api_key": llm_config.get('enable_api_key', True),
                            "enable_model_id": llm_config.get('enable_model_id', True),
                            "enable_temperature": llm_config.get('enable_temperature', True),
                            "enable_max_tokens": llm_config.get('enable_max_tokens', True),
                            "enable_custom_fields": llm_config.get('enable_custom_fields', False)
                        }
                        
                        g.api_providers[temp_provider_id] = config_data
                        print(f"🔧 创建临时配置: {llm_config.get('name', temp_provider_id)} (类型: {actual_provider_type})")
                    
                    # 临时切换活动提供商
                    original_provider = getattr(g, 'active_api_provider', 'openai')
                    g.active_api_provider = temp_provider_id
                    
                    # 根据字段开关和内容设置API参数
                    # 新规则：
                    # - 启用且内容为空：发送空字段（除了自定义字段）
                    # - 启用且内容不为空：发送完整字段
                    # - 关闭：不发送字段（无论内容是否为空）
                    
                    # 处理模型ID
                    if llm_config.get('enable_model_id', True):
                        model_id = llm_config.get('model_id', '')
                        # 启用时总是发送字段，即使为空
                        llm_params["model"] = model_id if model_id.strip() else ""
                    # 如果关闭，不设置该参数
                    
                    # 处理max_tokens
                    if llm_config.get('enable_max_tokens', True):
                        max_tokens = llm_config.get('max_tokens')
                        # 启用时总是发送字段，即使为空或0
                        llm_params["max_tokens"] = max_tokens if max_tokens is not None else 0
                    
                    # 处理temperature
                    if llm_config.get('enable_temperature', True):
                        temperature = llm_config.get('temperature')
                        # 启用时总是发送字段，即使为空或0
                        llm_params["temperature"] = temperature if temperature is not None else 0.0
                    
                    # 解析自定义字段并准备传递给工作流
                    parsed_custom_fields = {}
                    if llm_config.get('enable_custom_fields', False):
                        custom_fields = llm_config.get('custom_fields', '')
                        if custom_fields and custom_fields.strip():
                            parsed_custom_fields = _parse_custom_fields(custom_fields)
                            print(f"🔧 解析自定义字段结果: {parsed_custom_fields}")
                else:
                    print("⚠️ LLM配置不完整，使用默认配置")
            
            # 4. 执行工作流，工作流会自动更新原始对话文件
            workflow_kwargs = {
                "conversation_file": conversation_file_path,
                "character_file": character_file,
                "persona_file": persona_file,
                "stream": stream,
                **llm_params
            }
            
            # 如果有自定义字段，传递给工作流
            if parsed_custom_fields:
                workflow_kwargs["custom_params"] = parsed_custom_fields
            
            result = workflow(**workflow_kwargs)
            
            # 恢复原始API提供商设置（如果有临时更改）
            if llm_config and llm_config.get('provider') and llm_config.get('api_key'):
                # 恢复原始提供商
                g.active_api_provider = original_provider
                # 只删除临时创建的配置，保留用户已保存的配置
                if temp_provider_id in g.api_providers and not llm_config.get('id'):
                    del g.api_providers[temp_provider_id]
                    print(f"🗑️ 清理临时配置: {temp_provider_id}")
            
            if result.get("success", False):
                # 5. 读取处理后的对话文件内容并返回
                try:
                    with open(conversation_file_path, 'r', encoding='utf-8') as f:
                        processed_conversation_data = json.load(f)
                except Exception as e:
                    print(f"⚠️ 读取处理后的对话文件失败: {e}")
                    processed_conversation_data = []
                
                # 创建干净的对话历史直接返回给前端
                clean_history = []
                if isinstance(processed_conversation_data, list):
                    for msg in processed_conversation_data:
                        try:
                            if isinstance(msg, dict) and \
                               isinstance(msg.get("role"), str) and \
                               msg.get("role") in ["user", "assistant"] and \
                               msg.get("content") is not None:
                                clean_history.append({
                                    "role": msg["role"],
                                    "content": str(msg["content"]).strip()
                                })
                        except Exception as e:
                            print(f"⚠️ 处理对话消息异常，跳过：{e}, 内容：{msg}")
                            continue
                
                return {
                    "success": True,
                    "message": "消息处理成功",
                    "history": clean_history,  # 直接返回对话历史
                    "final_message_count": len(clean_history),
                    "timestamp": datetime.now().isoformat()
                }
            else:
                return {
                    "success": False,
                    "error": result.get("error", "工作流执行失败"),
                    "message": "AI回复失败",
                    "history": []
                }
                
        except Exception as e:
            import traceback
            print(f"❌ SmartTavern消息处理失败: {e}")
            print(f"堆栈跟踪: {traceback.format_exc()}")
            return {
                "success": False,
                "error": str(e),
                "message": "处理消息时发生错误",
                "history": []
            }
    
    
    @register_function(name="SmartTavern.clear_history", outputs=["result"])
    def clear_history():
        """清空对话历史"""
        try:
            conversation_file = f"{conversation_storage}/{default_conversation_file}"
            display_history_path = "shared/SmartTavern/conversations/display_history/display_chat.json"
            
            # 清空原始对话文件
            if os.path.exists(conversation_file):
                with open(conversation_file, 'w', encoding='utf-8') as f:
                    json.dump([], f, ensure_ascii=False, indent=2)
            
            # 清空显示历史文件  
            if os.path.exists(display_history_path):
                with open(display_history_path, 'w', encoding='utf-8') as f:
                    json.dump([], f, ensure_ascii=False, indent=2)
            
            return {
                "success": True,
                "message": "对话历史已清空",
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "清空历史失败",
                "timestamp": datetime.now().isoformat()
            }
    
    @register_function(name="SmartTavern.load_conversation", outputs=["result"])
    def load_conversation(filename: str):
        """加载指定的对话文件"""
        try:
            conversation_file = f"{conversation_storage}/{filename}"
            
            if not os.path.exists(conversation_file):
                return {
                    "success": False,
                    "error": f"对话文件不存在: {filename}",
                    "message": "加载对话失败"
                }
            
            # 更新配置中的默认对话文件
            smarttavern_config["default_conversation_file"] = filename
            
            return {
                "success": True,
                "message": f"已加载对话: {filename}",
                "conversation_file": filename,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "加载对话失败"
            }
    
    @register_function(name="SmartTavern.save_conversation", outputs=["result"])
    def save_conversation(filename: str = None):
        """保存当前对话到指定文件"""
        try:
            if not filename:
                filename = f"chat_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            
            current_file = f"{conversation_storage}/{default_conversation_file}"
            target_file = f"{conversation_storage}/{filename}"
            
            if os.path.exists(current_file):
                import shutil
                shutil.copy2(current_file, target_file)
            
            return {
                "success": True,
                "message": f"对话已保存: {filename}",
                "saved_file": filename,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "保存对话失败"
            }
    
    @register_function(name="SmartTavern.get_system_status", outputs=["status"])
    def get_system_status():
        """获取系统状态"""
        return {
            "success": True,
            "system": {
                "project_name": project_info.get("display_name", "SmartTavern对话系统"),
                "version": project_info.get("version", "1.0.0"),
                "workflow": workflow_name,
                "character_file": character_file,
                "persona_file": persona_file,
                "conversation_storage": conversation_storage,
                "llm_provider": "gemini",
                "llm_model": "gemini-2.5-flash",
                "llm_available": llm_manager.is_available() if llm_manager else False,
                "smarttavern_active": True,
                "timestamp": datetime.now().isoformat()
            }
        }
    
    @register_function(name="SmartTavern.get_all_files", outputs=["files"])
    def get_all_files():
        """获取 shared/SmartTavern 目录下的所有文件结构"""
        try:
            # 调用文件管理模块的扫描函数
            registry = get_registry()
            scan_function = registry.functions.get("file_manager.scan_all_files")
            
            if not scan_function:
                return {
                    "success": False,
                    "error": "文件管理模块未加载",
                    "files": {}
                }
            
            result = scan_function()
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取文件列表失败: {str(e)}",
                "files": {}
            }
    
    @register_function(name="SmartTavern.get_folder_files", outputs=["folder_files"])
    def get_folder_files(folder_name: str = None):
        """获取指定文件夹或所有文件夹的文件列表"""
        try:
            registry = get_registry()
            folder_function = registry.functions.get("file_manager.get_folder_files")
            
            if not folder_function:
                return {
                    "success": False,
                    "error": "文件管理模块未加载",
                    "folder_files": {}
                }
            
            result = folder_function(folder_name=folder_name)
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取文件夹文件失败: {str(e)}",
                "folder_files": {}
            }
    
    @register_function(name="SmartTavern.get_file_content", outputs=["file_content"])
    def get_file_content(file_path: str = None):
        """获取指定文件的内容"""
        try:
            if not file_path:
                return {
                    "success": False,
                    "error": "缺少必需参数: file_path",
                    "file_content": None
                }
            
            registry = get_registry()
            content_function = registry.functions.get("file_manager.get_file_content")
            
            if not content_function:
                return {
                    "success": False,
                    "error": "文件管理模块未加载",
                    "file_content": None
                }
            
            result = content_function(file_path=file_path)
            
            # 确保返回结果包含正确的字段名
            if result and result.get("success") and "file_content" in result:
                # 将 file_content 字段重命名为 content 以匹配前端期望
                result["content"] = result["file_content"]
            
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取文件内容失败: {str(e)}",
                "file_content": None
            }
    
    @register_function(name="SmartTavern.save_file_content", outputs=["save_result"])
    def save_file_content(file_path: str = None, content: str = None):
        """保存内容到指定文件"""
        try:
            if not file_path:
                return {
                    "success": False,
                    "error": "缺少必需参数: file_path",
                    "message": "文件路径不能为空"
                }
            
            if content is None:
                return {
                    "success": False,
                    "error": "缺少必需参数: content",
                    "message": "文件内容不能为空"
                }
            
            registry = get_registry()
            save_function = registry.functions.get("file_manager.save_file_content")
            
            if not save_function:
                return {
                    "success": False,
                    "error": "文件管理模块未加载或保存功能不可用",
                    "message": "保存失败"
                }
            
            # 使用文件管理模块的保存函数
            result = save_function(file_path=file_path, content=content)
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"保存文件内容时发生未知错误: {str(e)}",
                "message": "保存操作异常"
            }
    
    @register_function(name="SmartTavern.delete_file", outputs=["delete_result"])
    def delete_file(file_path: str = None):
        """删除指定文件"""
        try:
            if not file_path:
                return {
                    "success": False,
                    "error": "缺少必需参数: file_path",
                    "message": "文件路径不能为空"
                }
            
            registry = get_registry()
            delete_function = registry.functions.get("file_manager.delete_file")
            
            if not delete_function:
                return {
                    "success": False,
                    "error": "文件管理模块未加载或删除功能不可用",
                    "message": "删除失败"
                }
            
            # 使用文件管理模块的删除函数
            result = delete_function(file_path=file_path)
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"删除文件时发生未知错误: {str(e)}",
                "message": "删除操作异常"
            }
    
    # 配置管理相关API
    @register_function(name="SmartTavern.get_config_options", outputs=["config_options"])
    def get_config_options():
        """获取所有配置文件选项"""
        try:
            registry = get_registry()
            config_function = registry.functions.get("config_manager.get_config_options")
            
            if not config_function:
                return {
                    "success": False,
                    "error": "配置管理模块未加载",
                    "config_options": {}
                }
            
            result = config_function()
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取配置选项失败: {str(e)}",
                "config_options": {}
            }
    
    @register_function(name="SmartTavern.set_active_config", outputs=["config_result"])
    def set_active_config(config_type: str, file_path: str = None):
        """设置活跃配置"""
        try:
            registry = get_registry()
            set_config_function = registry.functions.get("config_manager.set_active_config")
            
            if not set_config_function:
                return {
                    "success": False,
                    "error": "配置管理模块未加载"
                }
            
            result = set_config_function(config_type=config_type, file_path=file_path)
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"设置配置失败: {str(e)}"
            }
    
    @register_function(name="SmartTavern.get_active_config", outputs=["active_config"])
    def get_active_config():
        """获取当前活跃配置"""
        try:
            registry = get_registry()
            get_config_function = registry.functions.get("config_manager.get_active_config")
            
            if not get_config_function:
                return {
                    "success": False,
                    "error": "配置管理模块未加载",
                    "active_config": {}
                }
            
            result = get_config_function()
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取活跃配置失败: {str(e)}",
                "active_config": {}
            }
    
    @register_function(name="SmartTavern.load_user_preferences", outputs=["preferences_result"])
    def load_user_preferences():
        """加载用户偏好设置"""
        try:
            registry = get_registry()
            load_preferences_function = registry.functions.get("config_manager.load_user_preferences")
            
            if not load_preferences_function:
                return {
                    "success": False,
                    "error": "配置管理模块未加载或不支持偏好设置功能"
                }
            
            result = load_preferences_function()
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"加载用户偏好设置失败: {str(e)}"
            }
    
    @register_function(name="SmartTavern.save_user_preferences", outputs=["save_result"])
    def save_user_preferences():
        """保存用户偏好设置"""
        try:
            registry = get_registry()
            save_preferences_function = registry.functions.get("config_manager.save_user_preferences")
            
            if not save_preferences_function:
                return {
                    "success": False,
                    "error": "配置管理模块未加载或不支持偏好设置功能"
                }
            
            result = save_preferences_function()
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"保存用户偏好设置失败: {str(e)}"
            }
    
    # 角色卡相关API
    @register_function(name="SmartTavern.get_characters", outputs=["characters"])
    def get_characters():
        """获取角色卡列表"""
        try:
            registry = get_registry()
            config_function = registry.functions.get("config_manager.get_config_options")
            
            if not config_function:
                return {
                    "success": False,
                    "error": "配置管理模块未加载",
                    "characters": []
                }
            
            result = config_function()
            if result.get("success"):
                characters = result.get("config_options", {}).get("characters", {})
                return {
                    "success": True,
                    "characters": characters.get("files", []),
                    "timestamp": datetime.now().isoformat()
                }
            else:
                return {
                    "success": False,
                    "error": result.get("error", "获取角色卡列表失败"),
                    "characters": []
                }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取角色卡列表失败: {str(e)}",
                "characters": []
            }
    
    @register_function(name="SmartTavern.use_character", outputs=["character_result"])
    def use_character(character_path: str):
        """使用指定的角色卡"""
        try:
            registry = get_registry()
            
            # 1. 设置角色卡为活跃配置
            set_config_function = registry.functions.get("config_manager.set_active_config")
            if not set_config_function:
                return {
                    "success": False,
                    "error": "配置管理模块未加载"
                }
            
            config_result = set_config_function(config_type="characters", file_path=character_path)
            if not config_result.get("success"):
                return {
                    "success": False,
                    "error": f"设置角色卡配置失败: {config_result.get('error', '未知错误')}"
                }
            
            # 2. 加载角色卡内容
            get_file_function = registry.functions.get("file_manager.get_file_content")
            if not get_file_function:
                return {
                    "success": False,
                    "error": "文件管理模块未加载"
                }
            
            file_result = get_file_function(file_path=character_path)
            if not file_result.get("success"):
                return {
                    "success": False,
                    "error": f"加载角色卡文件失败: {file_result.get('error', '未知错误')}"
                }
            
            character_data = json.loads(file_result.get("file_content", "{}"))
            
            # 3. 创建新的对话会话（清空当前历史）
            conversation_file = f"{conversation_storage}/{default_conversation_file}"
            display_history_path = "shared/SmartTavern/conversations/display_history/display_chat.json"
            
            # 清空对话历史
            os.makedirs(os.path.dirname(conversation_file), exist_ok=True)
            os.makedirs(os.path.dirname(display_history_path), exist_ok=True)
            
            with open(conversation_file, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)
            
            with open(display_history_path, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)
            
            # 4. 如果角色卡有初始消息，添加第一条作为AI的开场白
            initial_message = None
            if character_data.get("message") and len(character_data["message"]) > 0:
                initial_message = character_data["message"][0]
                
                # 添加初始消息到对话历史
                ai_message = {"role": "assistant", "content": initial_message}
                _add_message_to_conversation_file(conversation_file, ai_message)
                
                # 同步到display_history
                with open(display_history_path, 'w', encoding='utf-8') as f:
                    json.dump([ai_message], f, ensure_ascii=False, indent=2)
            
            return {
                "success": True,
                "message": f"已切换到角色卡: {character_data.get('name', '未命名角色')}",
                "character_name": character_data.get("name", "未命名角色"),
                "character_path": character_path,
                "has_initial_message": initial_message is not None,
                "initial_message": initial_message,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"使用角色卡失败: {str(e)}",
                "message": "切换角色卡时发生错误"
            }
    
    @register_function(name="SmartTavern.start_character_session", outputs=["session_result"])
    def start_character_session(character_path: str):
        """开始角色卡对话会话"""
        try:
            registry = get_registry()
            
            # 获取角色卡内容
            get_file_function = registry.functions.get("file_manager.get_file_content")
            if not get_file_function:
                return {
                    "success": False,
                    "error": "文件管理模块未加载"
                }
            
            file_result = get_file_function(file_path=character_path)
            if not file_result.get("success"):
                return {
                    "success": False,
                    "error": f"加载角色卡文件失败: {file_result.get('error', '未知错误')}"
                }
            
            character_data = json.loads(file_result.get("file_content", "{}"))
            
            # 生成会话ID
            session_id = f"char_session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            # 创建角色卡专用的对话文件
            character_conversation_file = f"{conversation_storage}/character_sessions/{session_id}.json"
            os.makedirs(os.path.dirname(character_conversation_file), exist_ok=True)
            
            initial_messages = []
            initial_message = None
            
            if character_data.get("message") and len(character_data["message"]) > 0:
                initial_message = character_data["message"][0]
                ai_message = {"role": "assistant", "content": initial_message}
                initial_messages.append(ai_message)
            
            # 保存初始对话状态
            with open(character_conversation_file, 'w', encoding='utf-8') as f:
                json.dump(initial_messages, f, ensure_ascii=False, indent=2)
            
            return {
                "success": True,
                "session_id": session_id,
                "character_name": character_data.get("name", "未命名角色"),
                "initial_message": initial_message,
                "conversation_file": character_conversation_file,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"创建角色卡会话失败: {str(e)}"
            }

    # 对话文件管理相关API
    @register_function(name="SmartTavern.get_conversation_files", outputs=["conversation_files"])
    def get_conversation_files():
        """获取对话文件列表（包含绑定的角色卡信息）"""
        try:
            registry = get_registry()
            binding_function = registry.functions.get("conversation_binding.get_conversations_with_bindings")
            
            if not binding_function:
                # 如果绑定模块未加载，使用原有逻辑
                conversations_dir = f"{conversation_storage}"
                conversations = []
                
                if os.path.exists(conversations_dir):
                    for root, dirs, files in os.walk(conversations_dir):
                        for file in files:
                            if file.endswith('.json'):
                                full_path = os.path.join(root, file)
                                relative_path = os.path.relpath(full_path, conversations_dir)
                                stat_info = os.stat(full_path)
                                
                                # 尝试读取文件内容获取更多信息
                                try:
                                    with open(full_path, 'r', encoding='utf-8') as f:
                                        content = json.load(f)
                                        message_count = len(content) if isinstance(content, list) else 0
                                except:
                                    message_count = 0
                                
                                conversations.append({
                                    "name": file,
                                    "path": relative_path.replace('\\', '/'),
                                    "display_name": os.path.splitext(file)[0],
                                    "size": stat_info.st_size,
                                    "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                                    "message_count": message_count
                                })
                
                # 按修改时间排序，最新的在前
                conversations.sort(key=lambda x: x["modified"], reverse=True)
                
                return {
                    "success": True,
                    "conversations": conversations,
                    "total_count": len(conversations),
                    "timestamp": datetime.now().isoformat()
                }
            else:
                # 使用绑定模块获取包含角色卡信息的对话列表
                result = binding_function(conversation_storage=conversation_storage)
                return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取对话文件列表失败: {str(e)}",
                "conversations": []
            }




    @register_function(name="SmartTavern.load_and_process_conversation", outputs=["load_result"])
    def load_and_process_conversation(conversation_path: str, call_llm: bool = True):
        """加载指定对话文件并通过工作流处理，直接返回对话历史内容
        
        Args:
            conversation_path: 对话文件路径
            call_llm: 是否调用LLM API，False时仅处理提示词不调用API
        """
        try:
            registry = get_registry()
            
            # 构建完整的对话文件路径
            full_conversation_path = f"{conversation_storage}/{conversation_path}"
            print(f"🔍 开始处理对话文件: {conversation_path} (完整路径: {full_conversation_path})")
            
            # 验证对话文件存在
            if not os.path.exists(full_conversation_path):
                print(f"❌ 对话文件不存在: {full_conversation_path}")
                return {
                    "success": False,
                    "error": f"对话文件不存在: {conversation_path}",
                    "history": []
                }
            
            # 读取对话文件内容
            try:
                with open(full_conversation_path, 'r', encoding='utf-8') as f:
                    conversation_data = json.load(f)
                    print(f"✅ 成功读取对话文件: {conversation_path}, 消息数: {len(conversation_data) if isinstance(conversation_data, list) else 0}")
                    # 打印前两条消息的摘要，帮助调试
                    if isinstance(conversation_data, list) and len(conversation_data) > 0:
                        print(f"📝 第一条消息: {conversation_data[0].get('role', '未知')} - {conversation_data[0].get('content', '')[:50] if conversation_data[0].get('content') else '空内容'}...")
                        if len(conversation_data) > 1:
                            print(f"📝 第二条消息: {conversation_data[1].get('role', '未知')} - {conversation_data[1].get('content', '')[:50] if conversation_data[1].get('content') else '空内容'}...")
            except Exception as e:
                print(f"❌ 读取对话文件失败: {e}")
                return {
                    "success": False,
                    "error": f"读取对话文件失败: {str(e)}",
                    "history": []
                }
            
            # 获取绑定的角色卡信息
            bound_character_path = None
            # 优先尝试使用完整绑定系统
            get_full_binding_function = registry.functions.get("conversation_binding.get_full_binding")
            if get_full_binding_function:
                binding_result = get_full_binding_function(conversation_path=conversation_path)
                if binding_result.get("success") and binding_result.get("character_path"):
                    bound_character_path = binding_result.get("character_path")
                    print(f"🔗 从完整绑定中获取角色卡: {bound_character_path}")
            
            # 如果完整绑定没有找到，尝试旧版绑定系统
            if not bound_character_path:
                get_binding_function = registry.functions.get("conversation_binding.get_binding")
                if get_binding_function:
                    binding_result = get_binding_function(conversation_path=conversation_path)
                    if binding_result.get("success") and binding_result.get("character_path"):
                        bound_character_path = binding_result.get("character_path")
                        print(f"🔗 从旧版绑定中获取角色卡: {bound_character_path}")
            
            # 如果对话文件为空且有绑定的角色卡，使用角色卡的初始消息
            if not conversation_data and bound_character_path:
                try:
                    get_file_function = registry.functions.get("file_manager.get_file_content")
                    if get_file_function:
                        char_result = get_file_function(file_path=bound_character_path)
                        if char_result.get("success"):
                            character_data = json.loads(char_result.get("file_content", "{}"))
                            if character_data.get("message") and len(character_data["message"]) > 0:
                                # 添加角色卡的第一条初始消息
                                initial_message = character_data["message"][0]
                                ai_message = {"role": "assistant", "content": initial_message}
                                conversation_data = [ai_message]
                                
                                # 保存初始消息到对话文件
                                with open(full_conversation_path, 'w', encoding='utf-8') as f:
                                    json.dump(conversation_data, f, ensure_ascii=False, indent=2)
                except Exception as e:
                    print(f"⚠️ 处理角色卡初始消息失败: {e}")
            
            # 我们不再修改全局默认对话文件，避免并发请求之间相互干扰
            # 而是直接传递完整的文件路径给工作流
            print(f"📋 准备处理对话: {conversation_path}")
            
            # 使用绑定的角色卡，如果没有绑定则使用默认角色卡
            current_character = bound_character_path or character_file
            print(f"👤 使用角色卡: {current_character}")
            clean_history = []
            
            if call_llm:
                # 调用完整工作流（包含LLM API调用）
                workflow = registry.get_workflow(workflow_name)
                if workflow:
                    print(f"🚀 开始执行工作流: {workflow_name} 处理文件: {conversation_path}")
                    workflow_result = workflow(
                        conversation_file=full_conversation_path,  # 传递完整路径
                        character_file=current_character,
                        persona_file=persona_file,
                        stream=False,
                        model="gemini-2.5-flash",
                        max_tokens=2048,
                        temperature=0.7,
                        # 传递参数指示这是指定加载的对话，而非当前活跃对话
                        is_specific_conversation=True,
                        conversation_id=conversation_path  # 传递对话ID帮助工作流识别
                    )
                    
                    if workflow_result.get("success", False):
                        print(f"✅ 工作流处理成功: {conversation_path}")
                    else:
                        print(f"⚠️ 工作流处理失败: {workflow_result.get('error', '未知错误')}")
                
                # 重新读取处理后的对话文件内容
                try:
                    print(f"📄 重新读取处理后的对话文件: {full_conversation_path}")
                    with open(full_conversation_path, 'r', encoding='utf-8') as f:
                        processed_conversation_data = json.load(f)
                except Exception as e:
                    print(f"⚠️ 读取处理后的对话文件失败: {e}，使用原始数据")
                    processed_conversation_data = conversation_data
                
                # 创建干净的对话历史直接返回给前端
                if isinstance(processed_conversation_data, list):
                    for msg in processed_conversation_data:
                        try:
                            if isinstance(msg, dict) and \
                               isinstance(msg.get("role"), str) and \
                               msg.get("role") in ["user", "assistant"] and \
                               msg.get("content") is not None:
                                clean_history.append({
                                    "role": msg["role"],
                                    "content": str(msg["content"]).strip()
                                })
                        except Exception as e:
                            print(f"⚠️ 处理对话消息异常，跳过：{e}, 内容：{msg}")
                            continue
                    
                    # 确保获取到了请求的对话内容
                    if len(clean_history) == 0:
                        print(f"❗ LLM处理后对话历史为空，重新尝试读取原始文件: {conversation_path}")
                        try:
                            with open(full_conversation_path, 'r', encoding='utf-8') as f:
                                fresh_data = json.load(f)
                                if isinstance(fresh_data, list):
                                    for msg in fresh_data:
                                        if isinstance(msg, dict) and \
                                           isinstance(msg.get("role"), str) and \
                                           msg.get("role") in ["user", "assistant"] and \
                                           msg.get("content") is not None:
                                            clean_history.append({
                                                "role": msg["role"],
                                                "content": str(msg["content"]).strip()
                                            })
                        except Exception as e:
                            print(f"❌ 重新读取原始对话文件失败: {e}")
            else:
                # 调用仅处理提示词的工作流（不调用LLM API）
                prompt_only_workflow = registry.get_workflow("prompt_only_workflow")
                
                if prompt_only_workflow:
                    try:
                        print(f"🧩 开始执行提示词工作流处理对话: {conversation_path}")
                        
                        # 直接调用工作流，获取返回结果
                        workflow_result = prompt_only_workflow(
                            conversation_file=full_conversation_path,  # 传递完整路径
                            character_file=current_character,
                            persona_file=persona_file,
                            is_specific_conversation=True,  # 指定这是加载特定对话
                            conversation_id=conversation_path  # 传递对话ID
                        )
                        
                        if workflow_result.get("success", False):
                            # 直接从工作流返回结果获取历史记录
                            if workflow_result.get("display_history"):
                                clean_history = workflow_result.get("display_history", [])
                                print(f"✅ [提示词工作流] 从返回结果获取成功，{len(clean_history)} 条消息")
                                
                                # 验证处理的是正确的对话文件
                                file_matches = workflow_result.get("conversation_file", "") == full_conversation_path
                                if file_matches:
                                    print(f"✓ 确认对话文件匹配: {conversation_path}")
                                else:
                                    print(f"⚠️ 对话文件不匹配，期望: {full_conversation_path}, 实际: {workflow_result.get('conversation_file', '未知')}")
                            else:
                                print(f"⚠️ 工作流未返回历史记录")
                        else:
                            print(f"⚠️ 提示词工作流处理失败: {workflow_result.get('error', '未知错误')}")
                            
                    except Exception as e:
                        print(f"⚠️ 调用提示词工作流异常: {e}")
                else:
                    print(f"⚠️ 提示词工作流未找到，使用原始对话数据: {conversation_path}")
                    
                # 如果提示词工作流失败或没有返回有效历史，使用原始对话数据作为备用方案
                if not clean_history and isinstance(conversation_data, list):
                    print(f"⚠️ 使用原始对话数据: {conversation_path}")
                    for msg in conversation_data:
                        try:
                            if isinstance(msg, dict) and \
                               isinstance(msg.get("role"), str) and \
                               msg.get("role") in ["user", "assistant"] and \
                               msg.get("content") is not None:
                                clean_history.append({
                                    "role": msg["role"],
                                    "content": str(msg["content"]).strip()
                                })
                        except Exception as e:
                            print(f"⚠️ 处理对话消息异常，跳过：{e}, 内容：{msg}")
                            continue
                    
                    # 确保clean_history确实来自请求的对话文件
                    if len(clean_history) == 0:
                        print(f"❗ 对话历史为空，重新尝试读取原始文件: {conversation_path}")
                        try:
                            with open(full_conversation_path, 'r', encoding='utf-8') as f:
                                fresh_data = json.load(f)
                                if isinstance(fresh_data, list):
                                    for msg in fresh_data:
                                        if isinstance(msg, dict) and \
                                           isinstance(msg.get("role"), str) and \
                                           msg.get("role") in ["user", "assistant"] and \
                                           msg.get("content") is not None:
                                            clean_history.append({
                                                "role": msg["role"],
                                                "content": str(msg["content"]).strip()
                                            })
                        except Exception as e:
                            print(f"❌ 重新读取对话文件失败: {e}")
            
            # 最终确认返回的数据来源正确
            if clean_history:
                print(f"✅ 返回处理后的对话历史: {conversation_path}, 共 {len(clean_history)} 条消息")
            else:
                print(f"⚠️ 警告: 处理后的对话历史为空: {conversation_path}")
                # 最后尝试直接从文件读取
                try:
                    print(f"🔄 最后尝试直接从原始文件读取: {full_conversation_path}")
                    with open(full_conversation_path, 'r', encoding='utf-8') as f:
                        final_conversation_data = json.load(f)
                        if isinstance(final_conversation_data, list):
                            for msg in final_conversation_data:
                                if isinstance(msg, dict) and \
                                   isinstance(msg.get("role"), str) and \
                                   msg.get("role") in ["user", "assistant"] and \
                                   msg.get("content") is not None:
                                    clean_history.append({
                                        "role": msg["role"],
                                        "content": str(msg["content"]).strip()
                                    })
                    print(f"📄 直接读取文件成功，获取 {len(clean_history)} 条消息")
                except Exception as e:
                    print(f"❌ 最终读取尝试失败: {e}")
            
            # 直接返回对话历史，不再依赖display.json文件
            return {
                "success": True,
                "message": f"已加载对话: {conversation_path}",
                "conversation_path": conversation_path,  # 返回原始请求的对话路径
                "character_path": bound_character_path,
                "history": clean_history,  # 直接返回对话历史
                "total_messages": len(clean_history),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"加载和处理对话失败: {str(e)}",
                "history": []
            }
    
    # 完整绑定管理相关API
    @register_function(name="SmartTavern.get_conversations_with_full_bindings", outputs=["conversations_with_full_bindings"])
    def get_conversations_with_full_bindings():
        """获取所有对话文件及其完整绑定信息（用户+角色卡）"""
        try:
            registry = get_registry()
            binding_function = registry.functions.get("conversation_binding.get_conversations_with_full_bindings")
            
            if not binding_function:
                return {
                    "success": False,
                    "error": "对话绑定模块未加载或不支持完整绑定功能",
                    "conversations": []
                }
            
            result = binding_function()
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取对话完整绑定信息失败: {str(e)}",
                "conversations": []
            }
    
    @register_function(name="SmartTavern.set_full_binding", outputs=["full_binding_result"])
    def set_full_binding(conversation_path: str, user_path: str = None, character_path: str = None):
        """设置对话的完整绑定关系（用户+角色卡）"""
        try:
            registry = get_registry()
            binding_function = registry.functions.get("conversation_binding.set_full_binding")
            
            if not binding_function:
                return {
                    "success": False,
                    "error": "对话绑定模块未加载或不支持完整绑定功能"
                }
            
            result = binding_function(
                conversation_path=conversation_path,
                user_path=user_path,
                character_path=character_path
            )
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"设置完整绑定关系失败: {str(e)}"
            }
    
    @register_function(name="SmartTavern.get_full_binding", outputs=["full_binding_info"])
    def get_full_binding(conversation_path: str):
        """获取指定对话的完整绑定信息（用户+角色卡）"""
        try:
            registry = get_registry()
            binding_function = registry.functions.get("conversation_binding.get_full_binding")
            
            if not binding_function:
                return {
                    "success": False,
                    "error": "对话绑定模块未加载或不支持完整绑定功能",
                    "user_path": None,
                    "character_path": None,
                    "has_binding": False
                }
            
            result = binding_function(conversation_path=conversation_path)
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取完整绑定信息失败: {str(e)}",
                "user_path": None,
                "character_path": None,
                "has_binding": False
            }
    
    @register_function(name="SmartTavern.create_new_conversation_with_full_binding", outputs=["create_full_conversation_result"])
    def create_new_conversation_with_full_binding(name: str, user_path: str, character_path: str):
        """创建新对话文件并设置完整绑定（用户+角色卡）"""
        try:
            # 清理文件名
            safe_name = name.replace(' ', '_').replace('/', '_').replace('\\', '_')
            if not safe_name.endswith('.json'):
                safe_name += '.json'
            
            # 创建对话文件路径
            conversation_file_path = f"{conversation_storage}/{safe_name}"
            
            # 确保目录存在
            os.makedirs(os.path.dirname(conversation_file_path), exist_ok=True)
            
            initial_messages = []
            
            # 如果指定了角色卡，添加初始消息
            if character_path:
                try:
                    registry = get_registry()
                    get_file_function = registry.functions.get("file_manager.get_file_content")
                    if get_file_function:
                        char_result = get_file_function(file_path=character_path)
                        if char_result.get("success"):
                            character_data = json.loads(char_result.get("file_content", "{}"))
                            if character_data.get("message") and len(character_data["message"]) > 0:
                                initial_message = character_data["message"][0]
                                ai_message = {"role": "assistant", "content": initial_message}
                                initial_messages.append(ai_message)
                except Exception as e:
                    print(f"⚠️ 加载角色卡初始消息失败: {e}")
            
            # 创建新对话文件
            with open(conversation_file_path, 'w', encoding='utf-8') as f:
                json.dump(initial_messages, f, ensure_ascii=False, indent=2)
            
            # 设置完整绑定
            registry = get_registry()
            binding_function = registry.functions.get("conversation_binding.set_full_binding")
            
            if binding_function:
                binding_result = binding_function(
                    conversation_path=safe_name,
                    user_path=user_path,
                    character_path=character_path
                )
                if not binding_result.get("success"):
                    print(f"⚠️ 设置完整绑定失败: {binding_result.get('error', '未知错误')}")
            
            return {
                "success": True,
                "message": f"已创建新对话并设置完整绑定: {name}",
                "conversation_path": safe_name,
                "full_path": conversation_file_path,
                "has_initial_message": len(initial_messages) > 0,
                "user_path": user_path,
                "character_path": character_path,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"创建带完整绑定的新对话失败: {str(e)}"
            }

    # LLM API配置管理相关API
    @register_function(name="SmartTavern.get_api_providers", outputs=["api_providers"])
    def get_api_providers():
        """获取所有LLM API提供商配置"""
        try:
            # 从globals获取API提供商配置
            providers = getattr(g, 'api_providers', {})
            provider_list = []
            
            for provider_id, config in providers.items():
                # 创建安全的配置副本（不暴露API密钥）
                safe_config = config.copy()
                if 'api_key' in safe_config and safe_config['api_key']:
                    safe_config['api_key_masked'] = '*' * 8 + safe_config['api_key'][-4:] if len(safe_config['api_key']) > 4 else '***'
                else:
                    safe_config['api_key_masked'] = ''
                
                # 处理models字段 - 确保兼容性
                models_value = safe_config.get('models', '')
                if isinstance(models_value, list):
                    model_id = models_value[0] if models_value else ''
                else:
                    model_id = models_value
                
                # 获取实际的provider类型，优先使用provider_type字段，否则使用配置ID
                actual_provider_type = safe_config.get('provider_type', provider_id)
                
                # 现在 provider_id 就是名称，所以将 id 和 name 设置为相同的值
                provider_list.append({
                    "id": provider_id,  # 配置的唯一标识符
                    "name": provider_id,  # 名称现在就是键名
                    "provider": actual_provider_type,  # 实际的提供商类型（如openai, anthropic, gemini等）
                    "api_url": safe_config.get('base_url', ''),
                    "api_key": safe_config['api_key_masked'],
                    "model_id": model_id,
                    "models": model_id,  # 保持一致性
                    "max_tokens": safe_config.get('max_tokens', 1024),
                    "temperature": safe_config.get('temperature', 1.0),
                    "custom_fields": safe_config.get('custom_fields', ''),
                    # 包含字段开关状态
                    "enable_api_key": safe_config.get('enable_api_key', True),
                    "enable_model_id": safe_config.get('enable_model_id', True),
                    "enable_temperature": safe_config.get('enable_temperature', True),
                    "enable_max_tokens": safe_config.get('enable_max_tokens', True),
                    "enable_custom_fields": safe_config.get('enable_custom_fields', False)
                })
            
            return {
                "success": True,
                "providers": provider_list,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取API提供商配置失败: {str(e)}",
                "providers": []
            }
    
    @register_function(name="SmartTavern.save_api_provider", outputs=["save_provider_result"])
    def save_api_provider(provider: Dict[str, Any]):
        """保存API提供商配置"""
        try:
            # 获取新的名称和当前ID
            current_id = provider.get('id')
            new_name = provider.get('name')
            
            if not current_id and not new_name:
                return {
                    "success": False,
                    "error": "提供商ID和名称不能同时为空",
                    "message": "保存失败"
                }
            
            # 确保全局配置存在
            if not hasattr(g, 'api_providers'):
                g.api_providers = {}
            
            # 判断是否需要重命名（名称变更）
            if current_id and new_name and current_id != new_name:
                print(f"📝 检测到名称变更: {current_id} -> {new_name}")
                
                # 如果存在旧配置，需要先删除旧配置再创建新配置
                if current_id in g.api_providers:
                    old_config = g.api_providers[current_id].copy()
                    del g.api_providers[current_id]
                    print(f"🗑️ 已删除旧配置: {current_id}")
                    
                    # 如果当前活动的提供商是被重命名的提供商，更新活动提供商
                    if getattr(g, 'active_api_provider', '') == current_id:
                        g.active_api_provider = new_name
                        print(f"🔄 更新活动提供商: {current_id} -> {new_name}")
                else:
                    old_config = {}
                    print(f"⚠️ 未找到原配置: {current_id}")
                
                # 使用新名称作为键
                provider_id = new_name
            else:
                # 未变更名称，使用当前ID或名称
                provider_id = current_id or new_name
                old_config = g.api_providers.get(provider_id, {})
            
            # 处理API密钥 - 如果是掩码格式则保持原有密钥
            new_api_key = provider.get('api_key', '')
            
            # 如果新传入的API密钥是掩码格式（只有以星号开头的才是掩码），使用现有的真实密钥
            if new_api_key and new_api_key.startswith('*'):
                api_key_to_save = old_config.get('api_key', '')
                print(f"🔒 保持现有API密钥，未更新掩码密钥")
            else:
                api_key_to_save = new_api_key
                print(f"🔑 更新API密钥: {api_key_to_save[:8]}..." if api_key_to_save else "🔑 API密钥为空")
            
            # 使用新名称作为键，不再保存内部name字段
            config_data = {
                "base_url": provider.get('api_url', ''),
                "api_key": api_key_to_save,
                "models": provider.get('model_id', ''),
                "provider_type": provider.get('provider', provider_id),
                "max_tokens": provider.get('max_tokens', 1024),
                "temperature": provider.get('temperature', 1.0),
                "custom_fields": provider.get('custom_fields', ''),
                # 保存字段开关状态
                "enable_api_key": provider.get('enable_api_key', True),
                "enable_model_id": provider.get('enable_model_id', True),
                "enable_temperature": provider.get('enable_temperature', True),
                "enable_max_tokens": provider.get('enable_max_tokens', True),
                "enable_custom_fields": provider.get('enable_custom_fields', False)
            }
            
            # 保存配置
            g.api_providers[provider_id] = config_data
            print(f"💾 保存配置到键: {provider_id}")
            
            # 持久化保存到globals.py文件
            globals_file_path = "shared/SmartTavern/globals.py"
            try:
                # 读取当前的globals.py文件
                with open(globals_file_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                
                # 找到api_providers的开始和结束位置
                start_line = -1
                end_line = -1
                bracket_count = 0
                found_api_providers = False
                
                for i, line in enumerate(lines):
                    if 'api_providers' in line and '=' in line and not found_api_providers:
                        start_line = i
                        found_api_providers = True
                        # 检查这行是否包含开始的大括号
                        if '{' in line:
                            bracket_count += line.count('{')
                            bracket_count -= line.count('}')
                    elif found_api_providers and start_line != -1:
                        bracket_count += line.count('{')
                        bracket_count -= line.count('}')
                        if bracket_count == 0:
                            end_line = i
                            break
                
                if start_line != -1 and end_line != -1:
                    # 构建新的api_providers内容，使用正确的格式
                    new_content = []
                    new_content.append("api_providers = {\n")
                    
                    for provider_id, config in g.api_providers.items():
                        new_content.append(f'    "{provider_id}": {{\n')
                        # 转义所有字符串字段中的特殊字符以确保正确保存
                        base_url_value = config.get("base_url", "")
                        escaped_base_url = base_url_value.replace('\\', '\\\\').replace('"', '\\"')
                        new_content.append(f'        "base_url": "{escaped_base_url}",\n')
                        
                        # 转义 API key
                        api_key_value = config.get("api_key", "")
                        escaped_api_key = api_key_value.replace('\\', '\\\\').replace('"', '\\"')
                        new_content.append(f'        "api_key": "{escaped_api_key}",\n')
                        
                        # 转义 models 字段
                        models_value = config.get("models", "")
                        if isinstance(models_value, list):
                            models_value = models_value[0] if models_value else ""
                        escaped_models = str(models_value).replace('\\', '\\\\').replace('"', '\\"')
                        new_content.append(f'        "models": "{escaped_models}"')
                        
                        # 添加max_tokens、temperature和custom_fields字段
                        new_content.append(',\n')
                        new_content.append(f'        "max_tokens": {config.get("max_tokens", 1024)},\n')
                        new_content.append(f'        "temperature": {config.get("temperature", 1.0)},\n')
                        
                        # 处理自定义字段的换行符，确保在Python字符串中正确转义
                        custom_fields_value = config.get("custom_fields", "")
                        # 转义换行符、回车符和双引号以确保Python字符串格式正确
                        escaped_custom_fields = custom_fields_value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r')
                        new_content.append(f'        "custom_fields": "{escaped_custom_fields}",\n')
                        
                        # 添加字段开关状态
                        new_content.append(f'        "enable_api_key": {config.get("enable_api_key", True)},\n')
                        new_content.append(f'        "enable_model_id": {config.get("enable_model_id", True)},\n')
                        new_content.append(f'        "enable_temperature": {config.get("enable_temperature", True)},\n')
                        new_content.append(f'        "enable_max_tokens": {config.get("enable_max_tokens", True)},\n')
                        new_content.append(f'        "enable_custom_fields": {config.get("enable_custom_fields", False)}')
                        
                        # 如果有provider_type字段，也保存它（需要转义）
                        if config.get("provider_type"):
                            provider_type_value = config.get("provider_type", "")
                            escaped_provider_type = provider_type_value.replace('\\', '\\\\').replace('"', '\\"')
                            new_content.append(',\n')
                            new_content.append(f'        "provider_type": "{escaped_provider_type}"\n')
                        else:
                            new_content.append('\n')
                        
                        new_content.append('    },\n')
                    
                    # 移除最后一个逗号
                    if new_content and new_content[-1].endswith(',\n'):
                        new_content[-1] = new_content[-1].rstrip(',\n') + '\n'
                    
                    new_content.append("}\n")
                    
                    # 替换原有内容
                    updated_lines = lines[:start_line] + new_content + lines[end_line+1:]
                    
                    # 写回文件
                    with open(globals_file_path, 'w', encoding='utf-8') as f:
                        f.writelines(updated_lines)
                    
                    print(f"✅ API配置已持久化保存到 {globals_file_path}")
                else:
                    print(f"⚠️ 未找到api_providers定义的完整结构，无法持久化保存")
                    
            except Exception as e:
                print(f"⚠️ 持久化保存失败: {e}")
                # 即使持久化失败，内存中的配置仍然有效
            
            return {
                "success": True,
                "message": f"API配置已保存: {provider.get('name', provider_id)}",
                "provider_id": provider_id,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"保存API配置失败: {str(e)}",
                "message": "保存失败"
            }
    
    @register_function(name="SmartTavern.delete_api_provider", outputs=["delete_provider_result"])
    def delete_api_provider(provider_id: str):
        """删除API提供商配置"""
        try:
            if not hasattr(g, 'api_providers') or provider_id not in g.api_providers:
                return {
                    "success": False,
                    "error": f"API配置不存在: {provider_id}",
                    "message": "删除失败"
                }
            
            # 删除配置
            del g.api_providers[provider_id]
            
            return {
                "success": True,
                "message": f"API配置已删除: {provider_id}",
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"删除API配置失败: {str(e)}",
                "message": "删除失败"
            }

    @register_function(name="SmartTavern.set_active_api_provider", outputs=["set_active_provider_result"])
    def set_active_api_provider(provider_id: str):
        """设置活动的API提供商"""
        try:
            if not hasattr(g, 'api_providers') or provider_id not in g.api_providers:
                return {
                    "success": False,
                    "error": f"API配置不存在: {provider_id}",
                    "message": "设置失败"
                }
            
            # 设置活动提供商
            g.active_api_provider = provider_id
            
            # 持久化更新到globals.py文件
            try:
                globals_file_path = "shared/SmartTavern/globals.py"
                with open(globals_file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # 更新active_api_provider行
                import re
                pattern = r'active_api_provider = "[^"]*"'
                replacement = f'active_api_provider = "{provider_id}"'
                updated_content = re.sub(pattern, replacement, content)
                
                with open(globals_file_path, 'w', encoding='utf-8') as f:
                    f.write(updated_content)
                
                print(f"✅ 已将active_api_provider持久化更新为: {provider_id}")
                
            except Exception as e:
                print(f"⚠️ 持久化更新active_api_provider失败: {e}")
                # 即使持久化失败，内存中的设置仍然有效
            
            provider_config = g.api_providers[provider_id]
            provider_name = provider_config.get('name', provider_id)
            
            return {
                "success": True,
                "message": f"已切换到API提供商: {provider_name}",
                "active_provider": provider_id,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"设置活动API提供商失败: {str(e)}",
                "message": "设置失败"
            }

    @register_function(name="SmartTavern.get_active_api_provider", outputs=["active_provider_result"])
    def get_active_api_provider():
        """获取当前活动的API提供商"""
        try:
            active_provider = getattr(g, 'active_api_provider', 'openai')
            
            # 获取活动提供商的配置信息
            provider_config = None
            if hasattr(g, 'api_providers') and active_provider in g.api_providers:
                provider_config = g.api_providers[active_provider].copy()
                # 不暴露API密钥
                if 'api_key' in provider_config and provider_config['api_key']:
                    provider_config['api_key_masked'] = '*' * 8 + provider_config['api_key'][-4:] if len(provider_config['api_key']) > 4 else '***'
                else:
                    provider_config['api_key_masked'] = ''
                del provider_config['api_key']
            
            return {
                "success": True,
                "active_provider": active_provider,
                "provider_config": provider_config,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"获取活动API提供商失败: {str(e)}",
                "active_provider": None
            }

    @register_function(name="SmartTavern.delete_message", outputs=["delete_message_result"])
    def delete_message(conversation_file: str, message_index: int):
        """删除指定对话文件中的指定索引消息
        
        Args:
            conversation_file: 对话文件路径（相对于conversation_storage）
            message_index: 要删除的消息索引（从0开始）
        """
        try:
            # 构建完整的对话文件路径
            if conversation_file:
                conversation_file_path = f"{conversation_storage}/{conversation_file}"
            else:
                conversation_file_path = f"{conversation_storage}/{default_conversation_file}"
            
            # 验证对话文件存在
            if not os.path.exists(conversation_file_path):
                return {
                    "success": False,
                    "error": f"对话文件不存在: {conversation_file}",
                    "history": []
                }
            
            # 读取当前对话历史
            try:
                with open(conversation_file_path, 'r', encoding='utf-8') as f:
                    history = json.load(f)
            except Exception as e:
                return {
                    "success": False,
                    "error": f"读取对话文件失败: {str(e)}",
                    "history": []
                }
            
            # 验证索引有效性
            if not isinstance(history, list):
                return {
                    "success": False,
                    "error": "对话文件格式无效，不是数组格式",
                    "history": []
                }
            
            if message_index < 0 or message_index >= len(history):
                return {
                    "success": False,
                    "error": f"消息索引无效: {message_index}，有效范围: 0-{len(history)-1}",
                    "history": history
                }
            
            # 删除指定索引的消息
            deleted_message = history.pop(message_index)
            
            # 保存更新后的对话历史
            try:
                with open(conversation_file_path, 'w', encoding='utf-8') as f:
                    json.dump(history, f, ensure_ascii=False, indent=2)
            except Exception as e:
                return {
                    "success": False,
                    "error": f"保存对话文件失败: {str(e)}",
                    "history": []
                }
            
            # 创建干净的对话历史返回给前端
            clean_history = []
            for msg in history:
                try:
                    if isinstance(msg, dict) and \
                       isinstance(msg.get("role"), str) and \
                       msg.get("role") in ["user", "assistant"] and \
                       msg.get("content") is not None:
                        clean_history.append({
                            "role": msg["role"],
                            "content": str(msg["content"]).strip()
                        })
                except Exception as e:
                    print(f"⚠️ 处理对话消息异常，跳过：{e}, 内容：{msg}")
                    continue
            
            return {
                "success": True,
                "message": f"已删除第 {message_index + 1} 条消息",
                "deleted_message": {
                    "role": deleted_message.get("role", "unknown"),
                    "content": str(deleted_message.get("content", "")).strip()
                },
                "history": clean_history,
                "total_messages": len(clean_history),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"删除消息失败: {str(e)}",
                "history": []
            }

    print("✓ SmartTavern对话API函数注册完成")


def _add_message_to_conversation_file(conversation_file_path: str, message: Dict[str, str]):
    """将消息添加到对话文件中"""
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(conversation_file_path), exist_ok=True)
        
        # 读取现有对话历史
        if os.path.exists(conversation_file_path):
            with open(conversation_file_path, 'r', encoding='utf-8') as f:
                history = json.load(f)
        else:
            history = []
        
        # 添加新消息
        history.append(message)
        
        # 保存回文件
        with open(conversation_file_path, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
        
        print(f"✓ 消息已添加到对话文件: {conversation_file_path}")
        
    except Exception as e:
        print(f"❌ 保存消息到对话文件失败: {e}")
        raise


def _parse_custom_fields(custom_fields_str: str) -> Dict[str, Any]:
    """解析自定义字段字符串为字典格式
    
    支持多种格式：
    1. 简单键值对 (换行分隔)：
       key1: value1
       key2: value2
    
    2. 逗号分隔的键值对：
       key1: value1, key2: value2
    
    3. 嵌套对象结构：
       config: {
         nested_key: value,
         another_nested: {
           deep_key: value
         }
       }
    
    4. 混合格式：
       simple_key: value
       nested: {
         key: value
       }
    
    Args:
        custom_fields_str: 自定义字段字符串
        
    Returns:
        解析后的字典
    """
    result = {}
    
    if not custom_fields_str or not custom_fields_str.strip():
        return result
    
    try:
        # 首先尝试作为JSON解析（用于完全嵌套的结构）
        try:
            # 尝试直接解析为JSON
            parsed_json = json.loads(custom_fields_str.strip())
            if isinstance(parsed_json, dict):
                print(f"🔧 解析为JSON结构: {custom_fields_str} -> {parsed_json}")
                return parsed_json
        except json.JSONDecodeError:
            pass
        
        # 如果不是有效JSON，使用高级解析逻辑
        result = _advanced_parse_custom_fields(custom_fields_str)
        print(f"🔧 高级解析自定义字段: {custom_fields_str[:100]}... -> {result}")
        
    except Exception as e:
        print(f"⚠️ 解析自定义字段失败: {e}, 输入: {custom_fields_str[:100]}...")
        # 解析失败时返回空字典，避免影响主要功能
        result = {}
    
    return result


def _advanced_parse_custom_fields(content: str) -> Dict[str, Any]:
    """高级解析自定义字段，支持嵌套结构和多种格式"""
    import re
    
    result = {}
    content = content.strip()
    
    # 预处理：移除注释
    content = re.sub(r'//.*$', '', content, flags=re.MULTILINE)
    content = re.sub(r'#.*$', '', content, flags=re.MULTILINE)
    
    lines = []
    current_line = ""
    
    # 处理多行，合并被分隔的行
    for line in content.split('\n'):
        line = line.strip()
        if not line:
            continue
            
        # 如果当前行以逗号结尾，或下一行不是新的键值对，合并行
        if current_line and not re.match(r'^\s*\w+\s*:', line):
            current_line += " " + line
        else:
            if current_line:
                lines.append(current_line)
            current_line = line
    
    if current_line:
        lines.append(current_line)
    
    # 处理每一行
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        
        # 检查是否是键值对格式
        if ':' in line and not line.strip().startswith('{'):
            # 简单键值对或嵌套对象的开始
            key, rest = line.split(':', 1)
            key = key.strip()
            rest = rest.strip()
            
            if rest.startswith('{'):
                # 嵌套对象
                value, consumed_lines = _parse_nested_object(lines[i:])
                result[key] = value
                i += consumed_lines
            else:
                # 简单值，可能包含逗号分隔的多个键值对
                pairs = _parse_simple_line(line)
                result.update(pairs)
                i += 1
        else:
            i += 1
    
    return result


def _parse_nested_object(lines: list) -> tuple:
    """解析嵌套对象结构"""
    result = {}
    consumed_lines = 0
    
    # 获取第一行的键和开始的大括号
    first_line = lines[0].strip()
    if ':' in first_line:
        key_part, value_part = first_line.split(':', 1)
        value_part = value_part.strip()
    else:
        return result, 1
    
    # 处理嵌套内容
    brace_count = value_part.count('{') - value_part.count('}')
    content_lines = [value_part.lstrip('{')] if value_part.lstrip('{').strip() else []
    
    i = 1
    while i < len(lines) and brace_count > 0:
        line = lines[i].strip()
        brace_count += line.count('{') - line.count('}')
        
        if brace_count > 0:
            content_lines.append(line)
        else:
            # 最后一行，移除结束大括号
            cleaned_line = line.rstrip('}').strip()
            if cleaned_line:
                content_lines.append(cleaned_line)
        
        i += 1
        consumed_lines += 1
    
    # 递归解析嵌套内容
    nested_content = '\n'.join(content_lines)
    if nested_content.strip():
        result = _advanced_parse_custom_fields(nested_content)
    
    return result, consumed_lines + 1


def _parse_simple_line(line: str) -> Dict[str, Any]:
    """解析简单的键值对行，可能包含逗号分隔的多个对"""
    result = {}
    
    # 按逗号分割，但要考虑可能的嵌套结构
    parts = _smart_split_by_comma(line)
    
    for part in parts:
        part = part.strip()
        if ':' not in part:
            continue
            
        key, value = part.split(':', 1)
        key = key.strip()
        value = value.strip()
        
        if not key:
            continue
        
        # 解析值类型
        parsed_value = _parse_value(value)
        result[key] = parsed_value
    
    return result


def _smart_split_by_comma(text: str) -> list:
    """智能按逗号分割，考虑括号和引号"""
    parts = []
    current_part = ""
    paren_count = 0
    quote_char = None
    
    for char in text:
        if quote_char:
            current_part += char
            if char == quote_char and (len(current_part) < 2 or current_part[-2] != '\\'):
                quote_char = None
        elif char in ['"', "'"]:
            current_part += char
            quote_char = char
        elif char in '({[':
            current_part += char
            paren_count += 1
        elif char in ')}]':
            current_part += char
            paren_count -= 1
        elif char == ',' and paren_count == 0:
            parts.append(current_part.strip())
            current_part = ""
        else:
            current_part += char
    
    if current_part.strip():
        parts.append(current_part.strip())
    
    return parts


def _parse_value(value_str: str) -> Any:
    """解析值的类型"""
    value_str = value_str.strip()
    
    if not value_str:
        return ""
    
    # 布尔值
    if value_str.lower() in ['true', 'false']:
        return value_str.lower() == 'true'
    
    # null值
    if value_str.lower() in ['null', 'none']:
        return None
    
    # 数字值
    try:
        if '.' in value_str:
            return float(value_str)
        else:
            return int(value_str)
    except ValueError:
        pass
    
    # 字符串值 - 移除引号
    if ((value_str.startswith('"') and value_str.endswith('"')) or
        (value_str.startswith("'") and value_str.endswith("'"))):
        return value_str[1:-1]
    
    # 默认为字符串
    return value_str