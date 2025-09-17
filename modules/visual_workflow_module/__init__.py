"""
可视化工作流模块
提供可视化工作流的核心API和管理功能

此模块是ModularFlow Framework的扩展，专门用于支持
拖拽式可视化工作流编排，支持多LLM协同工作。
"""

from modules.visual_workflow_module.visual_workflow_module import get_visual_workflow_manager

__version__ = "1.0.0"
__author__ = "ModularFlow Team"

# 导出核心功能
__all__ = [
    'get_visual_workflow_manager'
]