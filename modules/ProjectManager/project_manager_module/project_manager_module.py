"""
项目管理核心模块
负责统一管理前后端项目的生命周期、端口分配和状态监控
"""

import json
import subprocess
import threading
import time
import requests
import psutil
import logging
from typing import Dict, List, Optional, Any
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field

from core.function_registry import register_function
from core.services import get_current_globals

# 配置日志
logger = logging.getLogger(__name__)


@dataclass
class ProjectStatus:
    """项目状态信息"""
    name: str
    namespace: str
    enabled: bool = True
    frontend_running: bool = False
    backend_running: bool = False
    frontend_port: Optional[int] = None
    backend_port: Optional[int] = None
    frontend_pid: Optional[int] = None
    backend_pid: Optional[int] = None
    start_time: Optional[datetime] = None
    last_health_check: Optional[datetime] = None
    health_status: str = "unknown"  # healthy, unhealthy, unknown
    errors: List[str] = field(default_factory=list)


class ProjectManager:
    """
    统一项目管理器
    
    负责管理所有注册项目的生命周期，包括：
    - 项目启动/停止
    - 端口管理
    - 健康检查
    - 状态监控
    """
    
    def __init__(self):
        self.projects: Dict[str, ProjectStatus] = {}
        self.managed_projects_config: List[Dict[str, Any]] = []
        self.processes: Dict[str, subprocess.Popen] = {}
        self.health_check_thread: Optional[threading.Thread] = None
        self.health_check_running = False
        
        # 加载项目配置
        self._load_managed_projects_config()
        
        # 初始化项目状态
        self._initialize_project_status()
        
        # 启动健康检查
        self._start_health_check()
    
    def _load_managed_projects_config(self):
        """从ProjectManager配置文件加载被管理的项目配置"""
        try:
            config_path = Path("backend_projects/ProjectManager/config.json")
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                self.managed_projects_config = config.get("managed_projects", [])
                logger.info(f"✓ 加载了 {len(self.managed_projects_config)} 个被管理项目配置")
            else:
                logger.warning("⚠️ ProjectManager配置文件不存在")
        except Exception as e:
            logger.error(f"❌ 加载被管理项目配置失败: {e}")
    
    def _initialize_project_status(self):
        """初始化所有项目的状态"""
        for project_config in self.managed_projects_config:
            project_name = project_config["name"]
            namespace = project_config["namespace"]
            
            self.projects[project_name] = ProjectStatus(
                name=project_name,
                namespace=namespace,
                enabled=project_config.get("enabled", True),
                frontend_port=project_config.get("ports", {}).get("frontend_dev"),
                backend_port=project_config.get("ports", {}).get("api_gateway")
            )
    
    def _start_health_check(self):
        """启动健康检查线程"""
        if not self.health_check_running:
            self.health_check_running = True
            self.health_check_thread = threading.Thread(
                target=self._health_check_loop, 
                daemon=True
            )
            self.health_check_thread.start()
            logger.info("✓ 健康检查线程已启动")
    
    def _health_check_loop(self):
        """健康检查循环"""
        while self.health_check_running:
            try:
                for project_name, status in self.projects.items():
                    if status.enabled:
                        self._check_project_health(project_name)
                time.sleep(30)  # 每30秒检查一次
            except Exception as e:
                logger.error(f"健康检查异常: {e}")
                time.sleep(10)
    
    def _check_project_health(self, project_name: str):
        """检查单个项目的健康状态"""
        if project_name not in self.projects:
            return
        
        status = self.projects[project_name]
        project_config = next(
            (p for p in self.managed_projects_config if p["name"] == project_name), 
            None
        )
        
        if not project_config:
            return
        
        health_checks = project_config.get("health_checks", {})
        status.last_health_check = datetime.now()
        status.errors.clear()
        
        # 检查前端健康状态
        if status.frontend_running and status.frontend_port:
            frontend_url = health_checks.get("frontend_dev_url", f"http://localhost:{status.frontend_port}")
            try:
                response = requests.get(frontend_url, timeout=5)
                if response.status_code == 200:
                    status.frontend_running = True
                else:
                    status.errors.append(f"前端响应异常: {response.status_code}")
                    status.frontend_running = False
            except Exception as e:
                status.errors.append(f"前端连接失败: {str(e)}")
                status.frontend_running = False
        
        # 检查后端健康状态
        if status.backend_running and status.backend_port:
            api_docs_url = health_checks.get("api_docs_url", f"http://localhost:{status.backend_port}/docs")
            try:
                response = requests.get(f"http://localhost:{status.backend_port}/api/v1/health", timeout=5)
                if response.status_code == 200:
                    status.backend_running = True
                else:
                    status.errors.append(f"后端响应异常: {response.status_code}")
                    status.backend_running = False
            except Exception as e:
                status.errors.append(f"后端连接失败: {str(e)}")
                status.backend_running = False
        
        # 更新整体健康状态
        if status.errors:
            status.health_status = "unhealthy"
        elif status.frontend_running or status.backend_running:
            status.health_status = "healthy"
        else:
            status.health_status = "unknown"
    
    def start_project(self, project_name: str, component: str = "all") -> Dict[str, Any]:
        """
        启动项目
        
        Args:
            project_name: 项目名称
            component: 启动组件 ("frontend", "backend", "all")
        
        Returns:
            启动结果
        """
        if project_name not in self.projects:
            return {"success": False, "error": f"项目 {project_name} 不存在"}
        
        project_config = next(
            (p for p in self.managed_projects_config if p["name"] == project_name), 
            None
        )
        
        if not project_config:
            return {"success": False, "error": f"项目 {project_name} 配置不存在"}
        
        status = self.projects[project_name]
        results = {"success": True, "started_components": []}
        
        try:
            # 启动后端
            if component in ["backend", "all"]:
                backend_config = project_config.get("backend", {})
                if backend_config.get("enabled", True):
                    start_command = backend_config.get("start_command")
                    if start_command:
                        logger.info(f"启动 {project_name} 后端: {start_command}")
                        
                        # 启动后端进程
                        process = subprocess.Popen(
                            start_command.split(),
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            creationflags=subprocess.CREATE_NEW_CONSOLE if hasattr(subprocess, 'CREATE_NEW_CONSOLE') else 0
                        )
                        
                        self.processes[f"{project_name}_backend"] = process
                        status.backend_pid = process.pid
                        status.backend_running = True
                        status.start_time = datetime.now()
                        results["started_components"].append("backend")
                        
                        logger.info(f"✓ {project_name} 后端启动成功 (PID: {process.pid})")
            
            # 启动前端
            if component in ["frontend", "all"]:
                frontend_config = project_config.get("frontend", {})
                if frontend_config.get("type") == "react":
                    # React项目需要特殊处理
                    dev_command = frontend_config.get("dev_command", "npm run dev")
                    project_path = Path(frontend_config.get("path", ""))
                    
                    if project_path.exists():
                        logger.info(f"启动 {project_name} 前端: {dev_command}")
                        
                        process = subprocess.Popen(
                            dev_command.split(),
                            cwd=str(project_path),
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            creationflags=subprocess.CREATE_NEW_CONSOLE if hasattr(subprocess, 'CREATE_NEW_CONSOLE') else 0
                        )
                        
                        self.processes[f"{project_name}_frontend"] = process
                        status.frontend_pid = process.pid
                        status.frontend_running = True
                        results["started_components"].append("frontend")
                        
                        logger.info(f"✓ {project_name} 前端启动成功 (PID: {process.pid})")
                
                # 启动控制台（如果存在）
                console_config = project_config.get("console", {})
                if console_config.get("enabled", False):
                    # 使用web_server_module启动静态文件服务器
                    from modules.web_server_module import get_web_server
                    web_server = get_web_server()
                    
                    console_success = web_server.start_project(project_name, open_browser=False)
                    if console_success:
                        results["started_components"].append("console")
                        logger.info(f"✓ {project_name} 控制台启动成功")
            
            return results
            
        except Exception as e:
            logger.error(f"❌ 启动项目 {project_name} 失败: {e}")
            return {"success": False, "error": str(e)}
    
    def stop_project(self, project_name: str, component: str = "all") -> Dict[str, Any]:
        """
        停止项目
        
        Args:
            project_name: 项目名称
            component: 停止组件 ("frontend", "backend", "all")
        
        Returns:
            停止结果
        """
        if project_name not in self.projects:
            return {"success": False, "error": f"项目 {project_name} 不存在"}
        
        status = self.projects[project_name]
        results = {"success": True, "stopped_components": []}
        
        try:
            # 停止后端
            if component in ["backend", "all"]:
                backend_process_key = f"{project_name}_backend"
                if backend_process_key in self.processes:
                    process = self.processes[backend_process_key]
                    try:
                        # 终止进程组
                        if hasattr(process, 'terminate'):
                            process.terminate()
                            process.wait(timeout=10)
                        
                        del self.processes[backend_process_key]
                        status.backend_running = False
                        status.backend_pid = None
                        results["stopped_components"].append("backend")
                        
                        logger.info(f"✓ {project_name} 后端已停止")
                    except Exception as e:
                        logger.warning(f"停止 {project_name} 后端时出现问题: {e}")
            
            # 停止前端
            if component in ["frontend", "all"]:
                frontend_process_key = f"{project_name}_frontend"
                if frontend_process_key in self.processes:
                    process = self.processes[frontend_process_key]
                    try:
                        process.terminate()
                        process.wait(timeout=10)
                        
                        del self.processes[frontend_process_key]
                        status.frontend_running = False
                        status.frontend_pid = None
                        results["stopped_components"].append("frontend")
                        
                        logger.info(f"✓ {project_name} 前端已停止")
                    except Exception as e:
                        logger.warning(f"停止 {project_name} 前端时出现问题: {e}")
                
                # 停止控制台
                try:
                    from modules.web_server_module import get_web_server
                    web_server = get_web_server()
                    web_server.stop_project(project_name)
                    results["stopped_components"].append("console")
                except Exception as e:
                    logger.warning(f"停止 {project_name} 控制台时出现问题: {e}")
            
            return results
            
        except Exception as e:
            logger.error(f"❌ 停止项目 {project_name} 失败: {e}")
            return {"success": False, "error": str(e)}
    
    def restart_project(self, project_name: str, component: str = "all") -> Dict[str, Any]:
        """重启项目"""
        stop_result = self.stop_project(project_name, component)
        if not stop_result["success"]:
            return stop_result
        
        # 等待进程完全停止
        time.sleep(3)
        
        return self.start_project(project_name, component)
    
    def get_project_status(self, project_name: str = None) -> Dict[str, Any]:
        """获取项目状态"""
        if project_name:
            if project_name not in self.projects:
                return {"error": f"项目 {project_name} 不存在"}
            
            status = self.projects[project_name]
            return {
                "name": status.name,
                "namespace": status.namespace,
                "enabled": status.enabled,
                "frontend_running": status.frontend_running,
                "backend_running": status.backend_running,
                "frontend_port": status.frontend_port,
                "backend_port": status.backend_port,
                "frontend_pid": status.frontend_pid,
                "backend_pid": status.backend_pid,
                "start_time": status.start_time.isoformat() if status.start_time else None,
                "last_health_check": status.last_health_check.isoformat() if status.last_health_check else None,
                "health_status": status.health_status,
                "errors": status.errors
            }
        else:
            # 返回所有项目状态
            return {
                name: {
                    "name": status.name,
                    "namespace": status.namespace,
                    "enabled": status.enabled,
                    "frontend_running": status.frontend_running,
                    "backend_running": status.backend_running,
                    "frontend_port": status.frontend_port,
                    "backend_port": status.backend_port,
                    "health_status": status.health_status,
                    "errors": len(status.errors)
                }
                for name, status in self.projects.items()
            }
    
    def get_port_usage(self) -> Dict[str, Any]:
        """获取端口使用情况"""
        port_usage = {}
        
        for project_name, status in self.projects.items():
            project_ports = {}
            
            if status.frontend_port:
                project_ports["frontend"] = {
                    "port": status.frontend_port,
                    "running": status.frontend_running,
                    "pid": status.frontend_pid
                }
            
            if status.backend_port:
                project_ports["backend"] = {
                    "port": status.backend_port,
                    "running": status.backend_running,
                    "pid": status.backend_pid
                }
            
            port_usage[project_name] = project_ports
        
        return port_usage
    
    def cleanup(self):
        """清理资源"""
        self.health_check_running = False
        
        if self.health_check_thread and self.health_check_thread.is_alive():
            self.health_check_thread.join(timeout=5)
        
        # 停止所有进程
        for process_name, process in self.processes.items():
            try:
                if process.poll() is None:  # 进程仍在运行
                    process.terminate()
                    process.wait(timeout=5)
            except Exception as e:
                logger.warning(f"清理进程 {process_name} 时出现问题: {e}")


# 全局项目管理器实例
_project_manager_instance = None

def get_project_manager() -> ProjectManager:
    """获取项目管理器单例"""
    global _project_manager_instance
    if _project_manager_instance is None:
        _project_manager_instance = ProjectManager()
    return _project_manager_instance


# 注册函数到ModularFlow Framework
@register_function(name="project_manager.start_project", outputs=["result"])
def start_managed_project(project_name: str, component: str = "all"):
    """启动被管理的项目"""
    manager = get_project_manager()
    return manager.start_project(project_name, component)

@register_function(name="project_manager.stop_project", outputs=["result"])
def stop_managed_project(project_name: str, component: str = "all"):
    """停止被管理的项目"""
    manager = get_project_manager()
    return manager.stop_project(project_name, component)

@register_function(name="project_manager.restart_project", outputs=["result"])
def restart_managed_project(project_name: str, component: str = "all"):
    """重启被管理的项目"""
    manager = get_project_manager()
    return manager.restart_project(project_name, component)

@register_function(name="project_manager.get_status", outputs=["status"])
def get_managed_project_status(project_name: str = None):
    """获取项目状态"""
    manager = get_project_manager()
    return manager.get_project_status(project_name)

@register_function(name="project_manager.get_ports", outputs=["ports"])
def get_port_usage():
    """获取端口使用情况"""
    manager = get_project_manager()
    return manager.get_port_usage()

@register_function(name="project_manager.health_check", outputs=["health"])
def perform_health_check():
    """执行健康检查"""
    manager = get_project_manager()
    results = {}
    
    for project_name in manager.projects.keys():
        manager._check_project_health(project_name)
        results[project_name] = manager.get_project_status(project_name)
    
    return results