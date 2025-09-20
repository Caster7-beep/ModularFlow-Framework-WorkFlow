#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from modules.ProjectManager.project_manager_module.project_manager_module import get_project_manager

print('🔍 当前系统服务状态检查...')
print('='*50)

manager = get_project_manager()

print('\n📋 已注册的项目:')
projects = manager.get_managed_projects()
for project in projects:
    print(f'  ✓ {project["name"]} ({project["namespace"]})')

print('\n📊 详细项目状态:')
status = manager.get_project_status()
for name, info in status.items():
    print(f'\n📦 {name}:')
    print(f'   健康状态: {info["health_status"]}')
    print(f'   前端运行: {info["frontend_running"]} (端口: {info.get("frontend_port", "未知")})')
    print(f'   后端运行: {info["backend_running"]} (端口: {info.get("backend_port", "未知")})')
    if 'error' in info:
        print(f'   错误信息: {info["error"]}')

print('\n🌐 预期服务端口:')
print('  - ProjectManager API: http://localhost:8000')
print('  - ProjectManager前端: http://localhost:8080')
print('  - VisualWorkFlow前端: http://localhost:3002')
print('  - VisualWorkFlow后端: http://localhost:6502')
print('  - WebSocket通信: ws://localhost:6502/ws')