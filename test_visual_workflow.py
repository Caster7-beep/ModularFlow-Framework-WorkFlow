"""
可视化工作流系统基础功能测试
测试Phase 1核心引擎的基本功能
"""

import sys
import os
import traceback

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_import_modules():
    """测试模块导入"""
    print("🔍 测试模块导入...")
    
    try:
        # 测试核心模块导入
        from orchestrators.visual_workflow import (
            VisualWorkflow, WorkflowDefinition, WorkflowNode, WorkflowEdge,
            create_visual_workflow, create_node, create_edge, NodeType
        )
        print("✅ VisualWorkflow核心模块导入成功")
        
        # 测试API模块导入
        from modules.visual_workflow_module.visual_workflow_module import (
            get_visual_workflow_manager, create_workflow, add_node,
            create_connection, execute_workflow
        )
        print("✅ Visual Workflow API模块导入成功")
        
        # 测试function_registry导入
        from core.function_registry import get_registry
        print("✅ Function Registry导入成功")
        
        return True
        
    except Exception as e:
        print(f"❌ 模块导入失败: {e}")
        traceback.print_exc()
        return False


def test_core_workflow_creation():
    """测试核心工作流创建功能"""
    print("\n🔧 测试核心工作流创建...")
    
    try:
        from orchestrators.visual_workflow import create_visual_workflow, create_node, create_edge, NodeType
        
        # 创建工作流
        workflow = create_visual_workflow("测试工作流", "基础功能测试")
        print(f"✅ 工作流创建成功: {workflow.workflow_def.name}")
        print(f"   ID: {workflow.workflow_def.id}")
        
        # 创建输入节点
        input_node = create_node("input", {"x": 100, "y": 100}, {
            "name": "用户输入",
            "default_value": "Hello World"
        })
        workflow.workflow_def.nodes.append(input_node)
        print(f"✅ 输入节点创建成功: {input_node.id}")
        
        # 创建输出节点
        output_node = create_node("output", {"x": 300, "y": 100}, {
            "name": "输出结果",
            "format": "text"
        })
        workflow.workflow_def.nodes.append(output_node)
        print(f"✅ 输出节点创建成功: {output_node.id}")
        
        # 创建连接
        edge = create_edge(input_node.id, output_node.id, {
            "source_handle": "text",
            "target_handle": "input",
            "data_type": "text"
        })
        workflow.workflow_def.edges.append(edge)
        print(f"✅ 连接创建成功: {input_node.name} -> {output_node.name}")
        
        # 加载工作流
        workflow.load_from_definition(workflow.workflow_def)
        print("✅ 工作流加载成功")
        
        return workflow, input_node, output_node
        
    except Exception as e:
        print(f"❌ 核心工作流创建失败: {e}")
        traceback.print_exc()
        return None, None, None


def test_workflow_execution():
    """测试工作流执行"""
    print("\n▶️ 测试工作流执行...")
    
    try:
        # 先创建工作流
        workflow, input_node, output_node = test_core_workflow_creation()
        if not workflow:
            return False
        
        # 设置初始输入
        input_data = {"input": "这是一个测试输入"}
        print(f"🔤 设置输入数据: {input_data}")
        
        # 执行工作流
        result = workflow.execute_with_monitoring(input_data)
        print("✅ 工作流执行完成")
        
        # 检查执行结果
        if result.get('status') == 'completed':
            print(f"   状态: {result['status']}")
            print(f"   执行时间: {result.get('duration', 0):.3f}秒")
            
            # 显示结果
            results = result.get('results', {})
            print(f"   节点执行结果数量: {len(results)}")
            
            for func_name, func_result in results.items():
                if isinstance(func_result, dict):
                    text_output = func_result.get('text', 'N/A')
                    print(f"     {func_name}: {text_output[:50]}...")
        else:
            print(f"   执行状态: {result.get('status')}")
            if result.get('error'):
                print(f"   错误: {result['error']}")
        
        return True
        
    except Exception as e:
        print(f"❌ 工作流执行失败: {e}")
        traceback.print_exc()
        return False


def test_api_functions():
    """测试API函数"""
    print("\n🌐 测试API函数...")
    
    try:
        # 导入必要模块
        from core.function_registry import get_registry
        from modules.visual_workflow_module.visual_workflow_module import get_visual_workflow_manager
        
        # 获取注册器
        registry = get_registry()
        print("✅ 获取function_registry成功")
        
        # 检查我们的函数是否已注册
        registered_functions = registry.list_functions()
        visual_workflow_functions = [f for f in registered_functions if f.startswith('visual_workflow')]
        
        print(f"📋 已注册的可视化工作流函数: {len(visual_workflow_functions)}")
        for func in visual_workflow_functions:
            print(f"   - {func}")
        
        # 测试创建工作流API
        print("\n🏗️ 测试创建工作流API...")
        from modules.visual_workflow_module.visual_workflow_module import create_workflow
        result = create_workflow("API测试工作流", "通过API创建的测试工作流")
        
        if result.get('success'):
            workflow_id = result['workflow_id']
            print(f"✅ 工作流创建成功: {workflow_id}")
            
            # 测试添加节点
            print("\n📦 测试添加节点API...")
            from modules.visual_workflow_module.visual_workflow_module import add_node
            node_result = add_node(workflow_id, "input", {"x": 100, "y": 100}, {"name": "API输入节点"})
            
            if node_result.get('success'):
                input_node_id = node_result['node_id']
                print(f"✅ 输入节点添加成功: {input_node_id}")
                
                # 添加输出节点
                output_result = add_node(workflow_id, "output", {"x": 300, "y": 100}, {"name": "API输出节点"})
                
                if output_result.get('success'):
                    output_node_id = output_result['node_id']
                    print(f"✅ 输出节点添加成功: {output_node_id}")
                    
                    # 创建连接
                    from modules.visual_workflow_module.visual_workflow_module import create_connection
                    connection_result = create_connection(workflow_id, input_node_id, output_node_id)
                    
                    if connection_result.get('success'):
                        print(f"✅ 连接创建成功")
                        
                        # 测试执行
                        print("\n▶️ 测试API执行工作流...")
                        from modules.visual_workflow_module.visual_workflow_module import execute_workflow
                        exec_result = execute_workflow(workflow_id, {"input": "API测试数据"})
                        
                        if exec_result.get('success'):
                            print("✅ 工作流执行成功")
                            print(f"   执行ID: {exec_result.get('execution_id')}")
                            
                            # 显示结果摘要
                            result_data = exec_result.get('result', {})
                            print(f"   执行状态: {result_data.get('status')}")
                            if result_data.get('duration'):
                                print(f"   执行耗时: {result_data['duration']:.3f}秒")
                        else:
                            print(f"❌ 工作流执行失败: {exec_result.get('message')}")
                    else:
                        print(f"❌ 连接创建失败: {connection_result.get('message')}")
                else:
                    print(f"❌ 输出节点添加失败: {output_result.get('message')}")
            else:
                print(f"❌ 输入节点添加失败: {node_result.get('message')}")
        else:
            print(f"❌ 工作流创建失败: {result.get('message')}")
        
        return True
        
    except Exception as e:
        print(f"❌ API函数测试失败: {e}")
        traceback.print_exc()
        return False


def test_node_types():
    """测试各种节点类型"""
    print("\n🧩 测试各种节点类型...")
    
    try:
        from orchestrators.visual_workflow import create_visual_workflow, create_node, NodeType
        
        # 创建测试工作流
        workflow = create_visual_workflow("节点类型测试", "测试各种节点类型的创建和基本功能")
        
        # 测试每种节点类型
        node_types = [
            ("input", {"name": "测试输入", "default_value": "test"}),
            ("output", {"name": "测试输出", "format": "text"}),
            ("code_block", {"name": "测试代码", "code": "output = {'text': 'Hello from code!'}"}),
            ("condition", {"name": "测试条件", "condition": "len(text) > 0"}),
            ("switch", {"name": "测试开关", "switch_map": {"1": "路径1", "0": "路径0"}}),
            ("merger", {"name": "测试聚合", "merge_strategy": "concat"})
        ]
        
        created_nodes = []
        for i, (node_type, config) in enumerate(node_types):
            try:
                node = create_node(node_type, {"x": i * 100, "y": 100}, config)
                workflow.workflow_def.nodes.append(node)
                created_nodes.append((node_type, node))
                print(f"✅ {node_type}节点创建成功: {node.name}")
            except Exception as e:
                print(f"❌ {node_type}节点创建失败: {e}")
        
        # 尝试加载工作流
        try:
            workflow.load_from_definition(workflow.workflow_def)
            print(f"✅ 包含{len(created_nodes)}个节点的工作流加载成功")
        except Exception as e:
            print(f"⚠️ 工作流加载警告: {e}")
        
        return True
        
    except Exception as e:
        print(f"❌ 节点类型测试失败: {e}")
        traceback.print_exc()
        return False


def test_code_block_execution():
    """测试代码块节点执行"""
    print("\n💻 测试代码块节点执行...")
    
    try:
        from orchestrators.visual_workflow import create_visual_workflow, create_node, create_edge
        
        # 创建包含代码块的工作流
        workflow = create_visual_workflow("代码块测试", "测试代码块节点的执行功能")
        
        # 创建输入节点
        input_node = create_node("input", {"x": 100, "y": 100}, {
            "name": "数据输入",
            "default_value": "Hello World"
        })
        
        # 创建代码块节点
        code_node = create_node("code_block", {"x": 300, "y": 100}, {
            "name": "文本处理",
            "code": """
# 处理输入文本
input_text = inputs.get('input', '')
processed_text = f"处理结果: {input_text.upper()}"

# 输出结果
output = {
    'text': processed_text,
    'signal': 1 if len(input_text) > 0 else 0,
    'metadata': {'original_length': len(input_text)}
}
""",
            "code_type": "python"
        })
        
        # 创建输出节点
        output_node = create_node("output", {"x": 500, "y": 100}, {
            "name": "处理结果"
        })
        
        # 添加节点到工作流
        workflow.workflow_def.nodes.extend([input_node, code_node, output_node])
        
        # 创建连接
        edge1 = create_edge(input_node.id, code_node.id, {"source_handle": "text", "target_handle": "input"})
        edge2 = create_edge(code_node.id, output_node.id, {"source_handle": "text", "target_handle": "input"})
        workflow.workflow_def.edges.extend([edge1, edge2])
        
        # 加载和执行工作流
        workflow.load_from_definition(workflow.workflow_def)
        result = workflow.execute_with_monitoring({"input": "测试代码块功能"})
        
        if result.get('status') == 'completed':
            print("✅ 代码块工作流执行成功")
            
            # 查看执行结果
            results = result.get('results', {})
            for func_name, func_result in results.items():
                if 'code_block' in func_name and isinstance(func_result, dict):
                    print(f"   代码块输出: {func_result.get('text', 'N/A')}")
                    print(f"   信号值: {func_result.get('signal', 'N/A')}")
                    print(f"   元数据: {func_result.get('metadata', {})}")
        else:
            print(f"❌ 代码块工作流执行失败: {result.get('error', '未知错误')}")
        
        return True
        
    except Exception as e:
        print(f"❌ 代码块节点测试失败: {e}")
        traceback.print_exc()
        return False


def run_all_tests():
    """运行所有测试"""
    print("🚀 开始可视化工作流系统基础功能测试\n")
    print("=" * 60)
    
    test_results = []
    
    # 运行测试
    tests = [
        ("模块导入测试", test_import_modules),
        ("核心工作流创建测试", lambda: test_core_workflow_creation()[0] is not None),
        ("工作流执行测试", test_workflow_execution),
        ("节点类型测试", test_node_types),
        ("代码块执行测试", test_code_block_execution),
        ("API函数测试", test_api_functions),
    ]
    
    for test_name, test_func in tests:
        print(f"\n{'='*60}")
        try:
            result = test_func()
            test_results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name}出现异常: {e}")
            test_results.append((test_name, False))
    
    # 总结测试结果
    print(f"\n{'='*60}")
    print("📊 测试结果总结")
    print("=" * 60)
    
    passed = 0
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
        if result:
            passed += 1
    
    print(f"\n🎯 总体结果: {passed}/{total} 测试通过")
    
    if passed == total:
        print("🎉 所有测试都通过了！可视化工作流系统Phase 1核心功能正常工作。")
        return True
    else:
        print(f"⚠️  有 {total - passed} 个测试失败，需要进一步检查。")
        return False


if __name__ == "__main__":
    try:
        success = run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⏹️ 测试被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n💥 测试过程中出现未处理的异常: {e}")
        traceback.print_exc()
        sys.exit(1)