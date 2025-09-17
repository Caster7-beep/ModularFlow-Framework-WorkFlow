"""
优化的可视化工作流引擎
实现并行执行、缓存机制、异步处理和性能监控

主要优化点：
1. 工作流节点并行执行
2. LRU缓存机制
3. 异步I/O处理
4. 连接池管理
5. 性能监控
"""

import asyncio
import uuid
import time
import json
import hashlib
from typing import Any, Dict, List, Optional, Union, Set
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from functools import lru_cache
import threading
from collections import deque
import weakref

from orchestrators.visual_workflow import (
    VisualWorkflow, WorkflowDefinition, WorkflowNode, WorkflowEdge, 
    NodeType, NodeOutput, ConditionalExecutionEngine, WorkflowExecutionMonitor
)


# ========== 性能监控系统 ==========

@dataclass
class PerformanceMetrics:
    """性能指标数据结构"""
    execution_id: str
    workflow_id: str
    total_duration: float = 0.0
    node_durations: Dict[str, float] = field(default_factory=dict)
    parallel_efficiency: float = 0.0
    cache_hits: int = 0
    cache_misses: int = 0
    memory_usage_mb: float = 0.0
    cpu_usage_percent: float = 0.0
    thread_count: int = 0
    concurrent_nodes: int = 0
    started_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None


class PerformanceMonitor:
    """性能监控器"""
    
    def __init__(self):
        self.metrics_history: List[PerformanceMetrics] = []
        self.active_metrics: Dict[str, PerformanceMetrics] = {}
        self.lock = threading.RLock()
    
    def start_monitoring(self, execution_id: str, workflow_id: str) -> PerformanceMetrics:
        """开始性能监控"""
        with self.lock:
            metrics = PerformanceMetrics(execution_id, workflow_id)
            self.active_metrics[execution_id] = metrics
            return metrics
    
    def record_node_start(self, execution_id: str, node_id: str):
        """记录节点开始执行"""
        with self.lock:
            if execution_id in self.active_metrics:
                metrics = self.active_metrics[execution_id]
                metrics.node_durations[node_id] = time.time()
    
    def record_node_complete(self, execution_id: str, node_id: str):
        """记录节点完成执行"""
        with self.lock:
            if execution_id in self.active_metrics:
                metrics = self.active_metrics[execution_id]
                if node_id in metrics.node_durations:
                    start_time = metrics.node_durations[node_id]
                    duration = time.time() - start_time
                    metrics.node_durations[node_id] = duration
    
    def record_cache_hit(self, execution_id: str):
        """记录缓存命中"""
        with self.lock:
            if execution_id in self.active_metrics:
                self.active_metrics[execution_id].cache_hits += 1
    
    def record_cache_miss(self, execution_id: str):
        """记录缓存未命中"""
        with self.lock:
            if execution_id in self.active_metrics:
                self.active_metrics[execution_id].cache_misses += 1
    
    def complete_monitoring(self, execution_id: str) -> Optional[PerformanceMetrics]:
        """完成性能监控"""
        with self.lock:
            if execution_id in self.active_metrics:
                metrics = self.active_metrics.pop(execution_id)
                metrics.completed_at = time.time()
                metrics.total_duration = metrics.completed_at - metrics.started_at
                
                # 计算并行效率
                if metrics.node_durations:
                    total_node_time = sum(metrics.node_durations.values())
                    if metrics.total_duration > 0:
                        metrics.parallel_efficiency = min(total_node_time / metrics.total_duration, 1.0)
                
                self.metrics_history.append(metrics)
                return metrics
            return None
    
    def get_metrics(self, execution_id: str) -> Optional[PerformanceMetrics]:
        """获取性能指标"""
        with self.lock:
            return self.active_metrics.get(execution_id) or \
                   next((m for m in self.metrics_history if m.execution_id == execution_id), None)


# ========== 缓存系统 ==========

class LRUCache:
    """LRU缓存实现"""
    
    def __init__(self, max_size: int = 1000, ttl: int = 3600):
        self.max_size = max_size
        self.ttl = ttl
        self.cache: Dict[str, Any] = {}
        self.access_order = deque()
        self.access_times: Dict[str, float] = {}
        self.lock = threading.RLock()
    
    def _cleanup_expired(self):
        """清理过期的缓存项"""
        current_time = time.time()
        expired_keys = [
            key for key, access_time in self.access_times.items() 
            if current_time - access_time > self.ttl
        ]
        for key in expired_keys:
            self._remove_key(key)
    
    def _remove_key(self, key: str):
        """移除指定的缓存键"""
        if key in self.cache:
            del self.cache[key]
            del self.access_times[key]
            if key in self.access_order:
                self.access_order.remove(key)
    
    def _evict_lru(self):
        """驱逐最少使用的缓存项"""
        while len(self.cache) >= self.max_size and self.access_order:
            lru_key = self.access_order.popleft()
            if lru_key in self.cache:
                del self.cache[lru_key]
                del self.access_times[lru_key]
    
    def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        with self.lock:
            self._cleanup_expired()
            
            if key in self.cache:
                # 更新访问时间和顺序
                self.access_times[key] = time.time()
                if key in self.access_order:
                    self.access_order.remove(key)
                self.access_order.append(key)
                return self.cache[key]
            
            return None
    
    def put(self, key: str, value: Any):
        """存储缓存值"""
        with self.lock:
            self._cleanup_expired()
            self._evict_lru()
            
            current_time = time.time()
            
            # 如果key已存在，更新值和访问时间
            if key in self.cache:
                if key in self.access_order:
                    self.access_order.remove(key)
            
            self.cache[key] = value
            self.access_times[key] = current_time
            self.access_order.append(key)
    
    def clear(self):
        """清空缓存"""
        with self.lock:
            self.cache.clear()
            self.access_order.clear()
            self.access_times.clear()
    
    def stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        with self.lock:
            return {
                'size': len(self.cache),
                'max_size': self.max_size,
                'hit_ratio': 0.0,  # 这需要在上层统计
                'ttl': self.ttl
            }


# ========== 连接池管理 ==========

class ConnectionPool:
    """连接池管理器"""
    
    def __init__(self, max_connections: int = 50):
        self.max_connections = max_connections
        self.active_connections = set()
        self.available_connections = deque()
        self.lock = threading.Semaphore(max_connections)
    
    async def acquire(self):
        """获取连接"""
        await asyncio.to_thread(self.lock.acquire)
        # 这里可以实现实际的连接创建逻辑
        connection = f"conn_{len(self.active_connections)}"
        self.active_connections.add(connection)
        return connection
    
    def release(self, connection):
        """释放连接"""
        if connection in self.active_connections:
            self.active_connections.remove(connection)
            self.available_connections.append(connection)
        self.lock.release()


# ========== 优化的工作流引擎 ==========

class OptimizedVisualWorkflow:
    """
    优化的可视化工作流引擎
    
    主要优化特性：
    1. 并行节点执行
    2. LRU缓存机制
    3. 异步I/O处理
    4. 性能监控
    5. 连接池管理
    """
    
    def __init__(self, workflow_def: WorkflowDefinition, websocket_manager=None):
        self.workflow_def = workflow_def
        self.websocket_manager = websocket_manager
        
        # 基础工作流引擎
        self.base_workflow = VisualWorkflow(workflow_def, websocket_manager)
        
        # 优化组件
        self.performance_monitor = PerformanceMonitor()
        self.cache = LRUCache(max_size=1000, ttl=3600)
        self.connection_pool = ConnectionPool(max_connections=50)
        
        # 执行控制
        self.max_concurrent_nodes = 10
        self.thread_pool = ThreadPoolExecutor(max_workers=self.max_concurrent_nodes)
        self.process_pool = ProcessPoolExecutor(max_workers=4)
        
        # 依赖关系图
        self.dependency_graph = self._build_dependency_graph()
        self.ready_queue = asyncio.Queue()
        self.completed_nodes = set()
        self.running_nodes = set()
        
        # 执行状态
        self.execution_results = {}
        self.execution_context = {}
    
    def _build_dependency_graph(self) -> Dict[str, Set[str]]:
        """构建节点依赖关系图"""
        dependencies = {node.id: set() for node in self.workflow_def.nodes}
        
        for edge in self.workflow_def.edges:
            dependencies[edge.target].add(edge.source)
        
        return dependencies
    
    def _generate_cache_key(self, node: WorkflowNode, inputs: Dict[str, Any]) -> str:
        """生成缓存键"""
        # 基于节点配置和输入数据生成hash
        cache_data = {
            'node_type': node.type.value,
            'node_data': node.data,
            'inputs': inputs
        }
        cache_str = json.dumps(cache_data, sort_keys=True, default=str)
        return hashlib.md5(cache_str.encode()).hexdigest()
    
    def _get_ready_nodes(self) -> List[WorkflowNode]:
        """获取可以并行执行的节点"""
        ready_nodes = []
        
        for node in self.workflow_def.nodes:
            if (node.id not in self.completed_nodes and 
                node.id not in self.running_nodes and
                all(dep in self.completed_nodes for dep in self.dependency_graph[node.id])):
                ready_nodes.append(node)
        
        return ready_nodes
    
    async def _execute_node_async(self, node: WorkflowNode, execution_id: str) -> Dict[str, Any]:
        """异步执行单个节点"""
        try:
            self.running_nodes.add(node.id)
            self.performance_monitor.record_node_start(execution_id, node.id)
            
            # 收集输入数据
            inputs = await self._collect_node_inputs(node)
            
            # 检查缓存
            cache_key = self._generate_cache_key(node, inputs)
            cached_result = self.cache.get(cache_key)
            
            if cached_result is not None:
                self.performance_monitor.record_cache_hit(execution_id)
                result = cached_result
            else:
                self.performance_monitor.record_cache_miss(execution_id)
                
                # 根据节点类型选择执行方式
                if node.type == NodeType.LLM_CALL:
                    result = await self._execute_llm_node_async(node, inputs)
                elif node.type == NodeType.CODE_BLOCK:
                    result = await self._execute_code_node_async(node, inputs)
                else:
                    # 对于其他类型，使用原有的同步方法
                    result = await asyncio.to_thread(
                        self._call_node_function_sync, node, inputs
                    )
                
                # 缓存结果
                self.cache.put(cache_key, result)
            
            # 存储结果
            self.execution_results[node.id] = result
            
            self.performance_monitor.record_node_complete(execution_id, node.id)
            self.completed_nodes.add(node.id)
            self.running_nodes.remove(node.id)
            
            return result
            
        except Exception as e:
            self.running_nodes.discard(node.id)
            error_result = {
                'text': f'节点执行出错: {str(e)}',
                'signal': None,
                'metadata': {'node_id': node.id, 'error': str(e)}
            }
            self.execution_results[node.id] = error_result
            return error_result
    
    def _call_node_function_sync(self, node: WorkflowNode, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """同步调用节点函数"""
        if node.type == NodeType.INPUT:
            return self._execute_input_node(node, inputs)
        elif node.type == NodeType.CONDITION:
            return self._execute_condition_node(node, inputs)
        elif node.type == NodeType.SWITCH:
            return self._execute_switch_node(node, inputs)
        elif node.type == NodeType.MERGER:
            return self._execute_merger_node(node, inputs)
        elif node.type == NodeType.OUTPUT:
            return self._execute_output_node(node, inputs)
        else:
            return {
                'text': f'不支持的节点类型: {node.type.value}',
                'signal': None,
                'metadata': {'node_id': node.id, 'error': f'不支持的节点类型: {node.type.value}'}
            }
    
    def _execute_input_node(self, node: WorkflowNode, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """执行输入节点"""
        input_data = inputs.get('input', node.data.get('default_value', ''))
        return {
            'text': str(input_data),
            'signal': 1,
            'metadata': {'node_id': node.id, 'node_type': 'input'}
        }
    
    def _execute_condition_node(self, node: WorkflowNode, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """执行条件节点"""
        try:
            condition_expr = node.data.get('condition', 'True')
            true_output = node.data.get('true_output', 'True')
            false_output = node.data.get('false_output', 'False')
            
            # 构建执行上下文
            context = self._build_condition_context(inputs)
            
            # 简单的条件评估
            condition_result = self._evaluate_simple_condition(condition_expr, context)
            
            output_text = true_output if condition_result else false_output
            signal = 1 if condition_result else 0
            
            return {
                'text': output_text,
                'signal': signal,
                'metadata': {
                    'node_id': node.id,
                    'node_type': 'condition',
                    'condition': condition_expr,
                    'result': condition_result,
                    'context': context
                }
            }
        except Exception as e:
            return {
                'text': "条件分支执行出错",
                'signal': 0,
                'metadata': {'node_id': node.id, 'node_type': 'condition', 'error': str(e)}
            }
    
    def _execute_switch_node(self, node: WorkflowNode, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """执行开关节点"""
        try:
            signal = inputs.get('signal', 0)
            switch_map = node.data.get('switch_map', {})
            
            output_text = switch_map.get(str(signal), switch_map.get('default', ''))
            
            return {
                'text': output_text,
                'signal': signal,
                'metadata': {
                    'node_id': node.id,
                    'node_type': 'switch',
                    'input_signal': signal,
                    'selected_output': output_text,
                    'switch_map': switch_map
                }
            }
        except Exception as e:
            return {
                'text': "开关路由出错",
                'signal': inputs.get('signal', 0),
                'metadata': {'node_id': node.id, 'node_type': 'switch', 'error': str(e)}
            }
    
    def _execute_merger_node(self, node: WorkflowNode, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """执行聚合节点"""
        try:
            merge_strategy = node.data.get('merge_strategy', 'concat')
            separator = node.data.get('separator', '\n')
            
            # 收集所有文本输入
            texts = []
            signals = []
            
            for key, value in inputs.items():
                if key.startswith('input'):
                    if isinstance(value, str):
                        texts.append(value)
                    elif isinstance(value, dict):
                        texts.append(value.get('text', ''))
                        if value.get('signal') is not None:
                            signals.append(value.get('signal'))
            
            # 根据合并策略处理
            if merge_strategy == 'concat':
                result_text = separator.join(texts)
            elif merge_strategy == 'first':
                result_text = texts[0] if texts else ''
            elif merge_strategy == 'last':
                result_text = texts[-1] if texts else ''
            else:
                result_text = separator.join(texts)
            
            result_signal = max(signals) if signals else None
            
            return {
                'text': result_text,
                'signal': result_signal,
                'metadata': {
                    'node_id': node.id,
                    'node_type': 'merger',
                    'merge_strategy': merge_strategy,
                    'input_count': len(texts),
                    'input_signals': signals
                }
            }
        except Exception as e:
            return {
                'text': "结果聚合出错",
                'signal': None,
                'metadata': {'node_id': node.id, 'node_type': 'merger', 'error': str(e)}
            }
    
    def _execute_output_node(self, node: WorkflowNode, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """执行输出节点"""
        input_data = inputs.get('input', inputs.get('text', ''))
        output_format = node.data.get('format', 'text')
        
        if output_format == 'json' and isinstance(input_data, str):
            try:
                formatted_output = json.dumps(json.loads(input_data), indent=2, ensure_ascii=False)
            except:
                formatted_output = input_data
        elif output_format == 'html':
            formatted_output = f"<div>{input_data}</div>"
        else:
            formatted_output = str(input_data)
        
        return {
            'text': formatted_output,
            'signal': 1,
            'metadata': {
                'node_id': node.id,
                'node_type': 'output',
                'format': output_format,
                'final_output': True
            }
        }
    
    def _build_condition_context(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """构建条件执行上下文"""
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
    
    def _evaluate_simple_condition(self, expression: str, context: Dict[str, Any]) -> bool:
        """简单的条件表达式评估"""
        try:
            # 替换表达式中的变量
            for key, value in context.items():
                if isinstance(value, (str, int, float)):
                    expression = expression.replace(key, str(value))
            
            # 安全的表达式评估
            if '>' in expression:
                parts = expression.split('>')
                if len(parts) == 2:
                    try:
                        left = float(parts[0].strip())
                        right = float(parts[1].strip())
                        return left > right
                    except:
                        pass
            elif '<' in expression:
                parts = expression.split('<')
                if len(parts) == 2:
                    try:
                        left = float(parts[0].strip())
                        right = float(parts[1].strip())
                        return left < right
                    except:
                        pass
            elif '==' in expression:
                parts = expression.split('==')
                if len(parts) == 2:
                    return parts[0].strip() == parts[1].strip()
            
            # 默认为True
            return True
        except:
            return False
    
    async def _collect_node_inputs(self, node: WorkflowNode) -> Dict[str, Any]:
        """收集节点的输入数据"""
        inputs = {}
        
        for edge in self.workflow_def.edges:
            if edge.target == node.id:
                source_result = self.execution_results.get(edge.source, {})
                
                # 根据连接类型映射数据
                if edge.source_handle == "output" and edge.target_handle == "input":
                    inputs['input'] = source_result.get('text', '')
                elif edge.source_handle == "signal" and edge.target_handle == "signal":
                    inputs['signal'] = source_result.get('signal', 0)
                else:
                    inputs[edge.target_handle] = source_result.get(edge.source_handle, '')
        
        return inputs
    
    async def _execute_llm_node_async(self, node: WorkflowNode, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """异步执行LLM节点"""
        try:
            # 获取连接
            connection = await self.connection_pool.acquire()
            
            try:
                # 构建LLM调用参数
                input_text = str(inputs.get('input', inputs.get('text', '')))
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
                
                # 异步调用LLM API
                llm_result = await self._call_llm_api_async({
                    'messages': messages,
                    'provider': provider,
                    'model': model,
                    'temperature': temperature,
                    'max_tokens': max_tokens
                })
                
                response_text = llm_result.get('response', {}).get('content', '')
                signal = self._extract_signal(response_text)
                
                return {
                    'text': response_text,
                    'signal': signal,
                    'metadata': {
                        'node_id': node.id,
                        'node_type': 'llm_call',
                        'provider': provider,
                        'model': model
                    }
                }
                
            finally:
                self.connection_pool.release(connection)
                
        except Exception as e:
            return {
                'text': f'LLM调用失败: {str(e)}',
                'signal': None,
                'metadata': {'node_id': node.id, 'node_type': 'llm_call', 'error': str(e)}
            }
    
    async def _execute_code_node_async(self, node: WorkflowNode, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """异步执行代码节点"""
        try:
            code = node.data.get('code', '')
            code_type = node.data.get('code_type', 'python')
            
            if code_type == 'python':
                # 使用进程池执行CPU密集型代码
                result = await asyncio.get_event_loop().run_in_executor(
                    self.process_pool,
                    self._execute_python_code_safe,
                    code, inputs, node.id
                )
                return result
            else:
                return {
                    'text': f'不支持的代码类型: {code_type}',
                    'signal': None,
                    'metadata': {'node_id': node.id, 'node_type': 'code_block', 'error': f'不支持的代码类型: {code_type}'}
                }
                
        except Exception as e:
            return {
                'text': f'代码执行出错: {str(e)}',
                'signal': None,
                'metadata': {'node_id': node.id, 'node_type': 'code_block', 'error': str(e)}
            }
    
    def _execute_python_code_safe(self, code: str, inputs: Dict[str, Any], node_id: str) -> Dict[str, Any]:
        """安全执行Python代码（在进程池中运行）"""
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
            
            local_scope = {'output': None}
            exec(code, safe_globals, local_scope)
            
            code_output = local_scope.get('output')
            
            if isinstance(code_output, dict):
                return {
                    'text': code_output.get('text', ''),
                    'signal': code_output.get('signal'),
                    'metadata': {'node_id': node_id, 'node_type': 'code_block', 'code_output': code_output}
                }
            else:
                return {
                    'text': str(code_output) if code_output is not None else '',
                    'signal': 1 if code_output is not None else 0,
                    'metadata': {'node_id': node_id, 'node_type': 'code_block'}
                }
        
        except Exception as e:
            return {
                'text': f'代码执行错误: {str(e)}',
                'signal': None,
                'metadata': {'node_id': node_id, 'node_type': 'code_block', 'error': str(e)}
            }
    
    async def _call_llm_api_async(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """异步调用LLM API（模拟实现）"""
        # 这里应该实现真正的异步LLM API调用
        # 暂时使用模拟延迟
        await asyncio.sleep(0.5)
        return {
            'response': {
                'content': f"模拟LLM响应: {params['messages'][-1]['content'][:50]}..."
            }
        }
    
    def _extract_signal(self, text: str) -> Optional[int]:
        """从文本中提取控制信号"""
        import re
        patterns = [
            r'(?:信号|signal|选择|choice)[:：\s]*(\d+)',
            r'(?:分支|branch)[:：\s]*(\d+)',
            r'(?:路径|path)[:：\s]*(\d+)',
            r'^(\d+)$'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text.lower())
            if match:
                try:
                    return int(match.group(1))
                except ValueError:
                    continue
        
        return None
    
    async def execute_with_optimization(self, input_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        优化的工作流执行方法
        
        Args:
            input_data: 初始输入数据
            
        Returns:
            执行结果和性能指标
        """
        execution_id = str(uuid.uuid4())
        
        # 开始性能监控
        metrics = self.performance_monitor.start_monitoring(execution_id, self.workflow_def.id)
        
        try:
            # 初始化执行状态
            self.completed_nodes.clear()
            self.running_nodes.clear()
            self.execution_results.clear()
            
            # 设置输入节点的初始数据
            if input_data:
                for node in self.workflow_def.nodes:
                    if node.type == NodeType.INPUT:
                        self.execution_results[node.id] = {
                            'text': str(input_data.get('input', '')),
                            'signal': 1,
                            'metadata': {'node_id': node.id, 'node_type': 'input'}
                        }
                        self.completed_nodes.add(node.id)
            
            # 并行执行所有可执行的节点
            while len(self.completed_nodes) < len(self.workflow_def.nodes):
                ready_nodes = self._get_ready_nodes()
                
                if not ready_nodes:
                    # 没有可执行的节点，可能存在循环依赖或其他问题
                    remaining_nodes = [n.id for n in self.workflow_def.nodes if n.id not in self.completed_nodes]
                    raise Exception(f"工作流执行停滞，剩余节点: {remaining_nodes}")
                
                # 限制并发数量
                concurrent_nodes = ready_nodes[:self.max_concurrent_nodes]
                metrics.concurrent_nodes = max(metrics.concurrent_nodes, len(concurrent_nodes))
                
                # 并行执行节点
                tasks = [
                    self._execute_node_async(node, execution_id)
                    for node in concurrent_nodes
                ]
                
                await asyncio.gather(*tasks, return_exceptions=True)
            
            # 收集最终结果
            final_results = {}
            for node in self.workflow_def.nodes:
                if node.type == NodeType.OUTPUT:
                    final_results[node.id] = self.execution_results.get(node.id, {})
            
            # 完成性能监控
            final_metrics = self.performance_monitor.complete_monitoring(execution_id)
            
            return {
                'execution_id': execution_id,
                'status': 'completed',
                'results': final_results or self.execution_results,
                'performance_metrics': final_metrics.__dict__ if final_metrics else {},
                'cache_stats': self.cache.stats()
            }
            
        except Exception as e:
            # 完成性能监控（错误情况）
            final_metrics = self.performance_monitor.complete_monitoring(execution_id)
            
            return {
                'execution_id': execution_id,
                'status': 'error',
                'error': str(e),
                'results': self.execution_results,
                'performance_metrics': final_metrics.__dict__ if final_metrics else {},
                'cache_stats': self.cache.stats()
            }
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """获取性能统计信息"""
        history = self.performance_monitor.metrics_history
        if not history:
            return {'message': '暂无性能数据'}
        
        recent_metrics = history[-10:]  # 最近10次执行
        
        avg_duration = sum(m.total_duration for m in recent_metrics) / len(recent_metrics)
        avg_efficiency = sum(m.parallel_efficiency for m in recent_metrics) / len(recent_metrics)
        total_cache_hits = sum(m.cache_hits for m in recent_metrics)
        total_cache_requests = sum(m.cache_hits + m.cache_misses for m in recent_metrics)
        cache_hit_rate = total_cache_hits / total_cache_requests if total_cache_requests > 0 else 0
        
        return {
            'executions_count': len(history),
            'average_duration': avg_duration,
            'average_parallel_efficiency': avg_efficiency,
            'cache_hit_rate': cache_hit_rate,
            'recent_executions': [
                {
                    'execution_id': m.execution_id,
                    'duration': m.total_duration,
                    'efficiency': m.parallel_efficiency,
                    'cache_hits': m.cache_hits,
                    'cache_misses': m.cache_misses
                }
                for m in recent_metrics
            ]
        }
    
    def cleanup(self):
        """清理资源"""
        self.thread_pool.shutdown(wait=True)
        self.process_pool.shutdown(wait=True)
        self.cache.clear()


# ========== 工厂函数 ==========

def create_optimized_workflow(workflow_def: WorkflowDefinition, websocket_manager=None) -> OptimizedVisualWorkflow:
    """创建优化的可视化工作流实例"""
    return OptimizedVisualWorkflow(workflow_def, websocket_manager)