# backend_projects/SmartTavern/workflows/prompt_only_workflow.py

import os
import json
from datetime import datetime
from core.function_registry import get_registry, register_workflow
from core.services import get_current_globals, get_service_manager

@register_workflow(name="prompt_only_workflow")
def prompt_only_workflow(
    conversation_file: str,
    character_file: str,
    persona_file: str,
    preset_files: list[str] = None,
    world_book_files: list[str] = None,
    is_specific_conversation: bool = False,
    conversation_id: str = None
):
    """
    一个仅处理提示词构建的工作流，不调用LLM API。
    
    流程:
    1. 加载所有数据（角色、对话、预设等）。
    2. 构建完整的提示词序列（前缀 + 对话历史）。
    3. 处理宏和正则表达式，生成最终的用户视图。
    4. 从用户视图中提取干净的对话历史并返回（不存储文件）。
    
    Args:
        conversation_file: 对话文件的完整路径
        character_file: 角色卡文件名
        persona_file: 用户人格文件名
        preset_files: 预设文件列表
        world_book_files: 世界书文件列表
        is_specific_conversation: 是否是加载特定对话而非当前活跃对话
        conversation_id: 对话ID或文件名，用于记录处理的是哪个对话
    """
    registry = get_registry()
    g = get_current_globals()

    # 优先加载本次会话指定的角色卡，而不是依赖全局或默认配置
    service_manager = get_service_manager()
    shared_path = service_manager.get_shared_path()
    
    # 清空可能存在的旧角色数据，确保本次加载的是正确的
    g.character = {}
    
    if character_file and shared_path:
        character_full_path = shared_path / character_file
        if character_full_path.exists():
            try:
                with open(character_full_path, 'r', encoding='utf-8') as f:
                    g.character = json.load(f)
                    print(f"✅ [工作流] 成功加载指定角色卡: {character_file}")
            except Exception as e:
                print(f"❌ [工作流] 加载指定角色卡失败: {character_file}, 错误: {e}")
        else:
            print(f"⚠️ [工作流] 指定的角色卡文件不存在: {character_full_path}")

    # 1. 初始化与数据加载
    # 加载配置管理器选中的配置 (如预设, 独立世界书, 独立正则等)
    registry.call("config_manager.load_selected_config")
    
    # 读取指定的对话文件而不是使用全局对话历史
    original_history = []
    
    # 从文件加载对话历史
    try:
        print(f"📄 从文件加载对话历史: {conversation_file}")
        if os.path.exists(conversation_file):
            with open(conversation_file, 'r', encoding='utf-8') as f:
                original_history = json.load(f)
                print(f"✅ 成功加载对话文件，消息数: {len(original_history)}")
        else:
            print(f"⚠️ 对话文件不存在: {conversation_file}")
            # 如果文件不存在，使用全局历史作为备用
            registry.call("data.load_all")
            original_history = g.conversation_history.copy()
    except Exception as e:
        print(f"❌ 读取对话文件失败: {e}，使用全局对话历史作为备用")
        registry.call("data.load_all")
        original_history = g.conversation_history.copy()

    # 确保使用从文件加载的对话历史，而不是全局状态
    if is_specific_conversation:
        print(f"📋 处理特定对话: {conversation_id or 'unknown'}")
        # 如果是加载特定对话，设置临时全局对话历史，避免影响原有全局状态
        saved_global_history = g.conversation_history.copy() if hasattr(g, 'conversation_history') else []
        g.conversation_history = original_history.copy()
        
        # 设置临时全局当前对话文件
        saved_current_conversation = getattr(g, 'current_conversation_file', None)
        g.current_conversation_file = conversation_file
    
    print(f"🔍 [宏模块调试] 开始处理对话，原始历史消息数: {len(original_history)}")

    # 2. 构建提示词
    # 触发条件世界书
    last_user_message = next((msg['content'] for msg in reversed(original_history) if msg['role'] == 'user'), "")
    trigger_result = registry.call("world_book.trigger", last_user_message=last_user_message)
    triggered_wb_ids = trigger_result.get("triggered_ids", [])
    if triggered_wb_ids:
        print(f"已触发 {len(triggered_wb_ids)} 个世界书条目。")
    
    # 打印世界书数据来源
    world_book_data = None
    if hasattr(g, 'world_book_files') and g.world_book_files:
        world_book_data = g.world_book_files
        print(f"📚 从g.world_book_files中读取世界书数据，条目数: {len(g.world_book_files)}")
    
    # 打印角色卡内嵌世界书
    character_data = None
    if hasattr(g, 'character') and g.character:
        character_data = g.character
    elif hasattr(g, 'character_data') and g.character_data:
        character_data = g.character_data
    
    if character_data and 'world_book' in character_data:
        print(f"📚 角色卡内嵌世界书: {character_data['world_book'].get('name', '未命名')}")
        world_book_entries = character_data['world_book'].get('entries', [])
        print(f"📚 角色卡内嵌世界书条目数: {len(world_book_entries)}")

    # 构建框架提示词 (前缀部分)
    framing_result = registry.call("framing.assemble", triggered_wb_ids=triggered_wb_ids)
    prefix_prompt = framing_result.get("prefix_prompt", [])

    # 构建对话内上下文
    in_chat_result = registry.call("in_chat.construct", history=original_history, triggered_wb_ids=triggered_wb_ids)
    chat_context = in_chat_result.get("context", [])
    
    # 组合成完整的消息序列
    raw_full_prompt = prefix_prompt + chat_context

    # 3. 后处理流程
    # a. 宏处理
    macro_result = registry.call("process_message_sequence_macros", messages=raw_full_prompt)
    processed_prompt_after_macro = macro_result.get("processed_messages", [])
    
    # b. 正则表达式处理 (为 user_view)
    # 收集所有来源的正则规则：独立文件、角色卡内嵌、预设内嵌
    all_rules = []
    
    # 1. 添加独立正则规则文件
    if hasattr(g, 'regex_rules_files') and g.regex_rules_files:
        all_rules.extend(g.regex_rules_files)
        print(f"🔧 已提取独立正则规则文件: {len(g.regex_rules_files)} 条")
    
    # 2. 添加角色卡内嵌正则规则
    character_data = None
    if hasattr(g, 'character') and g.character:
        character_data = g.character
        print(f"🔍 从g.character中读取角色卡数据")
    elif hasattr(g, 'character_data') and g.character_data:
        character_data = g.character_data
        print(f"🔍 从g.character_data中读取角色卡数据")
    
    if character_data and 'regex_rules' in character_data:
        character_regex_rules = character_data['regex_rules']
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

    final_processed_prompt_user_view = []
    for raw_message, processed_message in zip(raw_full_prompt, processed_prompt_after_macro):
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

    # 4. 生成最终显示历史
    # 从 user_view 中提取 display_history，只保留真正的用户和助手消息
    display_history = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in final_processed_prompt_user_view
        if (msg.get("role") in ["user", "assistant"] and
            msg.get("content", "").strip() and
            msg.get("source_type") in ["user", "assistant"])
    ]

    print(f"🔍 [宏模块调试] 处理完成，共生成 {len(display_history)} 条处理后的消息")

    # 记录一些关键信息用于调试
    print(f"🔍 [宏模块调试] 处理完成，共生成 {len(display_history)} 条处理后的消息")
    
    # 5. 恢复全局状态（如果有临时修改）
    if is_specific_conversation:
        # 恢复原始对话历史
        g.conversation_history = saved_global_history
        
        # 恢复原始当前对话文件
        if saved_current_conversation is not None:
            g.current_conversation_file = saved_current_conversation
        elif hasattr(g, 'current_conversation_file'):
            delattr(g, 'current_conversation_file')
    
    # 6. 返回结果（不保存文件）
    return {
        "success": True,
        "display_history": display_history,
        "processed_message_count": len(display_history),
        "conversation_file": conversation_file,  # 添加处理的对话文件路径
        "conversation_id": conversation_id,      # 添加对话ID
        "timestamp": datetime.now().isoformat()
    }