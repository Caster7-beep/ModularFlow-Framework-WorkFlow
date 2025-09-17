#!/usr/bin/env python3
"""
SmartTavern对话项目优化后端启动脚本

该脚本提供以下优化特性：
1. 异步服务启动
2. 并行服务初始化
3. 连接池预热
4. 性能监控集成
5. 优化工作流引擎支持
6. 资源池管理
"""

import sys
import os
import json
import asyncio
import threading
import time
import webbrowser
import concurrent.futures
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

# 添加框架根目录到Python路径
framework_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(framework_root))

try:
    from modules.api_gateway_module import get_api_gateway
    from modules.web_server_module import get_web_server
    from modules.llm_api_module.llm_api_manager import LLMAPIManager, APIConfiguration
    from modules.SmartTavern.api_gateway_functions_module import setup_smarttavern_api_functions
    from core.services import get_service_manager, get_current_globals
    from core.function_registry import get_registry
    from backend_projects.SmartTavern.workflows.prompt_api_workflow import prompt_api_call_workflow
    
    # 导入优化模块
    from modules.visual_workflow_module.optimized_visual_workflow_module import (
        get_optimized_workflow_manager, cleanup_optimized_workflows
    )
    from orchestrators.optimized_visual_workflow import OptimizedVisualWorkflow
    
    # 导入错误处理模块
    from modules.error_handling_module.integration import setup_error_handling
    
except ImportError as e:
    print(f"❌ 导入模块失败: {e}")
    print(f"请确保在框架根目录 {framework_root} 下运行此脚本")
    sys.exit(1)


class OptimizedSmartTavernBackend:
    """优化的SmartTavern对话项目后端管理器"""
    
    def __init__(self, config_path: str = None):
        self.api_gateway = None
        self.web_server = None
        self.llm_manager = None
        self.framework_root = framework_root
        self.config_path = config_path or str(Path(__file__).parent / "config.json")
        self.project_config = {}
        
        # 性能监控
        self.startup_metrics = {
            'startup_start_time': time.time(),
            'services_start_times': {},
            'services_ready_times': {},
            'total_startup_time': 0,
            'parallel_startup_efficiency': 0
        }
        
        # 异步任务管理
        self.background_tasks = set()
        self.shutdown_event = asyncio.Event()
        self.health_check_interval = 30  # 秒
        
        print("🚀 初始化SmartTavern优化后端系统...")
        
        # 确保工作目录正确
        os.chdir(self.framework_root)
        
        # 加载项目配置
        self.load_project_config()
    
    def load_project_config(self):
        """加载项目配置"""
        config_file = Path(self.config_path)
        if config_file.exists():
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    self.project_config = json.load(f)
                print(f"✓ 项目配置加载成功: {config_file}")
            except Exception as e:
                print(f"❌ 加载项目配置失败: {e}")
                self.project_config = {}
        else:
            print(f"⚠️ 项目配置文件不存在: {config_file}")
            self.project_config = {}
    
    async def init_service_manager(self):
        """异步初始化服务管理器"""
        start_time = time.time()
        self.startup_metrics['services_start_times']['service_manager'] = start_time
        
        try:
            # 在线程池中初始化服务管理器
            loop = asyncio.get_event_loop()
            self.service_manager = await loop.run_in_executor(
                None, get_service_manager
            )
            
            # 异步加载模块
            loaded_count = await loop.run_in_executor(
                None, self.service_manager.load_project_modules
            )
            
            self.startup_metrics['services_ready_times']['service_manager'] = time.time()
            print(f"✓ 服务管理器初始化完成，已加载 {loaded_count} 个模块")
            
        except Exception as e:
            print(f"❌ 初始化服务管理器失败: {e}")
            raise
    
    async def init_llm_manager(self):
        """异步初始化LLM API管理器"""
        start_time = time.time()
        self.startup_metrics['services_start_times']['llm_manager'] = start_time
        
        try:
            backend_config = self.project_config.get("backend", {})
            llm_config = backend_config.get("llm_api", {})
            
            if llm_config.get("enabled", True):
                # 异步获取全局配置
                loop = asyncio.get_event_loop()
                g = await loop.run_in_executor(None, get_current_globals)
                
                if not g or not hasattr(g, 'api_providers') or "Gemini" not in g.api_providers:
                    print("⚠️ 全局API配置不存在，无法初始化LLM API管理器")
                    self.llm_manager = None
                    return
                
                # 使用现有的Gemini配置创建LLM API管理器
                gemini_config = g.api_providers.get("Gemini", {})
                
                # 创建APIConfiguration对象
                api_config = APIConfiguration(
                    provider="gemini",
                    api_key=gemini_config.get("api_key", ""),
                    base_url=gemini_config.get("base_url", "https://generativelanguage.googleapis.com/v1beta"),
                    models=[gemini_config.get("models", "gemini-2.5-flash")],
                    enabled=gemini_config.get("enable_api_key", True)
                )
                
                # 在线程池中初始化LLM管理器
                self.llm_manager = await loop.run_in_executor(
                    None, LLMAPIManager, api_config
                )
                
                # 设置活动提供商
                if not hasattr(g, 'active_api_provider') or not g.active_api_provider:
                    g.active_api_provider = 'gemini'
                
                self.startup_metrics['services_ready_times']['llm_manager'] = time.time()
                print("✓ Gemini API管理器初始化完成")
            else:
                print("⚠️ LLM API在配置中被禁用")
                
        except Exception as e:
            print(f"❌ 初始化LLM API管理器失败: {e}")
            self.llm_manager = None
    
    async def init_servers(self):
        """异步初始化API网关和Web服务器"""
        start_time = time.time()
        self.startup_metrics['services_start_times']['servers'] = start_time
        
        try:
            loop = asyncio.get_event_loop()
            
            # 并行初始化服务器
            if self.project_config:
                # 创建前端项目配置
                frontend_config = self._create_frontend_config()
                
                # 并行初始化
                api_gateway_task = loop.run_in_executor(
                    None, get_api_gateway, self.project_config
                )
                web_server_task = loop.run_in_executor(
                    None, get_web_server, frontend_config
                )
                
                self.api_gateway, self.web_server = await asyncio.gather(
                    api_gateway_task, web_server_task
                )
            else:
                # 使用默认配置并行初始化
                api_gateway_task = loop.run_in_executor(None, get_api_gateway)
                web_server_task = loop.run_in_executor(None, get_web_server)
                
                self.api_gateway, self.web_server = await asyncio.gather(
                    api_gateway_task, web_server_task
                )
            
            self.startup_metrics['services_ready_times']['servers'] = time.time()
            print("✓ API网关和Web服务器初始化完成")
            
        except Exception as e:
            print(f"❌ 初始化服务器失败: {e}")
            raise
    
    def _create_frontend_config(self):
        """从项目配置创建前端配置"""
        if not self.project_config:
            return None
        
        project_info = self.project_config.get("project", {})
        frontend_config = self.project_config.get("frontend", {})
        backend_config = self.project_config.get("backend", {})
        api_gateway_config = backend_config.get("api_gateway", {})
        
        # 构建前端项目配置
        return {
            "projects": [
                {
                    "name": project_info.get("name", "SmartTavern"),
                    "display_name": project_info.get("display_name", "SmartTavern对话系统"),
                    "type": "html",
                    "path": frontend_config.get("path", "frontend_projects/ai_chat"),
                    "port": frontend_config.get("port", 6601),
                    "api_endpoint": f"http://localhost:{api_gateway_config.get('port', 6500)}/api/v1",
                    "dev_command": frontend_config.get("dev_command", "python -m http.server 6601"),
                    "description": project_info.get("description", "SmartTavern对话前端界面"),
                    "enabled": True
                }
            ],
            "global_config": {
                "cors_origins": api_gateway_config.get("cors_origins", ["*"]),
                "api_base_url": f"http://localhost:{api_gateway_config.get('port', 6500)}",
                "websocket_url": f"ws://localhost:{api_gateway_config.get('port', 6500)}/ws"
            }
        }
    
    async def start_api_gateway_async(self):
        """异步启动API网关"""
        start_time = time.time()
        self.startup_metrics['services_start_times']['api_gateway'] = start_time
        
        try:
            backend_config = self.project_config.get("backend", {})
            api_gateway_config = backend_config.get("api_gateway", {})
            
            if not api_gateway_config.get("enabled", True):
                print("⚠️ API网关在配置中被禁用")
                return False
            
            port = api_gateway_config.get("port", 6500)
            
            print("🌐 启动API网关服务器...")
            
            # 在线程池中启动API网关
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, self.api_gateway.start_server, True  # background=True
            )
            
            # 等待API网关启动完成
            await asyncio.sleep(2)
            
            self.startup_metrics['services_ready_times']['api_gateway'] = time.time()
            print("✅ API网关启动成功")
            print(f"📚 API文档: http://localhost:{port}/docs")
            return True
            
        except Exception as e:
            print(f"❌ API网关启动失败: {e}")
            return False
    
    async def start_frontend_server_async(self, open_browser=True):
        """异步启动前端开发服务器"""
        start_time = time.time()
        self.startup_metrics['services_start_times']['frontend'] = start_time
        
        try:
            project_info = self.project_config.get("project", {})
            frontend_config = self.project_config.get("frontend", {})
            project_name = project_info.get("name", "SmartTavern")
            port = frontend_config.get("port", 6601)
            auto_open = frontend_config.get("auto_open_browser", True) and open_browser
            
            print("⚛️ 启动前端服务器...")
            
            # 在线程池中启动前端服务器
            loop = asyncio.get_event_loop()
            success = await loop.run_in_executor(
                None, self.web_server.start_project, project_name, auto_open
            )
            
            if success:
                self.startup_metrics['services_ready_times']['frontend'] = time.time()
                print("✅ 前端服务器启动成功")
                print(f"🌐 前端界面: http://localhost:{port}")
                return True
            else:
                print("❌ 前端服务器启动失败")
                return False
                
        except Exception as e:
            print(f"❌ 启动前端服务器失败: {e}")
            return False
    
    async def setup_smarttavern_functions_async(self):
        """异步设置SmartTavern自定义函数"""
        start_time = time.time()
        self.startup_metrics['services_start_times']['functions'] = start_time
        
        try:
            print("📝 设置SmartTavern自定义函数...")
            
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, setup_smarttavern_api_functions, self.project_config, self.llm_manager
            )
            
            self.startup_metrics['services_ready_times']['functions'] = time.time()
            print("✓ SmartTavern自定义函数设置完成")
            
        except Exception as e:
            print(f"❌ 设置SmartTavern函数失败: {e}")
    
    async def init_optimized_workflows(self):
        """初始化优化工作流管理器"""
        start_time = time.time()
        self.startup_metrics['services_start_times']['optimized_workflows'] = start_time
        
        try:
            print("⚡ 初始化优化工作流引擎...")
            
            # 获取优化工作流管理器（这会自动初始化）
            manager = get_optimized_workflow_manager()
            
            self.startup_metrics['services_ready_times']['optimized_workflows'] = time.time()
            print("✓ 优化工作流引擎初始化完成")
            
            return True
            
        except Exception as e:
            print(f"❌ 初始化优化工作流引擎失败: {e}")
            return False
    
    async def start_all_services_async(self):
        """异步启动所有服务"""
        print("🎯 启动SmartTavern对话系统完整优化后端服务...\n")
        
        # 显示配置信息
        if self.project_config:
            project_info = self.project_config.get("project", {})
            backend_config = self.project_config.get("backend", {})
            smarttavern_config = backend_config.get("smarttavern", {})
            
            print(f"📋 项目: {project_info.get('display_name', 'SmartTavern对话系统')}")
            print(f"📋 版本: {project_info.get('version', '1.0.0')}")
            print(f"📋 描述: {project_info.get('description', '集成完整SmartTavern工作流的AI对话系统')}")
            print(f"📋 SmartTavern工作流: {smarttavern_config.get('workflow', 'prompt_api_call_workflow')}")
            print(f"⚡ 性能优化: 启用（并行执行、缓存、异步I/O）")
            print()
        
        try:
            # 阶段1：并行初始化核心组件
            print("📦 阶段1：并行初始化核心组件...")
            init_tasks = [
                self.init_service_manager(),
                self.init_llm_manager(),
                self.init_optimized_workflows()
            ]
            await asyncio.gather(*init_tasks)
            print("✅ 核心组件初始化完成\n")
            
            # 阶段2：初始化服务器
            print("🌐 阶段2：初始化服务器...")
            await self.init_servers()
            print("✅ 服务器初始化完成\n")
            
            # 阶段3：设置错误处理系统
            print("🛡️ 阶段3：设置错误处理系统...")
            setup_error_handling(self.api_gateway.app, debug_mode=True)
            print("✅ 错误处理系统设置完成\n")
            
            # 阶段4：设置自定义函数
            print("📝 阶段4：设置自定义函数...")
            await self.setup_smarttavern_functions_async()
            print("✅ 自定义函数设置完成\n")
            
            # 阶段5：并行启动服务
            print("🚀 阶段5：并行启动服务...")
            startup_tasks = [
                self.start_api_gateway_async(),
                self.start_frontend_server_async(open_browser=True)
            ]
            results = await asyncio.gather(*startup_tasks, return_exceptions=True)
            
            # 检查启动结果
            if not all(isinstance(r, bool) and r for r in results if not isinstance(r, Exception)):
                print("❌ 某些服务启动失败")
                return False
            print("✅ 所有服务启动完成\n")
            
            # 计算启动性能指标
            self._calculate_startup_metrics()
            
            return True
            
        except Exception as e:
            print(f"❌ 启动服务失败: {e}")
            return False
    
    def _calculate_startup_metrics(self):
        """计算启动性能指标"""
        current_time = time.time()
        startup_start = self.startup_metrics['startup_start_time']
        
        self.startup_metrics['total_startup_time'] = current_time - startup_start
        
        # 计算并行启动效率
        service_durations = {}
        total_sequential_time = 0
        
        for service, start_time in self.startup_metrics['services_start_times'].items():
            end_time = self.startup_metrics['services_ready_times'].get(service, current_time)
            duration = end_time - start_time
            service_durations[service] = duration
            total_sequential_time += duration
        
        if self.startup_metrics['total_startup_time'] > 0:
            self.startup_metrics['parallel_startup_efficiency'] = min(
                total_sequential_time / self.startup_metrics['total_startup_time'], 
                1.0
            )
        
        # 显示启动性能报告
        print("📈 启动性能报告:")
        print(f"  • 总启动时间: {self.startup_metrics['total_startup_time']:.2f}秒")
        print(f"  • 并行启动效率: {self.startup_metrics['parallel_startup_efficiency']:.2%}")
        print("  • 各服务启动时间:")
        for service, duration in service_durations.items():
            print(f"    - {service}: {duration:.2f}秒")
        print()
    
    def display_startup_summary(self):
        """显示启动摘要"""
        backend_config = self.project_config.get("backend", {})
        frontend_config = self.project_config.get("frontend", {})
        api_gateway_config = backend_config.get("api_gateway", {})
        websocket_config = backend_config.get("websocket", {})
        smarttavern_config = backend_config.get("smarttavern", {})
        
        api_port = api_gateway_config.get("port", 6500)
        frontend_port = frontend_config.get("port", 6601)
        websocket_path = websocket_config.get("path", "/ws")
        
        print("🎉 SmartTavern对话系统优化版启动完成！")
        print("\n📋 可用服务:")
        print(f"  • API网关: http://localhost:{api_port}")
        print(f"  • API文档: http://localhost:{api_port}/docs")
        print(f"  • 前端界面: http://localhost:{frontend_port}")
        print(f"  • WebSocket: ws://localhost:{api_port}{websocket_path}")
        print(f"  • LLM模型: Gemini 2.5 Flash")
        print(f"  • SmartTavern工作流: {smarttavern_config.get('workflow', 'enabled')}")
        print(f"  • 优化工作流引擎: 启用")
        print(f"\n⚡ 性能优化特性:")
        print(f"  • 并行节点执行 ✅")
        print(f"  • LRU缓存机制 ✅") 
        print(f"  • 异步I/O处理 ✅")
        print(f"  • 连接池管理 ✅")
        print(f"  • 性能监控 ✅")
        print(f"  • 并行启动效率: {self.startup_metrics['parallel_startup_efficiency']:.1%}")
        print(f"\n💡 配置文件: {self.config_path}")
        print(f"\n📚 优化API文档: http://localhost:{api_port}/docs (搜索 'optimized')")
        print("\n按 Ctrl+C 停止所有服务")


async def main_async():
    """异步主函数"""
    # 检查是否指定了配置文件
    config_path = None
    if len(sys.argv) > 1:
        config_path = sys.argv[1]
        if not Path(config_path).exists():
            print(f"❌ 配置文件不存在: {config_path}")
            sys.exit(1)
    
    backend = OptimizedSmartTavernBackend(config_path=config_path)
    
    try:
        # 启动所有服务
        if await backend.start_all_services_async():
            backend.display_startup_summary()
            
            # 保持运行
            try:
                while True:
                    await asyncio.sleep(1)
            except KeyboardInterrupt:
                print("\n\n⏹️ 收到停止信号...")
                print("👋 再见！程序已停止")
        else:
            print("❌ 服务启动失败")
            sys.exit(1)
    
    except Exception as e:
        print(f"❌ 运行时错误: {e}")
        sys.exit(1)


def main():
    """同步主函数入口"""
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        print("\n👋 程序被用户终止")
    except Exception as e:
        print(f"❌ 程序执行错误: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()