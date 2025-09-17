"""
错误处理系统集成示例
展示如何将错误处理系统集成到FastAPI应用中
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any

from .error_handler import ErrorHandler, ErrorHandlerMiddleware, setup_error_handlers
from .error_collector import ErrorCollector, ErrorReport, get_error_collector
from .recovery_manager import RecoveryManager, RetryPolicy, with_recovery, get_recovery_manager
from .exceptions import (
    WorkflowError, ValidationError, ResourceNotFoundError,
    AuthenticationError, ServiceUnavailableError
)


def setup_error_handling(
    app: FastAPI,
    debug_mode: bool = False,
    enable_file_logging: bool = True,
    enable_statistics: bool = True,
    log_dir: str = "logs/errors"
) -> Dict[str, Any]:
    """
    设置FastAPI应用的完整错误处理系统
    
    Args:
        app: FastAPI应用实例
        debug_mode: 是否启用调试模式
        enable_file_logging: 是否启用文件日志
        enable_statistics: 是否启用统计
        log_dir: 日志目录
        
    Returns:
        包含错误处理组件的字典
    """
    
    # 1. 初始化错误收集器
    error_collector = ErrorCollector(
        log_dir=log_dir,
        enable_file_logging=enable_file_logging,
        enable_statistics=enable_statistics
    )
    
    # 2. 初始化错误处理器
    error_handler = ErrorHandler(
        error_collector=error_collector,
        debug_mode=debug_mode,
        include_stacktrace=debug_mode
    )
    
    # 3. 添加错误处理中间件
    app.add_middleware(
        ErrorHandlerMiddleware,
        error_handler=error_handler,
        catch_all_errors=True
    )
    
    # 4. 设置异常处理器
    setup_error_handlers(app)
    
    # 5. 初始化恢复管理器
    recovery_manager = get_recovery_manager()
    
    # 6. 注册一些默认的重试策略
    recovery_manager.register_retry_policy(
        "default",
        RetryPolicy(
            max_attempts=3,
            initial_delay=1.0,
            strategy=RetryPolicy.RetryStrategy.EXPONENTIAL_BACKOFF
        )
    )
    
    recovery_manager.register_retry_policy(
        "aggressive",
        RetryPolicy(
            max_attempts=5,
            initial_delay=0.5,
            max_delay=30.0,
            strategy=RetryPolicy.RetryStrategy.EXPONENTIAL_BACKOFF,
            backoff_multiplier=1.5
        )
    )
    
    recovery_manager.register_retry_policy(
        "conservative",
        RetryPolicy(
            max_attempts=2,
            initial_delay=2.0,
            strategy=RetryPolicy.RetryStrategy.FIXED_DELAY
        )
    )
    
    # 7. 添加错误报告API端点
    @app.post("/api/v1/errors/report")
    async def report_error(request: Request):
        """前端错误报告端点"""
        try:
            error_data = await request.json()
            
            # 创建错误报告
            error_report = ErrorReport(
                error_id=error_data.get("errorId", "unknown"),
                timestamp=datetime.fromisoformat(error_data.get("timestamp")),
                error_type="frontend_error",
                error_message=error_data.get("message", ""),
                error_code=error_data.get("code", "FRONTEND_ERROR"),
                severity=error_data.get("level", "error"),
                request_url=error_data.get("url"),
                stacktrace=error_data.get("stack"),
                user_id=error_data.get("userId"),
                session_id=error_data.get("sessionId"),
                additional_context=error_data.get("context", {})
            )
            
            # 收集错误
            await error_collector.collect(error_report)
            
            return JSONResponse(
                content={"success": True, "error_id": error_report.error_id},
                status_code=200
            )
        except Exception as e:
            return JSONResponse(
                content={"success": False, "error": str(e)},
                status_code=500
            )
    
    # 8. 添加错误统计API端点
    @app.get("/api/v1/errors/statistics")
    async def get_error_statistics():
        """获取错误统计信息"""
        stats = error_collector.get_statistics()
        recovery_stats = recovery_manager.get_statistics()
        
        return JSONResponse(
            content={
                "error_statistics": stats,
                "recovery_statistics": recovery_stats
            }
        )
    
    # 9. 添加错误查询API端点
    @app.get("/api/v1/errors")
    async def query_errors(
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        error_type: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 100
    ):
        """查询错误日志"""
        from datetime import datetime
        
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None
        
        errors = await error_collector.get_errors(
            start_date=start_dt,
            end_date=end_dt,
            error_type=error_type,
            severity=severity,
            limit=limit
        )
        
        return JSONResponse(
            content={
                "errors": [error.to_dict() for error in errors],
                "count": len(errors)
            }
        )
    
    # 10. 添加健康检查端点
    @app.get("/api/v1/health")
    async def health_check():
        """健康检查端点"""
        return JSONResponse(
            content={
                "status": "healthy",
                "timestamp": datetime.utcnow().isoformat(),
                "error_handler": "active",
                "error_collector": "active",
                "recovery_manager": "active"
            }
        )
    
    return {
        "error_handler": error_handler,
        "error_collector": error_collector,
        "recovery_manager": recovery_manager
    }


# ========== 使用示例 ==========

def create_app_with_error_handling() -> FastAPI:
    """创建带有错误处理的FastAPI应用示例"""
    
    app = FastAPI(
        title="Visual Workflow API",
        description="可视化工作流系统API",
        version="1.0.0"
    )
    
    # 设置错误处理系统
    error_components = setup_error_handling(
        app,
        debug_mode=True,  # 开发环境启用调试模式
        enable_file_logging=True,
        enable_statistics=True
    )
    
    # 获取恢复管理器
    recovery_manager = error_components["recovery_manager"]
    
    # ========== 示例API端点 ==========
    
    @app.post("/api/v1/visual_workflow/execute")
    @with_recovery(
        service_name="workflow_execution",
        retry_policy="default",
        circuit_breaker=True,
        fallback=lambda workflow_id: {
            "success": False,
            "message": "Workflow execution service is temporarily unavailable",
            "workflow_id": workflow_id
        }
    )
    async def execute_workflow(workflow_id: str, input_data: Dict[str, Any]):
        """执行工作流（带错误恢复）"""
        
        # 模拟可能出错的工作流执行
        import random
        if random.random() < 0.3:  # 30%概率失败
            raise WorkflowError(
                "Workflow execution failed",
                workflow_id=workflow_id
            )
        
        return {
            "success": True,
            "workflow_id": workflow_id,
            "result": "Workflow executed successfully"
        }
    
    @app.get("/api/v1/visual_workflow/{workflow_id}")
    async def get_workflow(workflow_id: str):
        """获取工作流详情"""
        
        # 模拟资源未找到
        if workflow_id == "not_exists":
            raise ResourceNotFoundError(
                f"Workflow {workflow_id} not found",
                resource_type="workflow",
                resource_id=workflow_id
            )
        
        return {
            "workflow_id": workflow_id,
            "name": "Sample Workflow",
            "nodes": [],
            "edges": []
        }
    
    @app.post("/api/v1/visual_workflow/validate")
    async def validate_workflow(workflow_data: Dict[str, Any]):
        """验证工作流数据"""
        
        # 模拟验证错误
        if not workflow_data.get("name"):
            raise ValidationError(
                "Workflow name is required",
                field="name",
                value=None,
                constraints={"required": True, "min_length": 1}
            )
        
        if not workflow_data.get("nodes"):
            raise ValidationError(
                "Workflow must have at least one node",
                field="nodes",
                value=[],
                constraints={"min_items": 1}
            )
        
        return {
            "valid": True,
            "message": "Workflow validation successful"
        }
    
    @app.post("/api/v1/auth/login")
    async def login(username: str, password: str):
        """用户登录"""
        
        # 模拟认证错误
        if username != "admin" or password != "admin":
            raise AuthenticationError("Invalid username or password")
        
        return {
            "success": True,
            "token": "sample_jwt_token",
            "user": {
                "id": "user_123",
                "username": username,
                "role": "admin"
            }
        }
    
    @app.get("/api/v1/external/service")
    @with_recovery(
        service_name="external_service",
        retry_policy="aggressive",
        circuit_breaker=True,
        fallback=lambda: {
            "success": False,
            "data": None,
            "message": "External service is unavailable, using cached data",
            "cached": True
        }
    )
    async def call_external_service():
        """调用外部服务（带熔断和降级）"""
        
        # 模拟外部服务不可用
        import random
        if random.random() < 0.5:  # 50%概率失败
            raise ServiceUnavailableError(
                "External service is not responding",
                service_name="external_api",
                retry_after=60
            )
        
        return {
            "success": True,
            "data": {"value": "external_data"},
            "cached": False
        }
    
    return app


# ========== 工作流特定的错误处理 ==========

def setup_workflow_error_handling(recovery_manager: RecoveryManager):
    """设置工作流特定的错误处理策略"""
    
    # 注册工作流执行的降级处理
    recovery_manager.register_fallback(
        "workflow_execution_fallback",
        lambda workflow_id, **kwargs: {
            "success": False,
            "workflow_id": workflow_id,
            "message": "Workflow is queued for later execution",
            "queued": True
        }
    )
    
    # 注册节点执行的降级处理
    recovery_manager.register_fallback(
        "node_execution_fallback",
        lambda node_id, **kwargs: {
            "success": False,
            "node_id": node_id,
            "message": "Node execution skipped due to error",
            "skipped": True
        }
    )
    
    # 注册LLM调用的降级处理
    recovery_manager.register_fallback(
        "llm_fallback",
        lambda prompt, **kwargs: {
            "success": False,
            "response": "LLM service is temporarily unavailable. Please try again later.",
            "fallback": True
        }
    )


# 导入必要的模块
from datetime import datetime