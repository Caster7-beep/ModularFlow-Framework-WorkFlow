"""
优化的可视化工作流API模块
集成优化的工作流引擎，提供高性能的异步API接口

主要优化特性：
1. 异步API函数
2. 集成优化的工作流引擎
3. 连接池复用
4. 性能监控接口
5. 缓存管理接口
"""

import asyncio
import uuid
import json
import time
from typing import Dict, Any, List, Optional
from concurrent.futures import ThreadPoolExecutor

from core.function_registry import register_function
from core.services import get_current_globals
from orchestrators.optimized_visual_workflow import (
    OptimizedVisualWorkflow, create_optimized_workflow
)
from orchestrators.visual_workflow import (
    WorkflowDefinition, WorkflowNode, WorkflowEdge, NodeType,
    create_node, create_edge
)
from modules.visual_workflow_module import variables as v


class OptimizedWorkflowManager:
    """优化的工作流管理器"""
    
    def __init__(self):
        self.workflows: Dict[str, OptimizedVisualWorkflow] = {}
        self.workflows_metadata: Dict[str, Dict[str, Any]] = {}
        self.executor = ThreadPoolExecutor(max_workers=10)
        self.global_cache_stats = {
            'total_requests': 0,
            'cache_hits': 0,
            'cache_misses': 0
        }
    
    def add_workflow(self, workflow: OptimizedVisualWorkflow):
        """添加优化工作流到管理器"""
        workflow_id = workflow.workflow_def.id
        self.workflows[workflow_id] = workflow
        self.workflows_metadata[workflow_id] = {
            'id': workflow_id,
            'name': workflow.workflow_def.name,
            'description': workflow.workflow_def.description,
            'version': workflow.workflow_def.version,
            'created_at': workflow.workflow_def.created_at,
            'updated_at': workflow.workflow_def.updated_at,
            'node_count': len(workflow.workflow_def.nodes),
            'edge_count': len(workflow.workflow_def.edges),
            'optimization_enabled': True
        }
    
    def get_workflow(self, workflow_id: str) -> Optional[OptimizedVisualWorkflow]:
        """获取优化工作流"""
        return self.workflows.get(workflow_id)
    
    def remove_workflow(self, workflow_id: str):
        """移除工作流"""
        if workflow_id in self.workflows:
            # 清理工作流资源
            self.workflows[workflow_id].cleanup()
            del self.workflows[workflow_id]
        self.workflows_metadata.pop(workflow_id, None)
    
    def list_workflows(self) -> List[Dict[str, Any]]:
        """列出所有工作流"""
        return list(self.workflows_metadata.values())
    
    def get_global_performance_stats(self) -> Dict[str, Any]:
        """获取全局性能统计"""
        stats = {
            'total_workflows': len(self.workflows),
            'total_cache_requests': self.global_cache_stats['total_requests'],
            'global_cache_hit_rate': 0.0,
            'workflow_stats': []
        }
        
        # 计算全局缓存命中率
        if self.global_cache_stats['total_requests'] > 0:
            stats['global_cache_hit_rate'] = (
                self.global_cache_stats['cache_hits'] / 
                self.global_cache_stats['total_requests']
            )
        
        # 收集各个工作流的性能统计
        for workflow_id, workflow in self.workflows.items():
            workflow_stats = workflow.get_performance_stats()
            workflow_stats['workflow_id'] = workflow_id
            workflow_stats['workflow_name'] = self.workflows_metadata[workflow_id]['name']
            stats['workflow_stats'].append(workflow_stats)
        
        return stats
    
    def cleanup_all(self):
        """清理所有资源"""
        for workflow in self.workflows.values():
            workflow.cleanup()
        self.executor.shutdown(wait=True)


def get_optimized_workflow_manager() -> OptimizedWorkflowManager:
    """获取全局优化工作流管理器"""
    g = get_current_globals()
    if not hasattr(g, 'optimized_workflow_manager'):
        g.optimized_workflow_manager = OptimizedWorkflowManager()
    return g.optimized_workflow_manager


# ========== 异步工作流CRUD API函数 ==========

@register_function(name="visual_workflow.optimized.create", outputs=["workflow_id", "success", "message"])
def create_optimized_workflow_api(name: str, description: str = "") -> Dict[str, Any]:
    """
    创建新的优化可视化工作流
    
    Args:
        name: 工作流名称
        description: 工作流描述
        
    Returns:
        Dict containing workflow_id, success status and message
    """
    try:
        # 检查工作流数量限制
        manager = get_optimized_workflow_manager()
        if len(manager.workflows) >= v.DEFAULT_MAX_WORKFLOWS:
            return {
                "workflow_id": None,
                "success": False,
                "message": v.ERROR_MESSAGES['max_workflows_exceeded']
            }
        
        # 创建工作流定义
        workflow_def = WorkflowDefinition(
            id=str(uuid.uuid4()),
            name=name,
            description=description
        )
        
        # 创建优化工作流
        workflow = create_optimized_workflow(workflow_def)
        
        # 添加到管理器
        manager.add_workflow(workflow)
        
        return {
            "workflow_id": workflow_def.id,
            "success": True,
            "message": f"优化工作流创建成功: {name}"
        }
        
    except Exception as e:
        return {
            "workflow_id": None,
            "success": False,
            "message": f"创建优化工作流失败: {str(e)}"
        }


@register_function(name="visual_workflow.optimized.execute", outputs=["execution_id", "result", "success", "message"])
def execute_optimized_workflow_api(workflow_id: str, input_data: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    执行优化工作流（同步包装异步函数）
    
    Args:
        workflow_id: 工作流ID
        input_data: 初始输入数据
        
    Returns:
        Dict containing execution result and performance metrics
    """
    try:
        manager = get_optimized_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "execution_id": None,
                "result": None,
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        # 在事件循环中执行异步工作流
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        result = loop.run_until_complete(
            workflow.execute_with_optimization(input_data or {})
        )
        
        # 更新全局统计
        cache_stats = result.get('cache_stats', {})
        performance_metrics = result.get('performance_metrics', {})
        if performance_metrics:
            cache_hits = performance_metrics.get('cache_hits', 0)
            cache_misses = performance_metrics.get('cache_misses', 0)
            manager.global_cache_stats['cache_hits'] += cache_hits
            manager.global_cache_stats['cache_misses'] += cache_misses
            manager.global_cache_stats['total_requests'] += cache_hits + cache_misses
        
        return {
            "execution_id": result.get('execution_id'),
            "result": result,
            "success": True,
            "message": "优化工作流执行成功"
        }
        
    except Exception as e:
        return {
            "execution_id": None,
            "result": None,
            "success": False,
            "message": f"执行优化工作流失败: {str(e)}"
        }


@register_function(name="visual_workflow.optimized.get_performance_stats", outputs=["stats", "success", "message"])
def get_performance_stats_api(workflow_id: str = None) -> Dict[str, Any]:
    """
    获取工作流性能统计
    
    Args:
        workflow_id: 工作流ID（可选，为空则返回全局统计）
        
    Returns:
        Dict containing performance statistics
    """
    try:
        manager = get_optimized_workflow_manager()
        
        if workflow_id:
            # 获取特定工作流的性能统计
            workflow = manager.get_workflow(workflow_id)
            if not workflow:
                return {
                    "stats": None,
                    "success": False,
                    "message": v.ERROR_MESSAGES['workflow_not_found']
                }
            
            stats = workflow.get_performance_stats()
            stats['workflow_id'] = workflow_id
            
            return {
                "stats": stats,
                "success": True,
                "message": f"获取工作流 {workflow_id} 性能统计成功"
            }
        else:
            # 获取全局性能统计
            stats = manager.get_global_performance_stats()
            
            return {
                "stats": stats,
                "success": True,
                "message": "获取全局性能统计成功"
            }
            
    except Exception as e:
        return {
            "stats": None,
            "success": False,
            "message": f"获取性能统计失败: {str(e)}"
        }


@register_function(name="visual_workflow.optimized.clear_cache", outputs=["success", "message"])
def clear_workflow_cache_api(workflow_id: str = None) -> Dict[str, Any]:
    """
    清理工作流缓存
    
    Args:
        workflow_id: 工作流ID（可选，为空则清理所有缓存）
        
    Returns:
        Dict containing success status and message
    """
    try:
        manager = get_optimized_workflow_manager()
        
        if workflow_id:
            # 清理特定工作流的缓存
            workflow = manager.get_workflow(workflow_id)
            if not workflow:
                return {
                    "success": False,
                    "message": v.ERROR_MESSAGES['workflow_not_found']
                }
            
            workflow.cache.clear()
            
            return {
                "success": True,
                "message": f"工作流 {workflow_id} 缓存已清理"
            }
        else:
            # 清理所有工作流的缓存
            cleared_count = 0
            for workflow in manager.workflows.values():
                workflow.cache.clear()
                cleared_count += 1
            
            # 重置全局统计
            manager.global_cache_stats = {
                'total_requests': 0,
                'cache_hits': 0,
                'cache_misses': 0
            }
            
            return {
                "success": True,
                "message": f"已清理 {cleared_count} 个工作流的缓存"
            }
            
    except Exception as e:
        return {
            "success": False,
            "message": f"清理缓存失败: {str(e)}"
        }


@register_function(name="visual_workflow.optimized.benchmark", outputs=["benchmark_result", "success", "message"])
def benchmark_workflow_api(workflow_id: str, iterations: int = 5, input_data: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    对工作流进行性能基准测试
    
    Args:
        workflow_id: 工作流ID
        iterations: 测试迭代次数
        input_data: 测试输入数据
        
    Returns:
        Dict containing benchmark results
    """
    try:
        manager = get_optimized_workflow_manager()
        workflow = manager.get_workflow(workflow_id)
        
        if not workflow:
            return {
                "benchmark_result": None,
                "success": False,
                "message": v.ERROR_MESSAGES['workflow_not_found']
            }
        
        if iterations <= 0 or iterations > 20:
            return {
                "benchmark_result": None,
                "success": False,
                "message": "迭代次数必须在1-20之间"
            }
        
        # 进行基准测试
        async def run_benchmark():
            results = []
            
            for i in range(iterations):
                start_time = time.time()
                result = await workflow.execute_with_optimization(input_data or {})
                end_time = time.time()
                
                results.append({
                    'iteration': i + 1,
                    'duration': end_time - start_time,
                    'status': result.get('status'),
                    'cache_stats': result.get('cache_stats', {}),
                    'performance_metrics': result.get('performance_metrics', {})
                })
            
            return results
        
        # 执行基准测试
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        benchmark_results = loop.run_until_complete(run_benchmark())
        
        # 计算统计信息
        durations = [r['duration'] for r in benchmark_results]
        avg_duration = sum(durations) / len(durations)
        min_duration = min(durations)
        max_duration = max(durations)
        
        # 计算缓存命中率
        total_hits = sum(r.get('performance_metrics', {}).get('cache_hits', 0) for r in benchmark_results)
        total_misses = sum(r.get('performance_metrics', {}).get('cache_misses', 0) for r in benchmark_results)
        total_requests = total_hits + total_misses
        cache_hit_rate = total_hits / total_requests if total_requests > 0 else 0
        
        benchmark_summary = {
            'workflow_id': workflow_id,
            'iterations': iterations,
            'avg_duration': avg_duration,
            'min_duration': min_duration,
            'max_duration': max_duration,
            'total_cache_hit_rate': cache_hit_rate,
            'total_cache_requests': total_requests,
            'detailed_results': benchmark_results
        }
        
        return {
            "benchmark_result": benchmark_summary,
            "success": True,
            "message": f"基准测试完成，{iterations} 次迭代，平均耗时: {avg_duration:.2f}s"
        }
        
    except Exception as e:
        return {
            "benchmark_result": None,
            "success": False,
            "message": f"基准测试失败: {str(e)}"
        }


@register_function(name="visual_workflow.optimized.list", outputs=["workflows", "success", "message"])
def list_optimized_workflows_api() -> Dict[str, Any]:
    """
    获取所有优化工作流列表
    """
    try:
        manager = get_optimized_workflow_manager()
        workflows = manager.list_workflows()
        
        return {
            "workflows": workflows,
            "success": True,
            "message": f"获取到 {len(workflows)} 个优化工作流"
        }
        
    except Exception as e:
        return {
            "workflows": [],
            "success": False,
            "message": f"获取优化工作流列表失败: {str(e)}"
        }


# ========== 系统管理函数 ==========

def cleanup_optimized_workflows():
    """清理所有优化工作流资源（系统关闭时调用）"""
    try:
        manager = get_optimized_workflow_manager()
        manager.cleanup_all()
        print("✓ 优化工作流资源清理完成")
    except Exception as e:
        print(f"⚠️ 清理优化工作流资源时出错: {e}")


# 注册清理函数到全局
def register_cleanup():
    """注册清理函数到全局服务"""
    g = get_current_globals()
    if not hasattr(g, 'cleanup_functions'):
        g.cleanup_functions = []
    g.cleanup_functions.append(cleanup_optimized_workflows)

# 自动注册清理函数
register_cleanup()