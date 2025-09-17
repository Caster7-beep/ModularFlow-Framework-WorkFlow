"""
错误处理模块
提供统一的异常处理、错误日志收集和错误恢复机制
"""

from .error_handler import ErrorHandler, ErrorHandlerMiddleware
from .error_collector import ErrorCollector, ErrorReport
from .recovery_manager import RecoveryManager, RetryPolicy
from .exceptions import (
    WorkflowError, APIError, ValidationError, 
    ResourceNotFoundError, AuthenticationError,
    RateLimitError, ServiceUnavailableError
)

__all__ = [
    'ErrorHandler',
    'ErrorHandlerMiddleware', 
    'ErrorCollector',
    'ErrorReport',
    'RecoveryManager',
    'RetryPolicy',
    'WorkflowError',
    'APIError', 
    'ValidationError',
    'ResourceNotFoundError',
    'AuthenticationError',
    'RateLimitError',
    'ServiceUnavailableError'
]