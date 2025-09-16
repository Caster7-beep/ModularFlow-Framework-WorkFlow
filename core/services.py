"""
统一服务管理系统 (Unified Service Management System)

提供框架级别的服务定位、命名空间管理和资源访问功能。
解决硬编码导入路径问题，确保框架的通用性和可扩展性。

核心特性：
1. 配置驱动的命名空间管理
2. 动态模块加载和服务注册
3. 统一的共享资源访问接口
4. 多项目/多命名空间支持
"""

import os
import json
import importlib
import importlib.util
from typing import Any, Dict, List, Optional, Type, Callable, Union
from pathlib import Path
from dataclasses import dataclass, field
import threading


@dataclass
class ProjectConfig:
    """项目配置结构"""
    name: str
    namespace: str
    modules_path: str = "modules"
    shared_path: str = "shared"
    globals_module: str = "globals"
    enabled: bool = True
    priority: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass 
class ServiceRegistry:
    """服务注册表"""
    globals_services: Dict[str, Any] = field(default_factory=dict)
    module_services: Dict[str, Any] = field(default_factory=dict)
    function_services: Dict[str, Callable] = field(default_factory=dict)
    workflow_services: Dict[str, Callable] = field(default_factory=dict)


class UnifiedServiceManager:
    """
    统一服务管理器
    
    负责：
    1. 多项目命名空间管理
    2. 动态模块发现和加载
    3. 服务注册和定位
    4. 共享资源统一访问
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        
        self._initialized = True
        self.projects: Dict[str, ProjectConfig] = {}
        self.services = ServiceRegistry()
        self._current_project: Optional[str] = None
        self._base_path = Path.cwd()
        
        # 加载配置
        self._load_project_configs()
    
    def _load_project_configs(self):
        """从配置文件加载项目配置"""
        config_path = self._base_path / "backend_projects" / "backend-projects.json"
        
        if config_path.exists():
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config_data = json.load(f)
                    
                for project_data in config_data.get("projects", []):
                    project = ProjectConfig(**project_data)
                    self.projects[project.name] = project
                    
                # 自动设置当前项目为第一个项目
                if self.projects:
                    self._current_project = next(iter(self.projects.keys()))

            except Exception as e:
                print(f"⚠️ 加载项目配置失败: {e}")
        
        # 如果没有配置文件，打印警告
        if not self.projects:
            print("⚠️ 未找到项目配置文件 (backend_projects/backend-projects.json)，请确保配置文件存在。")
    
    def _save_project_configs(self):
        """保存项目配置到文件"""
        config_data = {
            "default_project": self._current_project,
            "projects": [
                {
                    "name": p.name,
                    "namespace": p.namespace,
                    "modules_path": p.modules_path,
                    "shared_path": p.shared_path,
                    "globals_module": p.globals_module,
                    "enabled": p.enabled,
                    "priority": p.priority,
                    "metadata": p.metadata
                }
                for p in self.projects.values()
            ]
        }
        
        config_path = self._base_path / "backend_projects" / "backend-projects.json"
        try:
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"⚠️ 保存项目配置失败: {e}")
    
    # ==========  项目管理接口  ==========
    
    def register_project(self, name: str, namespace: str, modules_path: str = None, 
                        shared_path: str = None, **kwargs) -> bool:
        """注册新项目"""
        if name in self.projects:
            print(f"⚠️ 项目 '{name}' 已存在")
            return False
        
        project = ProjectConfig(
            name=name,
            namespace=namespace,
            modules_path=modules_path or f"modules/{namespace}",
            shared_path=shared_path or f"shared/{namespace}",
            **kwargs
        )
        
        self.projects[name] = project
        self._save_project_configs()
        return True
    
    def set_current_project(self, project_name: str) -> bool:
        """设置当前活动项目"""
        if project_name not in self.projects:
            print(f"⚠️ 项目 '{project_name}' 不存在")
            return False
        
        self._current_project = project_name
        self._save_project_configs()
        return True
    
    def get_current_project(self) -> Optional[ProjectConfig]:
        """获取当前项目配置"""
        if self._current_project:
            return self.projects.get(self._current_project)
        return None
    
    def list_projects(self) -> List[str]:
        """列出所有项目"""
        return list(self.projects.keys())
    
    # ==========  动态模块发现和加载  ==========
    
    def discover_modules(self, project_name: str = None, root_level: bool = False) -> List[str]:
        """动态发现模块 (项目或根级)"""
        module_paths = []
        
        if root_level:
            modules_dir = self._base_path / "modules"
        else:
            project = self.projects.get(project_name or self._current_project)
            if not project:
                return []
            modules_dir = self._base_path / project.modules_path

        if modules_dir.exists():
            for init_file in modules_dir.glob('*/__init__.py'):
                module_dir = init_file.parent
                module_py_file = module_dir / f"{module_dir.name}.py"
                if module_py_file.exists():
                    try:
                        relative_to_root = module_dir.relative_to(self._base_path)
                        import_path = str(relative_to_root).replace(os.path.sep, '.')
                        full_import_path = f"{import_path}.{module_dir.name}"
                        if full_import_path not in module_paths:
                            module_paths.append(full_import_path)
                    except ValueError:
                        continue
        
        return module_paths
    
    def load_project_modules(self) -> int:
        """加载所有通用模块和已启用项目的模块"""
        total_loaded_count = 0
        
        # 1. 加载根级通用模块
        root_modules = self.discover_modules(root_level=True)
        for module_path in root_modules:
            try:
                module = importlib.import_module(module_path)
                total_loaded_count += 1
                module_name = module_path.split('.')[-2]
                service_key = f"core.{module_name}"
                self.services.module_services[service_key] = module
                if hasattr(self, '_verbose') and self._verbose:
                    print(f"  ✓ 加载通用模块: {service_key}")
            except ImportError as e:
                print(f"  ✗ 通用模块加载失败 {module_path}: {e}")

        # 2. 加载所有已启用项目的模块
        projects_to_load = sorted(
            [p for p in self.projects.values() if p.enabled],
            key=lambda p: p.priority
        )
        for project in projects_to_load:
            project_modules = self.discover_modules(project.name)
            for module_path in project_modules:
                try:
                    module = importlib.import_module(module_path)
                    total_loaded_count += 1
                    module_name = module_path.split('.')[-2]
                    service_key = f"{project.namespace}.{module_name}"
                    self.services.module_services[service_key] = module
                    if hasattr(self, '_verbose') and self._verbose:
                        print(f"  ✓ 加载项目模块: {service_key}")
                except ImportError as e:
                    print(f"  ✗ 项目模块加载失败 {module_path}: {e}")
        
        return total_loaded_count
    
    # ==========  共享资源访问接口  ==========
    
    def get_globals(self, project_name: str = None) -> Optional[Any]:
        """获取指定项目的globals模块"""
        project = self.projects.get(project_name or self._current_project)
        if not project:
            return None
        
        # 检查是否已缓存
        cache_key = f"{project.namespace}.globals"
        if cache_key in self.services.globals_services:
            return self.services.globals_services[cache_key]
        
        # 动态导入globals模块
        try:
            globals_path = f"{project.shared_path.replace('/', '.')}.{project.globals_module}"
            globals_module = importlib.import_module(globals_path)
            
            # 缓存服务
            self.services.globals_services[cache_key] = globals_module
            return globals_module
            
        except ImportError as e:
            print(f"⚠️ 无法加载globals模块 {globals_path}: {e}")
            return None
    
    def get_shared_path(self, project_name: str = None) -> Optional[Path]:
        """获取指定项目的共享资源路径"""
        project = self.projects.get(project_name or self._current_project)
        if project:
            return self._base_path / project.shared_path
        return None
    
    def get_modules_path(self, project_name: str = None) -> Optional[Path]:
        """获取指定项目的模块路径"""
        project = self.projects.get(project_name or self._current_project)
        if project:
            return self._base_path / project.modules_path
        return None
    
    # ==========  服务定位接口  ==========
    
    def register_service(self, name: str, service: Any, service_type: str = 'general'):
        """注册服务"""
        if service_type == 'function':
            self.services.function_services[name] = service
        elif service_type == 'workflow':
            self.services.workflow_services[name] = service
        elif service_type == 'module':
            self.services.module_services[name] = service
        elif service_type == 'globals':
            self.services.globals_services[name] = service
    
    def get_service(self, name: str, service_type: str = None) -> Optional[Any]:
        """获取服务"""
        if service_type == 'function' or service_type is None:
            if name in self.services.function_services:
                return self.services.function_services[name]
        
        if service_type == 'workflow' or service_type is None:
            if name in self.services.workflow_services:
                return self.services.workflow_services[name]
        
        if service_type == 'module' or service_type is None:
            if name in self.services.module_services:
                return self.services.module_services[name]
        
        if service_type == 'globals' or service_type is None:
            if name in self.services.globals_services:
                return self.services.globals_services[name]
        
        return None
    
    def list_services(self, service_type: str = None) -> Dict[str, List[str]]:
        """列出所有服务"""
        if service_type:
            if service_type == 'function':
                return {service_type: list(self.services.function_services.keys())}
            elif service_type == 'workflow':
                return {service_type: list(self.services.workflow_services.keys())}
            elif service_type == 'module':
                return {service_type: list(self.services.module_services.keys())}
            elif service_type == 'globals':
                return {service_type: list(self.services.globals_services.keys())}
        
        return {
            'function': list(self.services.function_services.keys()),
            'workflow': list(self.services.workflow_services.keys()),
            'module': list(self.services.module_services.keys()),
            'globals': list(self.services.globals_services.keys()),
        }
    
    # ==========  便捷访问接口  ==========
    
    def g(self, project_name: str = None):
        """便捷的globals访问接口"""
        return self.get_globals(project_name)
    
    def current_g(self):
        """当前项目的globals快捷访问"""
        return self.get_globals()
    
    def set_verbose(self, verbose: bool = True):
        """设置详细输出模式"""
        self._verbose = verbose


# ==========  全局服务管理器实例  ==========

# 创建全局服务管理器单例
service_manager = UnifiedServiceManager()

# 便捷的全局访问函数
def get_service_manager() -> UnifiedServiceManager:
    """获取全局服务管理器"""
    return service_manager

def get_current_globals():
    """获取当前项目的globals模块"""
    return service_manager.current_g()

def register_project(name: str, namespace: str, **kwargs) -> bool:
    """注册新项目的便捷函数"""
    return service_manager.register_project(name, namespace, **kwargs)

def switch_project(project_name: str) -> bool:
    """切换当前项目的便捷函数"""
    return service_manager.set_current_project(project_name)

# 向后兼容的globals访问（用于渐进式迁移）
def get_legacy_globals():
    """
    向后兼容的globals访问
    用于现有代码的渐进式迁移
    """
    try:
        # 首先尝试通过服务管理器获取
        g = service_manager.current_g()
        if g is not None:
            return g
        
        # 后备方案：直接导入（保持向后兼容）
        from shared.SmartTavern import globals as legacy_g
        return legacy_g
    except ImportError:
        print("⚠️ 无法访问globals模块，请检查项目配置")
        return None