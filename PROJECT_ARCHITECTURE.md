# ModularFlow Framework 项目架构总览

本文档详细说明了ModularFlow Framework的完整项目架构，包括前后端分离设计、模块化系统和项目组织结构。

## 🏗️ 整体架构设计

ModularFlow Framework现在采用完全的**前后端分离架构**，支持多种前端技术栈和统一的后端API服务。

### 核心设计原则

1. **前后端分离**: 前端和后端项目完全独立，通过HTTP API和WebSocket进行通信
2. **项目独立**: 每个前端项目都有独立的后端脚本和配置
3. **模块化架构**: 基于ModularFlow原有的模块化系统扩展
4. **配置驱动**: 所有配置通过JSON文件管理，支持动态配置

## 📁 项目结构概览

```
ModularFlow-Framework/
├── 📁 core/                          # 框架核心系统
│   ├── function_registry.py         # 函数注册系统
│   └── services.py                   # 统一服务管理器
│
├── 📁 modules/                       # 模块系统
│   ├── api_gateway_module/          # API网关模块
│   ├── web_server_module/           # Web服务器模块
│   ├── llm_api_module/              # LLM API模块
│   └── SmartTavern/                 # SmartTavern项目模块
│
├── 📁 frontend_projects/            # 前端项目集合
│   ├── SmartTavern/                 # SmartTavern对话系统
│   ├── web_admin/                   # React管理后台
│   ├── vue_dashboard/               # Vue仪表板
│   └── mobile_app/                  # React Native移动应用
│
├── 📁 backend_projects/             # 后端项目集合
│   ├── SmartTavern/                 # SmartTavern后端脚本
│   │   ├── start_server.py         # 启动脚本
│   │   ├── config.json             # 项目配置
│   │   └── README.md               # 项目文档
│   └── SmartTavern/                 # SmartTavern后端脚本
│
├── 📁 shared/                       # 共享资源
├── 📁 workflows/                    # 通用工作流
├── 📁 orchestrators/               # 编排器
│
├── api-config.json                 # API网关配置
├── backend_projects/               # 后端项目配置
│   └── backend-projects.json       # 后端项目配置文件
└── frontend_projects/              # 前端项目配置
    └── frontend-projects.json      # 前端项目配置文件
```

## 🔧 核心组件详解

### 1. API网关模块 (`modules/api_gateway_module/`)

**职责**: 统一的API入口点，负责请求路由、中间件处理和API文档生成。

**核心特性**:
- 基于FastAPI的高性能API服务器
- 自动API发现：将注册函数暴露为RESTful端点
- WebSocket实时通信支持
- 完整的中间件系统（CORS、日志、错误处理）
- 自动生成的API文档和OpenAPI规范

**关键文件**:
- [`api_gateway_module.py`](modules/api_gateway_module/api_gateway_module.py): 主要实现
- [`README.md`](modules/api_gateway_module/README.md): 详细文档

### 2. Web服务器模块 (`modules/web_server_module/`)

**职责**: 前端项目的开发服务器管理，支持多种前端技术栈。

**核心特性**:
- 多项目前端开发服务器管理
- 支持HTML、React、Vue、React Native等技术栈
- 自动浏览器启动和热重载
- 进程生命周期管理
- 项目结构自动创建

**关键文件**:
- [`web_server_module.py`](modules/web_server_module/web_server_module.py): 主要实现
- [`README.md`](modules/web_server_module/README.md): 详细文档

### 3. 前端项目系统 (`frontend_projects/`)

**设计理念**: 每个前端项目独立管理，支持不同的技术栈和开发工具链。

**项目类型**:

#### React管理后台 (`web_admin/`)
- **技术栈**: React 18、Ant Design、Axios
- **用途**: 现代化管理界面
- **端口**: 3000

#### Vue仪表板 (`vue_dashboard/`)
- **技术栈**: Vue 3、Element Plus、Vite
- **用途**: 数据可视化和监控
- **端口**: 3001

#### 移动应用 (`mobile_app/`)
- **技术栈**: React Native
- **用途**: 跨平台移动端应用

### 4. 后端项目系统 (`backend_projects/`)

**设计理念**: 每个前端项目都有对应的独立后端脚本，实现完全的项目分离。
#### SmartTavern后端 (`SmartTavern/`)

**核心文件**:
- [`start_server.py`](backend_projects/SmartTavern/start_server.py): 完整的启动脚本
- [`config.json`](backend_projects/SmartTavern/config.json): 项目配置


**功能特性**:
- 自动启动API网关和静态文件服务器
- 自定义API函数注册
- 服务状态监控
- 自动浏览器启动
- 完整的错误处理

## 🌐 网络架构

### API通信层

```
前端应用 ←→ API网关 ←→ 模块系统
   ↓           ↓         ↓
 浏览器    :8000端口   函数注册表
```

**通信协议**:
- **HTTP RESTful API**: 用于标准的CRUD操作
- **WebSocket**: 用于实时双向通信
- **CORS支持**: 支持跨域请求

### 端口分配

| 服务 | 端口 | 用途 |
|------|------|------|
| API网关 | 8000 | RESTful API + WebSocket |
| 静态页面 | 8080 | 静态文件服务 |
| React管理后台 | 3000 | 开发服务器 |
| Vue仪表板 | 3001 | 开发服务器 |

## 📋 配置系统

### 1. 后端项目配置 (`backend_projects/backend-projects.json`)
```json
{
  "projects": [
    {
      "name": "SmartTavern",
      "namespace": "SmartTavern",
      "modules_path": "modules/SmartTavern",
      "shared_path": "shared/SmartTavern",
      "enabled": true
    }
  ]
}
```

### 2. 前端项目配置 (`frontend_projects/frontend-projects.json`)
```json
{
  "projects": [
    {
      "name": "SmartTavern",
      "type": "html",
      "path": "frontend_projects/SmartTavern",
      "port": 6601,
      "enabled": true
    }
  ]
}
```

### 3. API网关配置 (`api-config.json`)
```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8000,
    "cors_origins": ["http://localhost:8080"]
  },
  "api": {
    "prefix": "/api/v1",
    "auto_discovery": true
  }
}
```

## 🚀 快速启动指南

### 启动静态页面项目

```bash
# 方式1: 直接运行启动脚本
python backend_projects/SmartTavern/start_server.py

# 方式2: 在项目目录中运行
cd backend_projects/SmartTavern
python start_server.py
```

### 服务访问地址

启动后可访问以下服务：
- **前端控制台**: http://localhost:8080
- **API文档**: http://localhost:8000/docs
- **API网关**: http://localhost:8000/api/v1
- **WebSocket**: ws://localhost:8000/ws

## 🔌 API集成示例

### 前端API调用

```javascript
// 使用内置API客户端
const health = await window.apiClient.healthCheck();
const info = await window.apiClient.getInfo();

// 调用自定义函数
const result = await window.apiClient.callFunction('SmartTavern.get_info');
```

### WebSocket通信

```javascript
// 连接WebSocket
const ws = new WebSocket('ws://localhost:8000/ws');

// 发送函数调用请求
ws.send(JSON.stringify({
  type: 'function_call',
  function: 'SmartTavern.test_connection',
  params: {}
}));
```

### 后端函数注册

```python
from core.function_registry import register_function

@register_function(name="SmartTavern.get_info", outputs=["info"])
def get_smarttavern_info():
    return {
        "project_name": "静态页面控制台",
        "version": "1.0.0",
        "status": "运行中"
    }
```

## 🏆 架构优势

### 1. 完全解耦
- 前端和后端项目完全独立
- 通过标准HTTP API通信
- 支持不同技术栈混合使用

### 2. 高度可扩展
- 新增前端项目零配置
- 模块化的后端系统
- 动态API发现机制

### 3. 开发友好
- 热重载和自动重启
- 完整的API文档生成
- 实时WebSocket通信
- 自动浏览器启动

### 4. 生产就绪
- 完整的错误处理
- 性能优化机制
- 安全的CORS配置
- 详细的日志系统

## 📈 扩展指南

### 添加新前端项目

1. **更新前端项目配置**:
```json
// frontend_projects/frontend-projects.json
{
  "name": "new_project",
  "type": "react",
  "path": "frontend_projects/new_project",
  "port": 3002,
  "enabled": true
}
```

2. **创建后端脚本**:
```bash
mkdir backend_projects/new_project
# 复制并修改SmartTavern的脚本
```

3. **创建项目结构**:
```python
server = get_web_server()
server.create_project_structure("new_project")
```

### 添加新API端点

```python
@register_function(name="project.new_api", outputs=["result"])
def new_api_endpoint():
    return {"message": "新的API端点"}
```

## 🔍 监控和调试

### 服务状态检查

每个后端启动脚本都包含完整的服务状态监控：
- API网关健康检查
- 前端服务器状态
- 注册函数统计
- 系统资源监控

### 日志系统

所有服务都提供详细的日志输出：
```
🚀 初始化静态页面项目后端...
✓ 服务管理器初始化完成
✓ 已加载 XX 个模块
🌐 启动API网关服务器...
✅ API网关启动成功
```

## 📚 相关文档

- [前后端集成指南](FRONTEND_BACKEND_INTEGRATION.md)
- [API网关模块文档](modules/api_gateway_module/README.md)
- [Web服务器模块文档](modules/web_server_module/README.md)
- [SmartTavern项目文档](backend_projects/SmartTavern/README.md)

## 🎯 总结

ModularFlow Framework的前后端分离架构实现了：

✅ **完全的项目分离**: 每个前端项目都有独立的后端脚本和配置
✅ **多技术栈支持**: HTML、React、Vue、React Native等
✅ **统一的API网关**: 自动发现和文档生成
✅ **实时通信支持**: WebSocket双向通信
✅ **开发友好**: 热重载、自动启动、详细日志
✅ **生产就绪**: 错误处理、性能优化、安全配置
✅ **高度可扩展**: 模块化设计，零配置添加新项目

这个架构为从简单的原型开发到复杂的企业级应用提供了完整的解决方案，同时保持了ModularFlow Framework的核心优势：灵活性、可扩展性和模块化。