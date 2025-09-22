# ModularFlow Framework

一个高度灵活、完全模块化的处理框架，其核心是 **服务驱动** 和 **配置驱动** 的架构。框架具备强大的开放性，不仅能处理文本，还能编排各种数据类型和业务逻辑的模块化工作流。系统能够自动发现并加载模块和工作流，无需复杂的设置。

单一事实指南（SSoT）：[VISUAL_WORKFLOW_SINGLE_SOURCE_OF_TRUTH.md](VISUAL_WORKFLOW_SINGLE_SOURCE_OF_TRUTH.md:1)

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

- 后端采用独立启动脚本：[startserver.py](backend_projects/visual_work_flow/startserver.py:1)
- 端口约定：HTTP http://localhost:6502，API 前缀 /api/v1，WebSocket 路径 /ws

后端（VisualWorkFlow 独立后端，端口 6502，API /api/v1，WS /ws）：
```powershell
# PowerShell 7（同一会话设置环境变量）
$env:GEMINI_API_KEY="<你的密钥>"
python backend_projects/visual_work_flow/startserver.py

# 健康检查（建议）
curl http://localhost:6502/api/v1/health
# OpenAPI
# http://localhost:6502/docs
# WS
# ws://localhost:6502/ws
```

前端（Visual Workflow Editor，端口 3002）：
```bash
cd frontend_projects/visual_workflow_editor
npm ci
npm run dev
# 浏览器访问：http://localhost:3002
```

快速自检（M2-1 已实现）：
- 打开编辑器后，点击工具栏“快速自检”，弹窗会显示 5 行摘要（Health/Docs/WS/LLM/CodeBlock）
- 自检结果会写入 window.__qaHooks.lastSelfTest，供 E2E 读取

端到端最小链路（M2-3 已实现）（简述）：
- 在画布中构建：
  - A：Input(value="ping") → LLM(provider=gemini, model=gemini-2.5-flash, prompt="Echo: {{input}}") → Output
  - B：Input(value="hello") → CodeBlock(读取 inputs.value/inputs.text 输出 "len=5") → Output
- 点击“执行”，右侧 [ExecutionMonitor.tsx](frontend_projects/visual_workflow_editor/src/components/ExecutionMonitor.tsx:1) 会只显示本次 run 事件序列；Output 显示对应文本（A 包含 “ping”，B 为 “len=5”）

E2E 脚本运行指引（M3 已增强）：
- 冒烟（Smoke）：
  - Node 执行 [e2e_browser_smoke.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:1)
  - 覆盖最小链路 A/B 与快速自检读取，日志写入 [last_e2e.txt](frontend_projects/visual_workflow_editor/scripts/logs/last_e2e.txt:1)（附 [SMOKE] 分节）
- 回归（Regression）：
  - Node 执行 [e2e_regression.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_regression.mjs:1)
  - 覆盖画布增删/连线/对齐/分布/边样式/上下文菜单/组合解组/清空画布等，日志写入 last_e2e.txt（附 [REGRESSION] 分节）
- 日志样例：
  - [SMOKE] A: PASS out="ping" / B: PASS out="len=5"
  - [REGRESSION] 总断言: 36 | 失败: 0 | 重试: 1 | 最终: PASS

重要说明：
- 不涉及 SmartTavern 桥接与 runner.py 的耦合；可视化工作流采用独立后端 + 前端分离架构
- WebSocket 心跳（ping/pong）已在前端层屏蔽，不影响业务事件；监控支持 run:{run_id} 订阅（M2-2）
- 详细设计、契约与路线图以 SSoT 为准

环境变量覆盖：
- 前端：
  - VITE_API_BASE=http://localhost:6502/api/v1
  - VITE_WS_URL=ws://localhost:6502/ws
- 后端：
  - GEMINI_API_KEY 必须在同一 PowerShell 会话设置后再启动 [startserver.py](backend_projects/visual_work_flow/startserver.py:1)，变量才会被自动注入

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
---
## 说明：与当前实现一致的最小必要补充

为确保快速上手、路由回退、UI IA、E2E 指引和质量闸与当前实现一致，补充以下要点（保持原文结构不变，新增说明块）。所有引用均为可点击锚点。

1) 快速上手与环境变量
- 后端：端口 6502、API 前缀 /api/v1、WS /ws；启动脚本与健康检查参考 [startserver.py](backend_projects/visual_work_flow/startserver.py:1)
- 前端：Vite dev 端口 3002；环境变量 VITE_API_BASE、VITE_WS_URL；可选 vite preview（默认 3010），参见 [vite.config.ts](frontend_projects/visual_workflow_editor/vite.config.ts:1)
- 快速自检（编辑器右上角“更多⋯”抽屉）：
  - 自检逻辑：[selfTest.ts](frontend_projects/visual_workflow_editor/src/utils/selfTest.ts:1)
  - 工具栏入口：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:1)
  - 自检会写入 window.__qaHooks.lastSelfTest（供 E2E 读取，见 [selfTest.ts](frontend_projects/visual_workflow_editor/src/utils/selfTest.ts:404)）

2) 路由与一次性回退机制
- 当前后端公开为“旧短路由”：/visual_workflow/create|get|update|delete|execute|list|get_templates|get_execution_state
- 前端服务层在 404/405 时会“仅一次”自动回退至旧路由（文档保留新命名示例，标注当前回退行为）：
  - 服务层入口：[api.ts](frontend_projects/visual_workflow_editor/src/services/api.ts:1)
  - 回退函数：[requestWithFallback()](frontend_projects/visual_workflow_editor/src/services/api.ts:51)
  - 结果兜底映射：[mapToWorkflowExecution()](frontend_projects/visual_workflow_editor/src/services/api.ts:108)

3) UI IA 与可达性（右上角工具栏）
- 顶部主操作：执行、监控、上报、更多（抽屉）
- “更多”抽屉包含：对齐/分布、边样式切换（Smooth/Orthogonal）、Reduced Motion、快捷键帮助、自检、网格显隐与吸附、清空画布、语言/主题
- 参考实现：
  - 工具栏与抽屉：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:1)
  - 样式与高度变量（--toolbar-height 等）：[App.css](frontend_projects/visual_workflow_editor/src/App.css:1)

4) 画布与布局稳定性（Error#004 相关）
- React Flow 父容器尺寸显式化，主布局防塌陷：
  - 画布容器与类名：[WorkflowCanvas.tsx](frontend_projects/visual_workflow_editor/src/components/WorkflowCanvas.tsx:1199)
  - 全局高度与变量：[App.css](frontend_projects/visual_workflow_editor/src/App.css:1)
  - 主布局容器：[App.tsx](frontend_projects/visual_workflow_editor/src/App.tsx:953)
- AntD useForm 绑定修复（Modal forceRender + destroyOnClose=false）：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:738)

5) E2E 与日志
- 冒烟脚本：[e2e_browser_smoke.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:1)
- 回归脚本：[e2e_regression.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_regression.mjs:1)
- 日志位置：[scripts/logs/last_e2e.txt](frontend_projects/visual_workflow_editor/scripts/logs/last_e2e.txt:1)
- 稳健化策略（摘要）：选择器多候选（data-qa/ARIA/文本）、Drawer-aware 点击、两段 rAF 稳定、指数退避重试、[FALLBACK] 日志捕获
- 最新事实摘录：SMOKE A/B PASS（A=ping，B=len=5）；REGRESSION 最新多次统计失败>2，未达收敛，详见 [last_e2e.txt](frontend_projects/visual_workflow_editor/scripts/logs/last_e2e.txt:1)

6) 质量闸（类型与构建）
- TypeScript 严格开启且不发射（"strict": true, "noEmit": true）：[tsconfig.json](frontend_projects/visual_workflow_editor/tsconfig.json:1)
- Vite 构建通过；dev 端口 3002 / 代理 /ws 与 /api：见 [vite.config.ts](frontend_projects/visual_workflow_editor/vite.config.ts:1)
- 产物大小提示：>500k chunk 警示为非阻断提醒

提示：
- 前端环境变量：VITE_API_BASE=http://localhost:6502/api/v1，VITE_WS_URL=ws://localhost:6502/ws
- 后端环境变量：GEMINI_API_KEY 需在同一 PowerShell 会话设置后再启动 [startserver.py](backend_projects/visual_work_flow/startserver.py:1)
### 待办清单

- [ ] 补齐 UI 入口（服务层调用）：列表/详情/更新/删除/模板/执行状态
  - 说明：在“加载工作流”弹窗调用 getWorkflows 与 getWorkflow；在详情视图提供“重命名/保存”(updateWorkflow) 与“删除工作流”(deleteWorkflow)；NodePanel 初始化 getNodeTemplates；执行后轮询 getExecutionStatus
  - 参考：[api.ts](frontend_projects/visual_workflow_editor/src/services/api.ts:1)
- [ ] Network 全 200 复检（UI 驱动，记录 primary→fallback）
  - 说明：通过 UI 触发 list/get/create/update/delete/execute/get_execution_state/get_workflow_templates，保留 HAR/截图，Console 捕获 “Fallback route engaged …”
  - 参考：[requestWithFallback()](frontend_projects/visual_workflow_editor/src/services/api.ts:51)
- [ ] E2E 第四次回归收敛（目标≤2）
  - 说明：基于第三轮稳健化（多候选、Drawer-aware、rAF、指数退避、[FALLBACK] 捕获）继续小幅加强，完成双跑统计、产出 [REG-STATS]
  - 参考：[e2e_regression.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_regression.mjs:1)
- [ ] Dev 控制台 Error 清理
  - 说明：复核各 Modal/Form 实例绑定与弹层容器（useForm 未挂载等），保持 0 Error
  - 参考：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:1)
- [ ] UI/UX 手动核对（关键路径）
  - 说明：抽屉 IA、对齐/分布、边样式切换（Smooth/Orthogonal）、AA、尺寸模式、网格显隐、清空画布、右键菜单、组合/解组、撤销重做、复制粘贴
  - 参考：[WorkflowCanvas.tsx](frontend_projects/visual_workflow_editor/src/components/WorkflowCanvas.tsx:1), [ContextMenu.tsx](frontend_projects/visual_workflow_editor/src/components/ContextMenu.tsx:1)
- [ ] errorService 上报地址对齐（建议项）
  - 说明：统一上报基址到 VITE_API_BASE 或在网关侧增加 /errors/report 代理，避免 3002 端口 404
  - 参考：[errorService.ts](frontend_projects/visual_workflow_editor/src/services/errorService.ts:1)
- [ ] 构建体积优化（建议项）
  - 说明：按需拆分大依赖与路由动态加载、rollup manualChunks 拆包；当前 >500k chunk 为警示非阻断
  - 参考：[vite.config.ts](frontend_projects/visual_workflow_editor/vite.config.ts:1)
- [ ] 文档持续对齐
  - 说明：UI 入口补齐与回归收敛完成后，更新 SSoT/README 的快速上手、路由示例与 E2E 结果