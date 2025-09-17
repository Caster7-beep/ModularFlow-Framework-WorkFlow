import json
import os
from typing import Dict, Any, List

from core.function_registry import register_function
from shared.SmartTavern import globals as g
from . import variables as v

@register_function(name="history.load_history", outputs=[])
def load_history(file_path: str) -> Dict[str, Any]:
    """
    从JSON文件加载对话历史到内存中。

    Args:
        file_path (str): 对话历史JSON文件的路径。

    Returns:
        Dict[str, Any]: 操作结果，包含成功或失败信息。
    """
    g.execution_count += 1
    v.history.clear()
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                v.history = json.load(f)
            return {"status": "success", "message": f"History loaded from {file_path}"}
        else:
            return {"status": "warning", "message": f"History file not found: {file_path}. A new history will be created."}
    except Exception as e:
        return {"status": "error", "message": f"Failed to load history: {e}"}

@register_function(name="history.save_history", outputs=[])
def save_history(file_path: str, history: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    将对话历史保存到JSON文件。

    Args:
        file_path (str): 保存对话历史的JSON文件路径。
        history (List[Dict[str, Any]], optional): 要保存的历史记录。如果为None，则保存模块内存中的历史。

    Returns:
        Dict[str, Any]: 操作结果，包含成功或失败信息。
    """
    g.execution_count += 1
    try:
        # 如果没有提供history参数，使用模块内存中的历史
        history_to_save = history if history is not None else v.history
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(history_to_save, f, ensure_ascii=False, indent=4)
        return {"status": "success", "message": f"History saved to {file_path}"}
    except Exception as e:
        return {"status": "error", "message": f"Failed to save history: {e}"}

@register_function(name="history.add_message", outputs=[])
def add_message(role: str, content: str) -> Dict[str, Any]:
    """
    向内存中的对话历史添加一条新消息。

    Args:
        role (str): 消息的角色 (例如, 'user' 或 'assistant').
        content (str): 消息的原始文本内容。

    Returns:
        Dict[str, Any]: 操作结果。
    """
    g.execution_count += 1
    if role not in ['user', 'assistant', 'system']:
        return {"status": "error", "message": f"Invalid role: {role}. Must be 'user', 'assistant', or 'system'."}
    
    v.history.append({"role": role, "content": content})
    return {"status": "success"}

@register_function(name="history.get_history", outputs=["history"])
def get_history() -> Dict[str, Any]:
    """
    获取当前内存中的完整对话历史。

    Returns:
        Dict[str, Any]: 包含完整对话历史的字典。
    """
    g.execution_count += 1
    return {"history": v.history}

@register_function(name="history.clear_history", outputs=[])
def clear_history() -> Dict[str, Any]:
    """
    清空内存中的对话历史。

    Returns:
        Dict[str, Any]: 操作结果。
    """
    g.execution_count += 1
    v.history.clear()
    return {"status": "success"}

@register_function(name="history.save_display_history", outputs=[])
def save_display_history(file_path: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    将指定的“显示历史”保存到JSON文件。

    Args:
        file_path (str): 保存显示历史的JSON文件路径。
        history (List[Dict[str, Any]]): 要保存的历史记录列表。

    Returns:
        Dict[str, Any]: 操作结果，包含成功或失败信息。
    """
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=4)
        return {"status": "success", "message": f"Display history saved to {file_path}"}
    except Exception as e:
        return {"status": "error", "message": f"Failed to save display history: {e}"}