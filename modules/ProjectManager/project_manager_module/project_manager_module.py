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
import os
import shutil
import tempfile
import zipfile
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
            config_path = Path("shared/ProjectManager/config.json")
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                self.managed_projects_config = config.get("managed_projects", [])
                logger.info(f"✓ 加载了 {len(self.managed_projects_config)} 个被管理项目配置")
            else:
                logger.warning("⚠️ ProjectManager配置文件不存在: shared/ProjectManager/config.json")
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
    
    def _check_command_availability(self, command: str) -> bool:
        """检查命令是否可用"""
        try:
            # 提取命令的第一部分
            cmd_name = command.split()[0]
            return shutil.which(cmd_name) is not None
        except:
            return False
    
    def _execute_command_safely(self, command: str, cwd: str = None, project_name: str = "") -> subprocess.Popen:
        """安全执行命令，处理Windows特殊情况"""
        try:
            # 检查命令是否可用
            if not self._check_command_availability(command):
                raise FileNotFoundError(f"命令不可用: {command.split()[0]}")
            
            # 在Windows上，使用shell=True并设置正确的环境
            env = os.environ.copy()
            
            # 确保PATH包含npm路径
            if "npm" in command and os.name == 'nt':
                # 添加常见的npm路径
                npm_paths = [
                    r"C:\Program Files\nodejs",
                    r"C:\Program Files (x86)\nodejs",
                    os.path.expanduser(r"~\AppData\Roaming\npm")
                ]
                current_path = env.get("PATH", "")
                for npm_path in npm_paths:
                    if os.path.exists(npm_path) and npm_path not in current_path:
                        env["PATH"] = f"{npm_path};{current_path}"
            
            logger.info(f"执行命令: {command} (工作目录: {cwd or '当前目录'})")
            
            # 在Windows上，避免使用PIPE和CREATE_NEW_CONSOLE同时使用
            # 这会导致连接重置错误
            if os.name == 'nt':
                process = subprocess.Popen(
                    command,
                    shell=True,
                    cwd=cwd,
                    env=env,
                    creationflags=subprocess.CREATE_NEW_CONSOLE
                )
            else:
                process = subprocess.Popen(
                    command,
                    shell=True,
                    cwd=cwd,
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
            
            return process
            
        except Exception as e:
            logger.error(f"❌ 执行命令失败 {command}: {e}")
            raise
    
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
                        process = self._execute_command_safely(
                            start_command,
                            project_name=project_name
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
                        
                        # 使用改进的命令执行方法
                        process = self._execute_command_safely(
                            dev_command,
                            cwd=str(project_path),
                            project_name=project_name
                        )
                        
                        self.processes[f"{project_name}_frontend"] = process
                        status.frontend_pid = process.pid
                        status.frontend_running = True
                        results["started_components"].append("frontend")
                        
                        logger.info(f"✓ {project_name} 前端启动成功 (PID: {process.pid})")
                    else:
                        logger.error(f"❌ {project_name} 前端路径不存在: {project_path}")
                        results["success"] = False
                        results["error"] = f"前端路径不存在: {project_path}"
                
                # 启动控制台（如果存在且不同于主前端）
                console_config = project_config.get("console", {})
                if console_config.get("enabled", False):
                    console_port = console_config.get("port")
                    console_path = console_config.get("path")
                    
                    # 只有当控制台端口与前端端口不同时才启动独立控制台
                    if console_port and console_port != frontend_config.get("port"):
                        try:
                            from modules.web_server_module.web_server_module import StaticFileServer
                            
                            # 直接启动静态文件服务器
                            static_server = StaticFileServer(console_path, console_port)
                            static_server.start()
                            
                            results["started_components"].append("console")
                            logger.info(f"✓ {project_name} 控制台启动成功 (端口: {console_port})")
                        except Exception as e:
                            logger.warning(f"⚠️ {project_name} 控制台启动失败: {e}")
            
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
                        # 强制终止进程及其子进程
                        self._terminate_process_tree(process)
                        
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
                        # 强制终止进程及其子进程
                        self._terminate_process_tree(process)
                        
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
    
    def _terminate_process_tree(self, process: subprocess.Popen):
        """终止进程及其所有子进程"""
        try:
            if process.poll() is None:  # 进程仍在运行
                # 在Windows上，尝试终止整个进程树
                if os.name == 'nt':
                    try:
                        # 使用taskkill命令终止进程树
                        subprocess.run(
                            ['taskkill', '/F', '/T', '/PID', str(process.pid)],
                            check=False,
                            capture_output=True
                        )
                        logger.info(f"✓ 使用taskkill终止进程树 PID: {process.pid}")
                    except Exception as e:
                        logger.warning(f"taskkill失败，使用标准方法: {e}")
                        process.terminate()
                        process.wait(timeout=10)
                else:
                    # Unix系统使用进程组终止
                    try:
                        import signal
                        os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                        process.wait(timeout=10)
                    except Exception:
                        process.terminate()
                        process.wait(timeout=10)
        except Exception as e:
            logger.error(f"终止进程树失败: {e}")
            # 最后尝试强制终止
            try:
                process.kill()
            except:
                pass
    
    def cleanup(self):
        """清理资源"""
        logger.info("🧹 开始清理项目管理器资源...")
        
        # 停止健康检查线程
        self.health_check_running = False
        if self.health_check_thread and self.health_check_thread.is_alive():
            self.health_check_thread.join(timeout=5)
            logger.info("✓ 健康检查线程已停止")
        
        # 停止所有进程
        processes_to_clean = list(self.processes.items())
        for process_name, process in processes_to_clean:
            try:
                logger.info(f"🛑 停止进程: {process_name} (PID: {process.pid})")
                self._terminate_process_tree(process)
                logger.info(f"✓ 进程 {process_name} 已停止")
            except Exception as e:
                logger.warning(f"清理进程 {process_name} 时出现问题: {e}")
        
        # 清空进程字典
        self.processes.clear()
        
        # 重置所有项目状态
        for project_name, status in self.projects.items():
            status.frontend_running = False
            status.backend_running = False
            status.frontend_pid = None
            status.backend_pid = None
            status.health_status = "unknown"
        
        logger.info("✅ 项目管理器资源清理完成")


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

@register_function(name="project_manager.get_managed_projects", outputs=["projects"])
def get_managed_projects():
    """获取可管理项目列表"""
    manager = get_project_manager()
    return manager.managed_projects_config

@register_function(name="project_manager.import_project", outputs=["result"])
def import_project(project_archive):
    """导入项目"""
    manager = get_project_manager()
    
    try:
        # 获取上传的文件
        if hasattr(project_archive, 'file'):
            # FastAPI 风格
            file_content = project_archive.file.read()
            filename = project_archive.filename
        elif hasattr(project_archive, 'name'):
            # Flask 风格
            file_content = project_archive.read()
            filename = project_archive.name
        else:
            # 直接传递二进制内容
            file_content = project_archive
            filename = "project_archive.zip"
        
        # 创建临时目录
        import tempfile
        import os
        import zipfile
        import shutil
        import json
        from pathlib import Path
        
        temp_dir = tempfile.mkdtemp(prefix="project_import_")
        archive_path = os.path.join(temp_dir, filename)
        
        # 保存文件
        with open(archive_path, 'wb') as f:
            f.write(file_content)
        
        # 解压文件
        extract_path = os.path.join(temp_dir, "extracted")
        os.makedirs(extract_path, exist_ok=True)
        
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            zip_ref.extractall(extract_path)
        
        # 检查项目配置
        project_config_path = os.path.join(extract_path, "project_config.json")
        if not os.path.exists(project_config_path):
            raise ValueError("项目配置文件不存在")
        
        with open(project_config_path, 'r', encoding='utf-8') as f:
            project_config = json.load(f)
        
        # 获取项目名称和命名空间
        if "name" not in project_config or "namespace" not in project_config:
            raise ValueError("项目配置缺少必要字段: name 或 namespace")
        
        project_name = project_config["name"]
        project_namespace = project_config["namespace"]
        
        # 检查目录结构
        required_folders = ["frontend_projects", "backend_projects", "modules", "shared"]
        for folder in required_folders:
            if not os.path.exists(os.path.join(extract_path, folder)):
                raise ValueError(f"项目缺少必要目录: {folder}")
        
        # 复制文件到对应目录
        framework_root = Path(__file__).parent.parent.parent.parent
        
        # 创建目标目录
        for folder in required_folders:
            source_dir = os.path.join(extract_path, folder, project_namespace)
            if os.path.exists(source_dir):
                target_dir = os.path.join(framework_root, folder, project_namespace)
                os.makedirs(os.path.dirname(target_dir), exist_ok=True)
                
                # 如果目标目录已存在，先备份
                if os.path.exists(target_dir):
                    backup_dir = f"{target_dir}_backup_{int(time.time())}"
                    shutil.move(target_dir, backup_dir)
                
                # 复制文件
                shutil.copytree(source_dir, target_dir)
                logger.info(f"✓ 已复制 {source_dir} 到 {target_dir}")
        
        # 更新项目管理器配置
        config_path = os.path.join(framework_root, "shared/ProjectManager/config.json")
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            # 检查项目是否已存在
            existing_project = next((p for p in config.get("managed_projects", [])
                                     if p["name"] == project_name), None)
            
            if existing_project:
                # 更新现有项目
                for key, value in project_config.items():
                    existing_project[key] = value
            else:
                # 添加新项目
                if "managed_projects" not in config:
                    config["managed_projects"] = []
                config["managed_projects"].append(project_config)
            
            # 保存配置
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            
            # 重新加载配置
            manager._load_managed_projects_config()
            manager._initialize_project_status()
        
        # 清理临时文件
        shutil.rmtree(temp_dir)
        
        return {
            "success": True,
            "project_name": project_name,
            "message": f"项目 {project_name} 导入成功"
        }
        
    except Exception as e:
        logger.error(f"导入项目失败: {str(e)}")
        return {"success": False, "error": str(e)}

@register_function(name="project_manager.delete_project", outputs=["result"])
def delete_project(project_name: str):
    """删除项目"""
    manager = get_project_manager()
    
    try:
        # 检查项目是否存在
        project_config = next((p for p in manager.managed_projects_config
                              if p["name"] == project_name), None)
        
        if not project_config:
            return {"success": False, "error": f"项目 {project_name} 不存在"}
        
        # 首先停止项目
        if project_name in manager.projects:
            manager.stop_project(project_name)
        
        project_namespace = project_config.get("namespace", project_name)
        framework_root = Path(__file__).parent.parent.parent.parent
        
        # 获取项目管理配置
        config_path = os.path.join(framework_root, "shared/ProjectManager/config.json")
        if not os.path.exists(config_path):
            return {"success": False, "error": "项目管理配置不存在"}
        
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # 创建备份目录
        backup_root = config.get("project_management", {}).get("project_operations", {}).get("backup_directory", "backups")
        backup_dir = os.path.join(framework_root, backup_root, f"{project_name}_{int(time.time())}")
        os.makedirs(backup_dir, exist_ok=True)
        
        # 备份项目文件
        folders_to_check = ["frontend_projects", "backend_projects", "modules", "shared"]
        backed_up_paths = []
        
        for folder in folders_to_check:
            project_dir = os.path.join(framework_root, folder, project_namespace)
            if os.path.exists(project_dir):
                backup_target = os.path.join(backup_dir, folder)
                os.makedirs(backup_target, exist_ok=True)
                
                # 复制到备份目录
                shutil.copytree(project_dir, os.path.join(backup_target, project_namespace))
                backed_up_paths.append(project_dir)
                
                # 删除原目录
                shutil.rmtree(project_dir)
                logger.info(f"✓ 已删除 {project_dir}")
        
        # 从配置中移除项目
        config["managed_projects"] = [p for p in config.get("managed_projects", [])
                                     if p["name"] != project_name]
        
        # 保存配置
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        
        # 重新加载配置
        manager._load_managed_projects_config()
        
        # 从状态中移除项目
        if project_name in manager.projects:
            del manager.projects[project_name]
        
        return {
            "success": True,
            "message": f"项目 {project_name} 已删除",
            "backup_location": backup_dir
        }
        
    except Exception as e:
        logger.error(f"删除项目失败: {str(e)}")
        return {"success": False, "error": str(e)}