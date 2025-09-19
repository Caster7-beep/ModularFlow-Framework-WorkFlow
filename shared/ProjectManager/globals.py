"""
ProjectManager 全局变量
存储项目管理器的运行时状态和配置
"""

from typing import Dict, List, Any, Optional
from datetime import datetime

# 项目管理器配置
project_manager_config = {
    "name": "ProjectManager",
    "version": "1.0.0",
    "description": "统一项目管理面板",
    "author": "System"
}

# 运行时状态
is_initialized = False
is_running = False
verbose_output = True
debug_mode = False

# 项目管理状态
managed_projects: Dict[str, Any] = {}
active_processes: Dict[str, Any] = {}
port_registry: Dict[int, str] = {}

# 统计信息
total_projects = 0
running_projects = 0
failed_projects = 0
last_health_check: Optional[datetime] = None

# 错误日志
error_log: List[str] = []
last_error: Optional[str] = None

# 执行计数
execution_count = 0
health_check_count = 0

# 系统信息
system_info = {
    "platform": "unknown",
    "python_version": "unknown",
    "memory_usage": 0,
    "cpu_usage": 0
}

# 项目模板
project_templates = {
    "react": {
        "frontend": {
            "type": "react",
            "dev_command": "npm run dev",
            "build_command": "npm run build",
            "default_port": 3000
        },
        "backend": {
            "type": "api_gateway",
            "default_port": 8000
        }
    },
    "html": {
        "frontend": {
            "type": "html",
            "dev_command": "",
            "default_port": 8080
        },
        "backend": {
            "type": "api_gateway",
            "default_port": 8000
        }
    }
}

# 端口范围配置
port_ranges = {
    "frontend": {"start": 3000, "end": 3999},
    "backend": {"start": 6000, "end": 6999},
    "console": {"start": 8000, "end": 8999}
}

def reset_stats():
    """重置统计信息"""
    global execution_count, health_check_count, error_log, last_error
    execution_count = 0
    health_check_count = 0
    error_log.clear()
    last_error = None

def add_error(error_msg: str):
    """添加错误信息"""
    global last_error
    error_log.append(f"{datetime.now().isoformat()}: {error_msg}")
    last_error = error_msg
    
    # 保持错误日志不超过100条
    if len(error_log) > 100:
        error_log.pop(0)

def get_stats():
    """获取统计信息"""
    return {
        "total_projects": total_projects,
        "running_projects": running_projects,
        "failed_projects": failed_projects,
        "execution_count": execution_count,
        "health_check_count": health_check_count,
        "error_count": len(error_log),
        "last_health_check": last_health_check.isoformat() if last_health_check else None,
        "last_error": last_error
    }