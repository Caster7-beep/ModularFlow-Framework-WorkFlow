#!/usr/bin/env python3
"""
测试ProjectManager模块集成功能
"""

import sys
sys.path.insert(0, '.')

from modules.ProjectManager.project_manager_module.project_manager_module import get_project_manager

def main():
    print('🔧 初始化ProjectManager...')
    manager = get_project_manager()

    print('\n📋 已注册的项目:')
    projects = manager.managed_projects_config
    for project in projects:
        print(f'  - {project["name"]} ({project["namespace"]})')

    print('\n📊 项目状态检查:')
    status = manager.get_project_status()
    for name, info in status.items():
        print(f'  {name}: {info["health_status"]} (前端:{info["frontend_running"]}, 后端:{info["backend_running"]})')

    print('\n📍 检查VisualWorkFlow配置:')
    vw_found = False
    for project in projects:
        if project["name"] == "VisualWorkFlow":
            vw_found = True
            print(f'  ✓ 找到VisualWorkFlow项目配置')
            print(f'    - 前端路径: {project.get("frontend", {}).get("path", "未配置")}')
            print(f'    - 前端端口: {project.get("frontend", {}).get("port", "未配置")}')
            print(f'    - 后端启动命令: {project.get("backend", {}).get("start_command", "未配置")}')
            print(f'    - 后端端口: {project.get("backend", {}).get("api_gateway_port", "未配置")}')
            break
    
    if not vw_found:
        print('  ❌ VisualWorkFlow项目未在managed_projects中找到')
        return

    print('\n🚀 尝试启动VisualWorkFlow项目...')
    result = manager.start_project('VisualWorkFlow', 'all')
    print(f'启动结果: {result}')

    print('\n🔍 更新后的项目状态:')
    status = manager.get_project_status('VisualWorkFlow')
    if 'error' not in status:
        print(f'  VisualWorkFlow: {status["health_status"]} (前端:{status["frontend_running"]}, 后端:{status["backend_running"]})')
        print(f'  前端端口: {status["frontend_port"]}, 后端端口: {status["backend_port"]}')
        if status["frontend_pid"]:
            print(f'  前端PID: {status["frontend_pid"]}')
        if status["backend_pid"]:
            print(f'  后端PID: {status["backend_pid"]}')
    else:
        print(f'  错误: {status["error"]}')

if __name__ == '__main__':
    main()