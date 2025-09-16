# SmartTavern 配置管理模块
"""
配置管理模块 - 管理用户选择的配置文件

提供功能：
- 获取所有可用的配置选项
- 设置和获取当前活跃的配置
- 加载选中的配置到全局变量
- 支持对话历史的切换和加载
"""

from .config_manager_module import (
    get_config_options,
    set_active_config, 
    get_active_config,
    load_selected_config,
    get_current_config,
    set_default_config
)

__all__ = [
    'get_config_options',
    'set_active_config',
    'get_active_config', 
    'load_selected_config',
    'get_current_config',
    'set_default_config'
]