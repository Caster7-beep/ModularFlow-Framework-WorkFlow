"""
可视化工作流引擎
基于SimpleWorkflow扩展，支持可视化节点和简化的数据传递
"""
import uuid
import time
import json
import re
import ast
import operator
from typing import Any, Dict, List, Optional, Union, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict

from orchestrators.simple_workflow import SimpleWorkflow, FlowConnection
from core.function_registry import get_registry, register_function


# ========== 数据结构定义 ==========

class NodeType(Enum):
    """节点类型枚举"""
    INPUT = "input"                    # 输入节点
    LLM_CALL = "llm_call"             # LLM调用节点
    CODE_BLOCK = "code_block"         # 代码块节点
    CONDITION = "condition"           # 条件判断节点
    SWITCH = "switch"                 # 开关路由节点
    MERGER = "merger"                 # 结果聚合节点
    LOOP = "loop"                     # 循环节点
    OUTPUT = "output"                 # 输出节点


# ========== 条件分支引擎 ==========

class ConditionalExecutionEngine:
    """
    条件执行引擎
    提供安全的条件表达式评估和分支执行功能
    """
    
    # 安全的操作符映射
    SAFE_OPERATORS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.LShift: operator.lshift,
        ast.RShift: operator.rshift,
        ast.BitOr: operator.or_,
        ast.BitXor: operator.xor,
        ast.BitAnd: operator.and_,
        ast.FloorDiv: operator.floordiv,
        ast.Eq: operator.eq,
        ast.NotEq: operator.ne,
        ast.Lt: operator.lt,
        ast.LtE: operator.le,
        ast.Gt: operator.gt,
        ast.GtE: operator.ge,
        ast.Is: operator.is_,
        ast.IsNot: operator.is_not,
        ast.In: lambda x, y: x in y,
        ast.NotIn: lambda x, y: x not in y,
        ast.And: lambda x, y: x and y,
        ast.Or: lambda x, y: x or y,
        ast.Not: operator.not_,
        ast.UAdd: operator.pos,
        ast.USub: operator.neg,
    }
    
    # 安全的内置函数
    SAFE_BUILTINS = {
        'len': len,
        'str': str,
        'int': int,
        'float': float,
        'bool': bool,
        'abs': abs,
        'min': min,
        'max': max,
        'sum': sum,
        'any': any,
        'all': all,
        'round': round,
        'range': range,
        'enumerate': enumerate,
        'zip': zip,
        're': re,
    }
    
    def __init__(self):
        self.execution_context = {}
    
    def evaluate_condition(self, expression: str, context: Dict[str, Any]) -> bool:
        """
        安全地评估条件表达式
        
        Args:
            expression: 条件表达式字符串
            context: 执行上下文变量
            
        Returns:
            条件评估结果
        """
        try:
            # 解析表达式为AST
            tree = ast.parse(expression, mode='eval')
            
            # 创建安全的执行环境
            safe_context = self._create_safe_context(context)
            
            # 评估表达式
            result = self._eval_ast_node(tree.body, safe_context)
            
            return bool(result)
            
        except Exception as e:
            print(f"条件表达式评估失败: {expression}, 错误: {e}")
            return False
    
    def execute_conditional_branch(self, node: 'WorkflowNode', inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行条件分支节点
        
        Args:
            node: 条件节点
            inputs: 输入数据
            
        Returns:
            分支执行结果
        """
        try:
            condition_expr = node.data.get('condition', 'True')
            true_output = node.data.get('true_output', 'True')
            false_output = node.data.get('false_output', 'False')
            
            # 构建执行上下文
            context = self._build_execution_context(inputs)
            
            # 评估条件
            condition_result = self.evaluate_condition(condition_expr, context)
            
            # 选择输出
            output_text = true_output if condition_result else false_output
            signal = 1 if condition_result else 0
            
            from orchestrators.visual_workflow import NodeOutput
            output = NodeOutput(
                text=output_text,
                signal=signal,
                metadata={
                    'node_id': node.id,
                    'node_type': 'condition',
                    'condition': condition_expr,
                    'result': condition_result,
                    'context': context
                }
            )
            
            return output.to_dict()
            
        except Exception as e:
            from orchestrators.visual_workflow import NodeOutput
            output = NodeOutput(
                text="条件分支执行出错",
                signal=0,
                metadata={'node_id': node.id, 'node_type': 'condition', 'error': str(e)}
            )
            return output.to_dict()
    
    def handle_switch_routing(self, switch_value: Any, routes: Dict[str, Any]) -> str:
        """
        处理开关路由
        
        Args:
            switch_value: 开关值
            routes: 路由映射
            
        Returns:
            选择的路由路径
        """
        # 转换为字符串进行匹配
        switch_str = str(switch_value)
        
        # 精确匹配
        if switch_str in routes:
            return routes[switch_str]
        
        # 数值范围匹配
        if isinstance(switch_value, (int, float)):
            for route_key, route_value in routes.items():
                if self._match_numeric_range(switch_value, route_key):
                    return route_value
        
        # 默认路由
        return routes.get('default', '')
    
    def _create_safe_context(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """创建安全的执行上下文"""
        safe_context = self.SAFE_BUILTINS.copy()
        safe_context.update(context)
        return safe_context
    
    def _build_execution_context(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """构建执行上下文"""
        context = {}
        
        # 添加输入数据
        for key, value in inputs.items():
            if isinstance(value, dict) and 'text' in value:
                context[key] = value['text']
                context[f"{key}_signal"] = value.get('signal')
                context[f"{key}_metadata"] = value.get('metadata', {})
            else:
                context[key] = value
        
        # 添加常用变量
        text_input = str(inputs.get('input', inputs.get('text', '')))
        context.update({
            'input': text_input,
            'text': text_input,
            'length': len(text_input),
            'words': len(text_input.split()) if text_input else 0,
            'lines': len(text_input.splitlines()) if text_input else 0,
            'signal': inputs.get('signal', 0),
        })
        
        return context
    
    def _eval_ast_node(self, node: ast.AST, context: Dict[str, Any]) -> Any:
        """安全地评估AST节点"""
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.Name):
            return context.get(node.id, None)
        elif isinstance(node, ast.BinOp):
            left = self._eval_ast_node(node.left, context)
            right = self._eval_ast_node(node.right, context)
            op = self.SAFE_OPERATORS.get(type(node.op))
            if op:
                return op(left, right)
            else:
                raise ValueError(f"不支持的二元操作符: {type(node.op)}")
        elif isinstance(node, ast.UnaryOp):
            operand = self._eval_ast_node(node.operand, context)
            op = self.SAFE_OPERATORS.get(type(node.op))
            if op:
                return op(operand)
            else:
                raise ValueError(f"不支持的一元操作符: {type(node.op)}")
        elif isinstance(node, ast.Compare):
            left = self._eval_ast_node(node.left, context)
            result = True
            for op, comparator in zip(node.ops, node.comparators):
                right = self._eval_ast_node(comparator, context)
                op_func = self.SAFE_OPERATORS.get(type(op))
                if op_func:
                    result = result and op_func(left, right)
                    left = right
                else:
                    raise ValueError(f"不支持的比较操作符: {type(op)}")
            return result
        elif isinstance(node, ast.BoolOp):
            values = [self._eval_ast_node(value, context) for value in node.values]
            if isinstance(node.op, ast.And):
                return all(values)
            elif isinstance(node.op, ast.Or):
                return any(values)
        elif isinstance(node, ast.Call):
            func_name = node.func.id if isinstance(node.func, ast.Name) else None
            if func_name in self.SAFE_BUILTINS:
                args = [self._eval_ast_node(arg, context) for arg in node.args]
                return self.SAFE_BUILTINS[func_name](*args)
            else:
                raise ValueError(f"不支持的函数调用: {func_name}")
        else:
            raise ValueError(f"不支持的AST节点类型: {type(node)}")
    
    def _match_numeric_range(self, value: Union[int, float], range_str: str) -> bool:
        """匹配数值范围"""
        try:
            # 支持格式: "1-10", ">5", "<10", ">=5", "<=10"
            if '-' in range_str and not range_str.startswith('-'):
                start, end = map(float, range_str.split('-'))
                return start <= value <= end
            elif range_str.startswith('>='):
                threshold = float(range_str[2:])
                return value >= threshold
            elif range_str.startswith('<='):
                threshold = float(range_str[2:])
                return value <= threshold
            elif range_str.startswith('>'):
                threshold = float(range_str[1:])
                return value > threshold
            elif range_str.startswith('<'):
                threshold = float(range_str[1:])
                return value < threshold
            else:
                return False
        except (ValueError, IndexError):
            return False


# ========== 实时执行监控系统 ==========

class WorkflowExecutionMonitor:
    """
    工作流执行监控器
    提供实时执行状态追踪和WebSocket通知功能
    """
    
    def __init__(self, websocket_manager=None):
        self.websocket_manager = websocket_manager
        self.execution_states = {}  # 存储执行状态
        self.execution_logs = {}    # 存储执行日志
        self.breakpoints = {}       # 存储断点信息
        self.debug_sessions = {}    # 存储调试会话
    
    def start_execution(self, execution_id: str, workflow_id: str, nodes: List['WorkflowNode']):
        """开始执行监控"""
        self.execution_states[execution_id] = {
            'workflow_id': workflow_id,
            'status': 'running',
            'start_time': time.time(),
            'current_node': None,
            'completed_nodes': [],
            'failed_nodes': [],
            'node_states': {node.id: 'pending' for node in nodes},
            'data_flows': [],
            'errors': []
        }
        
        self.execution_logs[execution_id] = []
        
        self._notify_execution_start(execution_id)
    
    def notify_node_start(self, execution_id: str, node_id: str):
        """通知节点开始执行"""
        if execution_id in self.execution_states:
            state = self.execution_states[execution_id]
            state['current_node'] = node_id
            state['node_states'][node_id] = 'running'
            
            self._log_event(execution_id, 'node_start', {
                'node_id': node_id,
                'timestamp': time.time()
            })
            
            self._notify_node_state_change(execution_id, node_id, 'running')
    
    def notify_node_complete(self, execution_id: str, node_id: str, result: Dict[str, Any]):
        """通知节点执行完成"""
        if execution_id in self.execution_states:
            state = self.execution_states[execution_id]
            state['node_states'][node_id] = 'completed'
            state['completed_nodes'].append(node_id)
            
            if state['current_node'] == node_id:
                state['current_node'] = None
            
            self._log_event(execution_id, 'node_complete', {
                'node_id': node_id,
                'result': result,
                'timestamp': time.time()
            })
            
            self._notify_node_state_change(execution_id, node_id, 'completed', result)
    
    def notify_node_error(self, execution_id: str, node_id: str, error: str):
        """通知节点执行错误"""
        if execution_id in self.execution_states:
            state = self.execution_states[execution_id]
            state['node_states'][node_id] = 'error'
            state['failed_nodes'].append(node_id)
            state['errors'].append({
                'node_id': node_id,
                'error': error,
                'timestamp': time.time()
            })
            
            self._log_event(execution_id, 'node_error', {
                'node_id': node_id,
                'error': error,
                'timestamp': time.time()
            })
            
            self._notify_node_state_change(execution_id, node_id, 'error', {'error': error})
    
    def notify_data_flow(self, execution_id: str, from_node: str, to_node: str, data: Any):
        """通知数据流动"""
        if execution_id in self.execution_states:
            flow_info = {
                'from_node': from_node,
                'to_node': to_node,
                'data': data,
                'timestamp': time.time()
            }
            
            self.execution_states[execution_id]['data_flows'].append(flow_info)
            
            self._log_event(execution_id, 'data_flow', flow_info)
            
            self._notify_data_flow(execution_id, flow_info)
    
    def complete_execution(self, execution_id: str, final_result: Dict[str, Any]):
        """完成执行监控"""
        if execution_id in self.execution_states:
            state = self.execution_states[execution_id]
            state['status'] = 'completed'
            state['end_time'] = time.time()
            state['duration'] = state['end_time'] - state['start_time']
            state['final_result'] = final_result
            
            self._log_event(execution_id, 'execution_complete', {
                'final_result': final_result,
                'duration': state['duration'],
                'timestamp': time.time()
            })
            
            self._notify_execution_complete(execution_id)
    
    def fail_execution(self, execution_id: str, error: str):
        """执行失败"""
        if execution_id in self.execution_states:
            state = self.execution_states[execution_id]
            state['status'] = 'failed'
            state['end_time'] = time.time()
            state['duration'] = state['end_time'] - state['start_time']
            state['final_error'] = error
            
            self._log_event(execution_id, 'execution_failed', {
                'error': error,
                'timestamp': time.time()
            })
            
            self._notify_execution_failed(execution_id, error)
    
    def get_execution_state(self, execution_id: str) -> Optional[Dict[str, Any]]:
        """获取执行状态"""
        return self.execution_states.get(execution_id)
    
    def get_execution_logs(self, execution_id: str) -> List[Dict[str, Any]]:
        """获取执行日志"""
        return self.execution_logs.get(execution_id, [])
    
    def set_breakpoint(self, workflow_id: str, node_id: str, enabled: bool = True):
        """设置断点"""
        if workflow_id not in self.breakpoints:
            self.breakpoints[workflow_id] = {}
        
        self.breakpoints[workflow_id][node_id] = enabled
    
    def check_breakpoint(self, workflow_id: str, node_id: str) -> bool:
        """检查是否有断点"""
        return self.breakpoints.get(workflow_id, {}).get(node_id, False)
    
    def _log_event(self, execution_id: str, event_type: str, data: Dict[str, Any]):
        """记录事件日志"""
        if execution_id in self.execution_logs:
            self.execution_logs[execution_id].append({
                'event_type': event_type,
                'data': data,
                'timestamp': time.time()
            })
    
    def _notify_execution_start(self, execution_id: str):
        """通知执行开始"""
        if self.websocket_manager:
            self.websocket_manager.broadcast({
                'type': 'execution_start',
                'execution_id': execution_id,
                'state': self.execution_states[execution_id]
            })
    
    def _notify_node_state_change(self, execution_id: str, node_id: str, status: str, result: Dict[str, Any] = None):
        """通知节点状态变化"""
        if self.websocket_manager:
            self.websocket_manager.broadcast({
                'type': 'node_state_change',
                'execution_id': execution_id,
                'node_id': node_id,
                'status': status,
                'result': result,
                'timestamp': time.time()
            })
    
    def _notify_data_flow(self, execution_id: str, flow_info: Dict[str, Any]):
        """通知数据流动"""
        if self.websocket_manager:
            self.websocket_manager.broadcast({
                'type': 'data_flow',
                'execution_id': execution_id,
                'flow': flow_info
            })
    
    def _notify_execution_complete(self, execution_id: str):
        """通知执行完成"""
        if self.websocket_manager:
            self.websocket_manager.broadcast({
                'type': 'execution_complete',
                'execution_id': execution_id,
                'state': self.execution_states[execution_id]
            })
    
    def _notify_execution_failed(self, execution_id: str, error: str):
        """通知执行失败"""
        if self.websocket_manager:
            self.websocket_manager.broadcast({
                'type': 'execution_failed',
                'execution_id': execution_id,
                'error': error,
                'state': self.execution_states[execution_id]
            })


@dataclass
class WorkflowNode:
    """工作流节点定义"""
    id: str
    type: NodeType
    name: str
    position: Dict[str, float]  # {"x": 100, "y": 200}
    data: Dict[str, Any] = field(default_factory=dict)
    inputs: List[str] = field(default_factory=list)
    outputs: List[str] = field(default_factory=list)


@dataclass
class WorkflowEdge:
    """工作流连接边定义"""
    id: str
    source: str  # 源节点ID
    target: str  # 目标节点ID
    source_handle: str = "output"  # 源节点输出端口
    target_handle: str = "input"   # 目标节点输入端口
    data_type: str = "text"        # 数据类型: text, signal, all
    condition: Optional[str] = None # 条件表达式


@dataclass
class WorkflowDefinition:
    """工作流定义"""
    id: str
    name: str
    description: str = ""
    version: str = "1.0.0"
    nodes: List[WorkflowNode] = field(default_factory=list)
    edges: List[WorkflowEdge] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


@dataclass
class NodeOutput:
    """标准化节点输出"""
    text: str = ""                    # 主要文本内容
    signal: Optional[int] = None      # 控制信号（用于条件分支）
    confidence: Optional[float] = None # 置信度
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            'text': self.text,
            'signal': self.signal,
            'confidence': self.confidence,
            'metadata': self.metadata
        }


# ========== 核心可视化工作流引擎 ==========

class VisualWorkflow(SimpleWorkflow):
    """
    可视化工作流引擎
    基于SimpleWorkflow扩展，增加可视化节点支持
    """
    
    def __init__(self, workflow_def: WorkflowDefinition = None, websocket_manager=None):
        """
        初始化可视化工作流
        
        Args:
            workflow_def: 工作流定义，如果为None则创建空工作流
            websocket_manager: WebSocket管理器，用于实时通信
        """
        super().__init__(workflow_def.name if workflow_def else "visual_workflow")
        
        self.workflow_def = workflow_def or WorkflowDefinition(
            id=str(uuid.uuid4()),
            name="新建工作流",
            description="通过可视化界面创建的工作流"
        )
        
        self.node_functions = {}  # 存储节点对应的函数
        self.execution_state = {}  # 执行状态跟踪
        
        # 初始化高级功能组件
        self.conditional_engine = ConditionalExecutionEngine()
        self.execution_monitor = WorkflowExecutionMonitor(websocket_manager)
        
        # 调试相关
        self.debug_mode = False
        self.step_mode = False
        self.current_execution_id = None
        
        # 如果有工作流定义，立即加载
        if workflow_def:
            self.load_from_definition(workflow_def)
    
    def load_from_definition(self, workflow_def: WorkflowDefinition):
        """
        从工作流定义加载
        
        Args:
            workflow_def: 工作流定义
        """
        self.workflow_def = workflow_def
        self.name = workflow_def.name
        
        # 清空现有状态
        self.connections.clear()
        self.initial_inputs.clear()
        self.results.clear()
        self.node_functions.clear()
        
        # 注册节点
        self._register_nodes()
        
        # 建立连接
        self._setup_connections()
        
        print(f"✓ 已加载可视化工作流: {self.name} (节点: {len(self.workflow_def.nodes)}, 连接: {len(self.workflow_def.edges)})")
    
    def _register_nodes(self):
        """注册所有节点为可执行函数"""
        for node in self.workflow_def.nodes:
            node_func_name = f"visual_node_{node.id}"
            
            # 根据节点类型创建对应的函数
            if node.type == NodeType.INPUT:
                node_func = self._create_input_node(node)
            elif node.type == NodeType.LLM_CALL:
                node_func = self._create_llm_node(node)
            elif node.type == NodeType.CODE_BLOCK:
                node_func = self._create_code_block_node(node)
            elif node.type == NodeType.CONDITION:
                node_func = self._create_condition_node(node)
            elif node.type == NodeType.SWITCH:
                node_func = self._create_switch_node(node)
            elif node.type == NodeType.MERGER:
                node_func = self._create_merger_node(node)
            elif node.type == NodeType.LOOP:
                node_func = self._create_loop_node(node)
            elif node.type == NodeType.OUTPUT:
                node_func = self._create_output_node(node)
            else:
                raise ValueError(f"不支持的节点类型: {node.type}")
            
            # 注册到function_registry
            self.registry.register(
                node_func_name,
                node_func,
                inputs=node.inputs or ['input'],
                outputs=node.outputs or ['text', 'signal', 'metadata'],
                description=f"{node.type.value}节点: {node.name}"
            )
            
            self.node_functions[node.id] = node_func_name
    
    def _setup_connections(self):
        """建立节点连接"""
        for edge in self.workflow_def.edges:
            source_node = self._get_node_by_id(edge.source)
            target_node = self._get_node_by_id(edge.target)
            
            if not source_node or not target_node:
                print(f"⚠️ 跳过无效连接: {edge.source} -> {edge.target}")
                continue
            
            source_func = self.node_functions[edge.source]
            target_func = self.node_functions[edge.target]
            
            # 映射handle到实际的字段名
            # 源节点的输出字段映射
            if edge.source_handle == "output":
                from_output = "text"  # 默认使用text字段
            else:
                from_output = edge.source_handle
            
            # 目标节点的输入参数映射
            if edge.target_handle == "input":
                to_input = "input"  # 保持input参数名
            else:
                to_input = edge.target_handle
            
            # 创建连接
            connection = FlowConnection(
                from_func=source_func,
                from_output=from_output,
                to_func=target_func,
                to_input=to_input
            )
            
            self.connections.append(connection)
            print(f"✓ 创建连接: {source_node.name} -> {target_node.name}")
    
    def _get_node_by_id(self, node_id: str) -> Optional[WorkflowNode]:
        """根据ID获取节点"""
        for node in self.workflow_def.nodes:
            if node.id == node_id:
                return node
        return None
    
    def _create_input_node(self, node: WorkflowNode):
        """创建输入节点函数"""
        def input_function(**inputs) -> Dict[str, Any]:
            # 输入节点直接返回传入的数据
            input_data = inputs.get('input', node.data.get('default_value', ''))
            
            output = NodeOutput(
                text=str(input_data),
                signal=1,  # 输入节点总是发出信号1表示有数据
                metadata={'node_id': node.id, 'node_type': 'input'}
            )
            
            return output.to_dict()
        
        return input_function
    
    def _create_llm_node(self, node: WorkflowNode):
        """创建LLM节点函数"""
        def llm_function(**inputs) -> Dict[str, Any]:
            try:
                # 获取输入文本
                input_text = ""
                if 'input' in inputs:
                    input_text = str(inputs['input'])
                elif 'text' in inputs:
                    input_text = str(inputs['text'])
                else:
                    # 动态地从任何传入的输入中获取文本
                    for key, value in inputs.items():
                        if isinstance(value, str):
                            input_text = value
                            break
                        elif isinstance(value, dict) and 'text' in value:
                            input_text = value['text']
                            break
                
                # 获取节点配置
                provider = node.data.get('provider', 'gemini')
                model = node.data.get('model', 'gemini-2.5-flash')
                prompt_template = node.data.get('prompt', '{{input}}')
                system_prompt = node.data.get('system_prompt', '')
                temperature = node.data.get('temperature', 0.7)
                max_tokens = node.data.get('max_tokens', 2048)
                
                # 应用提示词模板
                prompt = prompt_template.replace('{{input}}', input_text)
                
                # 构建消息
                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": prompt})
                
                # 调用LLM API (使用现有的注册函数)
                try:
                    # 这里应该调用现有的LLM API，我们先模拟
                    llm_result = self.registry.call('api.call', 
                                                   messages=messages,
                                                   provider=provider,
                                                   model=model,
                                                   temperature=temperature,
                                                   max_tokens=max_tokens)
                    
                    response_text = llm_result.get('response', {}).get('content', '')
                    
                    # 尝试提取信号（如果响应包含数字）
                    signal = self._extract_signal(response_text)
                    
                except Exception as e:
                    # 如果LLM调用失败，返回错误信息
                    response_text = f"LLM调用失败: {str(e)}"
                    signal = None
                
                output = NodeOutput(
                    text=response_text,
                    signal=signal,
                    metadata={
                        'node_id': node.id,
                        'node_type': 'llm_call',
                        'provider': provider,
                        'model': model,
                        'prompt': prompt[:100] + '...' if len(prompt) > 100 else prompt
                    }
                )
                
                return output.to_dict()
                
            except Exception as e:
                # 错误处理
                output = NodeOutput(
                    text=f"节点执行出错: {str(e)}",
                    signal=None,
                    metadata={'node_id': node.id, 'node_type': 'llm_call', 'error': str(e)}
                )
                return output.to_dict()
        
        return llm_function
    
    def _create_code_block_node(self, node: WorkflowNode):
        """创建代码块节点函数"""
        def code_function(**inputs) -> Dict[str, Any]:
            try:
                code = node.data.get('code', '')
                code_type = node.data.get('code_type', 'python')
                
                if code_type == 'python':
                    result = self._execute_python_code(code, inputs, node.id)
                else:
                    result = NodeOutput(
                        text=f"不支持的代码类型: {code_type}",
                        signal=None,
                        metadata={'node_id': node.id, 'node_type': 'code_block', 'error': f"不支持的代码类型: {code_type}"}
                    )
                
                return result.to_dict()
                
            except Exception as e:
                output = NodeOutput(
                    text=f"代码执行出错: {str(e)}",
                    signal=None,
                    metadata={'node_id': node.id, 'node_type': 'code_block', 'error': str(e)}
                )
                return output.to_dict()
        
        return code_function
    
    def _create_condition_node(self, node: WorkflowNode):
        """创建条件节点函数"""
        def condition_function(**inputs) -> Dict[str, Any]:
            # 使用条件分支引擎处理
            return self.conditional_engine.execute_conditional_branch(node, inputs)
        
        return condition_function
    
    def _create_switch_node(self, node: WorkflowNode):
        """创建开关路由节点函数"""
        def switch_function(**inputs) -> Dict[str, Any]:
            try:
                signal = inputs.get('signal', 0)
                switch_map = node.data.get('switch_map', {})  # {signal_value: output_text}
                
                # 使用条件分支引擎处理路由
                output_text = self.conditional_engine.handle_switch_routing(signal, switch_map)
                
                output = NodeOutput(
                    text=output_text,
                    signal=signal,
                    metadata={
                        'node_id': node.id,
                        'node_type': 'switch',
                        'input_signal': signal,
                        'selected_output': output_text,
                        'switch_map': switch_map
                    }
                )
                
                return output.to_dict()
                
            except Exception as e:
                output = NodeOutput(
                    text="开关路由出错",
                    signal=inputs.get('signal', 0),
                    metadata={'node_id': node.id, 'node_type': 'switch', 'error': str(e)}
                )
                return output.to_dict()
        
        return switch_function
    
    def _create_merger_node(self, node: WorkflowNode):
        """创建聚合节点函数"""
        def merger_function(**inputs) -> Dict[str, Any]:
            try:
                merge_strategy = node.data.get('merge_strategy', 'concat')  # concat, first, last, weighted
                separator = node.data.get('separator', '\n')
                
                # 收集所有文本输入
                texts = []
                signals = []
                metadata_list = []
                
                for key, value in inputs.items():
                    if key.startswith('input'):
                        if isinstance(value, str):
                            texts.append(value)
                        elif isinstance(value, dict):
                            texts.append(value.get('text', ''))
                            if value.get('signal') is not None:
                                signals.append(value.get('signal'))
                            if value.get('metadata'):
                                metadata_list.append(value.get('metadata'))
                
                # 根据合并策略处理
                if merge_strategy == 'concat':
                    result_text = separator.join(texts)
                elif merge_strategy == 'first':
                    result_text = texts[0] if texts else ''
                elif merge_strategy == 'last':
                    result_text = texts[-1] if texts else ''
                elif merge_strategy == 'weighted':
                    # 基于信号值加权合并
                    if signals and len(signals) == len(texts):
                        total_weight = sum(signals)
                        if total_weight > 0:
                            weighted_texts = []
                            for text, signal in zip(texts, signals):
                                weight = signal / total_weight
                                weighted_texts.append(f"{text} (权重: {weight:.2f})")
                            result_text = separator.join(weighted_texts)
                        else:
                            result_text = separator.join(texts)
                    else:
                        result_text = separator.join(texts)
                else:
                    result_text = separator.join(texts)
                
                # 信号处理
                if merge_strategy == 'weighted' and signals:
                    result_signal = sum(signals) / len(signals)  # 平均值
                else:
                    result_signal = max(signals) if signals else None
                
                output = NodeOutput(
                    text=result_text,
                    signal=result_signal,
                    metadata={
                        'node_id': node.id,
                        'node_type': 'merger',
                        'merge_strategy': merge_strategy,
                        'input_count': len(texts),
                        'input_signals': signals,
                        'merged_metadata': metadata_list
                    }
                )
                
                return output.to_dict()
                
            except Exception as e:
                output = NodeOutput(
                    text="结果聚合出错",
                    signal=None,
                    metadata={'node_id': node.id, 'node_type': 'merger', 'error': str(e)}
                )
                return output.to_dict()
        
        return merger_function
    
    def _create_loop_node(self, node: WorkflowNode):
        """创建循环节点函数"""
        def loop_function(**inputs) -> Dict[str, Any]:
            try:
                loop_type = node.data.get('loop_type', 'count')  # count, condition, foreach
                max_iterations = node.data.get('max_iterations', 10)
                loop_condition = node.data.get('loop_condition', 'True')
                
                input_data = inputs.get('input', inputs.get('text', ''))
                results = []
                iteration_count = 0
                
                if loop_type == 'count':
                    # 固定次数循环
                    count = node.data.get('count', 1)
                    for i in range(min(count, max_iterations)):
                        iteration_result = self._execute_loop_iteration(input_data, i, node.id)
                        results.append(iteration_result)
                        iteration_count += 1
                
                elif loop_type == 'condition':
                    # 条件循环
                    while iteration_count < max_iterations:
                        # 构建循环条件上下文
                        context = {
                            'input': input_data,
                            'iteration': iteration_count,
                            'results': results,
                            'last_result': results[-1] if results else None
                        }
                        
                        # 评估循环条件
                        should_continue = self.conditional_engine.evaluate_condition(loop_condition, context)
                        if not should_continue:
                            break
                        
                        iteration_result = self._execute_loop_iteration(input_data, iteration_count, node.id)
                        results.append(iteration_result)
                        iteration_count += 1
                
                elif loop_type == 'foreach':
                    # 遍历循环
                    if isinstance(input_data, str):
                        try:
                            # 尝试解析为JSON数组
                            items = json.loads(input_data)
                            if not isinstance(items, list):
                                items = [input_data]
                        except:
                            # 按行分割
                            items = input_data.splitlines()
                    else:
                        items = [input_data]
                    
                    for i, item in enumerate(items[:max_iterations]):
                        iteration_result = self._execute_loop_iteration(item, i, node.id)
                        results.append(iteration_result)
                        iteration_count += 1
                
                # 合并循环结果
                final_text = '\n'.join(str(result) for result in results)
                
                output = NodeOutput(
                    text=final_text,
                    signal=iteration_count,  # 信号表示循环次数
                    metadata={
                        'node_id': node.id,
                        'node_type': 'loop',
                        'loop_type': loop_type,
                        'iteration_count': iteration_count,
                        'results': results,
                        'max_iterations': max_iterations
                    }
                )
                
                return output.to_dict()
                
            except Exception as e:
                output = NodeOutput(
                    text=f"循环执行出错: {str(e)}",
                    signal=0,
                    metadata={'node_id': node.id, 'node_type': 'loop', 'error': str(e)}
                )
                return output.to_dict()
        
        return loop_function
    
    def _execute_loop_iteration(self, input_data: Any, iteration: int, node_id: str) -> str:
        """执行单次循环迭代"""
        try:
            # 这里可以执行循环体内的逻辑
            # 目前简单返回处理后的输入数据
            return f"迭代 {iteration}: {input_data}"
        except Exception as e:
            return f"迭代 {iteration} 出错: {str(e)}"
    
    def _create_output_node(self, node: WorkflowNode):
        """创建输出节点函数"""
        def output_function(**inputs) -> Dict[str, Any]:
            # 输出节点收集并格式化最终输出
            input_data = inputs.get('input', inputs.get('text', ''))
            
            # 获取输出格式配置
            output_format = node.data.get('format', 'text')  # text, json, html
            
            if output_format == 'json' and isinstance(input_data, str):
                try:
                    # 尝试解析为JSON
                    formatted_output = json.dumps(json.loads(input_data), indent=2, ensure_ascii=False)
                except:
                    formatted_output = input_data
            elif output_format == 'html':
                formatted_output = f"<div>{input_data}</div>"
            else:
                formatted_output = str(input_data)
            
            output = NodeOutput(
                text=formatted_output,
                signal=1,  # 输出节点总是发出信号表示完成
                metadata={
                    'node_id': node.id,
                    'node_type': 'output',
                    'format': output_format,
                    'final_output': True
                }
            )
            
            return output.to_dict()
        
        return output_function
    
    def _execute_python_code(self, code: str, inputs: Dict[str, Any], node_id: str) -> NodeOutput:
        """安全执行Python代码"""
        try:
            # 构建安全的执行环境
            safe_globals = {
                '__builtins__': {
                    'len': len, 'str': str, 'int': int, 'float': float,
                    'dict': dict, 'list': list, 'min': min, 'max': max,
                    'sum': sum, 'any': any, 'all': all, 'range': range,
                    'enumerate': enumerate, 'zip': zip
                },
                'inputs': inputs,
                'text': str(inputs.get('text', inputs.get('input', ''))),
                're': __import__('re'),
                'json': __import__('json'),
                'time': __import__('time'),
                'math': __import__('math')
            }
            
            # 本地作用域，用于接收输出
            local_scope = {'output': None}
            
            # 执行代码
            exec(code, safe_globals, local_scope)
            
            # 获取输出
            code_output = local_scope.get('output')
            
            if isinstance(code_output, dict):
                # 如果输出是字典，直接使用
                return NodeOutput(
                    text=code_output.get('text', ''),
                    signal=code_output.get('signal'),
                    confidence=code_output.get('confidence'),
                    metadata={
                        'node_id': node_id,
                        'node_type': 'code_block',
                        'code_output': code_output
                    }
                )
            else:
                # 如果输出是其他类型，转换为文本
                return NodeOutput(
                    text=str(code_output) if code_output is not None else '',
                    signal=1 if code_output is not None else 0,
                    metadata={'node_id': node_id, 'node_type': 'code_block'}
                )
        
        except Exception as e:
            return NodeOutput(
                text=f"代码执行错误: {str(e)}",
                signal=None,
                metadata={'node_id': node_id, 'node_type': 'code_block', 'error': str(e)}
            )
    
    def _extract_signal(self, text: str) -> Optional[int]:
        """从文本中提取控制信号"""
        import re
        
        # 尝试提取数字信号
        patterns = [
            r'(?:信号|signal|选择|choice)[:：\s]*(\d+)',
            r'(?:分支|branch)[:：\s]*(\d+)',
            r'(?:路径|path)[:：\s]*(\d+)',
            r'^(\d+)$'  # 纯数字
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text.lower())
            if match:
                try:
                    return int(match.group(1))
                except ValueError:
                    continue
        
        return None
    
    def execute_with_monitoring(self, input_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        执行工作流并提供监控信息
        
        Args:
            input_data: 初始输入数据
            
        Returns:
            包含执行结果和监控信息的字典
        """
        # 生成执行ID
        execution_id = str(uuid.uuid4())
        self.current_execution_id = execution_id
        
        # 启动监控
        self.execution_monitor.start_execution(execution_id, self.workflow_def.id, self.workflow_def.nodes)
        
        start_time = time.time()
        self.execution_state = {
            'execution_id': execution_id,
            'status': 'running',
            'start_time': start_time,
            'current_node': None,
            'completed_nodes': [],
            'errors': []
        }
        
        # 设置输入节点的初始数据
        if input_data:
            for node in self.workflow_def.nodes:
                if node.type == NodeType.INPUT:
                    node_func_name = self.node_functions[node.id]
                    self.set_input(node_func_name, input=input_data.get('input', ''))
        
        try:
            # 执行工作流
            results = self.execute()
            
            self.execution_state.update({
                'status': 'completed',
                'end_time': time.time(),
                'duration': time.time() - start_time,
                'results': results
            })
            
            # 通知监控器执行完成
            self.execution_monitor.complete_execution(execution_id, results)
            
        except Exception as e:
            self.execution_state.update({
                'status': 'error',
                'end_time': time.time(),
                'duration': time.time() - start_time,
                'error': str(e)
            })
            
            # 通知监控器执行失败
            self.execution_monitor.fail_execution(execution_id, str(e))
            
        return self.execution_state
    
    def set_breakpoint(self, node_id: str, enabled: bool = True):
        """设置断点"""
        self.execution_monitor.set_breakpoint(self.workflow_def.id, node_id, enabled)
    
    def enable_debug_mode(self, enabled: bool = True):
        """启用调试模式"""
        self.debug_mode = enabled
    
    def enable_step_mode(self, enabled: bool = True):
        """启用单步模式"""
        self.step_mode = enabled
    
    def get_execution_logs(self, execution_id: str = None) -> List[Dict[str, Any]]:
        """获取执行日志"""
        if execution_id is None:
            execution_id = self.current_execution_id
        return self.execution_monitor.get_execution_logs(execution_id) if execution_id else []
    
    def get_execution_state(self) -> Dict[str, Any]:
        """获取当前执行状态"""
        return self.execution_state.copy()
    
    def to_dict(self) -> Dict[str, Any]:
        """将工作流转换为字典格式（用于序列化）"""
        return {
            'workflow_definition': {
                'id': self.workflow_def.id,
                'name': self.workflow_def.name,
                'description': self.workflow_def.description,
                'version': self.workflow_def.version,
                'nodes': [
                    {
                        'id': node.id,
                        'type': node.type.value,
                        'name': node.name,
                        'position': node.position,
                        'data': node.data,
                        'inputs': node.inputs,
                        'outputs': node.outputs
                    }
                    for node in self.workflow_def.nodes
                ],
                'edges': [
                    {
                        'id': edge.id,
                        'source': edge.source,
                        'target': edge.target,
                        'source_handle': edge.source_handle,
                        'target_handle': edge.target_handle,
                        'data_type': edge.data_type,
                        'condition': edge.condition
                    }
                    for edge in self.workflow_def.edges
                ],
                'metadata': self.workflow_def.metadata,
                'created_at': self.workflow_def.created_at,
                'updated_at': self.workflow_def.updated_at
            },
            'execution_state': self.execution_state
        }


# ========== 工厂函数 ==========

def create_visual_workflow(name: str = "新建工作流", description: str = "") -> VisualWorkflow:
    """
    创建新的可视化工作流
    
    Args:
        name: 工作流名称
        description: 工作流描述
        
    Returns:
        VisualWorkflow实例
    """
    workflow_def = WorkflowDefinition(
        id=str(uuid.uuid4()),
        name=name,
        description=description
    )
    
    return VisualWorkflow(workflow_def)


def create_node(node_type: str, position: Dict[str, float], config: Dict[str, Any]) -> WorkflowNode:
    """
    创建新的工作流节点
    
    Args:
        node_type: 节点类型字符串
        position: 节点位置 {"x": 100, "y": 200}
        config: 节点配置数据
        
    Returns:
        WorkflowNode实例
    """
    node_type_enum = NodeType(node_type)
    
    return WorkflowNode(
        id=str(uuid.uuid4()),
        type=node_type_enum,
        name=config.get('name', f"{node_type}节点"),
        position=position,
        data=config,
        inputs=config.get('inputs', ['input']),
        outputs=config.get('outputs', ['text', 'signal', 'metadata'])
    )


def create_edge(source: str, target: str, config: Dict[str, Any]) -> WorkflowEdge:
    """
    创建新的工作流连接边
    
    Args:
        source: 源节点ID
        target: 目标节点ID
        config: 连接配置
        
    Returns:
        WorkflowEdge实例
    """
    return WorkflowEdge(
        id=str(uuid.uuid4()),
        source=source,
        target=target,
        source_handle=config.get('source_handle', 'output'),
        target_handle=config.get('target_handle', 'input'),
        data_type=config.get('data_type', 'text'),
        condition=config.get('condition')
    )