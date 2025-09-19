# ModularFlow Framework

一个高度灵活、完全模块化的处理框架，其核心是 **服务驱动** 和 **配置驱动** 的架构。框架具备强大的开放性，不仅能处理文本，还能编排各种数据类型和业务逻辑的模块化工作流。系统能够自动发现并加载模块和工作流，无需复杂的设置。

## 🎯 核心理念

- **服务发现**: 模块和功能被自动发现和加载，无需手动注册。
- **配置驱动**: 通过唯一的 `backend_projects/backend-projects.json` 文件定义项目结构和模块作用域。
- **完全解耦**: 模块之间没有硬编码的导入依赖，极大地提高了可维护性。
- **多项目支持**: 原生支持多个独立项目的并行开发和管理。
- **模块即功能**: 每个模块都专注于提供一组高内聚的功能函数。
- **变量隔离**: 通过服务管理器安全地访问与当前项目绑定的全局变量。

## 📁 项目结构

```
text_workflow/
├── core/                       # 框架核心
│   ├── services.py            # 统一服务管理器
│   └── function_registry.py   # 函数注册系统
│
├── modules/                    # 模块目录
│   └── SmartTavern/           # SmartTavern 项目的模块
│       ├── framing_prompt_module/
│       └── ...
│
├── shared/                     # 共享资源目录
│   └── SmartTavern/           # SmartTavern 项目的共享资源
│       ├── globals.py         # 项目的全局变量
│       ├── characters/
│       └── ...
│
├── workflows/                  # 工作流定义
├── backend_projects/           # 后端项目配置目录
│   └── backend-projects.json   # 后端项目配置文件 (唯一的配置)
├── frontend_projects/          # 前端项目配置目录
│   └── frontend-projects.json  # 前端项目配置文件
└── runner.py                   # 主执行器
```

## 🏗️ 架构设计

### 1. 服务与项目管理 (`core/services.py` & `backend_projects/backend-projects.json`)
这是框架的基石。[`UnifiedServiceManager`](core/services.py:46) 在启动时读取 [`backend_projects/backend-projects.json`](backend_projects/backend-projects.json:1)，了解所有已定义的项目、它们的模块路径和共享资源路径。随后，它会自动扫描这些路径，加载所有符合规范的模块。

### 2. 变量管理系统

#### 项目全局变量 (`shared/<ProjectName>/globals.py`)
- 每个项目都有其专属的 `globals.py` 文件（例如 [`shared/SmartTavern/globals.py`](shared/SmartTavern/globals.py:1)）。
- 包含该项目所有模块共享的运行时状态、缓存、配置等。
- **关键**: 访问它 **必须** 通过框架提供的安全接口，**严禁** 硬编码导入。

#### 模块局部变量 (`modules/.../variables.py`)
- 每个模块文件夹内可以有自己的 `variables.py`。
- 包含模块内部使用的配置、状态或常量。
- 这种做法依然被支持，用于需要高度封装的模块。

### 3. 使用变量系统
正确的变量访问方式是解耦和安全的关键。

```python
# 在任何模块中 (e.g., modules/SmartTavern/framing_prompt_module/framing_prompt_module.py)

from core.services import get_current_globals
from core.function_registry import register_function
from . import variables as v # 导入模块局部变量 (如果存在)

@register_function(name="framing.assemble", ...)
def assemble_framing_prompt(...):
    # 1. 安全地获取当前项目的全局变量
    g = get_current_globals()
    
    # 2. 使用全局变量
    if g:
        g.execution_count += 1
        # 从 g.presets, g.character_data 等读取数据
    
    # 3. 使用模块局部变量
    some_config = v.SOME_LOCAL_SETTING
    
    # ... 函数逻辑 ...
```

## 🚀 快速开始

系统现在的使用方式非常直接，所有发现和加载都是自动的。

```bash
# 查看所有已注册的函数
python runner.py --list-functions

# 查看所有可用的工作流
python runner.py --list-workflows

# 执行一个工作流 (以SmartTavern项目为例)
python runner.py full_prompt_generation_from_files --character_file main_char.json --persona_file default_user.json --conversation_file sample_chat.json

# 启用调试模式以获取更详细的输出
python runner.py <workflow_name> --debug

# 查看帮助
python runner.py --help
```

### VisualWorkFlow 快速开始

- 后端采用独立启动脚本：[`startserver.py`](backend_projects/visual_work_flow/startserver.py:1)
- 端口约定：HTTP http://localhost:6502，API 前缀 /api/v1，WebSocket 路径 /ws

后端启动（PowerShell 7 示范）：
```powershell
# 1) 停旧实例（忽略失败）
try {
  $conn = Get-NetTCPConnection -LocalPort 6502 -ErrorAction Stop | Select-Object -First 1
  if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }
} catch {}

# 2) 设置密钥（同一会话）
$env:GEMINI_API_KEY="<你的密钥>"

# 3) 启动后端（后台）
python backend_projects/visual_work_flow/startserver.py --background

# 4) 健康检查
Invoke-RestMethod http://localhost:6502/api/v1/health
```

前端启动：
```bash
cd frontend_projects/visual_workflow_editor && npm i && npm run dev
# 浏览器访问：http://localhost:3002
```

一键“快速自检”：
- 在编辑器工具栏点击“快速自检”，期望弹窗五行摘要：
  - Frontend E2E Smoke (LLM): PASS
  - Final Output (LLM): ping
  - Frontend E2E Smoke (CodeBlock): PASS
  - Final Output (CodeBlock): len=5
  - WS Events (last 20): execution_start, execution_complete, …

环境变量覆盖：
- 前端：
  - VITE_API_BASE=http://localhost:6502/api/v1
  - VITE_WS_URL=ws://localhost:6502/ws
- 后端：
  - GEMINI_API_KEY 必须在同一 PowerShell 会话设置后再启动 [`startserver.py`](backend_projects/visual_work_flow/startserver.py:1)，变量才会被自动注入

## 📦 创建一个新模块

1.  **确定作用域**:
    - 如果是所有项目通用的功能，在 `modules/` 下创建文件夹。
    - 如果是特定项目（如 `SmartTavern`）的功能，在 `modules/SmartTavern/` 下创建文件夹。

2.  **创建模块结构**:
    ```
    modules/
    └── my_new_module/
        ├── __init__.py
        ├── my_new_module.py  # 模块主脚本
        └── variables.py      # (可选) 模块局部变量
    ```

3.  **编写模块代码**:
    ```python
    # modules/my_new_module/my_new_module.py
    from core.function_registry import register_function
    from core.services import get_current_globals
    
    @register_function(name="new.do_something", outputs=["status"])
    def do_something():
        g = get_current_globals()
        if g:
            print(f"在项目 {g.project_name} 的上下文中执行")
        
        return {"status": "done"}
    ```

4.  **完成**！下次运行 `runner.py` 时，`new.do_something` 函数就会被自动发现并注册。

## 🔄 LLM API架构重构

ModularFlow Framework 已完成 LLM API 系统的重大重构，采用**模块分离**和**桥接模式**：

### 通用LLM API模块 (`modules/llm_api_module/`)
- **独立的API管理器**: 提供纯净的、与业务逻辑无关的LLM API调用功能
- **多提供商支持**: OpenAI、Anthropic (Claude)、Google Gemini
- **标准化接口**: 统一的请求/响应格式，自动处理不同API格式差异
- **流式支持**: 完整的流式和非流式响应处理
- **模型列表**: 符合各提供商官方API规范的模型获取功能

### SmartTavern桥接模块 (`modules/SmartTavern/llm_bridge_module/`)
- **业务逻辑桥接**: 连接通用API模块与SmartTavern特定需求
- **向后兼容**: 保持所有现有API接口不变
- **智能缓存**: 管理器实例缓存和配置管理
- **无缝集成**: 现有代码无需修改即可使用新架构

### 重构优势
- **职责分离**: 通用模块专注API调用，桥接模块处理业务逻辑
- **代码复用**: 通用模块可被其他项目直接使用
- **扩展性**: 新增LLM提供商或新项目都更容易实现
- **维护性**: 清晰的模块边界，便于测试和维护

## ️ 清理与简化
随着架构的演进，以下文件和概念已被 **移除**:
- `config.json`: 其功能已被 `backend_projects/backend-projects.json` 和自动发现机制取代。
- `shared/constants.py`: 应合并到具体项目的 `globals.py` 或模块的 `variables.py` 中。
- `shared/resources.py`: 同上。
- `orchestrators/`: 编排器的概念已被更灵活的工作流所取代。
- **交互模式**: `runner.py` 现在专注于直接执行。
- 已移除/不再使用 [`optimized_start_server.py`](backend_projects/SmartTavern/optimized_start_server.py:1)，请使用 [`startserver.py`](backend_projects/visual_work_flow/startserver.py:1)

## 🛠️ 故障排除（简表）
- 问题：LLM 返回“未配置密钥/基础URL”
  - 解决：在同一 PowerShell 会话中设置 $env:GEMINI_API_KEY 后，再运行 [`startserver.py`](backend_projects/visual_work_flow/startserver.py:1)
- 问题：前端“快速自检”失败但 CodeBlock 通过
  - 解决：确认后端端口与前端环境变量一致（VITE_API_BASE、VITE_WS_URL），或在前端 .env.local 指定
- 问题：WS 无事件
  - 解决：确认 WS 地址为 ws://localhost:6502/ws，并检查浏览器控制台的连接状态/重连提示

## 📄 许可证

MIT