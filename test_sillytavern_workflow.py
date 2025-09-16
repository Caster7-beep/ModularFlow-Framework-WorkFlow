#!/usr/bin/env python3
"""
SmartTavern工作流测试脚本
用于验证完整的SmartTavern对话系统是否正常工作
"""

import sys
import os
import json
import time
import requests
from pathlib import Path

# 添加框架根目录到Python路径
framework_root = Path(__file__).parent
sys.path.insert(0, str(framework_root))

def test_api_endpoints():
    """测试API端点是否正常工作"""
    base_url = "http://localhost:6500/api/v1"
    
    print("🧪 开始测试SmartTavern API端点...")
    
    # 测试健康检查
    try:
        response = requests.get(f"{base_url}/health", timeout=5)
        if response.status_code == 200:
            print("✅ 健康检查: 通过")
        else:
            print(f"❌ 健康检查: 失败 (状态码: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ 健康检查: 连接失败 ({e})")
        return False
    
    # 测试系统状态
    try:
        response = requests.get(f"{base_url}/SmartTavern/get_system_status", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print("✅ 系统状态: 正常")
                system_info = data.get("system", {})
                print(f"   - 项目: {system_info.get('project_name', 'Unknown')}")
                print(f"   - 工作流: {system_info.get('workflow', 'Unknown')}")
                print(f"   - LLM可用: {system_info.get('llm_available', False)}")
            else:
                print("❌ 系统状态: API返回失败")
                return False
        else:
            print(f"❌ 系统状态: HTTP错误 (状态码: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ 系统状态: 请求失败 ({e})")
        return False
    
    # 测试获取对话历史
    try:
        response = requests.get(f"{base_url}/SmartTavern/get_chat_history", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print(f"✅ 对话历史: 成功获取 (当前消息数: {data.get('total_messages', 0)})")
            else:
                print("❌ 对话历史: API返回失败")
                return False
        else:
            print(f"❌ 对话历史: HTTP错误 (状态码: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ 对话历史: 请求失败 ({e})")
        return False
    
    return True

def test_conversation_workflow():
    """测试完整的对话工作流"""
    base_url = "http://localhost:6500/api/v1"
    
    print("\n🔄 开始测试SmartTavern对话工作流...")
    
    # 清空历史记录
    try:
        response = requests.post(f"{base_url}/SmartTavern/clear_history",
                               headers={'Content-Type': 'application/json'}, 
                               timeout=10)
        if response.status_code == 200:
            print("✅ 历史清空: 成功")
        else:
            print(f"❌ 历史清空: 失败 (状态码: {response.status_code})")
    except Exception as e:
        print(f"❌ 历史清空: 请求失败 ({e})")
    
    # 发送测试消息
    test_message = "你好，这是一个测试消息。请简单回复确认收到。"
    
    try:
        print(f"📤 发送测试消息: {test_message}")
        response = requests.post(f"{base_url}/SmartTavern/send_message",
                               json={"message": test_message},
                               headers={'Content-Type': 'application/json'},
                               timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print("✅ 消息发送: 成功")
                print(f"   - 最终消息数: {data.get('final_message_count', 0)}")
                print(f"   - Display历史路径: {data.get('display_history_path', 'Unknown')}")
            else:
                print(f"❌ 消息发送: API返回失败 - {data.get('error', 'Unknown error')}")
                return False
        else:
            print(f"❌ 消息发送: HTTP错误 (状态码: {response.status_code})")
            return False
            
    except Exception as e:
        print(f"❌ 消息发送: 请求失败 ({e})")
        return False
    
    # 验证对话历史是否更新
    try:
        time.sleep(1)  # 等待工作流处理完成
        response = requests.get(f"{base_url}/SmartTavern/get_chat_history", timeout=5)
        if response.status_code == 200:
            data = response.json()
            # API网关可能包装了响应，检查是否有 data 字段
            if "data" in data:
                actual_data = data["data"]
            else:
                actual_data = data
                
            print(f"🔍 调试信息: 响应结构 = {actual_data}")
            
            if actual_data.get("success"):
                history = actual_data.get("history", [])
                print(f"✅ 历史验证: 成功 (更新后消息数: {len(history)})")
                if len(history) >= 2:  # 应该至少有用户消息和AI回复
                    print("   - 对话流程完整")
                    user_msg = next((msg for msg in history if msg.get('role') == 'user'), None)
                    ai_msg = next((msg for msg in history if msg.get('role') == 'assistant'), None)
                    if user_msg and ai_msg:
                        print(f"   - 用户消息: {user_msg.get('content', '')[:50]}...")
                        print(f"   - AI回复: {ai_msg.get('content', '')[:50]}...")
                    return True
                else:
                    print("❌ 历史验证: 消息数量异常")
                    print(f"🔍 调试信息: history内容 = {history}")
                    return False
            else:
                print("❌ 历史验证: API返回失败")
                return False
        else:
            print(f"❌ 历史验证: HTTP错误 (状态码: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ 历史验证: 请求失败 ({e})")
        return False

def check_files():
    """检查关键文件是否存在"""
    print("\n📁 检查关键文件...")
    
    files_to_check = [
        "shared/SmartTavern/conversations/current_chat.json",
        "shared/SmartTavern/conversations/display_history/display_chat.json",
        "shared/SmartTavern/characters/许莲笙.json",
        "shared/SmartTavern/personas/default_user.json",
        "backend_projects/SmartTavern/workflows/prompt_api_workflow.py",
        "backend_projects/SmartTavern/config.json",
        "backend_projects/SmartTavern/start_server.py"
    ]
    
    all_exist = True
    for file_path in files_to_check:
        if os.path.exists(file_path):
            print(f"✅ {file_path}")
        else:
            print(f"❌ {file_path} - 文件不存在")
            all_exist = False
    
    return all_exist

def main():
    """主测试函数"""
    print("🚀 SmartTavern 工作流测试开始")
    print("=" * 50)
    
    # 检查文件
    if not check_files():
        print("\n❌ 关键文件缺失，测试中止")
        return False
    
    # 测试API端点
    if not test_api_endpoints():
        print("\n❌ API端点测试失败，测试中止")
        return False
        
    # 测试对话工作流
    if not test_conversation_workflow():
        print("\n❌ 对话工作流测试失败")
        return False
    
    print("\n" + "=" * 50)
    print("🎉 所有测试通过！SmartTavern工作流运行正常")
    print("\n📋 测试总结:")
    print("  ✅ 文件检查: 通过")
    print("  ✅ API端点: 正常")
    print("  ✅ 对话工作流: 正常")
    print("  ✅ 历史记录: 正常")
    
    print("\n💡 您现在可以:")
    print("  1. 访问前端界面: http://localhost:6601")
    print("  2. 查看API文档: http://localhost:6500/docs")
    print("  3. 开始正常的对话测试")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)