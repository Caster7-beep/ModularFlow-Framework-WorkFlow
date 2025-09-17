"""
可视化工作流系统 Phase 1 验收标准测试
"""

import sys
import os
import traceback

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 模拟LLM API调用
def mock_llm_api_call(**kwargs):
    """模拟的LLM API调用函数"""
    messages = kwargs.get('messages', [])
    last_message = messages[-1]['content'] if messages else ''
    
    # 简单的基于内容的响应
    response_content = f"Mocked LLM response for: '{last_message[:30]}...'"
    
    return {
        "response": {
            "content": response_content
        },
        "usage": {
            "prompt_tokens": len(last_message),
            "completion_tokens": len(response_content),
            "total_tokens": len(last_message) + len(response_content)
        }
    }

def setup_test_environment():
    """设置测试环境，注册模拟函数"""
    print("🔧 设置测试环境...")
    try:
        from core.function_registry import get_registry
        registry = get_registry()
        
        # 注册一个模拟的LLM API调用函数
        if "api.call" not in registry.list_functions():
            registry.register(
                name="api.call",
                func=mock_llm_api_call,
                inputs=["messages", "provider", "model", "temperature", "max_tokens"],
                outputs=["response", "usage"],
                description="Mocked LLM API call for testing"
            )
            print("✅ 模拟LLM API函数 (api.call) 注册成功")
        else:
            print("✅ 模拟LLM API函数 (api.call) 已存在")
            
        return True
    except Exception as e:
        print(f"❌ 测试环境设置失败: {e}")
        traceback.print_exc()
        return False

def test_criterion_1_create_simple_llm_workflow():
    """
    验收标准 1: 能通过API创建简单的LLM工作流
    """
    print("\n\n" + "="*60)
    print("📊 验收标准 1: 能通过API创建简单的LLM工作流")
    print("="*60)
    
    try:
        from modules.visual_workflow_module.visual_workflow_module import (
            create_workflow, add_node, create_connection, get_workflow
        )
        
        # 1. 创建工作流
        result = create_workflow("验收测试工作流", "一个简单的LLM调用工作流")
        assert result['success'], f"工作流创建失败: {result['message']}"
        workflow_id = result['workflow_id']
        print(f"✅ (1/4) 工作流创建成功: {workflow_id}")
        
        # 2. 添加输入节点
        input_result = add_node(workflow_id, "input", {"x": 100, "y": 100}, {"name": "用户问题"})
        assert input_result['success'], f"输入节点添加失败: {input_result['message']}"
        input_node_id = input_result['node_id']
        print(f"✅ (2/4) 输入节点添加成功: {input_node_id}")
        
        # 3. 添加LLM节点
        llm_result = add_node(workflow_id, "llm_call", {"x": 300, "y": 100}, {
            "name": "LLM回答",
            "prompt": "请回答以下问题: {{input}}"
        })
        assert llm_result['success'], f"LLM节点添加失败: {llm_result['message']}"
        llm_node_id = llm_result['node_id']
        print(f"✅ (3/4) LLM节点添加成功: {llm_node_id}")
        
        # 4. 添加输出节点
        output_result = add_node(workflow_id, "output", {"x": 500, "y": 100}, {"name": "最终答案"})
        assert output_result['success'], f"输出节点添加失败: {output_result['message']}"
        output_node_id = output_result['node_id']
        print(f"✅ (4/4) 输出节点添加成功: {output_node_id}")
        
        # 验证工作流结构
        wf_data = get_workflow(workflow_id)
        assert wf_data['success'], "获取工作流数据失败"
        assert len(wf_data['workflow_data']['workflow_definition']['nodes']) == 3, "节点数量不正确"
        
        print("\n🎉 验收标准 1 通过!")
        return workflow_id, input_node_id, llm_node_id, output_node_id
        
    except Exception as e:
        print(f"❌ 验收标准 1 失败: {e}")
        traceback.print_exc()
        return None, None, None, None

def test_criterion_2_and_3_execute_and_data_passing(workflow_info):
    """
    验收标准 2 & 3: 能执行单链路的LLM调用 & 支持基础的数据传递
    """
    print("\n\n" + "="*60)
    print("📊 验收标准 2 & 3: 执行单链路LLM调用和基础数据传递")
    print("="*60)
    
    if not all(workflow_info):
        print("❌ 跳过测试，因为前置测试失败。")
        return False
        
    workflow_id, input_node_id, llm_node_id, output_node_id = workflow_info
    
    try:
        from modules.visual_workflow_module.visual_workflow_module import create_connection, execute_workflow
        
        # 1. 创建连接 (数据传递)
        conn1_result = create_connection(workflow_id, input_node_id, llm_node_id)
        assert conn1_result['success'], f"连接1创建失败: {conn1_result['message']}"
        print(f"✅ (1/3) 连接创建成功: 输入 -> LLM")
        
        conn2_result = create_connection(workflow_id, llm_node_id, output_node_id)
        assert conn2_result['success'], f"连接2创建失败: {conn2_result['message']}"
        print(f"✅ (2/3) 连接创建成功: LLM -> 输出")
        
        # 2. 执行工作流
        input_text = "ModularFlow框架是什么？"
        exec_result = execute_workflow(workflow_id, {"input": input_text})
        assert exec_result['success'], f"工作流执行失败: {exec_result['message']}"
        print(f"✅ (3/3) 工作流执行成功")
        
        # 3. 验证结果
        execution_data = exec_result.get('result', {})
        assert execution_data.get('status') == 'completed', "工作流未成功完成"
        
        results = execution_data.get('results', {})
        assert len(results) == 3, f"预期3个节点结果，实际为{len(results)}"
        
        # 验证数据传递
        output_node_func_name = next(k for k, v in results.items() if output_node_id in k)
        final_output = results[output_node_func_name]['text']
        
        expected_response = f"Mocked LLM response for: '请回答以下问题: {input_text}...'"
        assert final_output == expected_response, f"最终输出与预期不符. Got: {final_output}"
        
        print(f"   - 输入: '{input_text}'")
        print(f"   - 最终输出: '{final_output}'")
        print("   - 数据已成功从输入节点传递到LLM节点，再到输出节点。")
        
        print("\n🎉 验收标准 2 & 3 通过!")
        return True
        
    except Exception as e:
        print(f"❌ 验收标准 2 & 3 失败: {e}")
        traceback.print_exc()
        return False

def test_criterion_4_no_conflict():
    """
    验收标准 4: 与现有系统无冲突
    """
    print("\n\n" + "="*60)
    print("📊 验收标准 4: 与现有系统无冲突")
    print("="*60)
    
    try:
        from core.function_registry import get_registry
        
        registry = get_registry()
        all_functions = registry.list_functions()
        
        # 检查是否有重复注册的函数（除了我们覆盖的api.call）
        function_counts = {}
        for func in all_functions:
            function_counts[func] = function_counts.get(func, 0) + 1
        
        duplicates = [f for f, count in function_counts.items() if count > 1 and f != "api.call"]
        
        assert not duplicates, f"发现重复注册的函数: {duplicates}"
        print("✅ (1/2) 函数注册表中无冲突")
        
        # 检查全局变量管理器
        from modules.visual_workflow_module.visual_workflow_module import get_visual_workflow_manager
        manager = get_visual_workflow_manager()
        assert manager is not None, "无法获取工作流管理器"
        print("✅ (2/2) 全局工作流管理器可正常访问")
        
        print("\n🎉 验收标准 4 通过!")
        return True
        
    except Exception as e:
        print(f"❌ 验收标准 4 失败: {e}")
        traceback.print_exc()
        return False

def run_acceptance_tests():
    """运行所有验收测试"""
    print("🚀 开始可视化工作流系统 Phase 1 验收测试\n")
    
    if not setup_test_environment():
        return False
        
    results = []
    
    # Test 1
    workflow_info = test_criterion_1_create_simple_llm_workflow()
    results.append(workflow_info[0] is not None)
    
    # Test 2 & 3
    results.append(test_criterion_2_and_3_execute_and_data_passing(workflow_info))
    
    # Test 4
    results.append(test_criterion_4_no_conflict())
    
    # 总结
    passed = sum(1 for r in results if r)
    total = len(results)
    
    print("\n\n" + "="*60)
    print("📊 验收测试总结")
    print("="*60)
    print(f"🎯 总体结果: {passed}/{total} 验收标准通过")
    
    if passed == total:
        print("\n🎉🎉🎉 恭喜！可视化工作流系统Phase 1已成功通过所有验收标准！")
        return True
    else:
        print("\n⚠️  有 {total - passed} 个验收标准未通过，请检查失败的测试。")
        return False

if __name__ == "__main__":
    success = run_acceptance_tests()
    sys.exit(0 if success else 1)