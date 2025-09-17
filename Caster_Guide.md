# Caster工作流开发指导文档
*Caster于0917更动*

## 📋 工作流概念定义

### 传统工作流 vs 可视化协同工作流

本项目存在两种不同类型的工作流：

| 类型 | 传统工作流 | 可视化协同工作流（Caster负责） |
|------|------------|------------------------------|
| **定义** | Python函数序列执行 | 类似n8n的可视化编排系统 |
| **位置** | [`backend_projects/SmartTavern/workflows/`](backend_projects/SmartTavern/workflows/) | [`orchestrators/`](orchestrators/) + 待开发区域 |
| **特点** | 线性函数调用链 | 多LLM节点协同、可视化编排 |
| **示例** | `prompt_api_workflow.py` | 待开发：多LLM协同决策流程 |
| **用途** | 单一任务处理流程 | 复杂的多智能体协同任务 |

**Caster的职责重点：开发多LLM协同的可视化工作流系统**

## 1. 数据流向分析：从后端到前端的完整逻辑

### 1.1 前端文字输入到API请求的处理链路

**用户输入流程：**
1. **前端界面输入** - 用户在 [`frontend_projects/SmartTavern/src/`](frontend_projects/SmartTavern/src/) 的React组件中输入文字
2. **API调用包装** - 通过 [`api.ts`](frontend_projects/SmartTavern/src/services/api.ts:42) 的 `Api.sendMessage()` 方法封装请求
   ```typescript
   // 前端API调用示例
   Api.sendMessage(message, stream, conversationFile, llmConfig)
   ```
3. **HTTP请求发送** - 发送POST请求到后端API网关 (`http://localhost:6500/api/v1/SmartTavern/send_message`)
4. **WebSocket连接** - 通过 [`ws.ts`](frontend_projects/SmartTavern/src/services/ws.ts:12) 建立实时通信连接

**前端到后端的数据转换：**
- 用户文字输入 → JSON请求体 → HTTP POST → API网关路由 → 工作流函数调用

### 1.2 后端数据处理流程

**启动和初始化：**
1. **项目启动** - [`start_server.py`](backend_projects/SmartTavern/start_server.py:353) 启动完整的后端服务
2. **服务管理器初始化** - [`services.py`](core/services.py:46) 的 `UnifiedServiceManager` 加载所有模块
3. **API网关启动** - [`api_gateway_module.py`](modules/api_gateway_module/api_gateway_module.py:224) 创建FastAPI应用并路由注册函数

**请求处理流程：**
1. **API网关接收** - FastAPI接收HTTP请求并路由到对应的注册函数
2. **工作流调用** - 调用 [`prompt_api_workflow.py`](backend_projects/SmartTavern/workflows/prompt_api_workflow.py:8) 的主工作流
3. **数据加载** - [`data_manager_module.py`](modules/SmartTavern/data_manager_module/data_manager_module.py:7) 从共享目录加载所有配置数据
4. **提示词构建** - [`framing_prompt_module.py`](modules/SmartTavern/framing_prompt_module/framing_prompt_module.py:21) 组装前缀提示词
5. **LLM API调用** - [`llm_bridge_module.py`](modules/SmartTavern/llm_bridge_module/llm_bridge_module.py:108) 桥接通用LLM API模块

### 1.3 中间经过的数据转换和模块

**关键数据转换节点：**

1. **全局变量管理** - [`globals.py`](shared/SmartTavern/globals.py:1) 存储运行时状态和配置
   ```python
   # 全局数据容器
   conversation_history = []  # 对话历史
   character_data = {}        # 角色数据
   persona_data = {}          # 用户角色数据
   api_providers = {}         # API提供商配置
   ```

2. **模块间数据流转**：
   - **输入数据** → 数据管理器加载 → 全局变量存储
   - **全局数据** → 框架提示模块 → 结构化消息序列
   - **消息序列** → LLM桥接模块 → API调用格式
   - **API响应** → 工作流后处理 → 前端显示格式

3. **数据格式转换**：
   ```python
   # 原始用户输入
   user_input: str
   
   # 转换为消息格式
   message: {"role": "user", "content": user_input}
   
   # 构建完整上下文
   full_context: List[ConstructedMessage]
   
   # API调用格式
   api_format: List[Dict[str, str]]
   ```

## 2. 模块化架构详细定义

### 2.1 项目模块化实现方式

**架构分层设计：**
```
ModularFlow Framework
├── 核心层 (core/)
│   ├── services.py          # 统一服务管理器
│   └── function_registry.py # 函数注册系统
├── 通用模块层 (modules/)
│   ├── api_gateway_module/  # API网关 - 所有项目共享
│   └── llm_api_module/     # LLM API - 通用接口
└── 项目模块层 (modules/SmartTavern/)
    ├── data_manager_module/     # 数据管理
    ├── framing_prompt_module/   # 框架提示构建
    ├── llm_bridge_module/       # LLM桥接
    └── 其他专业化模块...
```

**模块发现机制：**
- [`services.py`](core/services.py:173) 的 `discover_modules()` 自动扫描模块目录
- 基于 `__init__.py` 和同名 `.py` 文件的约定自动加载
- 支持通用模块和项目特定模块的分离管理

### 2.2 并行开发支持原理

**解耦设计决策：**

1. **服务定位器模式** - 通过 [`get_current_globals()`](core/services.py:357) 安全访问项目数据
   ```python
   # 避免硬编码导入
   # from shared.SmartTavern import globals as g  # ❌ 硬耦合
   
   # 使用服务管理器
   from core.services import get_current_globals
   g = get_current_globals()  # ✅ 解耦访问
   ```

2. **函数注册系统** - [`function_registry.py`](core/function_registry.py) 支持模块间松散耦合
   ```python
   # 模块A注册函数
   @register_function(name="data.load_all", outputs=["loaded_data_summary"])
   
   # 模块B调用函数
   registry = get_registry()
   result = registry.call("data.load_all")
   ```

3. **配置驱动管理** - [`backend-projects.json`](backend_projects/backend-projects.json) 定义项目结构
   ```json
   {
     "projects": [{
       "name": "SmartTavern",
       "namespace": "SmartTavern", 
       "modules_path": "modules/SmartTavern",
       "shared_path": "shared/SmartTavern"
     }]
   }
   ```

**并行开发优势：**
- 模块独立开发，无需等待其他模块完成
- 通过函数注册接口约定，支持接口先行开发
- 配置文件驱动的项目管理，支持多项目同时开发

### 2.3 项目模块vs通用模块的区别

| 特性 | 通用模块 | 项目模块 |
|------|----------|----------|
| **位置** | `modules/` 根目录 | `modules/SmartTavern/` |
| **作用域** | 所有项目共享 | SmartTavern项目专用 |
| **示例** | [`api_gateway_module`](modules/api_gateway_module/) | [`data_manager_module`](modules/SmartTavern/data_manager_module/) |
| **依赖关系** | 无项目特定依赖 | 可依赖项目特定资源 |
| **服务命名** | `core.module_name` | `SmartTavern.module_name` |

## 3. 工作流开发重点分析

### 3.1 工作流开发接口位置

**传统工作流（现有）：**
- **位置** - [`backend_projects/SmartTavern/workflows/`](backend_projects/SmartTavern/workflows/)
- **类型** - Python函数线性执行
- **示例**：
  - [`full_prompt_workflow.py`](backend_projects/SmartTavern/workflows/full_prompt_workflow.py) - 完整提示词生成
  - [`prompt_api_workflow.py`](backend_projects/SmartTavern/workflows/prompt_api_workflow.py) - API调用流程
  - [`prompt_only_workflow.py`](backend_projects/SmartTavern/workflows/prompt_only_workflow.py) - 仅提示词生成

**可视化协同工作流（Caster开发重点）：**
- **设计位置** - [`orchestrators/`](orchestrators/) 目录
- **类型** - 多LLM节点编排系统
- **开发目标**：
  ```
  多LLM协同工作流
  ├── 节点类型定义
  │   ├── LLM推理节点 (多提供商支持)
  │   ├── 数据处理节点
  │   ├── 条件判断节点
  │   └── 结果聚合节点
  ├── 可视化编辑器
  │   ├── 拖拽式节点编排
  │   ├── 连线和数据流定义
  │   └── 参数配置界面
  └── 执行引擎
      ├── 并行节点调度
      ├── 数据流管理
      └── 错误处理和回滚
  ```

**现有编排基础设施：**
- [`simple_workflow.py`](orchestrators/simple_workflow.py) - 基础编排器实现
- 支持连接关系、并行执行、拓扑排序等核心功能

### 3.2 主要接触的前后端模块

**后端核心模块交互：**

1. **数据层模块**：
   - [`data_manager_module`](modules/SmartTavern/data_manager_module/data_manager_module.py:7) - 统一数据加载 `data.load_all`
   - [`config_manager_module`](modules/SmartTavern/config_manager_module/) - 配置管理
   - [`file_manager_module`](modules/SmartTavern/file_manager_module/) - 文件操作

2. **处理层模块**：
   - [`framing_prompt_module`](modules/SmartTavern/framing_prompt_module/framing_prompt_module.py:21) - 前缀提示构建 `framing.assemble`
   - [`in_chat_constructor_module`](modules/SmartTavern/in_chat_constructor_module/) - 对话上下文构建
   - [`macro_module`](modules/SmartTavern/macro_module/) - 宏处理系统
   - [`regex_module`](modules/SmartTavern/regex_module/) - 正则表达式处理

3. **API交互模块**：
   - [`llm_bridge_module`](modules/SmartTavern/llm_bridge_module/llm_bridge_module.py:108) - LLM API桥接 `api.call`
   - [`api_gateway_functions_module`](modules/SmartTavern/api_gateway_functions_module/) - SmartTavern API函数

**前端服务交互：**
- [`api.ts`](frontend_projects/SmartTavern/src/services/api.ts) - HTTP API客户端
- [`ws.ts`](frontend_projects/SmartTavern/src/services/ws.ts) - WebSocket实时通信

### 3.3 现有开发状态分析

**传统工作流（已完成）：**

1. **[`full_prompt_workflow`](backend_projects/SmartTavern/workflows/full_prompt_workflow.py:9)** - 完整提示生成
   - 功能：从文件加载数据，构建完整提示词
   - 状态：✅ 完整实现，支持角色卡、对话历史、世界书等

2. **[`prompt_api_workflow`](backend_projects/SmartTavern/workflows/prompt_api_workflow.py:8)** - API调用工作流
   - 功能：数据加载 + 提示构建 + LLM调用 + 结果保存
   - 状态：✅ 完整实现，支持完整的对话流程

3. **[`prompt_only_workflow`](backend_projects/SmartTavern/workflows/prompt_only_workflow.py)** - 仅提示词生成
   - 功能：仅构建提示词，不调用LLM
   - 状态：✅ 基本实现

**可视化协同工作流（待开发）：**

| 组件 | 状态 | 开发优先级 |
|------|------|------------|
| **多LLM节点系统** | ❌ 待开发 | 🔥 高优先级 |
| **可视化编辑器** | ❌ 待开发 | 🔥 高优先级 |
| **并行执行引擎** | 🟡 基础存在 | 📋 需扩展 |
| **数据流管理** | 🟡 基础存在 | 📋 需扩展 |
| **节点连接逻辑** | ✅ 已实现 | ✅ 可复用 |

**基础设施现状：**
```python
# orchestrators/simple_workflow.py - 现有编排基础
class SimpleWorkflow:
    def connect(from_func, to_func, mapping):  # ✅ 节点连接
    def execute():                             # ✅ 顺序执行
    def execute_async():                       # ✅ 异步并行
    def parallel(*branches):                   # ✅ 分支并行
```

**Caster开发重点：扩展为多LLM可视化协同工作流**

## 4. 开发实战路径

### 4.1 环境准备和架构理解

**开发环境启动：**
```bash
# 1. 启动后端服务
python backend_projects/SmartTavern/start_server.py

# 2. 访问API文档
# http://localhost:6500/docs

# 3. 测试前端界面
# http://localhost:6601
```

**理解现有架构：**
1. **传统工作流** - 学习现有的函数调用链模式
2. **编排基础** - 了解 [`simple_workflow.py`](orchestrators/simple_workflow.py) 的连接和执行机制
3. **模块系统** - 掌握函数注册和服务管理器的使用

### 4.2 多LLM协同工作流开发路径

**Phase 1: 节点系统设计**
```python
# 建议开发位置：orchestrators/multi_llm_workflow.py
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum

class NodeType(Enum):
    LLM_NODE = "llm"           # LLM推理节点
    PROCESSOR = "processor"     # 数据处理节点
    CONDITION = "condition"     # 条件判断节点
    AGGREGATOR = "aggregator"   # 结果聚合节点

@dataclass
class WorkflowNode:
    id: str
    type: NodeType
    config: Dict[str, Any]
    inputs: List[str]
    outputs: List[str]
    
class MultiLLMWorkflow:
    def add_llm_node(self, node_id: str, provider: str, model: str):
        """添加LLM推理节点"""
        pass
        
    def add_processor_node(self, node_id: str, function_name: str):
        """添加数据处理节点"""
        pass
        
    def connect_nodes(self, from_node: str, to_node: str, data_mapping: Dict):
        """连接节点并定义数据映射"""
        pass
```

**Phase 2: 可视化编辑器接口**
```typescript
// 前端可视化编辑器API设计
interface WorkflowNodeData {
  id: string;
  type: 'llm' | 'processor' | 'condition' | 'aggregator';
  position: { x: number; y: number };
  config: Record<string, any>;
}

interface WorkflowConnection {
  source: string;
  target: string;
  mapping: Record<string, string>;
}

// API接口设计
Api.createWorkflow(name: string): Promise<{workflow_id: string}>
Api.addNode(workflow_id: string, node: WorkflowNodeData): Promise<{node_id: string}>
Api.connectNodes(workflow_id: string, connection: WorkflowConnection): Promise<{success: boolean}>
Api.executeWorkflow(workflow_id: string, inputs: Record<string, any>): Promise<{results: any}>
```

**Phase 3: 执行引擎开发**
```python
# 扩展现有的 simple_workflow.py
class MultiLLMExecutionEngine:
    def __init__(self):
        self.llm_nodes = {}      # LLM节点管理
        self.processors = {}     # 处理器节点
        self.conditions = {}     # 条件节点
        
    async def execute_parallel_llm_calls(self, nodes: List[WorkflowNode]):
        """并行执行多个LLM节点"""
        tasks = []
        for node in nodes:
            if node.type == NodeType.LLM_NODE:
                task = self.call_llm_node(node)
                tasks.append(task)
        
        results = await asyncio.gather(*tasks)
        return results
        
    def aggregate_results(self, results: List[Any], strategy: str):
        """聚合多个LLM的输出结果"""
        # 投票、平均、最佳选择等策略
        pass
```

### 4.2 模块开发路径

**创建新模块：**
```python
# modules/SmartTavern/my_module/my_module.py
from core.function_registry import register_function
from core.services import get_current_globals

@register_function(name="my_module.my_function", outputs=["result"])
def my_custom_function(input_data: str):
    g = get_current_globals()
    # 模块逻辑
    return {"result": "processed"}
```

**模块文件结构：**
```
modules/SmartTavern/my_module/
├── __init__.py
├── my_module.py      # 主模块文件
├── variables.py      # 模块配置（可选）
└── README.md        # 模块说明
```

### 4.3 前后端集成路径

**添加新API接口：**
1. **后端注册函数**:
   ```python
   @register_function(name="SmartTavern.my_api", outputs=["response"])
   def my_api_function(request_data: dict):
       return {"response": "API response"}
   ```

2. **前端调用接口**:
   ```typescript
   // 在api.ts中添加
   async myCustomApi(data: any): Promise<Wrapped<{response: string}>> {
     const url = `${API_BASE_URL}/SmartTavern/my_api`
     return await request(url, {
       method: 'POST', 
       body: JSON.stringify(data)
     })
   }
   ```

### 4.4 调试和测试路径

**调试工具：**
- **API文档** - `http://localhost:6500/docs` 测试所有注册函数
- **WebSocket测试** - 通过 `ws://localhost:6500/ws` 测试实时通信
- **日志输出** - 查看控制台输出了解执行流程

**测试策略：**
1. **单元测试** - 独立测试每个注册函数
2. **工作流测试** - 完整测试工作流链路
3. **集成测试** - 前后端完整流程测试

**常用调试命令：**
```bash
# 列出所有注册函数
python runner.py --list-functions

# 列出所有工作流
python runner.py --list-workflows

# 执行特定工作流
python runner.py prompt_api_call_workflow --debug
```

### 4.5 架构扩展路径

**添加新项目：**
1. 更新 [`backend-projects.json`](backend_projects/backend-projects.json)
2. 创建项目模块目录 `modules/NewProject/`
3. 创建共享资源目录 `shared/NewProject/`
4. 实现项目特定的工作流和模块

**性能优化路径：**
- 利用 [`globals.py`](shared/SmartTavern/globals.py:165) 中的统计功能监控性能
- 使用模块缓存机制避免重复计算
- 通过WebSocket实现实时更新减少HTTP轮询

### 4.3 集成现有系统

**利用现有LLM桥接系统：**
```python
# 多LLM节点可复用现有的桥接模块
from modules.SmartTavern.llm_bridge_module import llm_bridge_module

class LLMNode:
    def __init__(self, provider: str, model: str):
        self.provider = provider
        self.model = model
        
    async def execute(self, messages: List[Dict]):
        # 复用现有的API调用接口
        result = llm_bridge_module.call_api(
            messages=messages,
            provider=self.provider,
            model=self.model
        )
        return result
```

**扩展API网关支持：**
```python
# 注册多LLM工作流相关的API函数
@register_function(name="multi_llm_workflow.create", outputs=["workflow_id"])
def create_workflow(name: str, description: str = ""):
    """创建新的多LLM协同工作流"""
    pass

@register_function(name="multi_llm_workflow.execute", outputs=["results"])
def execute_workflow(workflow_id: str, inputs: Dict[str, Any]):
    """执行多LLM协同工作流"""
    pass

@register_function(name="multi_llm_workflow.get_status", outputs=["status"])
def get_workflow_status(workflow_id: str):
    """获取工作流执行状态"""
    pass
```

### 4.4 开发优先级建议

**高优先级（立即开始）：**
1. 🔥 **多LLM节点定义** - 设计LLM节点的标准接口
2. 🔥 **基础执行引擎** - 扩展现有的 `simple_workflow.py`
3. 🔥 **数据流管理** - 定义节点间数据传递格式

**中优先级（后续开发）：**
4. 📋 **可视化编辑器** - 前端拖拽式节点编辑界面
5. 📋 **工作流模板** - 预设常用的多LLM协同模式
6. 📋 **监控和调试** - 工作流执行状态可视化

**低优先级（未来扩展）：**
7. 🔮 **版本管理** - 工作流版本控制和回滚
8. 🔮 **性能优化** - 智能调度和资源管理
9. 🔮 **插件系统** - 自定义节点类型扩展

### 4.5 与传统工作流的协同

**复用现有模块：**
- 可视化工作流可以调用传统工作流中的处理函数
- 通过函数注册系统无缝集成现有功能
- 利用全局变量系统共享数据状态

**架构互补：**
- **传统工作流** - 处理单一、线性的复杂任务
- **多LLM协同工作流** - 处理需要多智能体协作的复杂决策任务

---

*本文档专门为Caster开发多LLM协同工作流系统提供指导，基于ModularFlow Framework的实际架构设计。*