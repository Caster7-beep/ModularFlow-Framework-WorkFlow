"""
错误恢复管理器
提供重试策略、降级处理和熔断机制
"""

import asyncio
import time
import random
from typing import Optional, Callable, Any, Dict, List, TypeVar, Union
from dataclasses import dataclass
from enum import Enum
from functools import wraps
from collections import defaultdict, deque
from datetime import datetime, timedelta
import logging


T = TypeVar('T')


class RetryStrategy(Enum):
    """重试策略类型"""
    FIXED_DELAY = "fixed_delay"          # 固定延迟
    LINEAR_BACKOFF = "linear_backoff"    # 线性退避
    EXPONENTIAL_BACKOFF = "exponential_backoff"  # 指数退避
    RANDOM_JITTER = "random_jitter"      # 随机抖动


@dataclass
class RetryPolicy:
    """重试策略配置"""
    max_attempts: int = 3
    initial_delay: float = 1.0  # 秒
    max_delay: float = 60.0     # 秒
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL_BACKOFF
    backoff_multiplier: float = 2.0
    jitter_range: float = 0.1
    retriable_exceptions: Optional[List[type]] = None
    non_retriable_exceptions: Optional[List[type]] = None
    
    def calculate_delay(self, attempt: int) -> float:
        """计算重试延迟"""
        if self.strategy == RetryStrategy.FIXED_DELAY:
            delay = self.initial_delay
        elif self.strategy == RetryStrategy.LINEAR_BACKOFF:
            delay = self.initial_delay * attempt
        elif self.strategy == RetryStrategy.EXPONENTIAL_BACKOFF:
            delay = self.initial_delay * (self.backoff_multiplier ** (attempt - 1))
        elif self.strategy == RetryStrategy.RANDOM_JITTER:
            base_delay = self.initial_delay * (self.backoff_multiplier ** (attempt - 1))
            jitter = random.uniform(-self.jitter_range, self.jitter_range) * base_delay
            delay = base_delay + jitter
        else:
            delay = self.initial_delay
        
        # 限制最大延迟
        return min(delay, self.max_delay)
    
    def should_retry(self, exception: Exception) -> bool:
        """判断是否应该重试"""
        # 检查不可重试的异常
        if self.non_retriable_exceptions:
            for exc_type in self.non_retriable_exceptions:
                if isinstance(exception, exc_type):
                    return False
        
        # 检查可重试的异常
        if self.retriable_exceptions:
            for exc_type in self.retriable_exceptions:
                if isinstance(exception, exc_type):
                    return True
            return False
        
        # 默认所有异常都可重试
        return True


class CircuitBreakerState(Enum):
    """熔断器状态"""
    CLOSED = "closed"      # 关闭（正常工作）
    OPEN = "open"         # 开启（拒绝请求）
    HALF_OPEN = "half_open"  # 半开（测试恢复）


@dataclass
class CircuitBreakerConfig:
    """熔断器配置"""
    failure_threshold: int = 5           # 失败阈值
    success_threshold: int = 2           # 恢复阈值
    timeout: float = 60.0                # 熔断超时时间（秒）
    half_open_max_calls: int = 3         # 半开状态最大调用次数


class CircuitBreaker:
    """熔断器"""
    
    def __init__(self, name: str, config: CircuitBreakerConfig):
        self.name = name
        self.config = config
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = None
        self.half_open_calls = 0
        self.logger = logging.getLogger(f"circuit_breaker.{name}")
    
    def call_succeeded(self):
        """调用成功"""
        if self.state == CircuitBreakerState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.config.success_threshold:
                self._close()
        elif self.state == CircuitBreakerState.CLOSED:
            self.failure_count = 0
    
    def call_failed(self):
        """调用失败"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.state == CircuitBreakerState.CLOSED:
            if self.failure_count >= self.config.failure_threshold:
                self._open()
        elif self.state == CircuitBreakerState.HALF_OPEN:
            self._open()
    
    def can_execute(self) -> bool:
        """检查是否可以执行"""
        if self.state == CircuitBreakerState.CLOSED:
            return True
        elif self.state == CircuitBreakerState.OPEN:
            if self._should_attempt_reset():
                self._half_open()
                return True
            return False
        elif self.state == CircuitBreakerState.HALF_OPEN:
            if self.half_open_calls < self.config.half_open_max_calls:
                self.half_open_calls += 1
                return True
            return False
        
        return False
    
    def _should_attempt_reset(self) -> bool:
        """检查是否应该尝试恢复"""
        if self.last_failure_time:
            return time.time() - self.last_failure_time > self.config.timeout
        return False
    
    def _open(self):
        """打开熔断器"""
        self.state = CircuitBreakerState.OPEN
        self.logger.warning(f"Circuit breaker {self.name} opened")
    
    def _close(self):
        """关闭熔断器"""
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.half_open_calls = 0
        self.logger.info(f"Circuit breaker {self.name} closed")
    
    def _half_open(self):
        """半开熔断器"""
        self.state = CircuitBreakerState.HALF_OPEN
        self.success_count = 0
        self.half_open_calls = 0
        self.logger.info(f"Circuit breaker {self.name} half-opened")


class RecoveryManager:
    """错误恢复管理器"""
    
    def __init__(self):
        self.circuit_breakers: Dict[str, CircuitBreaker] = {}
        self.fallback_handlers: Dict[str, Callable] = {}
        self.retry_policies: Dict[str, RetryPolicy] = {}
        self.call_statistics = defaultdict(lambda: {
            'total_calls': 0,
            'successful_calls': 0,
            'failed_calls': 0,
            'retried_calls': 0,
            'fallback_calls': 0,
            'circuit_breaker_rejections': 0
        })
        self.logger = logging.getLogger("recovery_manager")
    
    def register_circuit_breaker(
        self,
        name: str,
        config: Optional[CircuitBreakerConfig] = None
    ):
        """注册熔断器"""
        if config is None:
            config = CircuitBreakerConfig()
        self.circuit_breakers[name] = CircuitBreaker(name, config)
    
    def register_fallback(self, name: str, handler: Callable):
        """注册降级处理器"""
        self.fallback_handlers[name] = handler
    
    def register_retry_policy(self, name: str, policy: RetryPolicy):
        """注册重试策略"""
        self.retry_policies[name] = policy
    
    async def execute_with_recovery(
        self,
        func: Callable[..., T],
        *args,
        service_name: Optional[str] = None,
        retry_policy: Optional[Union[str, RetryPolicy]] = None,
        fallback: Optional[Union[str, Callable]] = None,
        circuit_breaker: Optional[Union[str, bool]] = None,
        **kwargs
    ) -> T:
        """
        执行函数并提供恢复机制
        
        Args:
            func: 要执行的函数
            service_name: 服务名称
            retry_policy: 重试策略（策略名称或RetryPolicy对象）
            fallback: 降级处理（处理器名称或函数）
            circuit_breaker: 熔断器（熔断器名称或True使用默认配置）
            
        Returns:
            函数执行结果或降级结果
        """
        service_name = service_name or func.__name__
        self.call_statistics[service_name]['total_calls'] += 1
        
        # 检查熔断器
        if circuit_breaker:
            breaker = self._get_circuit_breaker(service_name, circuit_breaker)
            if not breaker.can_execute():
                self.call_statistics[service_name]['circuit_breaker_rejections'] += 1
                self.logger.warning(f"Circuit breaker {service_name} is open")
                return await self._execute_fallback(service_name, fallback, *args, **kwargs)
        else:
            breaker = None
        
        # 获取重试策略
        if retry_policy:
            policy = self._get_retry_policy(retry_policy)
        else:
            policy = RetryPolicy(max_attempts=1)
        
        # 执行重试逻辑
        last_exception = None
        for attempt in range(1, policy.max_attempts + 1):
            try:
                # 执行函数
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)
                
                # 标记成功
                self.call_statistics[service_name]['successful_calls'] += 1
                if breaker:
                    breaker.call_succeeded()
                
                return result
                
            except Exception as e:
                last_exception = e
                self.logger.warning(
                    f"Attempt {attempt}/{policy.max_attempts} failed for {service_name}: {e}"
                )
                
                # 检查是否应该重试
                if not policy.should_retry(e) or attempt >= policy.max_attempts:
                    break
                
                # 计算延迟
                delay = policy.calculate_delay(attempt)
                self.logger.info(f"Retrying {service_name} after {delay:.2f} seconds")
                await asyncio.sleep(delay)
                
                self.call_statistics[service_name]['retried_calls'] += 1
        
        # 所有重试都失败了
        self.call_statistics[service_name]['failed_calls'] += 1
        if breaker:
            breaker.call_failed()
        
        # 执行降级处理
        if fallback:
            return await self._execute_fallback(
                service_name, fallback, *args, 
                original_error=last_exception, **kwargs
            )
        
        # 没有降级处理，抛出异常
        raise last_exception
    
    def _get_circuit_breaker(
        self,
        service_name: str,
        circuit_breaker: Union[str, bool]
    ) -> CircuitBreaker:
        """获取熔断器"""
        if isinstance(circuit_breaker, str):
            # 使用指定的熔断器
            if circuit_breaker in self.circuit_breakers:
                return self.circuit_breakers[circuit_breaker]
        
        # 为服务创建默认熔断器
        if service_name not in self.circuit_breakers:
            self.register_circuit_breaker(service_name)
        
        return self.circuit_breakers[service_name]
    
    def _get_retry_policy(
        self,
        retry_policy: Union[str, RetryPolicy]
    ) -> RetryPolicy:
        """获取重试策略"""
        if isinstance(retry_policy, str):
            if retry_policy in self.retry_policies:
                return self.retry_policies[retry_policy]
            else:
                self.logger.warning(f"Retry policy {retry_policy} not found, using default")
                return RetryPolicy()
        elif isinstance(retry_policy, RetryPolicy):
            return retry_policy
        else:
            return RetryPolicy()
    
    async def _execute_fallback(
        self,
        service_name: str,
        fallback: Optional[Union[str, Callable]],
        *args,
        **kwargs
    ) -> Any:
        """执行降级处理"""
        self.call_statistics[service_name]['fallback_calls'] += 1
        
        if fallback is None:
            raise ServiceUnavailableError(f"Service {service_name} is unavailable")
        
        if isinstance(fallback, str):
            if fallback in self.fallback_handlers:
                handler = self.fallback_handlers[fallback]
            else:
                raise ValueError(f"Fallback handler {fallback} not found")
        else:
            handler = fallback
        
        try:
            if asyncio.iscoroutinefunction(handler):
                return await handler(*args, **kwargs)
            else:
                return handler(*args, **kwargs)
        except Exception as e:
            self.logger.error(f"Fallback failed for {service_name}: {e}")
            raise
    
    def get_statistics(self, service_name: Optional[str] = None) -> Dict[str, Any]:
        """获取统计信息"""
        if service_name:
            return dict(self.call_statistics.get(service_name, {}))
        else:
            return dict(self.call_statistics)
    
    def reset_statistics(self, service_name: Optional[str] = None):
        """重置统计信息"""
        if service_name:
            if service_name in self.call_statistics:
                self.call_statistics[service_name] = {
                    'total_calls': 0,
                    'successful_calls': 0,
                    'failed_calls': 0,
                    'retried_calls': 0,
                    'fallback_calls': 0,
                    'circuit_breaker_rejections': 0
                }
        else:
            self.call_statistics.clear()


def with_recovery(
    service_name: Optional[str] = None,
    retry_policy: Optional[Union[str, RetryPolicy]] = None,
    fallback: Optional[Union[str, Callable]] = None,
    circuit_breaker: Optional[Union[str, bool]] = None
):
    """
    装饰器：为函数添加错误恢复机制
    
    使用示例：
    @with_recovery(
        service_name="user_service",
        retry_policy=RetryPolicy(max_attempts=3),
        fallback=lambda: {"error": "Service unavailable"},
        circuit_breaker=True
    )
    async def get_user(user_id: str):
        # 函数实现
        pass
    """
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            manager = get_recovery_manager()
            return await manager.execute_with_recovery(
                func, *args,
                service_name=service_name or func.__name__,
                retry_policy=retry_policy,
                fallback=fallback,
                circuit_breaker=circuit_breaker,
                **kwargs
            )
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # 对于同步函数，需要在事件循环中运行
            loop = asyncio.get_event_loop()
            manager = get_recovery_manager()
            return loop.run_until_complete(
                manager.execute_with_recovery(
                    func, *args,
                    service_name=service_name or func.__name__,
                    retry_policy=retry_policy,
                    fallback=fallback,
                    circuit_breaker=circuit_breaker,
                    **kwargs
                )
            )
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


# 全局恢复管理器实例
_recovery_manager = None


def get_recovery_manager() -> RecoveryManager:
    """获取全局恢复管理器实例"""
    global _recovery_manager
    if _recovery_manager is None:
        _recovery_manager = RecoveryManager()
    return _recovery_manager


# 导入ServiceUnavailableError
from .exceptions import ServiceUnavailableError