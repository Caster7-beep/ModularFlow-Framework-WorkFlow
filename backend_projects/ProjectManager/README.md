# ProjectManager - 统一项目管理面板

ProjectManager 是 ModularFlow Framework 的统一项目管理系统，提供了一个更高级别的控制台来管理所有注册的前后端项目。

## 🎯 功能特性

- **统一项目管理**: 集中管理所有前后端项目的生命周期
- **端口管理**: 统一分配和监控项目端口使用情况
- **实时状态监控**: 实时监控项目运行状态和健康检查
- **批量操作**: 支持批量启动/停止项目
- **Web界面**: 提供直观的Web管理界面
- **API接口**: 完整的RESTful API和WebSocket支持

## 🏗️ 架构设计

### 核心组件

1. **项目管理核心模块** (`modules/ProjectManager/project_manager_module/`)
   - 负责项目生命周期管理
   - 端口分配和监控
   - 健康检查和状态跟踪

2. **Web管理界面** (`frontend_projects/ProjectManager/`)
   - 基于HTML/CSS/JavaScript的响应式界面
   - 使用Tailwind CSS和Lucide图标
   - 实时数据更新和WebSocket通信

3. **配置系统** (`backend_projects/ProjectManager/config.json`)
   - 定义被管理的项目配置
   - 端口分配策略
   - 健康检查配置

## 📁 项目结构

```
ProjectManager/
├── backend_projects/ProjectManager/
│   ├── config.json              # 项目配置文件
│   ├── start_server.py         # 启动脚本
│   └── README.md               # 项目文档
├── frontend_projects/ProjectManager/
│   ├── index.html              # 主页面
│   └── js/
│       ├── api.js              # API客户端
│       └── main.js             # 主应用逻辑
├── modules/ProjectManager/
│   ├── __init__.py
│   └── project_manager_module/
│       ├── __init__.py
│       └── project_manager_module.py  # 核心管理模块
└── shared/ProjectManager/
    ├── __init__.py
    └── globals.py              # 全局变量
```

## 🚀 快速开始

### 1. 启动项目管理面板

```bash
# 方式1: 直接运行启动脚本
python backend_projects/ProjectManager/start_server.py

# 方式2: 在项目目录中运行
cd backend_projects/ProjectManager
python start_server.py
```

### 2. 访问管理界面

启动后可访问以下服务：
- **管理面板**: http://localhost:8080
- **API文档**: http://localhost:8000/docs
- **API网关**: http://localhost:8000/api/v1
- **WebSocket**: ws://localhost:8000/ws

## ⚙️ 配置说明

### 项目配置文件 (`config.json`)

```json
{
  "project": {
    "name": "ProjectManager",
    "display_name": "统一项目管理面板",
    "version": "1.0.0",
    "description": "用于统一管理前后端项目、端口与生命周期的更高一级控制台",
    "type": "manager"
  },
  "managed_projects": [
    {
      "name": "SmartTavern",
      "namespace": "SmartTavern",
      "description": "SmartTavern 对话与工作流系统",
      "enabled": true,
      "frontend": {
        "type": "react",
        "path": "frontend_projects/SmartTavern",
        "port": 3000,
        "dev_command": "npm run dev"
      },
      "backend": {
        "api_gateway_port": 6500,
        "start_command": "python backend_projects/SmartTavern/start_server.py"
      },
      "ports": {
        "frontend_dev": 3000,
        "frontend_console": 6601,
        "api_gateway": 6500
      },
      "health_checks": {
        "frontend_dev_url": "http://localhost:3000",
        "console_url": "http://localhost:6601",
        "api_docs_url": "http://localhost:6500/docs"
      }
    }
  ]
}
```

### 配置字段说明

- **project**: 项目基本信息
- **managed_projects**: 被管理的项目列表
  - **frontend**: 前端配置（React开发服务器、静态控制台等）
  - **backend**: 后端配置（API网关端口、启动命令等）
  - **ports**: 端口分配
  - **health_checks**: 健康检查URL配置

## 🔧 API接口

ProjectManager 提供以下API接口：

### 项目管理
- `POST /api/v1/project_manager/start_project` - 启动项目
- `POST /api/v1/project_manager/stop_project` - 停止项目
- `POST /api/v1/project_manager/restart_project` - 重启项目
- `POST /api/v1/project_manager/get_status` - 获取项目状态
- `POST /api/v1/project_manager/get_ports` - 获取端口使用情况
- `POST /api/v1/project_manager/health_check` - 执行健康检查

### 请求示例

```javascript
// 启动项目
const result = await apiClient.startProject('SmartTavern', 'all');

// 获取项目状态
const status = await apiClient.getProjectStatus('SmartTavern');

// 获取端口使用情况
const ports = await apiClient.getPortUsage();
```

## 🌐 Web界面功能

### 主要功能

1. **项目概览**: 显示所有项目的运行状态
2. **统计面板**: 总项目数、运行中项目、端口使用等统计信息
3. **项目卡片**: 每个项目的详细状态和操作按钮
4. **端口监控**: 实时显示端口使用情况
5. **批量操作**: 一键启动/停止所有项目

### 界面特性

- **响应式设计**: 支持桌面和移动设备
- **实时更新**: 通过WebSocket实现实时状态更新
- **优雅UI**: 基于Tailwind CSS的现代化界面设计
- **交互反馈**: 完整的加载状态和通知系统

## 🔍 监控功能

### 健康检查

ProjectManager 会定期对所有被管理的项目进行健康检查：

- **前端健康检查**: 检查前端服务器响应状态
- **后端健康检查**: 检查API网关和后端服务状态
- **端口监控**: 监控端口占用情况
- **进程监控**: 跟踪项目进程状态

### 状态指示

- 🟢 **运行中**: 项目正常运行
- 🔴 **已停止**: 项目已停止
- 🟡 **异常**: 项目运行异常
- ⚪ **未知**: 状态未知

## 🛠️ 开发指南

### 添加新的被管理项目

1. 在 `config.json` 的 `managed_projects` 数组中添加项目配置
2. 重启ProjectManager服务
3. 新项目将自动出现在管理界面中

### 扩展功能

ProjectManager 基于 ModularFlow Framework 的模块化架构，可以轻松扩展：

```python
from core.function_registry import register_function

@register_function(name="project_manager.custom_function", outputs=["result"])
def custom_project_function():
    """自定义项目管理功能"""
    return {"message": "自定义功能"}
```

## 🚨 故障排除

### 常见问题

1. **端口冲突**
   - 检查配置文件中的端口设置
   - 确保端口未被其他服务占用

2. **项目启动失败**
   - 检查项目路径是否正确
   - 验证启动命令是否有效
   - 查看错误日志

3. **健康检查失败**
   - 检查项目是否正常运行
   - 验证健康检查URL配置

### 日志查看

ProjectManager 使用标准Python日志系统，可以通过以下方式查看详细日志：

```python
import logging
logging.getLogger('modules.ProjectManager').setLevel(logging.DEBUG)
```

## 📈 性能优化

- **异步处理**: 使用异步操作避免阻塞
- **缓存机制**: 智能缓存项目状态信息
- **批量操作**: 支持并行处理多个项目
- **资源监控**: 监控系统资源使用情况

## 🔒 安全考虑

- **CORS配置**: 严格的跨域访问控制
- **进程隔离**: 每个项目运行在独立进程中
- **权限控制**: 基于配置的访问权限管理

## 📚 相关文档

- [ModularFlow Framework 架构文档](../../ARCHITECTURE.md)
- [前后端集成指南](../../FRONTEND_BACKEND_INTEGRATION.md)
- [API网关模块文档](../../modules/api_gateway_module/README.md)
- [Web服务器模块文档](../../modules/web_server_module/README.md)

## 🎉 总结

ProjectManager 提供了一个强大而直观的项目管理解决方案，让开发者能够：

✅ **统一管理**: 在一个界面中管理所有项目
✅ **实时监控**: 实时查看项目状态和资源使用
✅ **简化操作**: 一键启动/停止项目
✅ **可视化界面**: 直观的Web管理界面
✅ **扩展性**: 基于模块化架构，易于扩展
✅ **生产就绪**: 完整的错误处理和监控机制

这个管理面板是 ModularFlow Framework 生态系统的重要组成部分，为复杂的多项目开发环境提供了统一的管理入口。