"""
错误收集器
负责收集、存储和分析错误信息
"""

import os
import json
import asyncio
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict, field
from pathlib import Path
from collections import defaultdict, deque
from threading import Lock
import aiofiles


@dataclass
class ErrorReport:
    """错误报告数据类"""
    error_id: str
    timestamp: datetime
    error_type: str
    error_message: str
    error_code: str
    severity: str
    request_method: Optional[str] = None
    request_url: Optional[str] = None
    request_headers: Optional[Dict[str, str]] = None
    request_body: Optional[Any] = None
    response_status_code: Optional[int] = None
    response_body: Optional[Dict[str, Any]] = None
    stacktrace: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    workflow_id: Optional[str] = None
    node_id: Optional[str] = None
    execution_id: Optional[str] = None
    additional_context: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        data = asdict(self)
        # 转换datetime为ISO格式字符串
        data['timestamp'] = self.timestamp.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ErrorReport':
        """从字典创建ErrorReport"""
        # 转换时间戳字符串为datetime
        if isinstance(data.get('timestamp'), str):
            data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        return cls(**data)


class ErrorStatistics:
    """错误统计类"""
    
    def __init__(self):
        self.total_errors = 0
        self.error_counts_by_type = defaultdict(int)
        self.error_counts_by_severity = defaultdict(int)
        self.error_counts_by_code = defaultdict(int)
        self.error_counts_by_hour = defaultdict(int)
        self.recent_errors = deque(maxlen=100)
        self._lock = Lock()
    
    def add_error(self, error_report: ErrorReport):
        """添加错误到统计"""
        with self._lock:
            self.total_errors += 1
            self.error_counts_by_type[error_report.error_type] += 1
            self.error_counts_by_severity[error_report.severity] += 1
            self.error_counts_by_code[error_report.error_code] += 1
            
            # 按小时统计
            hour_key = error_report.timestamp.strftime("%Y-%m-%d %H:00:00")
            self.error_counts_by_hour[hour_key] += 1
            
            # 添加到最近错误列表
            self.recent_errors.append({
                'error_id': error_report.error_id,
                'timestamp': error_report.timestamp.isoformat(),
                'error_type': error_report.error_type,
                'error_message': error_report.error_message[:100],
                'severity': error_report.severity
            })
    
    def get_statistics(self) -> Dict[str, Any]:
        """获取统计信息"""
        with self._lock:
            return {
                'total_errors': self.total_errors,
                'errors_by_type': dict(self.error_counts_by_type),
                'errors_by_severity': dict(self.error_counts_by_severity),
                'errors_by_code': dict(self.error_counts_by_code),
                'errors_by_hour': dict(self.error_counts_by_hour),
                'recent_errors': list(self.recent_errors)
            }
    
    def reset(self):
        """重置统计"""
        with self._lock:
            self.total_errors = 0
            self.error_counts_by_type.clear()
            self.error_counts_by_severity.clear()
            self.error_counts_by_code.clear()
            self.error_counts_by_hour.clear()
            self.recent_errors.clear()


class ErrorCollector:
    """错误收集器"""
    
    def __init__(
        self,
        log_dir: str = "logs/errors",
        max_file_size: int = 10 * 1024 * 1024,  # 10MB
        max_files: int = 10,
        enable_file_logging: bool = True,
        enable_console_logging: bool = True,
        enable_statistics: bool = True
    ):
        self.log_dir = Path(log_dir)
        self.max_file_size = max_file_size
        self.max_files = max_files
        self.enable_file_logging = enable_file_logging
        self.enable_console_logging = enable_console_logging
        self.enable_statistics = enable_statistics
        
        # 创建日志目录
        if self.enable_file_logging:
            self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # 初始化统计
        self.statistics = ErrorStatistics() if enable_statistics else None
        
        # 设置日志记录器
        self.logger = self._setup_logger()
        
        # 错误缓冲区（用于批量写入）
        self.error_buffer = []
        self.buffer_lock = Lock()
        self.buffer_size = 10
        
        # 启动后台任务
        self._start_background_tasks()
    
    def _setup_logger(self) -> logging.Logger:
        """设置日志记录器"""
        logger = logging.getLogger("error_collector")
        logger.setLevel(logging.DEBUG)
        
        # 控制台处理器
        if self.enable_console_logging:
            console_handler = logging.StreamHandler()
            console_handler.setLevel(logging.ERROR)
            console_formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            console_handler.setFormatter(console_formatter)
            logger.addHandler(console_handler)
        
        # 文件处理器
        if self.enable_file_logging:
            file_handler = logging.handlers.RotatingFileHandler(
                self.log_dir / "error_collector.log",
                maxBytes=self.max_file_size,
                backupCount=self.max_files
            )
            file_handler.setLevel(logging.DEBUG)
            file_formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            file_handler.setFormatter(file_formatter)
            logger.addHandler(file_handler)
        
        return logger
    
    def _start_background_tasks(self):
        """启动后台任务"""
        # 定期刷新缓冲区
        asyncio.create_task(self._flush_buffer_periodically())
        
        # 定期清理旧日志
        asyncio.create_task(self._cleanup_old_logs())
    
    async def _flush_buffer_periodically(self):
        """定期刷新缓冲区"""
        while True:
            await asyncio.sleep(5)  # 每5秒刷新一次
            await self._flush_buffer()
    
    async def _cleanup_old_logs(self):
        """清理旧日志文件"""
        while True:
            await asyncio.sleep(3600)  # 每小时清理一次
            try:
                await self._cleanup_logs_older_than(days=7)
            except Exception as e:
                self.logger.error(f"Failed to cleanup old logs: {e}")
    
    async def collect(self, error_report: ErrorReport):
        """收集错误报告"""
        try:
            # 记录到日志
            self.logger.error(
                f"Error collected: {error_report.error_id} - "
                f"{error_report.error_type}: {error_report.error_message}"
            )
            
            # 更新统计
            if self.statistics:
                self.statistics.add_error(error_report)
            
            # 添加到缓冲区
            with self.buffer_lock:
                self.error_buffer.append(error_report)
                
                # 如果缓冲区满了，立即刷新
                if len(self.error_buffer) >= self.buffer_size:
                    await self._flush_buffer()
            
            # 保存到文件
            if self.enable_file_logging:
                await self._save_to_file(error_report)
            
            # 发送告警（如果是严重错误）
            if error_report.severity in ['critical', 'fatal']:
                await self._send_alert(error_report)
            
        except Exception as e:
            self.logger.error(f"Failed to collect error: {e}")
    
    async def _flush_buffer(self):
        """刷新缓冲区"""
        with self.buffer_lock:
            if not self.error_buffer:
                return
            
            errors_to_save = self.error_buffer.copy()
            self.error_buffer.clear()
        
        # 批量保存到文件
        if self.enable_file_logging and errors_to_save:
            await self._batch_save_to_file(errors_to_save)
    
    async def _save_to_file(self, error_report: ErrorReport):
        """保存错误报告到文件"""
        try:
            # 生成文件名
            date_str = error_report.timestamp.strftime("%Y-%m-%d")
            filename = self.log_dir / f"errors_{date_str}.jsonl"
            
            # 写入文件（JSONL格式）
            async with aiofiles.open(filename, mode='a', encoding='utf-8') as f:
                await f.write(json.dumps(error_report.to_dict()) + '\n')
            
        except Exception as e:
            self.logger.error(f"Failed to save error to file: {e}")
    
    async def _batch_save_to_file(self, error_reports: List[ErrorReport]):
        """批量保存错误报告到文件"""
        try:
            # 按日期分组
            reports_by_date = defaultdict(list)
            for report in error_reports:
                date_str = report.timestamp.strftime("%Y-%m-%d")
                reports_by_date[date_str].append(report)
            
            # 批量写入
            for date_str, reports in reports_by_date.items():
                filename = self.log_dir / f"errors_{date_str}.jsonl"
                
                async with aiofiles.open(filename, mode='a', encoding='utf-8') as f:
                    for report in reports:
                        await f.write(json.dumps(report.to_dict()) + '\n')
            
        except Exception as e:
            self.logger.error(f"Failed to batch save errors to file: {e}")
    
    async def _send_alert(self, error_report: ErrorReport):
        """发送告警"""
        try:
            # 这里可以集成邮件、短信、Slack等告警服务
            self.logger.critical(
                f"ALERT: Critical error occurred - {error_report.error_id}: "
                f"{error_report.error_type} - {error_report.error_message}"
            )
            
            # TODO: 实现实际的告警发送逻辑
            # await send_email_alert(error_report)
            # await send_slack_alert(error_report)
            
        except Exception as e:
            self.logger.error(f"Failed to send alert: {e}")
    
    async def _cleanup_logs_older_than(self, days: int = 7):
        """清理指定天数之前的日志"""
        try:
            cutoff_date = datetime.now() - timedelta(days=days)
            
            for log_file in self.log_dir.glob("errors_*.jsonl"):
                # 从文件名提取日期
                try:
                    date_str = log_file.stem.replace("errors_", "")
                    file_date = datetime.strptime(date_str, "%Y-%m-%d")
                    
                    if file_date < cutoff_date:
                        log_file.unlink()
                        self.logger.info(f"Deleted old log file: {log_file}")
                        
                except Exception as e:
                    self.logger.error(f"Failed to process log file {log_file}: {e}")
            
        except Exception as e:
            self.logger.error(f"Failed to cleanup old logs: {e}")
    
    async def get_errors(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        error_type: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 100
    ) -> List[ErrorReport]:
        """查询错误报告"""
        errors = []
        
        try:
            # 确定日期范围
            if not end_date:
                end_date = datetime.now()
            if not start_date:
                start_date = end_date - timedelta(days=1)
            
            # 读取相关日志文件
            current_date = start_date
            while current_date <= end_date:
                date_str = current_date.strftime("%Y-%m-%d")
                filename = self.log_dir / f"errors_{date_str}.jsonl"
                
                if filename.exists():
                    async with aiofiles.open(filename, mode='r', encoding='utf-8') as f:
                        async for line in f:
                            try:
                                data = json.loads(line.strip())
                                error_report = ErrorReport.from_dict(data)
                                
                                # 过滤
                                if error_type and error_report.error_type != error_type:
                                    continue
                                if severity and error_report.severity != severity:
                                    continue
                                
                                errors.append(error_report)
                                
                                if len(errors) >= limit:
                                    return errors
                                    
                            except Exception as e:
                                self.logger.error(f"Failed to parse error report: {e}")
                
                current_date += timedelta(days=1)
            
        except Exception as e:
            self.logger.error(f"Failed to get errors: {e}")
        
        return errors[:limit]
    
    def get_statistics(self) -> Dict[str, Any]:
        """获取错误统计信息"""
        if self.statistics:
            return self.statistics.get_statistics()
        return {}
    
    def reset_statistics(self):
        """重置统计信息"""
        if self.statistics:
            self.statistics.reset()


# 全局错误收集器实例
_error_collector = None


def get_error_collector() -> ErrorCollector:
    """获取全局错误收集器实例"""
    global _error_collector
    if _error_collector is None:
        _error_collector = ErrorCollector()
    return _error_collector