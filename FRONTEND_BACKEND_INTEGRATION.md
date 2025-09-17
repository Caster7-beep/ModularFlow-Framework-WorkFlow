# ModularFlow Framework 前后端分离架构

本文档详细介绍了ModularFlow Framework的完整前后端分离架构，包括系统设计、实现方案和使用指南。

## 🎯 架构概览

ModularFlow Framework现在提供了一个完整的前后端分离解决方案，支持多种前端技术栈和统一的后端API交互。

### 核心组件

1. **API网关模块** (`modules/api_gateway_module/`) - 统一的API入口点
2. **Web服务器模块** (`modules/web_server_module/`) - 前端项目开发服务器管理
3. **前端项目集合** (`frontend_projects/`) - 多个独立的前端项目
4. **配置系统** - JSON驱动的灵活配置管理

## 📁 完整项目结构

```
ModularFlow-Framework/
├── core/                          # 框架核心
├── modules/                       # 模块系统
│   ├── api_gateway_module/        # API网关模块
│   ├── web_server_module/         # Web服务器模块
│   ├── llm_api_module/            # LLM API模块
│   └── SmartTavern/               # SmartTavern项目模块
├── frontend_projects/             # 前端项目集合
│   ├── SmartTavern/               # SmartTavern对话系统
│   │   ├── index.html
│   │   ├── css/main.css
│   │   ├── js/api.js
│   │   └── js/main.js
│   ├── web_admin/                 # React管理后台
│   ├── vue_dashboard/             # Vue仪表板
│   └── mobile_app/                # React Native移动应用
├── shared/                        # 共享资源
├── workflows/                     # 工作流
├── api-config.json                # API配置
├── backend_projects/              # 后端项目配置目录
│   └── backend-projects.json      # 后端项目配置
└── frontend_projects/             # 前端项目配置目录
    └── frontend-projects.json     # 前端项目配置
```

## 🚀 快速开始

### 1. 启动API网关

```python
from modules.api_gateway_module import get_api_gateway

# 获取API网关实例
gateway = get_api_gateway()

# 启动API服务器 (后台运行)
gateway.start_server(background=True)
```

访问API文档: `http://localhost:8000/docs`

### 2. 启动前端项目

```python
from modules.web_server_module import get_web_server

# 获取Web服务器实例
server = get_web_server()

# 启动SmartTavern项目
server.start_project("SmartTavern", open_browser=True)
```

访问前端控制台: `http://localhost:8080`

### 3. 通过函数注册系统使用

```python
from core.function_registry import get_registered_function

# 启动API网关
start_gateway = get_registered_function("api_gateway.start")
start_gateway(background=True)

# 启动前端项目
start_project = get_registered_function("web_server.start_project")
start_project("SmartTavern", open_browser=True)
```

## 🔧 配置管理

### API配置 (`api-config.json`)

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8000,
    "cors_origins": ["http://localhost:3000", "http://localhost:3001"]
  },
  "api": {
    "prefix": "/api/v1",
    "auto_discovery": true,
    "documentation": {"enabled": true, "url": "/docs"}
  },
  "websocket": {"enabled": true, "path": "/ws"},
  "static_files": {
    "enabled": true,
    "directory": "frontend_projects/SmartTavern"
  }
}
```

### 前端项目配置 (`frontend_projects/frontend-projects.json`)

```json
{
  "projects": [
    {
      "name": "SmartTavern",
      "display_name": "SmartTavern对话系统",
      "type": "html",
      "path": "frontend_projects/SmartTavern",
      "port": 6601,
      "enabled": true
    },
    {
      "name": "web_admin",
      "display_name": "管理后台",
      "type": "react",
      "path": "frontend_projects/web_admin", 
      "port": 3000,
      "dev_command": "npm start",
      "enabled": true
    }
  ]
}
```

## 🌐 网络层交互

### RESTful API

所有前端项目通过统一的RESTful API与后端交互：

**基础端点:**
- `GET /api/v1/health` - 健康检查
- `GET /api/v1/info` - 系统信息
- `POST /api/v1/function_name` - 调用注册的函数

**自动API发现:**
框架自动将所有注册的函数暴露为API端点：
- 函数名: `user.get_profile` 
- API路径: `/api/v1/user/get_profile`

### WebSocket实时通信

```javascript
// 前端WebSocket连接
const ws = new WebSocket('ws://localhost:8000/ws');

// 调用后端函数
ws.send(JSON.stringify({
    type: 'function_call',
    function: 'api_gateway.info',
    params: {}
}));

// 接收响应
ws.onmessage = function(event) {
    const response = JSON.parse(event.data);
    console.log('收到响应:', response);
};
```

## 📱 前端项目类型

### 1. 静态页面 (HTML/CSS/JS)

**特点:**
- 零配置启动
- 内置API客户端
- WebSocket支持
- 响应式设计

**启动方式:**
```python
server.start_project("SmartTavern")
# 访问: http://localhost:6601
```

### 2. React项目

**特点:**
- Create React App或自定义配置
- 热重载开发环境
- 现代化UI组件库

**启动方式:**
```python
server.start_project("web_admin")
# 访问: http://localhost:3000
```

### 3. Vue项目

**特点:**
- Vue 3 + Vite
- 组合式API
- Element Plus UI库

**启动方式:**
```python
server.start_project("vue_dashboard")
# 访问: http://localhost:3001
```

### 4. React Native移动应用

**特点:**
- 跨平台移动开发
- 原生性能
- 热重载调试

**启动方式:**
```python
server.start_project("mobile_app")
# 需要安装React Native开发环境
```

## 🔌 API集成示例

### 前端API调用

```javascript
// 使用内置API客户端
const api = new APIClient('http://localhost:8000', '/api/v1');

// 调用健康检查
const health = await api.healthCheck();

// 调用自定义函数
const result = await api.callFunction('user.get_profile', {
    user_id: 123
});

// 获取系统信息
const info = await api.getInfo();
```

### 后端函数注册

```python
from core.function_registry import register_function

@register_function(name="user.get_profile", outputs=["profile"])
def get_user_profile(user_id: int):
    """获取用户资料"""
    return {
        "user_id": user_id,
        "name": "用户名",
        "email": "user@example.com"
    }
```

自动生成的API:
- `GET /api/v1/user/get_profile?user_id=123`
- `POST /api/v1/user/get_profile` (JSON: `{"user_id": 123}`)

## 🛠️ 开发工作流

### 1. 完整开发环境启动

```python
# 一键启动所有服务
from modules.api_gateway_module import get_api_gateway
from modules.web_server_module import get_web_server

# 启动API网关
gateway = get_api_gateway()
gateway.start_server(background=True)

# 启动所有启用的前端项目
server = get_web_server()
server.start_all_enabled_projects()

print("✅ 完整开发环境已启动")
print("🌐 API文档: http://localhost:8000/docs")
print("📱 前端控制台: http://localhost:8080")
print("💻 管理后台: http://localhost:3000")
print("📊 数据仪表板: http://localhost:3001")
```

### 2. 添加新前端项目

```python
# 1. 在frontend_projects/frontend-projects.json中添加项目配置
# 2. 创建项目结构
server = get_web_server()
success = server.create_project_structure("new_project")

# 3. 启动项目
if success:
    server.start_project("new_project")
```

### 3. 添加新API端点

```python
# 方式1: 通过函数注册 (推荐)
@register_function(name="api.new_endpoint", outputs=["result"])
def new_api_endpoint(param1: str, param2: int = 10):
    return {"message": f"Hello {param1}", "value": param2}

# 方式2: 直接添加到API网关
gateway = get_api_gateway()
async def custom_handler():
    return {"status": "custom"}

gateway.router.add_endpoint("/custom", "GET", custom_handler)
```

## 📊 监控和管理

### 系统状态监控

```python
# 获取API网关状态
gateway_info = get_registered_function("api_gateway.info")()

# 获取运行中的前端服务器
running_servers = get_registered_function("web_server.running_servers")()

# 获取项目列表
projects = get_registered_function("web_server.list_projects")()

print(f"API端点数: {gateway_info['endpoints']}")
print(f"活跃WebSocket连接: {gateway_info['websocket_connections']}")
print(f"运行中的服务器: {len(running_servers)}")
```

### 日志和调试

```python
import logging

# 设置日志级别
logging.getLogger('api_gateway_module').setLevel(logging.DEBUG)
logging.getLogger('web_server_module').setLevel(logging.DEBUG)

# 查看详细的API调用日志
gateway.start_server()  # 会显示所有API请求和响应
```

## 🔐 安全和认证

### CORS配置

```json
// api-config.json
{
  "server": {
    "cors_origins": [
      "http://localhost:3000",
      "http://localhost:3001", 
      "https://yourdomain.com"
    ]
  }
}
```

### API认证 (可选)

```json
// api-config.json
{
  "authentication": {
    "enabled": true,
    "jwt_secret": "your-secret-key",
    "token_expire_hours": 24
  }
}
```

## 🎯 最佳实践

### 1. 项目组织

- **分离关注点**: 每个前端项目独立管理依赖和配置
- **统一API**: 所有前端通过相同的API网关访问后端
- **模块化开发**: 利用ModularFlow的模块系统组织业务逻辑

### 2. 开发规范

```python
# 推荐的API函数命名规范
@register_function(name="module.action", outputs=["result"])
def api_function():
    pass

# 示例:
# user.get_profile
# data.create_record  
# auth.login
# file.upload
```

### 3. 错误处理

```python
@register_function(name="api.example", outputs=["result"])
def example_api(param: str):
    try:
        # 业务逻辑
        result = process_data(param)
        return {"success": True, "data": result}
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.error(f"API错误: {e}")
        return {"success": False, "error": "内部服务器错误"}
```

## 📈 性能优化

### 1. API性能

- **异步处理**: API网关基于FastAPI，支持异步请求处理
- **自动缓存**: 静态文件自动缓存控制
- **连接池**: WebSocket连接池管理

### 2. 前端性能

- **懒加载**: 支持前端资源懒加载
- **热重载**: 开发环境自动重载
- **构建优化**: 生产环境代码分割和压缩

## 🚀 部署指南

### 开发环境部署

```python
# deploy_dev.py
from modules.api_gateway_module import get_api_gateway
from modules.web_server_module import get_web_server

def deploy_development():
    """部署开发环境"""
    # 启动API网关
    gateway = get_api_gateway()
    gateway.start_server(background=True)
    
    # 启动前端项目
    server = get_web_server()
    server.start_all_enabled_projects()
    
    print("🚀 开发环境部署完成!")

if __name__ == "__main__":
    deploy_development()
```

### 生产环境部署

```python
# deploy_prod.py
def deploy_production():
    """部署生产环境"""
    # 1. 构建前端项目
    # 2. 启动API网关 (production模式)
    # 3. 配置反向代理 (Nginx)
    # 4. 设置SSL证书
    pass
```

## 🔧 故障排除

### 常见问题

1. **端口冲突**
   - 检查端口使用: `netstat -an | findstr :8000`
   - 修改配置文件中的端口设置

2. **API连接失败**
   - 确认API网关已启动
   - 检查CORS配置
   - 验证API端点路径

3. **前端项目启动失败**
   - 检查项目依赖是否安装
   - 验证项目路径是否正确
   - 查看开发命令是否配置

### 调试工具

```python
# 诊断API网关状态
gateway = get_api_gateway()
print("API网关信息:", gateway._api_info_handler())

# 诊断前端项目状态  
server = get_web_server()
for project_name in server.projects:
    info = server.get_project_info(project_name)
    print(f"项目 {project_name}:", info)
```

## 📚 扩展开发

### 添加自定义中间件

```python
# 自定义API中间件
async def custom_middleware(request, call_next):
    # 请求前处理
    start_time = time.time()
    
    # 执行请求
    response = await call_next(request)
    
    # 请求后处理
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    
    return response

# 注册中间件
gateway = get_api_gateway()
gateway.router.add_middleware("timing", custom_middleware, priority=100)
```

### 扩展前端项目类型

```python
# 支持新的前端框架
def start_custom_project(project_path, port):
    """启动自定义前端项目"""
    # 实现自定义启动逻辑
    pass
```

## 🎉 总结

ModularFlow Framework的前后端分离架构提供了：

✅ **统一的API网关** - 单点API访问，自动文档生成
✅ **多样化前端支持** - HTML/React/Vue/React Native
✅ **开发友好** - 热重载、自动重启、浏览器集成
✅ **配置驱动** - JSON配置，零代码添加项目
✅ **实时通信** - WebSocket支持
✅ **模块化架构** - 与现有ModularFlow无缝集成
✅ **生产就绪** - 性能优化、错误处理、安全配置

这个架构可以支持从简单的原型开发到复杂的企业级应用的各种需求，同时保持了ModularFlow Framework一贯的灵活性和可扩展性。

---

**快速链接:**
- [API网关模块文档](modules/api_gateway_module/README.md)
- [Web服务器模块文档](modules/web_server_module/README.md)
- [SmartTavern对话系统](frontend_projects/SmartTavern/README.md)
- [React管理后台](frontend_projects/web_admin/README.md)
- [Vue仪表板](frontend_projects/vue_dashboard/README.md)