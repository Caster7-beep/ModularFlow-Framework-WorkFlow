#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from modules.ProjectManager.project_manager_module.project_manager_module import get_project_manager

print('🚀 启动VisualWorkFlow项目...')
manager = get_project_manager()

# 确保VisualWorkFlow项目启动
print('启动VisualWorkFlow前端和后端...')
result = manager.start_project('VisualWorkFlow', 'all')
print(f'启动结果: {result}')

# 等待服务启动
import time
time.sleep(5)

print('\n📊 检查项目状态:')
status = manager.get_project_status('VisualWorkFlow')
if 'error' not in status:
    print(f'✓ VisualWorkFlow: {status["health_status"]}')
    print(f'  前端运行: {status["frontend_running"]} (端口: {status["frontend_port"]})')
    print(f'  后端运行: {status["backend_running"]} (端口: {status["backend_port"]})')
else:
    print(f'❌ 错误: {status["error"]}')

print('\n🔍 所有项目状态概览:')
all_status = manager.get_project_status()
for name, info in all_status.items():
    print(f'  {name}: {info["health_status"]}')