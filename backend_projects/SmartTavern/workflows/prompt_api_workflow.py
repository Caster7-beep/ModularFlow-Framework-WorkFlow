# backend_projects/SmartTavern/workflows/prompt_api_workflow.py

import os
import json
from core.function_registry import get_registry, register_workflow
from core.services import get_current_globals

@register_workflow(name="prompt_api_call_workflow")
def prompt_api_call_workflow(
    conversation_file: str = "shared/SmartTavern/conversations/参考用sample_chat.json",
    character_file: str = "许莲笙.json",
    persona_file: str = "default_user.json",
    preset_files: list[str] = None,
    world_book_files: list[str] = None,
    stream: bool = False,
    model: str = None,
    max_tokens: int = 2048,
    temperature: float = 0.7,
    custom_params: dict = None
):
    """
    一个完整的工作流，它加载数据，构建提示，调用LLM API，然后处理并保存结果。
    
    流程:
    1.  加载所有数据（角色、对话、预设等）。
    2.  构建完整的提示词序列（前缀 + 对话历史）。
    3.  处理宏和正则表达式，生成发送给LLM的 `assistant_view`。
    4.  调用LLM API获取AI响应。
    5.  将AI响应添加到原始对话历史中。
    6.  重新运行提示词构建流程，生成最终的 `user_view`。
    7.  从 `user_view` 中提取干净的对话历史并保存为 `display_history`。
    """
    registry = get_registry()
    g = get_current_globals()

    # 1. 初始化与数据加载
    # 首先加载配置管理器选中的配置
    registry.call("config_manager.load_selected_config")
    registry.call("data.load_all")
    original_history = g.conversation_history.copy()

    # 2. 构建API请求
    # 触发条件世界书
    last_user_message = next((msg['content'] for msg in reversed(original_history) if msg['role'] == 'user'), "")
    trigger_result = registry.call("world_book.trigger", last_user_message=last_user_message)
    triggered_wb_ids = trigger_result.get("triggered_ids", [])

    # 构建框架提示词 (前缀部分)
    framing_result = registry.call("framing.assemble", triggered_wb_ids=triggered_wb_ids)
    prefix_prompt = framing_result.get("prefix_prompt", [])

    # 构建对话内上下文
    in_chat_result = registry.call("in_chat.construct", history=original_history, triggered_wb_ids=triggered_wb_ids)
    chat_context = in_chat_result.get("context", [])
    
    # 组合成完整的消息序列
    raw_full_prompt = prefix_prompt + chat_context

    # 宏处理
    macro_result = registry.call("process_message_sequence_macros", messages=raw_full_prompt)
    processed_prompt_after_macro = macro_result.get("processed_messages", [])
    
    # 正则表达式处理 (为 assistant_view)
    all_rules = g.regex_rules_files if hasattr(g, 'regex_rules_files') else []

    final_processed_prompt_assistant_view = []
    for raw_message, processed_message in zip(raw_full_prompt, processed_prompt_after_macro):
        assistant_view_res = registry.call(
            "apply_regex_rules",
            before_macro_text=raw_message.get("content", ""),
            after_macro_text=processed_message.get("content", ""),
            rules=all_rules,
            source_type=processed_message.get("source_type", "unknown"),
            current_view="assistant_view"
        )
        assistant_msg = processed_message.copy()
        assistant_msg["content"] = assistant_view_res.get("processed_text", "")
        final_processed_prompt_assistant_view.append(assistant_msg)

    # 生成用于LLM API的干净消息格式
    api_messages = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in final_processed_prompt_assistant_view
        if msg.get("content", "").strip()
    ]

    # 3. 调用LLM API
    # 准备API调用参数，包含自定义字段
    api_call_kwargs = {
        "messages": api_messages,
        "stream": stream,
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature
    }
    
    # 如果有自定义参数，添加到API调用中
    if custom_params:
        api_call_kwargs["custom_params"] = custom_params
    
    api_result = registry.call("api.call", **api_call_kwargs)
    
    api_response = api_result.get("response", {})
    if not api_response.get("success", False):
        error_msg = api_response.get("error", "未知API错误")
        return {"success": False, "error": error_msg}
    
    ai_content = api_response.get("content", "")

    # 4. 更新对话历史
    updated_history = original_history + [{"role": "assistant", "content": ai_content}]
    g.conversation_history = updated_history

    # 保存原始对话历史以便后续连续对话
    registry.call("history.save_history", file_path=conversation_file, history=updated_history)

    # 5. 生成最终显示历史
    # 重新运行核心流程，但使用更新后的历史记录
    in_chat_result_final = registry.call("in_chat.construct", history=updated_history, triggered_wb_ids=triggered_wb_ids)
    chat_context_final = in_chat_result_final.get("context", [])
    raw_full_prompt_final = prefix_prompt + chat_context_final
    
    macro_result_final = registry.call("process_message_sequence_macros", messages=raw_full_prompt_final)
    processed_prompt_final = macro_result_final.get("processed_messages", [])

    # 正则处理 (为 user_view)
    final_processed_prompt_user_view = []
    for raw_message, processed_message in zip(raw_full_prompt_final, processed_prompt_final):
        user_view_res = registry.call(
            "apply_regex_rules",
            before_macro_text=raw_message.get("content", ""),
            after_macro_text=processed_message.get("content", ""),
            rules=all_rules,
            source_type=processed_message.get("source_type", "unknown"),
            current_view="user_view"
        )
        user_msg = processed_message.copy()
        user_msg["content"] = user_view_res.get("processed_text", "")
        final_processed_prompt_user_view.append(user_msg)

    # 从 user_view 中提取 display_history，只保留真正的用户和助手消息
    display_history = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in final_processed_prompt_user_view
        if (msg.get("role") in ["user", "assistant"] and
            msg.get("content", "").strip() and
            msg.get("source_type") in ["user", "assistant"])
    ]

    # 6. 保存 Display History
    display_history_path = "shared/SmartTavern/conversations/display_history/display_chat.json"
    registry.call("history.save_display_history", file_path=display_history_path, history=display_history)
    return {
        "success": True,
        "display_history_path": display_history_path,
        "final_message_count": len(display_history)
    }