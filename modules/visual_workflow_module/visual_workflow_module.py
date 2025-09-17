"""
可视化工作流API模块
提供通过function_registry注册的API接口函数，用于创建、管理和执行可视化工作流

所有注册的函数都会自动暴露为REST API端点
"""

import uuid
import json
import time
from typing import Dict, Any, List, Optional

from core.function_registry import register_function
from core.services import get_current_globals
from orchestrators.visual_workflow import (
    VisualWorkflow, WorkflowDefinition, WorkflowNode, WorkflowEdge,
    create_visual_workflow, create_node, create_edge, NodeType
)
from modules.visual_workflow_module import variables as v


class VisualWorkflowManager:
    """可视化工作流管理器"""
    
    def __init__(self):
        self.workflows = {}  # 存储工作流实例
        self.workflows_metadata = {}  # 存储工作流元数据
        
    def add_workflow(self, workflow: VisualWorkflow):
        """添加工作流到管理器"""
        self.workflows[workflow.workflow_def.id] = workflow
        self.workflows_metadata[workflow.workflow_def.id] = {
            'id': workflow.workflow_def.id,
            'name': workflow.workflow_def.name,
            'description': workflow.workflow_def.description,
            'version': workflow.workflow_def.version,
            'created_at': workflow.workflow_def.created_at,
            'updated_at': workflow.workflow_def.updated_at,
            'node_count': len(workflow.workflow_def.nodes),
            'edge_count': len(workflow.workflow_def.edges)
        }
    
    def get_workflow(self, workflow_id: str) -> Optional[VisualWorkflow]:
        """获取工作流"""
        return self.workflows.get(workflow_id)
    
    def remove_workflow(self, workflow_id: str):
        """移除工作流"""
        self.workflows.pop(workflow_id, None)
        self.workflows_metadata.pop(workflow_id, None)
    
    def list_workflows(self) -> List[Dict[str, Any]]:
        """列出所有工作流"""
        return list(self.workflows_metadata.values())


def get_visual_workflow_manager() -> VisualWorkflowManager:
    """获取全局工作流管理器"""
    g = get_current_globals()
    if not hasattr(g, 'visual_workflow_manager'):
        g.visual_workflow_manager = VisualWorkflowManager()
    return g.visual_workflow_manager


# ========== 工作流CRUD API函数 ==========

@register_function(name="visual_workflow.create", outputs=["workflow_id", "success", "message"])
def create_workflow(name: str, description: str = "") -> Dict[str, Any]:
    """
    创建新的可视化工作流
    
    Args:
        name: 工作流名称
        description: 工作流描述
        
    Returns:
        Dict containing workflow_id, success status and message
    """
    try:
        # 检查工作流数量限制
        manager = get_visual_workflow_manager()
        if len(manager.workflows) >= v.DEFAULT_MAX_WORKFLOWS:
            return {
                "workflow_id": None,
                "success": False,
                "message": v.ERROR_MESSAGES['max_workflows_exceeded']
            }
        
        # 创建新工作流
        workflow = create_visual_workflow(name, description)
        
        # 添加到管理器
        manager.add_workflow(workflow)
        
        return {
            "workflow_id": workflow.workflow_def.id,
            "success": True,
            "message": v.SUCCESS_MESSAGES['workflow_created']
        }
        
    except Exception as e:
        return {
            "workflow_id": None,
            "success": False,
            "message": f"创建工作流失败: {str(e)}"
        }


@register_function(name="visual_workflow.get", outputs=["workflow_data", "success", "message"])
def get_workflow(workflow_id: str) -> Dict[str, Any]:
    """
    获取工作流详细信息
    
    Args:
        workflow_id: 工作流ID
        
    Returns:
        Dict containing workflow data, success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "workflow_data": None,
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        return {
            "workflow_data": workflow.to_dict(),
            "success": True,
            "message": "获取工作流成功"
        }
        
    except Exception as e:
        return {
            "workflow_data": None,
            "success": False,
            "message": f"获取工作流失败: {str(e)}"
        }


@register_function(name="visual_workflow.update", outputs=["success", "message"])
def update_workflow(workflow_id: str, name: str = None, description: str = None) -> Dict[str, Any]:
    """
    更新工作流基本信息
    
    Args:
        workflow_id: 工作流ID
        name: 新名称（可选）
        description: 新描述（可选）
        
    Returns:
        Dict containing success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 更新工作流信息
        if name is not None:
            workflow.workflow_def.name = name
            workflow.name = name
        
        if description is not None:
            workflow.workflow_def.description = description
        
        workflow.workflow_def.updated_at = time.time()
        
        # 更新管理器中的元数据
        manager.add_workflow(workflow)
        
        return {
            "success": True,
            "message": v.SUCCESS_MESSAGES['workflow_updated']
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"更新工作流失败: {str(e)}"
        }


@register_function(name="visual_workflow.delete", outputs=["success", "message"])
def delete_workflow(workflow_id: str) -> Dict[str, Any]:
    """
    删除工作流
    
    Args:
        workflow_id: 工作流ID
        
    Returns:
        Dict containing success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        
        if not manager.get_workflow(workflow_id):
            return {
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        manager.remove_workflow(workflow_id)
        
        return {
            "success": True,
            "message": v.SUCCESS_MESSAGES['workflow_deleted']
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"删除工作流失败: {str(e)}"
        }


@register_function(name="visual_workflow.list", outputs=["workflows", "success", "message"])
def list_workflows() -> Dict[str, Any]:
    """
    获取所有工作流列表
    
    Returns:
        Dict containing workflows list, success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflows = manager.list_workflows()
        
        return {
            "workflows": workflows,
            "success": True,
            "message": f"获取到 {len(workflows)} 个工作流"
        }
        
    except Exception as e:
        return {
            "workflows": [],
            "success": False,
            "message": f"获取工作流列表失败: {str(e)}"
        }


# ========== 节点操作API函数 ==========

@register_function(name="visual_workflow.add_node", outputs=["node_id", "success", "message"])
def add_node(workflow_id: str, node_type: str, position: Dict[str, float], config: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    添加节点到工作流
    
    Args:
        workflow_id: 工作流ID
        node_type: 节点类型
        position: 节点位置 {"x": 100, "y": 200}
        config: 节点配置数据
        
    Returns:
        Dict containing node_id, success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "node_id": None,
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 检查节点数量限制
        if len(workflow.workflow_def.nodes) >= v.DEFAULT_MAX_NODES_PER_WORKFLOW:
            return {
                "node_id": None,
                "success": False,
                "message": v.ERROR_MESSAGES['max_nodes_exceeded']
            }
        
        # 验证节点类型
        try:
            NodeType(node_type)
        except ValueError:
            return {
                "node_id": None,
                "success": False,
                "message": v.ERROR_MESSAGES['invalid_node_type']
            }
        
        # 合并默认配置
        node_config = v.DEFAULT_NODE_CONFIG.get(node_type, {}).copy()
        if config:
            node_config.update(config)
        
        # 创建节点
        node = create_node(node_type, position, node_config)
        workflow.workflow_def.nodes.append(node)
        workflow.workflow_def.updated_at = time.time()
        
        # 重新加载工作流以更新注册的函数
        workflow.load_from_definition(workflow.workflow_def)
        
        # 更新管理器
        manager.add_workflow(workflow)
        
        return {
            "node_id": node.id,
            "success": True,
            "message": v.SUCCESS_MESSAGES['node_added']
        }
        
    except Exception as e:
        return {
            "node_id": None,
            "success": False,
            "message": f"添加节点失败: {str(e)}"
        }


@register_function(name="visual_workflow.update_node", outputs=["success", "message"])
def update_node(workflow_id: str, node_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    更新节点配置
    
    Args:
        workflow_id: 工作流ID
        node_id: 节点ID
        config: 新的节点配置
        
    Returns:
        Dict containing success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 查找节点
        node = None
        for n in workflow.workflow_def.nodes:
            if n.id == node_id:
                node = n
                break
        
        if not node:
            return {
                "success": False,
                "message": v.ERROR_MESSAGES['node_not_found']
            }
        
        # 更新节点配置
        node.data.update(config)
        if 'name' in config:
            node.name = config['name']
        if 'position' in config:
            node.position = config['position']
        
        workflow.workflow_def.updated_at = time.time()
        
        # 重新加载工作流
        workflow.load_from_definition(workflow.workflow_def)
        
        # 更新管理器
        manager.add_workflow(workflow)
        
        return {
            "success": True,
            "message": v.SUCCESS_MESSAGES['node_updated']
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"更新节点失败: {str(e)}"
        }


@register_function(name="visual_workflow.delete_node", outputs=["success", "message"])
def delete_node(workflow_id: str, node_id: str) -> Dict[str, Any]:
    """
    删除节点
    
    Args:
        workflow_id: 工作流ID
        node_id: 节点ID
        
    Returns:
        Dict containing success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 删除节点
        workflow.workflow_def.nodes = [n for n in workflow.workflow_def.nodes if n.id != node_id]
        
        # 删除相关的连接
        workflow.workflow_def.edges = [
            e for e in workflow.workflow_def.edges 
            if e.source != node_id and e.target != node_id
        ]
        
        workflow.workflow_def.updated_at = time.time()
        
        # 重新加载工作流
        workflow.load_from_definition(workflow.workflow_def)
        
        # 更新管理器
        manager.add_workflow(workflow)
        
        return {
            "success": True,
            "message": v.SUCCESS_MESSAGES['node_deleted']
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"删除节点失败: {str(e)}"
        }


# ========== 连接操作API函数 ==========

@register_function(name="visual_workflow.create_connection", outputs=["connection_id", "success", "message"])
def create_connection(workflow_id: str, source_node_id: str, target_node_id: str, 
                     config: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    创建节点连接
    
    Args:
        workflow_id: 工作流ID
        source_node_id: 源节点ID
        target_node_id: 目标节点ID
        config: 连接配置
        
    Returns:
        Dict containing connection_id, success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "connection_id": None,
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 验证节点是否存在
        source_node = next((n for n in workflow.workflow_def.nodes if n.id == source_node_id), None)
        target_node = next((n for n in workflow.workflow_def.nodes if n.id == target_node_id), None)
        
        if not source_node or not target_node:
            return {
                "connection_id": None,
                "success": False,
                "message": v.ERROR_MESSAGES['node_not_found']
            }
        
        # 创建连接
        edge_config = config or {}
        edge = create_edge(source_node_id, target_node_id, edge_config)
        
        workflow.workflow_def.edges.append(edge)
        workflow.workflow_def.updated_at = time.time()
        
        # 重新加载工作流
        workflow.load_from_definition(workflow.workflow_def)
        
        # 更新管理器
        manager.add_workflow(workflow)
        
        return {
            "connection_id": edge.id,
            "success": True,
            "message": v.SUCCESS_MESSAGES['connection_created']
        }
        
    except Exception as e:
        return {
            "connection_id": None,
            "success": False,
            "message": f"创建连接失败: {str(e)}"
        }


@register_function(name="visual_workflow.delete_connection", outputs=["success", "message"])
def delete_connection(workflow_id: str, connection_id: str) -> Dict[str, Any]:
    """
    删除连接
    
    Args:
        workflow_id: 工作流ID
        connection_id: 连接ID
        
    Returns:
        Dict containing success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 删除连接
        original_count = len(workflow.workflow_def.edges)
        workflow.workflow_def.edges = [e for e in workflow.workflow_def.edges if e.id != connection_id]
        
        if len(workflow.workflow_def.edges) == original_count:
            return {
                "success": False,
                "message": "连接不存在"
            }
        
        workflow.workflow_def.updated_at = time.time()
        
        # 重新加载工作流
        workflow.load_from_definition(workflow.workflow_def)
        
        # 更新管理器
        manager.add_workflow(workflow)
        
        return {
            "success": True,
            "message": v.SUCCESS_MESSAGES['connection_deleted']
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"删除连接失败: {str(e)}"
        }


# ========== 执行API函数 ==========

@register_function(name="visual_workflow.execute", outputs=["execution_id", "result", "success", "message"])
def execute_workflow(workflow_id: str, input_data: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    执行工作流
    
    Args:
        workflow_id: 工作流ID
        input_data: 初始输入数据
        
    Returns:
        Dict containing execution_id, result, success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "execution_id": None,
                "result": None,
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 执行工作流
        execution_id = str(uuid.uuid4())
        result = workflow.execute_with_monitoring(input_data or {})
        
        return {
            "execution_id": execution_id,
            "result": result,
            "success": True,
            "message": v.SUCCESS_MESSAGES['workflow_executed']
        }
        
    except Exception as e:
        return {
            "execution_id": None,
            "result": None,
            "success": False,
            "message": f"执行工作流失败: {str(e)}"
        }


@register_function(name="visual_workflow.get_execution_state", outputs=["state", "success", "message"])
def get_execution_state(workflow_id: str) -> Dict[str, Any]:
    """
    获取工作流执行状态
    
    Args:
        workflow_id: 工作流ID
        
    Returns:
        Dict containing execution state, success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "state": None,
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        state = workflow.get_execution_state()
        
        return {
            "state": state,
            "success": True,
            "message": "获取执行状态成功"
        }
        
    except Exception as e:
        return {
            "state": None,
            "success": False,
            "message": f"获取执行状态失败: {str(e)}"
        }


# ========== 工具API函数 ==========

@register_function(name="visual_workflow.get_node_types", outputs=["node_types", "success"])
def get_node_types() -> Dict[str, Any]:
    """
    获取支持的节点类型
    
    Returns:
        Dict containing node types and success status
    """
    node_types = [
        {
            "type": "input",
            "name": "输入节点",
            "description": "接收用户输入数据",
            "default_config": v.DEFAULT_NODE_CONFIG["input"]
        },
        {
            "type": "llm_call",
            "name": "LLM调用节点",
            "description": "调用LLM API进行文本处理",
            "default_config": v.DEFAULT_NODE_CONFIG["llm_call"]
        },
        {
            "type": "code_block",
            "name": "代码块节点",
            "description": "执行自定义Python代码",
            "default_config": v.DEFAULT_NODE_CONFIG["code_block"]
        },
        {
            "type": "condition",
            "name": "条件节点",
            "description": "基于条件判断进行分支",
            "default_config": v.DEFAULT_NODE_CONFIG["condition"]
        },
        {
            "type": "switch",
            "name": "开关节点",
            "description": "基于信号值进行路由",
            "default_config": v.DEFAULT_NODE_CONFIG["switch"]
        },
        {
            "type": "merger",
            "name": "聚合节点",
            "description": "聚合多个输入的结果",
            "default_config": v.DEFAULT_NODE_CONFIG["merger"]
        },
        {
            "type": "output",
            "name": "输出节点",
            "description": "格式化和显示最终输出",
            "default_config": v.DEFAULT_NODE_CONFIG["output"]
        }
    ]
    
    return {
        "node_types": node_types,
        "success": True
    }


@register_function(name="visual_workflow.validate_workflow", outputs=["is_valid", "errors", "warnings"])
def validate_workflow(workflow_id: str) -> Dict[str, Any]:
    """
    验证工作流的完整性
    
    Args:
        workflow_id: 工作流ID
        
    Returns:
        Dict containing validation results
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "is_valid": False,
                "errors": [v.ERROR_MESSAGES['workflow_not_found']],
                "warnings": []
            }
        
        errors = []
        warnings = []
        
        # 检查是否有输入节点
        input_nodes = [n for n in workflow.workflow_def.nodes if n.type == NodeType.INPUT]
        if not input_nodes:
            warnings.append("工作流没有输入节点")
        
        # 检查是否有输出节点
        output_nodes = [n for n in workflow.workflow_def.nodes if n.type == NodeType.OUTPUT]
        if not output_nodes:
            warnings.append("工作流没有输出节点")
        
        # 检查孤立节点
        connected_nodes = set()
        for edge in workflow.workflow_def.edges:
            connected_nodes.add(edge.source)
            connected_nodes.add(edge.target)
        
        all_node_ids = {n.id for n in workflow.workflow_def.nodes}
        isolated_nodes = all_node_ids - connected_nodes
        
        if isolated_nodes:
            warnings.append(f"发现 {len(isolated_nodes)} 个孤立节点")
        
        # 检查循环依赖（简单检查）
        # 这里可以添加更复杂的循环检测逻辑
        
        is_valid = len(errors) == 0
        
        return {
            "is_valid": is_valid,
            "errors": errors,
            "warnings": warnings
        }
        
    except Exception as e:
        return {
            "is_valid": False,
            "errors": [f"验证失败: {str(e)}"],
            "warnings": []
        }


# ========== 调试API函数 ==========

@register_function(name="visual_workflow.set_breakpoint", outputs=["success", "message"])
def set_breakpoint(workflow_id: str, node_id: str, enabled: bool = True) -> Dict[str, Any]:
    """
    设置断点
    
    Args:
        workflow_id: 工作流ID
        node_id: 节点ID
        enabled: 是否启用断点
        
    Returns:
        Dict containing success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 设置断点
        workflow.set_breakpoint(node_id, enabled)
        
        return {
            "success": True,
            "message": f"断点已{'启用' if enabled else '禁用'}: {node_id}"
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"设置断点失败: {str(e)}"
        }


@register_function(name="visual_workflow.step_execute", outputs=["result", "success", "message"])
def step_execute(workflow_id: str, execution_id: str = None) -> Dict[str, Any]:
    """
    单步执行工作流
    
    Args:
        workflow_id: 工作流ID
        execution_id: 执行ID（可选）
        
    Returns:
        Dict containing execution result, success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "result": None,
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 启用单步模式
        workflow.enable_step_mode(True)
        
        # 执行一步
        result = workflow.execute_with_monitoring()
        
        return {
            "result": result,
            "success": True,
            "message": "单步执行完成"
        }
        
    except Exception as e:
        return {
            "result": None,
            "success": False,
            "message": f"单步执行失败: {str(e)}"
        }


@register_function(name="visual_workflow.get_execution_log", outputs=["log", "success", "message"])
def get_execution_log(workflow_id: str, execution_id: str = None) -> Dict[str, Any]:
    """
    获取执行日志
    
    Args:
        workflow_id: 工作流ID
        execution_id: 执行ID（可选）
        
    Returns:
        Dict containing execution log, success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "log": [],
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 获取执行日志
        logs = workflow.get_execution_logs(execution_id)
        
        return {
            "log": logs,
            "success": True,
            "message": f"获取到 {len(logs)} 条日志"
        }
        
    except Exception as e:
        return {
            "log": [],
            "success": False,
            "message": f"获取执行日志失败: {str(e)}"
        }


@register_function(name="visual_workflow.get_node_data", outputs=["data", "success", "message"])
def get_node_data(workflow_id: str, node_id: str, execution_id: str = None) -> Dict[str, Any]:
    """
    获取节点执行数据（用于调试）
    
    Args:
        workflow_id: 工作流ID
        node_id: 节点ID
        execution_id: 执行ID（可选）
        
    Returns:
        Dict containing node data, success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "data": None,
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 获取节点数据
        node = workflow._get_node_by_id(node_id)
        if not node:
            return {
                "data": None,
                "success": False,
                "message": v.ERROR_MESSAGES['node_not_found']
            }
        
        # 获取执行状态中的节点数据
        execution_state = workflow.execution_monitor.get_execution_state(execution_id or workflow.current_execution_id)
        node_data = {
            "node_info": {
                "id": node.id,
                "type": node.type.value,
                "name": node.name,
                "position": node.position,
                "data": node.data
            },
            "execution_state": execution_state.get('node_states', {}).get(node_id, 'unknown') if execution_state else 'unknown',
            "last_result": None  # 这里可以添加获取最后执行结果的逻辑
        }
        
        return {
            "data": node_data,
            "success": True,
            "message": "获取节点数据成功"
        }
        
    except Exception as e:
        return {
            "data": None,
            "success": False,
            "message": f"获取节点数据失败: {str(e)}"
        }


@register_function(name="visual_workflow.enable_debug_mode", outputs=["success", "message"])
def enable_debug_mode(workflow_id: str, enabled: bool = True) -> Dict[str, Any]:
    """
    启用/禁用调试模式
    
    Args:
        workflow_id: 工作流ID
        enabled: 是否启用调试模式
        
    Returns:
        Dict containing success status and message
    """
    try:
        manager = get_visual_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 启用/禁用调试模式
        workflow.enable_debug_mode(enabled)
        
        return {
            "success": True,
            "message": f"调试模式已{'启用' if enabled else '禁用'}"
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"设置调试模式失败: {str(e)}"
        }


# ========== 模板系统API函数 ==========

@register_function(name="visual_workflow.get_templates", outputs=["templates", "success", "message"])
def get_workflow_templates() -> Dict[str, Any]:
    """
    获取工作流模板
    
    Returns:
        Dict containing templates list, success status and message
    """
    try:
        # 预设工作流模板
        templates = [
            {
                "id": "text_processing",
                "name": "文本处理工作流",
                "description": "基础的文本处理工作流，包含输入、LLM处理和输出",
                "category": "文本处理",
                "nodes": [
                    {
                        "type": "input",
                        "name": "文本输入",
                        "position": {"x": 100, "y": 100},
                        "data": {"default_value": "请输入要处理的文本"}
                    },
                    {
                        "type": "llm_call",
                        "name": "LLM处理",
                        "position": {"x": 300, "y": 100},
                        "data": {
                            "provider": "gemini",
                            "model": "gemini-2.5-flash",
                            "prompt": "请分析以下文本：{{input}}",
                            "temperature": 0.7
                        }
                    },
                    {
                        "type": "output",
                        "name": "结果输出",
                        "position": {"x": 500, "y": 100},
                        "data": {"format": "text"}
                    }
                ],
                "edges": [
                    {
                        "source": 0,
                        "target": 1,
                        "source_handle": "output",
                        "target_handle": "input"
                    },
                    {
                        "source": 1,
                        "target": 2,
                        "source_handle": "output",
                        "target_handle": "input"
                    }
                ]
            },
            {
                "id": "conditional_workflow",
                "name": "条件分支工作流",
                "description": "包含条件判断的工作流，根据条件选择不同的处理路径",
                "category": "条件分支",
                "nodes": [
                    {
                        "type": "input",
                        "name": "输入",
                        "position": {"x": 100, "y": 100},
                        "data": {"default_value": ""}
                    },
                    {
                        "type": "condition",
                        "name": "条件判断",
                        "position": {"x": 300, "y": 100},
                        "data": {
                            "condition": "length > 10",
                            "true_output": "长文本",
                            "false_output": "短文本"
                        }
                    },
                    {
                        "type": "llm_call",
                        "name": "长文本处理",
                        "position": {"x": 500, "y": 50},
                        "data": {
                            "prompt": "这是一个长文本，请详细分析：{{input}}"
                        }
                    },
                    {
                        "type": "llm_call",
                        "name": "短文本处理",
                        "position": {"x": 500, "y": 150},
                        "data": {
                            "prompt": "这是一个短文本，请简要分析：{{input}}"
                        }
                    },
                    {
                        "type": "merger",
                        "name": "结果合并",
                        "position": {"x": 700, "y": 100},
                        "data": {"merge_strategy": "first"}
                    },
                    {
                        "type": "output",
                        "name": "输出",
                        "position": {"x": 900, "y": 100},
                        "data": {"format": "text"}
                    }
                ]
            },
            {
                "id": "multi_llm_collaboration",
                "name": "多LLM协同工作流",
                "description": "多个LLM协同处理任务，包含结果聚合",
                "category": "多LLM协同",
                "nodes": [
                    {
                        "type": "input",
                        "name": "任务输入",
                        "position": {"x": 100, "y": 200},
                        "data": {"default_value": ""}
                    },
                    {
                        "type": "llm_call",
                        "name": "分析师",
                        "position": {"x": 300, "y": 100},
                        "data": {
                            "prompt": "作为分析师，请分析：{{input}}",
                            "system_prompt": "你是一个专业的数据分析师"
                        }
                    },
                    {
                        "type": "llm_call",
                        "name": "创意师",
                        "position": {"x": 300, "y": 200},
                        "data": {
                            "prompt": "作为创意师，请提供创意想法：{{input}}",
                            "system_prompt": "你是一个富有创意的设计师"
                        }
                    },
                    {
                        "type": "llm_call",
                        "name": "评估师",
                        "position": {"x": 300, "y": 300},
                        "data": {
                            "prompt": "作为评估师，请评估：{{input}}",
                            "system_prompt": "你是一个严谨的评估专家"
                        }
                    },
                    {
                        "type": "merger",
                        "name": "观点聚合",
                        "position": {"x": 500, "y": 200},
                        "data": {
                            "merge_strategy": "concat",
                            "separator": "\n\n---\n\n"
                        }
                    },
                    {
                        "type": "llm_call",
                        "name": "总结师",
                        "position": {"x": 700, "y": 200},
                        "data": {
                            "prompt": "请总结以下多个专家的观点：{{input}}",
                            "system_prompt": "你是一个善于总结的专家"
                        }
                    },
                    {
                        "type": "output",
                        "name": "最终报告",
                        "position": {"x": 900, "y": 200},
                        "data": {"format": "text"}
                    }
                ]
            }
        ]
        
        return {
            "templates": templates,
            "success": True,
            "message": f"获取到 {len(templates)} 个模板"
        }
        
    except Exception as e:
        return {
            "templates": [],
            "success": False,
            "message": f"获取模板失败: {str(e)}"
        }


@register_function(name="visual_workflow.create_from_template", outputs=["workflow_id", "success", "message"])
def create_workflow_from_template(template_id: str, name: str = None) -> Dict[str, Any]:
    """
    从模板创建工作流
    
    Args:
        template_id: 模板ID
        name: 工作流名称（可选）
        
    Returns:
        Dict containing workflow_id, success status and message
    """
    try:
        # 获取模板
        templates_result = get_workflow_templates()
        if not templates_result["success"]:
            return {
                "workflow_id": None,
                "success": False,
                "message": "获取模板失败"
            }
        
        templates = templates_result["templates"]
        template = next((t for t in templates if t["id"] == template_id), None)
        
        if not template:
            return {
                "workflow_id": None,
                "success": False,
                "message": f"模板不存在: {template_id}"
            }
        
        # 创建工作流
        workflow_name = name or f"{template['name']} - {int(time.time())}"
        create_result = create_workflow(workflow_name, template["description"])
        
        if not create_result["success"]:
            return create_result
        
        workflow_id = create_result["workflow_id"]
        
        # 添加节点
        node_id_mapping = {}
        for i, node_template in enumerate(template["nodes"]):
            node_result = add_node(
                workflow_id,
                node_template["type"],
                node_template["position"],
                node_template["data"]
            )
            
            if node_result["success"]:
                node_id_mapping[i] = node_result["node_id"]
        
        # 添加连接
        if "edges" in template:
            for edge_template in template["edges"]:
                source_id = node_id_mapping.get(edge_template["source"])
                target_id = node_id_mapping.get(edge_template["target"])
                
                if source_id and target_id:
                    create_connection(
                        workflow_id,
                        source_id,
                        target_id,
                        {
                            "source_handle": edge_template.get("source_handle", "output"),
                            "target_handle": edge_template.get("target_handle", "input")
                        }
                    )
        
        return {
            "workflow_id": workflow_id,
            "success": True,
            "message": f"从模板 {template['name']} 创建工作流成功"
        }
        
    except Exception as e:
        return {
            "workflow_id": None,
            "success": False,
            "message": f"从模板创建工作流失败: {str(e)}"
        }