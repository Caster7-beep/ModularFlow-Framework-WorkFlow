"""
SmartTavern UI设置API网关函数
这个模块提供了UI设置相关的API端点
"""

from typing import Dict, Any
from datetime import datetime
from core.function_registry import register_function, get_registry

@register_function(name="SmartTavern.get_ui_settings", outputs=["ui_settings_result"])
def get_ui_settings():
    """获取UI设置"""
    try:
        registry = get_registry()
        get_ui_settings_function = registry.functions.get("config_manager.get_ui_settings")
        
        if not get_ui_settings_function:
            return {
                "success": False,
                "error": "配置管理模块未加载或不支持UI设置功能"
            }
        
        result = get_ui_settings_function()
        return result
        
    except Exception as e:
        return {
            "success": False,
            "error": f"获取UI设置失败: {str(e)}"
        }

@register_function(name="SmartTavern.update_ui_settings", outputs=["update_ui_settings_result"])
def update_ui_settings(settings: Dict[str, Any]):
    """更新UI设置
    
    Args:
        settings: 要更新的UI设置字典，可以包含以下字段：
            - floorCount: 显示的楼层数量(3-50)
            - messagePanelWidth: 消息面板宽度百分比(20-100)
            - inputPanelWidth: 输入框宽度百分比(20-100)
    """
    try:
        registry = get_registry()
        update_ui_settings_function = registry.functions.get("config_manager.update_ui_settings")
        
        if not update_ui_settings_function:
            return {
                "success": False,
                "error": "配置管理模块未加载或不支持UI设置功能"
            }
        
        result = update_ui_settings_function(settings=settings)
        return result
        
    except Exception as e:
        return {
            "success": False,
            "error": f"更新UI设置失败: {str(e)}"
        }