#!/usr/bin/env python3
"""
SmartTavern对话项目后端启动脚本

该脚本负责：
1. 启动API网关服务器（从ProjectManager配置获取端口）
2. 集成完整的SmartTavern工作流系统
3. 集成Gemini 2.5 Flash API
4. 提供完整的SmartTavern对话后端支持
"""

import sys
import os
import json
import asyncio
import threading
import time
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
    from core.services import get_service_manager
    from core.function_registry import get_registry
    from backend_projects.SmartTavern.workflows.prompt_api_workflow import prompt_api_call_workflow
except ImportError as e:
    print(f"❌ 导入模块失败: {e}")
    print(f"请确保在框架根目录 {framework_root} 下运行此脚本")
    sys.exit(1)


class SmartTavernChatBackend:
    """SmartTavern对话项目后端管理器"""
    
    def __init__(self, config_path: str = None):
        self.api_gateway = None
        self.llm_manager = None
        self.framework_root = framework_root
        self.config_path = config_path or str(Path(__file__).parent / "config.json")
        self.project_config = {}
        self.project_manager_config = {}
        self.api_port = 6500  # 默认端口，后续会从ProjectManager配置获取
        
        print("🚀 初始化SmartTavern对话系统后端...")
        
        # 确保工作目录正确
        os.chdir(self.framework_root)
        
        # 加载项目配置
        self.load_project_config()
        
        # 加载ProjectManager配置
        self.load_project_manager_config()
        
        # 初始化服务管理器
        self.service_manager = get_service_manager()
        print("✓ 服务管理器初始化完成")
        
        # 初始化LLM API管理器
        self.init_llm_manager()
        
        # 加载所有模块
        self.load_modules()
    
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
            
    def load_project_manager_config(self):
        """加载ProjectManager配置获取端口信息"""
        pm_config_path = Path(self.framework_root) / "shared" / "ProjectManager" / "config.json"
        if pm_config_path.exists():
            try:
                with open(pm_config_path, 'r', encoding='utf-8') as f:
                    self.project_manager_config = json.load(f)
                
                # 从ProjectManager配置中查找SmartTavern项目信息
                managed_projects = self.project_manager_config.get("managed_projects", [])
                for project in managed_projects:
                    if project.get("name") == "SmartTavern":
                        ports = project.get("ports", {})
                        self.api_port = ports.get("api_gateway", 6500)
                        print(f"✓ 从ProjectManager配置获取API端口: {self.api_port}")
                        break
            except Exception as e:
                print(f"⚠️ 加载ProjectManager配置失败: {e}")
                print("使用默认端口: 6500")
        else:
            print(f"⚠️ ProjectManager配置文件不存在: {pm_config_path}")
            print("使用默认端口: 6500")
    
    def init_llm_manager(self):
        """初始化LLM API管理器"""
        try:
            backend_config = self.project_config.get("backend", {})
            llm_config = backend_config.get("llm_api", {})
            
            if llm_config.get("enabled", True):
                # 直接使用globals.py中已有的API配置
                from core.services import get_current_globals
                g = get_current_globals()
                
                if not g or not hasattr(g, 'api_providers') or "Gemini" not in g.api_providers:
                    print("⚠️ 全局API配置不存在，无法初始化LLM API管理器")
                    self.llm_manager = None
                    return
                
                # 使用现有的Gemini配置创建LLM API管理器
                gemini_config = g.api_providers.get("Gemini", {})
                
                # 创建APIConfiguration对象用于LLMAPIManager
                api_config = APIConfiguration(
                    provider="gemini",
                    api_key=gemini_config.get("api_key", ""),
                    base_url=gemini_config.get("base_url", "https://generativelanguage.googleapis.com/v1beta"),
                    models=[gemini_config.get("models", "gemini-2.5-flash")],
                    enabled=gemini_config.get("enable_api_key", True)
                )
                
                self.llm_manager = LLMAPIManager(api_config)
                
                # 设置活动提供商（如果尚未设置）
                if not hasattr(g, 'active_api_provider') or not g.active_api_provider:
                    g.active_api_provider = 'gemini'
                
                print("✓ Gemini API管理器初始化完成")
            else:
                print("⚠️ LLM API在配置中被禁用")
                
        except Exception as e:
            print(f"❌ 初始化LLM API管理器失败: {e}")
            self.llm_manager = None
    
    def load_modules(self):
        """加载必要的模块"""
        try:
            # 加载项目模块
            loaded_count = self.service_manager.load_project_modules()
            print(f"✓ 已加载 {loaded_count} 个模块")
            
            # 使用项目配置初始化API网关
            if self.project_config:
                self.api_gateway = get_api_gateway(project_config=self.project_config)
            else:
                # 使用默认配置
                self.api_gateway = get_api_gateway()
            
            print("✓ API网关初始化完成")
            
        except Exception as e:
            print(f"❌ 加载模块失败: {e}")
            raise
    
    
    def start_api_gateway(self, background=True):
        """启动API网关"""
        try:
            backend_config = self.project_config.get("backend", {})
            api_gateway_config = backend_config.get("api_gateway", {})
            
            if not api_gateway_config.get("enabled", True):
                print("⚠️ API网关在配置中被禁用")
                return False
            
            # 使用从ProjectManager配置获取的端口
            port = self.api_port
            
            print(f"🌐 启动API网关服务器(端口 {port})...")
            self.api_gateway.start_server(background=background)
            print("✅ API网关启动成功")
            print(f"📚 API文档: http://localhost:{port}/docs")
            return True
        except Exception as e:
            print(f"❌ API网关启动失败: {e}")
            return False
    
    
    def check_services_status(self):
        """检查所有服务状态"""
        print("\n📊 服务状态检查:")
        
        # 使用从ProjectManager配置获取的端口
        api_port = self.api_port
        
        # 检查API网关
        try:
            import requests
            response = requests.get(f"http://localhost:{api_port}/api/v1/health", timeout=2)
            if response.status_code == 200:
                print("✅ API网关: 运行正常")
            else:
                print("⚠️ API网关: 响应异常")
        except:
            print("❌ API网关: 无法连接")
        
        # 检查LLM API
        if self.llm_manager and self.llm_manager.is_available():
            print("✅ Gemini API: 配置正常")
        else:
            print("❌ Gemini API: 配置异常或不可用")
        
        # 检查注册的函数
        registry = get_registry()
        functions = registry.list_functions()
        print(f"📝 已注册函数: {len(functions)} 个")
        
        print()
    
    def setup_smarttavern_functions(self):
        """为SmartTavern对话系统设置自定义API函数"""
        setup_smarttavern_api_functions(self.project_config, self.llm_manager)
    
    def start_all_services(self):
        """启动所有服务"""
        print("🎯 启动SmartTavern对话系统后端服务...\n")
        
        # 显示配置信息
        if self.project_config:
            project_info = self.project_config.get("project", {})
            backend_config = self.project_config.get("backend", {})
            smarttavern_config = backend_config.get("smarttavern", {})
            
            print(f"📋 项目: {project_info.get('display_name', 'SmartTavern对话系统')}")
            print(f"📋 版本: {project_info.get('version', '1.0.0')}")
            print(f"📋 描述: {project_info.get('description', '集成完整SmartTavern工作流的AI对话系统')}")
            print(f"📋 SmartTavern工作流: {smarttavern_config.get('workflow', 'prompt_api_call_workflow')}")
            print(f"📋 API端口: {self.api_port}")
            print()
        
        # 设置自定义函数
        self.setup_smarttavern_functions()
        
        # 启动API网关 (后台运行)
        if not self.start_api_gateway(background=True):
            return False
        
        # 等待API网关启动
        print("⏳ 等待API网关启动...")
        time.sleep(3)
        
        # 等待服务启动
        print("⏳ 等待服务启动完成...")
        time.sleep(2)
        
        # 检查服务状态
        self.check_services_status()
        
        return True
    
    def stop_all_services(self):
        """停止所有服务"""
        print("🛑 停止所有服务...")
        
        try:
            # 停止API网关
            if self.api_gateway:
                self.api_gateway.stop_server()
            
            print("✅ 所有服务已停止")
        
        except Exception as e:
            print(f"⚠️ 停止服务时出现问题: {e}")


def main():
    """主函数"""
    # 检查是否指定了配置文件
    config_path = None
    if len(sys.argv) > 1:
        config_path = sys.argv[1]
        if not Path(config_path).exists():
            print(f"❌ 配置文件不存在: {config_path}")
            sys.exit(1)
    
    backend = SmartTavernChatBackend(config_path=config_path)
    
    try:
        # 启动所有服务
        if backend.start_all_services():
            backend_config = backend.project_config.get("backend", {})
            api_gateway_config = backend_config.get("api_gateway", {})
            websocket_config = backend_config.get("websocket", {})
            smarttavern_config = backend_config.get("smarttavern", {})
            
            # 使用从ProjectManager配置获取的端口
            api_port = backend.api_port
            websocket_path = websocket_config.get("path", "/ws")
            
            print("🎉 SmartTavern对话系统后端启动完成！")
            print("\n📋 可用服务:")
            print(f"  • API网关: http://localhost:{api_port}")
            print(f"  • API文档: http://localhost:{api_port}/docs")
            print(f"  • WebSocket: ws://localhost:{api_port}{websocket_path}")
            print(f"  • LLM模型: Gemini 2.5 Flash")
            print(f"  • SmartTavern工作流: {smarttavern_config.get('workflow', 'enabled')}")
            print(f"\n💡 配置文件: {backend.config_path}")
            print("\n按 Ctrl+C 停止所有服务")
            
            # 保持运行
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("\n\n⏹️ 收到停止信号...")
                backend.stop_all_services()
                print("👋 再见！")
        
        else:
            print("❌ 服务启动失败")
            sys.exit(1)
    
    except Exception as e:
        print(f"❌ 运行时错误: {e}")
        backend.stop_all_services()
        sys.exit(1)


if __name__ == "__main__":
    main()