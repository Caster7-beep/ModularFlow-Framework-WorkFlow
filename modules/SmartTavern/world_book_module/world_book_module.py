#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
世界书模块 (World Book Module)

负责处理与世界书相关的逻辑，例如触发、筛选等。
"""

from core.function_registry import register_function
from core.services import get_current_globals
from modules.SmartTavern.macro_module.macro_module import get_macro_processor

@register_function(name="world_book.trigger", outputs=["triggered_ids"])
def trigger_world_books(last_user_message: str):
    """
    根据用户输入和启用条件，判断哪些世界书条目被触发。

    Args:
        last_user_message (str): 上一轮的用户输入内容。

    Returns:
        Dict[str, Any]: 包含已触发世界书ID列表的字典。
    """
    g = get_current_globals()
    macro_processor = get_macro_processor()
    
    # 修复：从所有可能的源获取世界书条目
    world_book_entries = []
    
    # 从独立世界书文件（需要处理嵌套数组结构）
    if hasattr(g, 'world_book_files') and isinstance(g.world_book_files, list):
        for wb_item in g.world_book_files:
            if isinstance(wb_item, list):
                # 处理嵌套数组结构 [[{...}, {...}]]
                for nested_item in wb_item:
                    if isinstance(nested_item, dict):
                        world_book_entries.append(nested_item)
            elif isinstance(wb_item, dict):
                # 直接的字典条目
                world_book_entries.append(wb_item)
    elif hasattr(g, 'world_book_entries') and isinstance(g.world_book_entries, list):
        for wb_item in g.world_book_entries:
            if isinstance(wb_item, list):
                # 处理嵌套数组结构
                for nested_item in wb_item:
                    if isinstance(nested_item, dict):
                        world_book_entries.append(nested_item)
            elif isinstance(wb_item, dict):
                # 直接的字典条目
                world_book_entries.append(wb_item)
    
    # 从角色卡中的世界书条目
    if hasattr(g, 'character') and g.character and 'world_book' in g.character:
        character_wb = g.character['world_book']
        if isinstance(character_wb, dict) and 'entries' in character_wb:
            character_entries = character_wb['entries']
            if isinstance(character_entries, list):
                for entry in character_entries:
                    if isinstance(entry, dict):
                        world_book_entries.append(entry)
    
    if not world_book_entries:
        return {"triggered_ids": []}

    triggered_wb_ids = []
    for wb in world_book_entries:
        # 检查触发条件
        is_triggered = (wb.get("mode") == "always") or \
                       (wb.get("mode") == "conditional" and any(key in last_user_message for key in wb.get("keys", [])))
        
        # 检查动态启用表达式
        enabled_val = wb.get("enabled", True)
        is_enabled = macro_processor._evaluate_enabled_expression(enabled_val, 'world')

        if is_triggered and is_enabled:
            if 'id' in wb:
                triggered_wb_ids.append(wb["id"])
    
    print(f"已触发 {len(triggered_wb_ids)} 个世界书条目。")
    return {"triggered_ids": triggered_wb_ids}