"""
错误处理器和中间件
提供统一的错误处理和响应格式化
"""

import sys
import traceback
import time
import uuid
from typing import Optional, Dict, Any, Callable
from datetime import datetime

from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .exceptions import (
    BaseApplicationError, APIError, ValidationError,
    ResourceNotFoundError, AuthenticationError, AuthorizationError,
    RateLimitError, ServiceUnavailableError, ErrorSeverity
)
from .error_collector import ErrorCollector, ErrorReport


class ErrorHandler:
    """统一错误处理器"""
    
    def __init__(
        self,
        error_collector: Optional[ErrorCollector] = None,
        debug_mode: bool = False,
        include_stacktrace: bool = False
    ):
        self.error_collector = error_collector or ErrorCollector()
        self.debug_mode = debug_mode
        self.include_stacktrace = include_stacktrace or debug_mode
        self.error_handlers = self._setup_error_handlers()
    
    def _setup_error_handlers(self) -> Dict[type, Callable]:
        """设置错误处理器映射"""
        return {
            ValidationError: self._handle_validation_error,
            ResourceNotFoundError: self._handle_not_found_error,
            AuthenticationError: self._handle_authentication_error,
            AuthorizationError: self._handle_authorization_error,
            RateLimitError: self._handle_rate_limit_error,
            ServiceUnavailableError: self._handle_service_unavailable_error,
            APIError: self._handle_api_error,
            HTTPException: self._handle_http_exception,
            StarletteHTTPException: self._handle_http_exception,
            BaseApplicationError: self._handle_application_error,
            Exception: self._handle_generic_error
        }
    
    async def handle_error(
        self,
        request: Request,
        error: Exception
    ) -> JSONResponse:
        """处理错误并返回格式化的响应"""
        # 生成错误ID
        error_id = str(uuid.uuid4())
        
        # 获取错误处理器
        handler = self._get_error_handler(error)
        
        # 处理错误
        response_data = await handler(request, error, error_id)
        
        # 收集错误信息
        await self._collect_error(request, error, error_id, response_data)
        
        # 返回响应
        return JSONResponse(
            status_code=response_data.get("status_code", 500),
            content=response_data,
            headers=self._get_response_headers(error_id)
        )
    
    def _get_error_handler(self, error: Exception) -> Callable:
        """获取对应的错误处理器"""
        for error_type, handler in self.error_handlers.items():
            if isinstance(error, error_type):
                return handler
        return self._handle_generic_error
    
    def _get_response_headers(self, error_id: str) -> Dict[str, str]:
        """获取响应头"""
        return {
            "X-Error-Id": error_id,
            "X-Error-Timestamp": datetime.utcnow().isoformat()
        }
    
    async def _handle_validation_error(
        self,
        request: Request,
        error: ValidationError,
        error_id: str
    ) -> Dict[str, Any]:
        """处理验证错误"""
        return {
            "status_code": 400,
            "error_id": error_id,
            "error": {
                "code": error.code,
                "message": error.message,
                "type": "validation_error",
                "details": error.details
            },
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url)
        }
    
    async def _handle_not_found_error(
        self,
        request: Request,
        error: ResourceNotFoundError,
        error_id: str
    ) -> Dict[str, Any]:
        """处理资源未找到错误"""
        return {
            "status_code": 404,
            "error_id": error_id,
            "error": {
                "code": error.code,
                "message": error.message,
                "type": "not_found",
                "details": error.details
            },
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url)
        }
    
    async def _handle_authentication_error(
        self,
        request: Request,
        error: AuthenticationError,
        error_id: str
    ) -> Dict[str, Any]:
        """处理认证错误"""
        return {
            "status_code": 401,
            "error_id": error_id,
            "error": {
                "code": error.code,
                "message": error.message,
                "type": "authentication_error"
            },
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url)
        }
    
    async def _handle_authorization_error(
        self,
        request: Request,
        error: AuthorizationError,
        error_id: str
    ) -> Dict[str, Any]:
        """处理授权错误"""
        return {
            "status_code": 403,
            "error_id": error_id,
            "error": {
                "code": error.code,
                "message": error.message,
                "type": "authorization_error",
                "details": error.details
            },
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url)
        }
    
    async def _handle_rate_limit_error(
        self,
        request: Request,
        error: RateLimitError,
        error_id: str
    ) -> Dict[str, Any]:
        """处理速率限制错误"""
        return {
            "status_code": 429,
            "error_id": error_id,
            "error": {
                "code": error.code,
                "message": error.message,
                "type": "rate_limit",
                "details": error.details
            },
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url),
            "retry_after": error.details.get("reset_time")
        }
    
    async def _handle_service_unavailable_error(
        self,
        request: Request,
        error: ServiceUnavailableError,
        error_id: str
    ) -> Dict[str, Any]:
        """处理服务不可用错误"""
        return {
            "status_code": 503,
            "error_id": error_id,
            "error": {
                "code": error.code,
                "message": error.message,
                "type": "service_unavailable",
                "details": error.details
            },
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url),
            "retry_after": error.details.get("retry_after")
        }
    
    async def _handle_api_error(
        self,
        request: Request,
        error: APIError,
        error_id: str
    ) -> Dict[str, Any]:
        """处理API错误"""
        return {
            "status_code": error.status_code,
            "error_id": error_id,
            "error": {
                "code": error.code,
                "message": error.message,
                "type": "api_error",
                "details": error.details
            },
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url)
        }
    
    async def _handle_http_exception(
        self,
        request: Request,
        error: HTTPException,
        error_id: str
    ) -> Dict[str, Any]:
        """处理HTTP异常"""
        return {
            "status_code": error.status_code,
            "error_id": error_id,
            "error": {
                "code": f"HTTP_{error.status_code}",
                "message": error.detail,
                "type": "http_exception"
            },
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url)
        }
    
    async def _handle_application_error(
        self,
        request: Request,
        error: BaseApplicationError,
        error_id: str
    ) -> Dict[str, Any]:
        """处理应用错误"""
        status_code_map = {
            ErrorSeverity.INFO: 200,
            ErrorSeverity.WARNING: 400,
            ErrorSeverity.ERROR: 500,
            ErrorSeverity.CRITICAL: 500,
            ErrorSeverity.FATAL: 500
        }
        
        response_data = {
            "status_code": status_code_map.get(error.severity, 500),
            "error_id": error_id,
            "error": {
                "code": error.code,
                "message": error.message,
                "type": error.__class__.__name__,
                "severity": error.severity.value,
                "details": error.details,
                "recoverable": error.recoverable
            },
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url)
        }
        
        if self.include_stacktrace:
            response_data["error"]["stacktrace"] = traceback.format_exc()
        
        return response_data
    
    async def _handle_generic_error(
        self,
        request: Request,
        error: Exception,
        error_id: str
    ) -> Dict[str, Any]:
        """处理通用错误"""
        response_data = {
            "status_code": 500,
            "error_id": error_id,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred" if not self.debug_mode else str(error),
                "type": "internal_error"
            },
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url)
        }
        
        if self.include_stacktrace:
            response_data["error"]["stacktrace"] = traceback.format_exc()
            response_data["error"]["exception_type"] = error.__class__.__name__
        
        return response_data
    
    async def _collect_error(
        self,
        request: Request,
        error: Exception,
        error_id: str,
        response_data: Dict[str, Any]
    ):
        """收集错误信息"""
        try:
            # 创建错误报告
            error_report = ErrorReport(
                error_id=error_id,
                timestamp=datetime.utcnow(),
                error_type=error.__class__.__name__,
                error_message=str(error),
                error_code=response_data.get("error", {}).get("code", "UNKNOWN"),
                severity=self._get_error_severity(error),
                request_method=request.method,
                request_url=str(request.url),
                request_headers=dict(request.headers),
                request_body=None,  # 需要从request中获取
                response_status_code=response_data.get("status_code", 500),
                response_body=response_data,
                stacktrace=traceback.format_exc() if self.include_stacktrace else None,
                user_id=None,  # 需要从认证信息中获取
                session_id=request.headers.get("X-Session-Id"),
                additional_context={
                    "client_ip": request.client.host if request.client else None,
                    "user_agent": request.headers.get("User-Agent"),
                    "referer": request.headers.get("Referer")
                }
            )
            
            # 收集错误
            await self.error_collector.collect(error_report)
            
        except Exception as e:
            # 错误收集失败不应影响响应
            print(f"Failed to collect error: {e}", file=sys.stderr)
    
    def _get_error_severity(self, error: Exception) -> str:
        """获取错误严重程度"""
        if isinstance(error, BaseApplicationError):
            return error.severity.value
        elif isinstance(error, (HTTPException, StarletteHTTPException)):
            if error.status_code >= 500:
                return ErrorSeverity.ERROR.value
            elif error.status_code >= 400:
                return ErrorSeverity.WARNING.value
            else:
                return ErrorSeverity.INFO.value
        else:
            return ErrorSeverity.ERROR.value


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """错误处理中间件"""
    
    def __init__(
        self,
        app,
        error_handler: Optional[ErrorHandler] = None,
        catch_all_errors: bool = True
    ):
        super().__init__(app)
        self.error_handler = error_handler or ErrorHandler()
        self.catch_all_errors = catch_all_errors
    
    async def dispatch(self, request: Request, call_next) -> Response:
        """处理请求"""
        try:
            # 记录请求开始时间
            start_time = time.time()
            
            # 调用下一个中间件或路由处理器
            response = await call_next(request)
            
            # 记录请求处理时间
            process_time = time.time() - start_time
            response.headers["X-Process-Time"] = str(process_time)
            
            return response
            
        except Exception as error:
            # 处理错误
            if self.catch_all_errors or isinstance(error, BaseApplicationError):
                return await self.error_handler.handle_error(request, error)
            else:
                # 重新抛出错误
                raise error


def setup_error_handlers(app):
    """设置FastAPI应用的错误处理器"""
    error_handler = ErrorHandler()
    
    @app.exception_handler(BaseApplicationError)
    async def application_error_handler(request: Request, exc: BaseApplicationError):
        return await error_handler.handle_error(request, exc)
    
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return await error_handler.handle_error(request, exc)
    
    @app.exception_handler(StarletteHTTPException)
    async def starlette_exception_handler(request: Request, exc: StarletteHTTPException):
        return await error_handler.handle_error(request, exc)
    
    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError):
        return await error_handler.handle_error(request, exc)
    
    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception):
        return await error_handler.handle_error(request, exc)
    
    return error_handler