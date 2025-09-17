"""
自定义异常类
定义系统中所有的自定义异常类型
"""

from typing import Optional, Dict, Any
from enum import Enum


class ErrorSeverity(Enum):
    """错误严重程度"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"
    FATAL = "fatal"


class BaseApplicationError(Exception):
    """应用基础异常类"""
    
    def __init__(
        self,
        message: str,
        code: str = "UNKNOWN_ERROR",
        severity: ErrorSeverity = ErrorSeverity.ERROR,
        details: Optional[Dict[str, Any]] = None,
        recoverable: bool = True
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.severity = severity
        self.details = details or {}
        self.recoverable = recoverable
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "severity": self.severity.value,
                "details": self.details,
                "recoverable": self.recoverable,
                "type": self.__class__.__name__
            }
        }


class WorkflowError(BaseApplicationError):
    """工作流相关错误"""
    
    def __init__(
        self,
        message: str,
        workflow_id: Optional[str] = None,
        node_id: Optional[str] = None,
        execution_id: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "workflow_id": workflow_id,
            "node_id": node_id,
            "execution_id": execution_id
        })
        super().__init__(
            message=message,
            code="WORKFLOW_ERROR",
            severity=ErrorSeverity.ERROR,
            details=details,
            **kwargs
        )


class APIError(BaseApplicationError):
    """API调用相关错误"""
    
    def __init__(
        self,
        message: str,
        status_code: int = 500,
        endpoint: Optional[str] = None,
        method: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "status_code": status_code,
            "endpoint": endpoint,
            "method": method
        })
        
        # 根据状态码设置严重程度
        if status_code >= 500:
            severity = ErrorSeverity.CRITICAL
        elif status_code >= 400:
            severity = ErrorSeverity.ERROR
        else:
            severity = ErrorSeverity.WARNING
        
        super().__init__(
            message=message,
            code=f"API_ERROR_{status_code}",
            severity=severity,
            details=details,
            **kwargs
        )
        self.status_code = status_code


class ValidationError(BaseApplicationError):
    """数据验证错误"""
    
    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        value: Any = None,
        constraints: Optional[Dict[str, Any]] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "field": field,
            "value": value,
            "constraints": constraints
        })
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            severity=ErrorSeverity.WARNING,
            details=details,
            recoverable=True,
            **kwargs
        )


class ResourceNotFoundError(BaseApplicationError):
    """资源未找到错误"""
    
    def __init__(
        self,
        message: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "resource_type": resource_type,
            "resource_id": resource_id
        })
        super().__init__(
            message=message,
            code="RESOURCE_NOT_FOUND",
            severity=ErrorSeverity.WARNING,
            details=details,
            **kwargs
        )


class AuthenticationError(BaseApplicationError):
    """认证错误"""
    
    def __init__(
        self,
        message: str = "Authentication failed",
        **kwargs
    ):
        super().__init__(
            message=message,
            code="AUTHENTICATION_ERROR",
            severity=ErrorSeverity.ERROR,
            recoverable=False,
            **kwargs
        )


class AuthorizationError(BaseApplicationError):
    """授权错误"""
    
    def __init__(
        self,
        message: str = "Insufficient permissions",
        required_permission: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "required_permission": required_permission
        })
        super().__init__(
            message=message,
            code="AUTHORIZATION_ERROR",
            severity=ErrorSeverity.ERROR,
            details=details,
            recoverable=False,
            **kwargs
        )


class RateLimitError(BaseApplicationError):
    """速率限制错误"""
    
    def __init__(
        self,
        message: str = "Rate limit exceeded",
        limit: Optional[int] = None,
        reset_time: Optional[int] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "limit": limit,
            "reset_time": reset_time
        })
        super().__init__(
            message=message,
            code="RATE_LIMIT_ERROR",
            severity=ErrorSeverity.WARNING,
            details=details,
            recoverable=True,
            **kwargs
        )


class ServiceUnavailableError(BaseApplicationError):
    """服务不可用错误"""
    
    def __init__(
        self,
        message: str = "Service temporarily unavailable",
        service_name: Optional[str] = None,
        retry_after: Optional[int] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "service_name": service_name,
            "retry_after": retry_after
        })
        super().__init__(
            message=message,
            code="SERVICE_UNAVAILABLE",
            severity=ErrorSeverity.CRITICAL,
            details=details,
            recoverable=True,
            **kwargs
        )


class ConfigurationError(BaseApplicationError):
    """配置错误"""
    
    def __init__(
        self,
        message: str,
        config_key: Optional[str] = None,
        config_value: Any = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "config_key": config_key,
            "config_value": config_value
        })
        super().__init__(
            message=message,
            code="CONFIGURATION_ERROR",
            severity=ErrorSeverity.CRITICAL,
            details=details,
            recoverable=False,
            **kwargs
        )


class TimeoutError(BaseApplicationError):
    """超时错误"""
    
    def __init__(
        self,
        message: str = "Operation timed out",
        operation: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "operation": operation,
            "timeout_seconds": timeout_seconds
        })
        super().__init__(
            message=message,
            code="TIMEOUT_ERROR",
            severity=ErrorSeverity.ERROR,
            details=details,
            recoverable=True,
            **kwargs
        )


class DataIntegrityError(BaseApplicationError):
    """数据完整性错误"""
    
    def __init__(
        self,
        message: str,
        data_type: Optional[str] = None,
        expected: Any = None,
        actual: Any = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "data_type": data_type,
            "expected": expected,
            "actual": actual
        })
        super().__init__(
            message=message,
            code="DATA_INTEGRITY_ERROR",
            severity=ErrorSeverity.CRITICAL,
            details=details,
            recoverable=False,
            **kwargs
        )


class ExternalServiceError(BaseApplicationError):
    """外部服务错误"""
    
    def __init__(
        self,
        message: str,
        service_name: str,
        original_error: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        details.update({
            "service_name": service_name,
            "original_error": original_error
        })
        super().__init__(
            message=message,
            code="EXTERNAL_SERVICE_ERROR",
            severity=ErrorSeverity.ERROR,
            details=details,
            recoverable=True,
            **kwargs
        )