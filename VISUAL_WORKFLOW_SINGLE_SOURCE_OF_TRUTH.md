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

- 前端阶段性变更（2025-09-22）
  - 取消导览/快速入门入口：导览组件保留但不渲染 UI 与副作用，见 [UserGuide.tsx](frontend_projects/visual_workflow_editor/src/components/UserGuide.tsx:11)
  - “上报”入口默认隐藏（功能保留）：以特性开关 VITE_FEATURE_QA_REPORT 控制渲染，按钮条件渲染见 [Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:454)
  - 新增“凭证管理”与本地存储（vw_api_providers_v1）：入口按钮见 [Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:547)，组件与挂载见 [CredentialManager.tsx](frontend_projects/visual_workflow_editor/src/components/CredentialManager.tsx:1)、[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:869)，存储键与实现见 [credentials.ts](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:33)
  - Modal 生命周期修复：destroyOnClose→destroyOnHidden，见 [Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:763)
  - “更多⋯”按钮可达性增强：aria-label/role/aria-expanded/aria-controls 与 ≥48×48 触达，见 [Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:475)
  - Drawer 可见性标记与 rootClassName（便于 E2E 探测）：marker 与 className 见 [Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:499)、[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:511)
  - E2E 冒烟增强：加入 Hydration 守护、选择器诊断、自检与“凭证入口+Modal”检查、去 page.waitForTimeout 兼容写法，见 [e2e_browser_smoke.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:213)、[e2e_browser_smoke.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:221)、[e2e_browser_smoke.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:270)、[e2e_browser_smoke.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:381)
  - 新增 E2E 会话参数：UI_URL 可加 e2eOpenDrawer=1 以初始展开 Drawer（仅测试会话），逻辑见 [Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:186)。该模式下 SMOKE 自检 items.length=5，且 LLM/CodeBlock 冒烟均 PASS
  - i18n 文案补齐：新增 toolbar.credentials 与 credentials.* 等键，见 [zh-CN.json](frontend_projects/visual_workflow_editor/src/i18n/locales/zh-CN.json:1)、[en-US.json](frontend_projects/visual_workflow_editor/src/i18n/locales/en-US.json:1)
  - 活动提供商字段调整为 active_group_id（一次性迁移 legacy active_provider，详见 [loadCredentials() 迁移](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:216) 与 [setActiveGroup()](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:425)）
  - 分组支持显示名称 name，展示优先使用 name（编辑入口见 [groupName 输入](frontend_projects/visual_workflow_editor/src/components/CredentialManager.tsx:334)）
  - openai-compatible base_url 自动补全 /v1 与去尾斜杠规范化（实现见 [sanitizeGroup()](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:148) 与 [loadCredentials()](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:248)）

---

## 9. 附录：规范与约定

- 视觉规范：黑/白/灰；圆角≤4px；按钮≥48×48；4/8pt 间距；高对比可读性（WCAG ≥4.5:1）
- 代码规范：TypeScript strict；Tailwind 原子类优先；最小 CSS 覆盖；仅在必要处用 !important
- 交互约定：所有切换类按钮具 aria-pressed；键盘可达；焦点环 focus:ring-2 ring-black
- 配置与密钥：在同一会话设置 GEMINI_API_KEY 后再启动后端（自动注入）

---

（完）
---
## 10. 与当前实现一致的补充说明（最小必要修订）

说明：本节为增量更正与补充，以当前代码实现为准，提供快速上手、路由与回退、UI IA、稳定性修复、E2E 与质量闸的必要信息。全部文件与函数引用均为可点击锚点。

1) 快速上手与环境变量
- 后端：端口 6502、API 前缀 /api/v1、WS /ws；独立启动脚本与健康检查见 [startserver.py](backend_projects/visual_work_flow/startserver.py:1)
- 前端：Vite dev 端口 3002；环境变量 VITE_API_BASE、VITE_WS_URL；可选 vite preview（3010），参见 [vite.config.ts](frontend_projects/visual_workflow_editor/vite.config.ts:1)
- 快速自检入口：编辑器右上角工具栏“更多⋯”抽屉内；点击“快速自检”弹出五行摘要（Health/Docs/WS/LLM/CodeBlock）；实现参考：
  - 自检工具：[selfTest.ts](frontend_projects/visual_workflow_editor/src/utils/selfTest.ts:1)
  - 工具栏入口：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:1)
- 自检结果会写入 window.__qaHooks.lastSelfTest（供 E2E 读取），详见 [selfTest.ts](frontend_projects/visual_workflow_editor/src/utils/selfTest.ts:404)

2) 路由与一次性回退机制
- 当前后端公开的是“旧短路由”，包括：/visual_workflow/create|get|update|delete|execute|list|get_templates|get_execution_state
- 文档保留“新命名”示例，但明确：前端服务层在 404/405 时会自动回退一次至旧路由（仅一次），实现位于：
  - 服务层入口与方法清单：[api.ts](frontend_projects/visual_workflow_editor/src/services/api.ts:1)
  - 一次性回退函数：[requestWithFallback()](frontend_projects/visual_workflow_editor/src/services/api.ts:51)
- 受影响 API（示例）：list_workflows、get_workflow、create_workflow、update_workflow、delete_workflow、execute_workflow、get_workflow_templates；get_execution_state 无需回退
- 执行结果映射兜底：当后端仅返回 raw.result 时，[mapToWorkflowExecution()](frontend_projects/visual_workflow_editor/src/services/api.ts:108) 会镜像至 results，并在 DEV 打印警告

3) UI IA 与可达性要点（右上角工具栏）
- 顶部主操作：执行、监控、上报、更多（抽屉）
- “更多”抽屉包含：对齐/分布、边样式切换（Smooth/Orthogonal）、Reduced Motion、快捷键帮助、自检、网格显隐与吸附、清空画布、语言/主题
- 数据选择器与可达性约定沿用 data-qa 与 ARIA；参考实现：
  - 工具栏与抽屉：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:1)
  - 样式与高度变量定义：[App.css](frontend_projects/visual_workflow_editor/src/App.css:1)

4) 画布与节点交互稳定性修复摘要
- React Flow 父容器尺寸修复（Error#004 消除）：显式提供父链路稳定宽高，引用：
  - 容器与类名：[WorkflowCanvas.tsx](frontend_projects/visual_workflow_editor/src/components/WorkflowCanvas.tsx:1199)
  - 全局高度与变量：[App.css](frontend_projects/visual_workflow_editor/src/App.css:1)
  - 主布局防塌陷：[App.tsx](frontend_projects/visual_workflow_editor/src/App.tsx:953)
- AntD useForm 绑定修复（Modal forceRender + destroyOnClose=false）：
  - 保存弹窗位置：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:738)

5) E2E 与日志（事实为准）
- 冒烟脚本与回归脚本入口、日志与语义：
  - SMOKE：[e2e_browser_smoke.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:1)
  - 回归：[e2e_regression.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_regression.mjs:1)
  - 日志位置：[last_e2e.txt](frontend_projects/visual_workflow_editor/scripts/logs/last_e2e.txt:1)
- 第三轮稳健化策略（简述）：选择器多候选（data-qa/ARIA/文本）、Drawer-aware 点击、两段 rAF 稳定、指数退避重试、[FALLBACK] 日志捕获
- 本轮结果说明（以日志事实为准，不夸大）：
  - SMOKE：A/B PASS（输出示例：A=ping，B=len=5）
  - REGRESSION：最新两次摘要统计显示失败>2，未达收敛；据 [last_e2e.txt](frontend_projects/visual_workflow_editor/scripts/logs/last_e2e.txt:1) 记录，持续存在“对齐/分布 Toast 未命中、边路径等待不稳定、清空画布 Toast 未出现”等；判定未达收敛。后续“脚本层再小幅稳健化”将另行推进（不影响本次文档修订范围）

6) 质量闸（类型与构建）
- TypeScript 严格检查（noEmit）与 Vite 构建通过；配置锚点：
  - tsconfig：[tsconfig.json](frontend_projects/visual_workflow_editor/tsconfig.json:1)（"strict": true, "noEmit": true）
  - Vite：[vite.config.ts](frontend_projects/visual_workflow_editor/vite.config.ts:1)（dev 端口 3002，WS/HTTP 代理）
- 产物大小与警告：>500k chunk 警示为非阻断提示（预算提示），不影响构建成功

提示：
- 环境变量覆盖（前端）：VITE_API_BASE=http://localhost:6502/api/v1，VITE_WS_URL=ws://localhost:6502/ws
- 环境变量覆盖（后端）：GEMINI_API_KEY 必须在同一 PowerShell 会话设置后再启动 [startserver.py](backend_projects/visual_work_flow/startserver.py:1)，变量才会自动注入

注意：
- 文档保留“新命名”API示例以对齐未来契约，同时明确当前前端服务层的 404/405 一次性回退行为，避免读者误判为双路并存。
### 10.1 前端改动对齐（本次前端调整，不改后端契约）

本小节将“已落地”的前端改动纳入 SSoT，作为单一事实来源，确保与当前实现一致。仅涉及前端 UI/开关/本地存储与文案键补充，不修改后端契约或路由策略。

1) 取消“功能导览/快速入门”入口与相关机制
- 现状：用户导览组件保留占位但不再渲染任何 UI，也不执行副作用（无本地存储、无自动启动）。
- 依据实现：[UserGuide.tsx](frontend_projects/visual_workflow_editor/src/components/UserGuide.tsx:11) 返回 null。

2) “上报”按钮默认隐藏，保留功能，由特性开关控制
- 特性开关：VITE_FEATURE_QA_REPORT（未显式开启即隐藏上报入口与 Modal）。
- 入口与渲染受控：
  - 工具栏入口与按钮显隐：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:1)，具体按钮块条件渲染位置：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:454)
  - 上报面板组件（功能保留）：[QAReporter.tsx](frontend_projects/visual_workflow_editor/src/components/QAReporter.tsx:1)

3) 新增“凭证管理”功能（直连/反代/自定义端点，跨 provider）
- 入口位置与挂载
  - 入口按钮：顶栏“更多”抽屉内“系统设置”分组中，按钮定义：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:547)
  - 组件挂载（抽屉外的根组件尾部）：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:870)（<CredentialManager open=... />）
  - 凭证面板组件本体：[CredentialManager.tsx](frontend_projects/visual_workflow_editor/src/components/CredentialManager.tsx:1)
- 本地持久化与键名
  - 本地存储键：vw_api_providers_v1（版本化）
  - 锚点与实现：[credentials.ts](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:33)
- 前端存储 Schema（与后端 APIConfiguration 字段对齐）
  - 组结构字段：provider/base_url/models/enabled/timeout/connect_timeout/enable_logging/keys[]/active_group_id/version='v1'（兼容 legacy active_provider→active_group_id 一次性迁移）
  - 前端定义：
    - 组模型接口与字段：[credentials.ts](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:14)
    - Store 版本与 active_group_id（含一次性迁移说明）：[credentials.ts](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:28)
  - 后端 APIConfiguration 对齐来源：[llm_api_manager.py](modules/llm_api_module/llm_api_manager.py:49)
  - 桥接模块（前端概念到后端调用的衔接参考）：[llm_bridge_module.py](modules/SmartTavern/llm_bridge_module/llm_bridge_module.py:22)
- 模式与折叠区（UI 行为）
  - 模式：direct/proxy/custom（仅 custom 强制要求 base_url；proxy 推荐配置 base_url）
  - proxy（官方渠道）显示“使用官方代理”折叠区；custom 模式直接展示 base_url 输入
  - aistudio 差异说明：见面板内“AI Studio 说明”文案键；实现参考 [CredentialManager.tsx](frontend_projects/visual_workflow_editor/src/components/CredentialManager.tsx:1)
- Provider 范围与分组命名
  - 支持 openai/anthropic(claude)/aistudio(openai-compatible)/openai-compatible
  - 分组命名策略：直连=“{provider}-直连”，反代=“{provider}-反代-{baseUrl简称}”，自定义=“{provider}-自定义-{baseUrl简称}”
  - 参考默认组构造与 baseURL 规范化：[credentials.ts](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:239)

4) 质量与可用性修复（与现实现一致）
- Modal 生命周期与表单绑定
  - 将 destroyOnClose 替换为 destroyOnHidden，避免 AntD Form 解绑导致的 useForm 状态丢失问题；位置：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:763)
- “更多⋯”按钮可达性与语义化
  - 增加 aria-label/role/aria-expanded/aria-controls；按钮区域尺寸≥48×48；位置：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:475)
- 重复添加密钥提示（保存拦截）
  - 若当前分组中已存在该密钥，则提示 t('credentials.keyExists') 并阻断保存提示链；位置：[CredentialManager.tsx](frontend_projects/visual_workflow_editor/src/components/CredentialManager.tsx:127)

5) i18n 文案键补充范围（多语言文件位置）
- 中文键文件：[zh-CN.json](frontend_projects/visual_workflow_editor/src/i18n/locales/zh-CN.json:1)
- 英文键文件：[en-US.json](frontend_projects/visual_workflow_editor/src/i18n/locales/en-US.json:1)
- 本次新增/使用的关键命名空间与键：
  - toolbar.credentials、credentials.*（含 mode、baseURL、keys、import/export、aistudioNote、keyExists 等）
  - qa.*（如 reportIssue/reportShort 等，仍受开关控制入口显隐）
## 11. 下一阶段 TODO

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
---
## 12. 阶段性验收（2025-09-23）

本轮聚焦“凭证面板”稳定性与可用性（下拉不可点击、遮罩/层级冲突、分组新增不可用），并完成 E2E 无参数稳定化与 Network 200 复检。结果已通过阶段性验收。

一) 前端交互与可用性
- Drawer→Modal 遮罩与层级冲突修复：
  - 入口在打开“凭证”前先关闭 Drawer 并短延时再开启 Modal：[Toolbar.tsx](frontend_projects/visual_workflow_editor/src/components/Toolbar.tsx:564)
  - Modal 层级与容器明确，覆盖 Drawer：[CredentialManager.tsx](frontend_projects/visual_workflow_editor/src/components/CredentialManager.tsx:217)
  - Select 下拉挂载至 Modal 容器并提升层级：
    - 容器函数：[popupInModal()](frontend_projects/visual_workflow_editor/src/components/CredentialManager.tsx:43)
    - ActiveGroup 下拉：[active-group-select](frontend_projects/visual_workflow_editor/src/components/CredentialManager.tsx:264)
    - Provider 下拉：[creds-provider-select](frontend_projects/visual_workflow_editor/src/components/CredentialManager.tsx:350)
    - Mode 下拉：[creds-mode-select](frontend_projects/visual_workflow_editor/src/components/CredentialManager.tsx:363)
- 新增分组（Add Group）可用性修复：
  - 唯一分组 ID 工具：[generateGroupId()](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:12)
  - 字段级合并与 keys 去重：[upsertGroup()](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:332)
  - 活动分组改为按 groupId 持久化：[setActiveGroup()](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:425)，一次性迁移逻辑：[loadCredentials() 迁移](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:216)
  - base_url 校验放宽（编辑期可空）、openai-compatible 自动补 /v1：[sanitizeGroup()](frontend_projects/visual_workflow_editor/src/utils/credentials.ts:146)

二) E2E 无参数稳定化（去除对 e2eOpenDrawer=1 依赖）
- 统一抽屉开启与稳定等待（多策略点击 + 两段 rAF）：
  - [openMoreDrawerReliably()](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:173)
  - 回归脚本同源实现：[openMoreDrawerReliably()](frontend_projects/visual_workflow_editor/scripts/e2e_regression.mjs:233)
- 凭证下拉展开与容器/z-index 断言：
  - Provider 下拉断言：[e2e_browser_smoke.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:749)
  - Mode 下拉断言：[e2e_browser_smoke.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:770)
- 新增分组断言与日志：
  - [CREDS] AddGroup：见 [e2e_browser_smoke.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_browser_smoke.mjs:1)
- 运行结果（无参数场景）：
  - [DRAWER] Open: PASS
  - [CREDS] ActiveGroupSelect: PASS / ProviderSelectDropdown: PASS / ModeSelectDropdown: PASS / AddGroup: PASS
  - 自检五行与最小链路：LLM=“ping”、CodeBlock=“len=5”，均 PASS
  - 日志文件：[last_e2e.txt](frontend_projects/visual_workflow_editor/scripts/logs/last_e2e.txt:1)

三) Network 200 复检（UI 驱动 + in-page 探针）
- 覆盖路由：list/get/create/update/delete/execute/get_workflow_templates/get_execution_state
- 结果：HTTP 全 200；7/8 命中一次性回退（primary→fallback），get_execution_state 未回退但 200
- 证据：
  - [network_200_20250923_193322.json](frontend_projects/visual_workflow_editor/scripts/logs/network_200_20250923_193322.json:1)
  - [network_200_20250923_193322.png](frontend_projects/visual_workflow_editor/scripts/logs/network_200_20250923_193322.png:1)
  - [network_200_20250923_192706.json](frontend_projects/visual_workflow_editor/scripts/logs/network_200_20250923_192706.json:1)
  - [network_200_20250923_192706.png](frontend_projects/visual_workflow_editor/scripts/logs/network_200_20250923_192706.png:1)

四) 已知事项与后续计划
- 回归（Regression）失败数仍高于“≤2”目标；保持既有稳健化策略（data-qa 首选、两段 rAF、指数退避），逐步收敛，范围不扩张；参见：
  - [e2e_regression.mjs](frontend_projects/visual_workflow_editor/scripts/e2e_regression.mjs:1)

---