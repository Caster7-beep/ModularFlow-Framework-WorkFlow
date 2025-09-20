# 可视化工作流（Visual Workflow）单一事实指南（Single Source of Truth）

版本：v1.0-sot  
最后更新：2025-09-20  
适用范围：ModularFlow Framework - 可视化工作流模块（后端 + 前端编辑器 + 运维与验收）

---

## 0. 文档目的与结构

本文件整合并取代下列过时或分散文档：
- Caster 工作流开发指导（原 [Caster_Guide.md](Caster_Guide.md)）
- 可视化工作流系统验收文档（原 [VISUAL_WORKFLOW_ACCEPTANCE.md](VISUAL_WORKFLOW_ACCEPTANCE.md)）
- 可视化工作流系统开发指南（原 [VISUAL_WORKFLOW_DEVELOPMENT_GUIDE.md](VISUAL_WORKFLOW_DEVELOPMENT_GUIDE.md)）

并在此基础上，纳入最新已落地改动（Polish v2–v6 等）、当前架构、验收流程、运维操作、以及未来路线与实施细则。后续一切与“可视化工作流”相关的信息，以本文件为准。

---

## 1. 快速上手（Quick Start）

### 1.1 启动后端（6502，API /api/v1，WS /ws）
- 标准启动脚本：[`startserver.py`](backend_projects/visual_work_flow/startserver.py)
- PowerShell 7（同一会话内设置 GEMINI_API_KEY）：
```powershell
# 停旧实例（忽略失败）
try {
  $conn = Get-NetTCPConnection -LocalPort 6502 -ErrorAction Stop | Select-Object -First 1
  if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }
} catch {}

# 设置密钥
$env:GEMINI_API_KEY="<你的密钥>"

# 后台启动
python backend_projects/visual_work_flow/startserver.py --background

# 健康检查
Invoke-RestMethod http://localhost:6502/api/v1/health
```
- 验证：
  - API 文档：http://localhost:6502/docs
  - API 前缀：http://localhost:6502/api/v1
  - WS：ws://localhost:6502/ws

### 1.2 启动前端编辑器（3002）
```bash
cd frontend_projects/visual_workflow_editor
npm install
npm run dev
```
- 打开 http://localhost:3002
- 页面无控制台错误，编辑器可交互

### 1.3 一键“快速自检”
- 顶部工具栏点击“快速自检”
- 期望弹窗五行摘要：
  - Frontend E2E Smoke (LLM): PASS
  - Final Output (LLM): ping
  - Frontend E2E Smoke (CodeBlock): PASS
  - Final Output (CodeBlock): len=5
  - WS Events (last 20): execution_start, execution_complete, …

---

## 2. 架构与组件

### 2.1 总览
- 后端：
  - API 网关：[`api_gateway_module.py`](modules/api_gateway_module/api_gateway_module.py)
  - 可视化工作流 API：[`visual_workflow_module.py`](modules/visual_workflow_module/visual_workflow_module.py)、[`optimized_visual_workflow_module.py`](modules/visual_workflow_module/optimized_visual_workflow_module.py)
  - 执行引擎：[`visual_workflow.py`](orchestrators/visual_workflow.py)、[`optimized_visual_workflow.py`](orchestrators/optimized_visual_workflow.py)
- 前端：
  - 入口：[`App.tsx`](frontend_projects/visual_workflow_editor/src/App.tsx)
  - 画布：[`WorkflowCanvas.tsx`](frontend_projects/visual_workflow_editor/src/components/WorkflowCanvas.tsx)
  - 工具栏：[`Toolbar.tsx`](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx)
  - 节点：[`src/components/nodes/*`](frontend_projects/visual_workflow_editor/src/components/nodes/)
  - 执行监控：[`ExecutionMonitor.tsx`](frontend_projects/visual_workflow_editor/src/components/ExecutionMonitor.tsx)
  - 弹窗/Toast/帮助：[`ShortcutsModal.tsx`](frontend_projects/visual_workflow_editor/src/components/ShortcutsModal.tsx)、[`Toast.tsx`](frontend_projects/visual_workflow_editor/src/components/Toast.tsx)
  - E2E 脚本：[`e2e_browser_smoke.mjs`](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs)、[`e2e_regression.mjs`](frontend_projects/visual_workflow_editor/scripts/e2e_regression.mjs)

### 2.2 数据与节点规范（精简）
- 节点输出（NodeOutput）：
```python
# NodeOutput
{text: str, signal: int|None, metadata: dict}
```
- 常用节点类型：
  - 输入（input）、LLM 调用（llm_call）、代码块（code_block）、条件（condition）、开关（switch）、聚合（merger）、输出（output）
- 连接（简化）：
```typescript
interface Connection {
  source: string
  target: string
  dataType: 'text' | 'signal' | 'all'
  condition?: string
}
```

### 2.3 运行与安全
- 代码块执行沙箱（Python）在后端引擎内受限执行，白名单内置与模块。
- WS 实时：通过 `/ws` 广播执行状态，前端统一接入并可断线重连。

---

## 3. 已落地改动（Polish v2 – v6）

本节记录从原始文档到当前版本期间，我们对“可视化工作流”前后端所做的系统性改造与新增能力。若需定位代码，请以本文链接为准。

### 3.1 后端与基础设施
- 新增独立后端启动（视觉工作流专用）：
  - 后台启动与环境变量自动注入：[`startserver.py`](backend_projects/visual_work_flow/startserver.py)
  - 端口/前缀/WS 统一：6502 /api/v1 /ws
- 移除不合理念脚本（SmartTavern 优化脚本旧实现，文档已清理引用）
- API 路由采用函数自动暴露（function_registry），编辑器服务层适配函数路由

### 3.2 前端 UX/UI 与交互（黑白极简风）
- 统一设计系统（黑/白/灰、圆角≤4px、48×48 可达性、4/8pt 网格）
- 画布与节点卡片统一：
  - 卡片化、标题排版、溢出修正（如输入节点 overflow-hidden）
  - 连接句柄命中区扩大（CSS 伪元素，无伪影），连线默认 2px、hover/选中 3px
  - 网格：点阵 Background（gap=16，size≈1.25），默认可见，可显隐
- 工具栏与二排折叠：
  - 二排包含：对齐/分布、边样式切换（Smooth/Orthogonal）、Reduced Motion（RM）、快捷键帮助（?）、清空画布（Clear）、网格显隐开关（关闭时有极简指示 ring）
  - 顶栏展开不溢出：通过 CSS 变量 `--toolbar-height`（56px/112px） + sticky 顶栏；画布/侧栏高度 `calc(100vh - var(--toolbar-height))`
- 高级编辑能力：
  - 多选对齐/分布（按钮/快捷键 Alt+Arrows、Alt+Shift+H/V）
  - 撤销/重做（50 深度）、复制/剪切/粘贴（偏移 16px，支持多选）
  - 右键上下文菜单（空白/单选/多选），支持重命名/复制/剪切/删除/锁定、组合/解组
  - 组合/解组（逻辑 groupId）、锁定（locked，不可拖/不可连线，浅灰视觉）
  - 布局导出/导入（包含坐标/尺寸/锁定/组/边类型）
  - 尺寸模式（R/按钮）：节点右下角 resize、单实例尺寸持久化
  - 自动对齐参考线（AA）开关（默认开启）；AA=off 完全绕过 rAF 计算，拖拽更顺畅；AA=on 启用 2px 最小阈值，降低迟滞
  - 边样式切换 UI 落地（Smooth/Orthogonal），新建边按当前样式渲染
- 辅助与可达性：
  - ShortcutsModal（?）快捷键帮助；Toast 黑白极简提示；ARIA 属性与焦点环统一
  - ExecutionMonitor 统一接入 WS（/ws），断线重连、ring buffer 去重与限流

### 3.3 测试与验收
- 端到端 E2E：
  - 冒烟脚本：[`scripts/e2e_browser_smoke.mjs`](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs)
  - 回归脚本：[`scripts/e2e_regression.mjs`](frontend_projects/visual_workflow_editor/scripts/e2e_regression.mjs)
  - 日志输出：[`scripts/logs/last_e2e.txt`](frontend_projects/visual_workflow_editor/scripts/logs/last_e2e.txt)
- 自检按钮（工具栏）用于最小工作流端到端连通性验证

---

## 4. 验收（Acceptance）

### 4.1 环境准备
- Python 3.8+，Node 16+
- 后端依赖：`pip install -r requirements.txt`
- 前端依赖：`cd frontend_projects/visual_workflow_editor && npm i`

### 4.2 步骤
1) 启动后端：[`startserver.py`](backend_projects/visual_work_flow/startserver.py) 同一会话注入 GEMINI_API_KEY  
2) 启动前端：`npm run dev`  
3) 打开编辑器（http://localhost:3002）  
4) 运行“快速自检”，检查五行摘要  
5) 基本功能覆盖：
   - 节点创建、连线、删除
   - 保存/加载/导入/导出
   - 执行与监控
6) 高级功能覆盖：
   - 多选对齐/分布（含快捷键）
   - 撤销/重做、复制/剪切/粘贴
   - 右键菜单（空白/单选/多选）
   - 组合/解组、锁定
   - 边样式切换 Smooth/Orthogonal
   - 网格显隐、AA 开关、尺寸模式
   - 导出/导入布局
7) E2E：执行回归脚本并检查日志（last_e2e.txt）

---

## 5. 运维与故障排除

### 5.1 常见问题
- 404 或 API 端点缺失：
  - 在同一 PowerShell 会话设置 GEMINI_API_KEY 后再运行 [`startserver.py`](backend_projects/visual_work_flow/startserver.py)
  - 更改密钥或环境变量后需重启后端
- 前端无法连接后端：
  - 检查 API 前缀与 WS：6502 /api/v1 /ws
  - 检查浏览器控制台网络请求
- WS 无事件：
  - 检查网关与 /ws；前端已带自动重连与状态指示
- UI 迟滞：
  - 关闭“AA 自动对齐”或减小节点密度；AA=on 已内建 2px 阈值

### 5.2 E2E 提示
- 断言波动一般为无头浏览器时序问题，可在脚本加入 waitForFunction（读取 `window.__qaHooks`）并适当 sleep
- 清空画布用工具栏“Clear”按钮（避免直操 DOM）

---

## 6. 未来改进方向与实施细则

### 6.1 执行引擎与模型
- Manhattan 路由（Orthogonal 边全局避让）：
  - 在画布侧提供自定义 Edge 组件，基于节点包围盒计算分段路径
  - 逐步引入路由缓存与增量更新
- 并行执行拓扑优化：
  - 在后端引擎加入批次化调度与资源感知（限流、优先级）

### 6.2 前端编辑体验
- 吸附与参考线增强：
  - 较大节点时自适应阈值（随缩放）、参考线多源比对
- 模板系统与快速流程：
  - 常用编排模板（输入→LLM→输出、分支投票、聚合汇总等）
  - 模板导入导出与市场

### 6.3 协作与管控
- 版本管理与审计：
  - 布局与配置的版本快照、差异比对、回滚
- 多人协作：
  - 基于 WS 或 CRDT 的多用户光标与变更合并
- 权限与分级：
  - 节点/工作流级别的访问控制，审批流程

### 6.4 质量与监控
- 更全面的 E2E 稳健化：
  - 所有关键操作均使用语义化选择器（aria/role/title），减少 class 依赖
  - 将日志从摘要扩展为逐条断言落地（含耗时），便于 CI 观察
- 前端性能预算：
  - FCP & LCP 目标、拖拽响应（<16ms）与大规模布局（20+ 节点）压力测试自动化

---

## 7. API 与脚本快速参考

- 可视化工作流 API（后端）：
  - 创建：`POST /api/v1/visual_workflow/create`
  - 执行：`POST /api/v1/visual_workflow/execute`
  - 列表：`GET  /api/v1/visual_workflow/list`
- 前端服务层：[`api.ts`](frontend_projects/visual_workflow_editor/src/services/api.ts)
- E2E：
  - 冒烟：`node` [`scripts/e2e_browser_smoke.mjs`](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs)
  - 回归：`node` [`scripts/e2e_regression.mjs`](frontend_projects/visual_workflow_editor/scripts/e2e_regression.mjs)
  - 日志：[`scripts/logs/last_e2e.txt`](frontend_projects/visual_workflow_editor/scripts/logs/last_e2e.txt)

---

## 8. 变更记录（关键里程碑）

- 后端独立化与统一端口/前缀/WS；移除旧脚本引用
- 前端黑白极简 UI 大改：节点卡片、把手命中、连线加粗、网格点阵可见
- 工具栏二排折叠 + 多选对齐/分布 + 尺寸模式 + AA 自动对齐 + 边样式切换 + 网格显隐 + 清空画布
- 右键菜单（空白/单选/多选）；撤销/重做；复制/剪切/粘贴；组合/解组；锁定
- 布局导出/导入（含坐标/尺寸/锁定/组/边类型）
- 执行监控统一接入 /ws；ShortcutsModal、Toast；状态持久化（vw_*）
- E2E 冒烟 + 回归脚本；日志落地 last_e2e.txt

---

## 9. 附录：规范与约定

- 视觉规范：黑/白/灰；圆角≤4px；按钮≥48×48；4/8pt 间距；高对比可读性（WCAG ≥4.5:1）
- 代码规范：TypeScript strict；Tailwind 原子类优先；最小 CSS 覆盖；仅在必要处用 !important
- 交互约定：所有切换类按钮具 aria-pressed；键盘可达；焦点环 focus:ring-2 ring-black
- 配置与密钥：在同一会话设置 GEMINI_API_KEY 后再启动后端（自动注入）

---

（完）