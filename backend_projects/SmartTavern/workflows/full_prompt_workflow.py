# backend_projects/SmartTavern/workflows/full_prompt_workflow.py

import os
import json
from core.function_registry import get_registry, register_workflow
from core.services import get_current_globals
from modules.SmartTavern.macro_module.macro_module import get_macro_processor

@register_workflow(name="full_prompt_generation_from_files")
def full_prompt_generation_workflow(
    character_file: str,
    persona_file: str,
    conversation_file: str,
    preset_files: list[str] = None,
    world_book_files: list[str] = None
):
    """
    一个完整的工作流，从指定的文件加载数据，生成最终提示词。
    
    Args:
        character_file (str): 要加载的角色卡文件名 (例如 "main_char.json")。
        persona_file (str): 要加载的用户卡文件名 (例如 "default_user.json")。
        conversation_file (str): 要加载的对话历史文件名 (例如 "sample_chat.json")。
        preset_files (list[str]): 要加载的预设文件名列表。如果为 None，则加载全部。
        world_book_files (list[str]): 要加载的世界书文件名列表。如果为 None，则加载全部。
    """
    registry = get_registry()

    # --- 1. 初始化与数据加载 ---
    # 调用数据管理模块加载所有数据到全局变量
    registry.call("data.load_all")
    print("全局数据加载完成。")

    # 注意：data.load_all 会加载所有文件。
    # 在这个示例中，我们假设已加载的数据是我们需要的。
    # 更复杂的实现可以是在 data_manager 中提供按文件名加载的函数。
    # 这里我们直接从全局变量中提取工作流需要的数据。
    g = get_current_globals()
    raw_history = g.conversation_history
    
    # --- 2. 核心处理流程 ---
    # 数据合并与收集已在 data.load_all 中自动完成

    # a. 触发条件世界书
    last_user_message = next((msg['content'] for msg in reversed(raw_history) if msg['role'] == 'user'), "")
    trigger_result = registry.call("world_book.trigger", last_user_message=last_user_message)
    triggered_wb_ids = trigger_result.get("triggered_ids", [])

    # b. 构建框架提示词 (前缀部分)
    framing_result = registry.call("framing.assemble", triggered_wb_ids=triggered_wb_ids)
    prefix_prompt = framing_result.get("prefix_prompt", [])

    # c. 构建对话内上下文
    in_chat_result = registry.call("in_chat.construct", history=raw_history, triggered_wb_ids=triggered_wb_ids)
    chat_context = in_chat_result.get("context", [])
    
    # d. 组合成一个完整的消息序列
    # 这是应用宏和正则之前最原始、最完整的消息列表
    raw_full_prompt = prefix_prompt + chat_context

    # --- 3. 后处理流程 ---
    # a. 宏处理
    # 宏模块会处理 enabled 字段，并执行代码块
    macro_result = registry.call(
        "process_message_sequence_macros",
        messages=raw_full_prompt
    )
    processed_prompt_after_macro = macro_result.get("processed_messages", [])
    
    # b. 正则表达式处理 (分两个视图)
    # 收集所有来源的正则规则：独立文件、角色卡内嵌、预设内嵌
    all_rules = []
    
    # 1. 添加独立正则规则文件
    if hasattr(g, 'regex_rules_files') and g.regex_rules_files:
        all_rules.extend(g.regex_rules_files)
    
    # 2. 添加角色卡内嵌正则规则
    if hasattr(g, 'character') and g.character and 'regex_rules' in g.character:
        character_regex_rules = g.character['regex_rules']
        if isinstance(character_regex_rules, list):
            all_rules.extend(character_regex_rules)
            print(f"🔧 已提取角色卡内嵌正则规则: {len(character_regex_rules)} 条")
    
    # 3. 添加预设内嵌正则规则
    if hasattr(g, 'preset') and g.preset and 'regex_rules' in g.preset:
        preset_regex_rules = g.preset['regex_rules']
        if isinstance(preset_regex_rules, list):
            all_rules.extend(preset_regex_rules)
            print(f"🔧 已提取预设内嵌正则规则: {len(preset_regex_rules)} 条")
    
    print(f"📋 正则规则总计: {len(all_rules)} 条")

    # 这是最终的、包含所有元数据的 PROCESSED 格式
    final_processed_prompt_user_view = []
    final_processed_prompt_assistant_view = []

    # zip 确保我们同时拥有宏处理前后的消息
    for raw_message, processed_message in zip(raw_full_prompt, processed_prompt_after_macro):
        before_macro_content = raw_message.get("content", "")
        after_macro_content = processed_message.get("content", "")
        
        # 直接从处理后的消息中获取权威的 source_type
        source_type = processed_message.get("source_type", "unknown")

        # 为 user_view 应用正则
        user_view_res = registry.call(
            "apply_regex_rules",
            before_macro_text=before_macro_content,
            after_macro_text=after_macro_content,
            rules=all_rules,
            source_type=source_type,
            current_view="user_view"
        )
        user_view_content = user_view_res.get("processed_text", "")

        # 为 assistant_view 应用正则
        assistant_view_res = registry.call(
            "apply_regex_rules",
            before_macro_text=before_macro_content,
            after_macro_text=after_macro_content,
            rules=all_rules,
            source_type=source_type,
            current_view="assistant_view"
        )
        assistant_view_content = assistant_view_res.get("processed_text", "")

        # 拷贝元数据 (使用处理后的消息)，更新内容
        user_msg = processed_message.copy()
        user_msg["content"] = user_view_content
        final_processed_prompt_user_view.append(user_msg)

        assistant_msg = processed_message.copy()
        assistant_msg["content"] = assistant_view_content
        final_processed_prompt_assistant_view.append(assistant_msg)

    # --- 4. 生成最终输出 ---
    # a. 生成 Display History (仅用于显示和保存的干净对话历史)
    display_history = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in final_processed_prompt_user_view
        if msg.get("source_type") in ["user", "assistant"] and msg.get("content", "").strip()
    ]

    # b. 生成 CLEAN 格式 (用于发送给LLM API)
    final_clean_prompt_user_view = [
        {"role": msg["role"], "content": msg["content"]} for msg in final_processed_prompt_user_view if msg.get("content", "").strip()
    ]
    final_clean_prompt_assistant_view = [
        {"role": msg["role"], "content": msg["content"]} for msg in final_processed_prompt_assistant_view if msg.get("content", "").strip()
    ]

    # c. 保存 Display History
    display_history_path = "shared/SmartTavern/conversations/display_history/display_chat.json"
    save_result = registry.call(
        "history.save_display_history",
        file_path=display_history_path,
        history=display_history
    )
    if save_result.get("status") == "success":
        print(f"显示历史已成功保存到: {display_history_path}")
    else:
        print(f"⚠️ 保存显示历史失败: {save_result.get('message')}")

    # d. 打印或返回结果
    print("\n--- Display History (For UI) ---")
    print(display_history)

    print("\n--- User View (Clean, For LLM) ---")
    print(final_clean_prompt_user_view)
    
    print("\n--- Assistant View (Clean, For LLM) ---")
    print(final_clean_prompt_assistant_view)
    
    return {
        "processed_user_view": final_processed_prompt_user_view,
        "processed_assistant_view": final_processed_prompt_assistant_view,
        "clean_user_view": final_clean_prompt_user_view,
        "clean_assistant_view": final_clean_prompt_assistant_view,
        "display_history": display_history
    }