# ModularFlow Framework 架构文档

## 概述

ModularFlow Framework 是一个基于 **服务发现** 和 **配置驱动** 的模块化处理框架。其核心设计旨在实现最大程度的灵活性、可扩展性和多项目支持能力，彻底解决了模块间的硬编码依赖问题。该框架不仅限于文本处理，具备处理各种数据类型和业务逻辑的强大开放性。

## 核心架构组件

### 1. 统一服务管理器 (`core/services.py`)

服务管理器是整个框架的神经中枢，采用 **服务定位器（Service Locator）** 设计模式。它负责：

- **配置驱动的项目管理**: 通过 `backend_projects/backend-projects.json` 文件定义和管理一个或多个项目。
- **动态模块发现与加载**: 在启动时自动发现并加载所有通用模块和已启用项目的模块。
- **命名空间隔离**: 为每个项目提供独立的模块和共享资源空间。
- **解耦的全局变量访问**: 提供安全的、与项目绑定的全局变量访问机制，避免了硬编码导入。

**核心用法**:
```python
# 安全地获取当前活动项目的全局变量
from core.services import get_current_globals
g = get_current_globals()

# 获取服务管理器单例
from core.services import get_service_manager
service_manager = get_service_manager()

# 示例：获取当前项目配置
project_info = service_manager.get_current_project()
```

### 2. 项目配置文件 (`backend_projects/backend-projects.json`)

这是框架现在 **唯一的** 配置文件，它定义了项目结构，并驱动服务管理器的行为。

- **移除了 `default_project`**: 系统现在默认加载所有 `enabled` 的项目。
- **项目定义**: 每个项目都有自己的命名空间、模块路径、共享资源路径和全局变量模块。

**示例 `backend_projects/backend-projects.json`**:
```json
{
  "projects": [
    {
      "name": "SmartTavern",
      "namespace": "SmartTavern",
      "modules_path": "modules/SmartTavern",
      "shared_path": "shared/SmartTavern",
      "globals_module": "globals",
      "enabled": true,
      "priority": 0
    }
  ]
}
```

### 3. 模块化架构与作用域

系统现在明确区分两种模块作用域：

1.  **根级通用模块 (Root-level Common Modules)**: 位于 `modules/` 根目录下，被所有项目共享。例如 `data_manager_module`。
2.  **项目特定模块 (Project-specific Modules)**: 位于每个项目自己的 `modules_path` 下（例如 `modules/SmartTavern/`），仅属于该项目。

#### 更新后的目录结构
```
text_workflow/
├── core/                       # 框架核心
│   ├── services.py            # 统一服务管理器
│   └── function_registry.py   # 函数注册系统
│
├── modules/                    # 模块目录
│   ├── data_manager_module/   # 根级通用模块
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

## 关键优势

### 1. 彻底解耦
**之前的问题**:
```python
# 硬编码导入，一旦目录结构改变，代码就会崩溃
from shared.SmartTavern import globals as g
from modules.SmartTavern.data_manager_module.data_manager_module import load_data
```
**新的解决方案**:
```python
# 通过服务管理器安全访问，完全不受目录结构变化的影响
from core.services import get_current_globals
g = get_current_globals()

# 函数/服务通过其注册的名称被调用，无需关心其物理位置
# (由 function_registry 或 workflow 定义处理)
```

### 2. 真正的多项目支持
- **通用模块共享**: 根级通用模块可以为所有项目提供基础服务。
- **项目隔离**: 不同项目的模块、全局变量和资源是完全隔离的。
- **零代码修改**: 添加一个全新的项目只需要更新 `backend_projects/backend-projects.json` 并创建相应的目录，无需修改任何框架代码。

## 使用指南

### 开发新模块
无论是通用模块还是项目模块，开发流程都是一致的。

**模块示例** (`modules/SmartTavern/example_module/example_module.py`):
```python
from core.function_registry import register_function
from core.services import get_current_globals

@register_function(name="example.my_function", outputs=["result"])
def my_function():
    # 安全地访问当前项目 (SmartTavern) 的全局变量
    g = get_current_globals()
    if g:
        g.some_variable = "new_value"
    
    return {"result": "success"}
```

### 添加新项目

1.  **更新 `backend_projects/backend-projects.json`**:
    在 `projects` 数组中添加一个新的项目对象。
    ```json
    {
      "name": "MyNewProject",
      "namespace": "MyNewProject",
      "modules_path": "modules/MyNewProject",
      "shared_path": "shared/MyNewProject",
      "globals_module": "globals",
      "enabled": true,
      "priority": 10
    }
    ```

2.  **创建目录结构**:
    ```
    modules/
    └── MyNewProject/
        └── my_first_module/
            ├── __init__.py
            └── my_first_module.py

    shared/
    └── MyNewProject/
        └── globals.py
    ```

3.  **完成**！系统下次启动时会自动发现并加载这个新项目及其模块。

## 总结

新的架构通过引入统一服务管理器，将系统从一个简单的、依赖硬编码路径的框架，演进为一个真正通用、可扩展、配置驱动的多项目平台。这个设计不仅解决了之前的所有痛点，也为未来的功能扩展（如插件系统、版本管理等）奠定了坚实的基础。

## SmartTavern 项目模块详解

ModularFlow Framework 为 SmartTavern 项目提供了多个高度专业化的模块，每个模块都专注于特定的功能领域。

### 🔧 宏处理系统 (Macro Module)

宏处理系统是项目中最复杂的模块之一，采用了**三层模块化架构**设计：

#### 架构组成
1. **主处理器** (`macro_module.py`)：
   - 核心类：`UnifiedMacroProcessor`
   - 职责：统一协调传统宏和Python宏的执行
   - 特性：作用域感知、上下文管理、消息序列处理

2. **缓存管理器** (`macro_cache_manager.py`)：
   - 核心类：`MacroCacheManager`
   - 职责：智能缓存、状态快照、持久化存储
   - 算法：SHA256哈希、增量计算、缓存失效检测

3. **传统宏转换器** (`legacy_macro_converter.py`)：
   - 核心类：`LegacyMacroConverter`
   - 职责：将SmartTavern传统宏转换为Python代码
   - 支持：双分隔符格式（`:` 和 `::`）、所有传统宏类型

#### 关键技术特性
- **状态感知缓存**：基于消息内容和变量状态的智能缓存系统
- **作用域隔离**：支持 `temp`, `char`, `world`, `conversation`, `preset`, `global` 六个作用域
- **前缀变量访问**：`world_var`, `preset_var` 等跨作用域变量访问
- **Python沙盒集成**：安全的代码执行环境

### 🎯 正则处理系统 (Regex Module)

正则处理系统提供了基于规则的文本替换功能，支持复杂的条件匹配和双阶段处理。

#### 核心架构
- **数据类**：`RegexRule` - 规则的完整定义
- **处理器**：`RegexProcessor` - 规则编译、筛选和执行

#### 关键创新：Placement 字段
正则模块的独特之处在于支持 **placement** 字段：
- `"before_macro"`：规则处理原始的宏处理前文本（`before_macro_text`）
- `"after_macro"`：规则处理当前的累积处理结果（`processed_content`）

这种设计实现了**链式规则处理**：每个规则的输出成为下一个规则的输入，同时支持规则回溯到原始文本进行处理。

#### 智能筛选系统
规则执行前会进行多层筛选：
- **targets** 匹配：只处理指定的内容类型
- **views** 控制：区分用户视图和AI视图
- **深度和顺序**：支持 `min_depth/max_depth` 和 `min_order/max_order` 范围限制
- **动态启用**：支持宏表达式动态控制规则启用状态

## 数据处理流程详解 (`full_prompt_workflow`)

`full_prompt_workflow` 工作流完整展示了框架的处理能力，实现了从数据加载到最终提示词生成的全流程。

### 1. 数据加载与准备阶段
- **统一加载与后处理**：通过 `data.load_all` 加载所有数据源，并自动调用 `data.merge_character_world_book` 和 `data.collect_all_regex_rules` 进行数据整合。
- **元数据标记**：在 `framing_prompt_module` 和 `in_chat_constructor_module` 中，为每个数据项添加 `source_type`, `role`, `source_id` 等权威元数据。

### 2. 上下文构建阶段
- **世界书触发**：调用 `world_book.trigger`，基于用户输入智能触发相关世界书条目。
- **消息序列构建**：
  - **`framing.assemble`** 和 **`in_chat.construct`** 协同工作，构建包含完整元数据（包括权威的 `source_type`）的原始消息序列。
  - `source_type` 在此阶段被**提前确定**，消除了后续转换的需要。

### 3. 智能处理阶段

#### A. 宏处理子流程（`process_message_sequence_macros`）
采用**严格的三阶段处理模式**：

1. **`enabled` 评估阶段**：
   - 使用当前变量状态评估启用条件
   - 支持布尔值和宏表达式两种格式
   - 动态决定是否处理当前条目

2. **`code_block` 执行阶段**：
   - 执行Python代码块，修改沙盒变量状态
   - 实时更新作用域变量
   - 为后续处理提供最新状态

3. **`content` 渲染阶段**：
   - 处理内容中的所有宏（传统宏和Python宏）
   - 读取最新的变量状态
   - 生成最终的处理结果

#### B. 缓存优化机制
- **消息级缓存**：每个消息独立缓存，支持增量更新
- **状态快照**：保存处理前后的完整变量状态
- **智能失效**：基于内容哈希和状态哈希的双重验证
- **跨会话持久化**：缓存保存到文件，支持重启后复用

#### C. 正则处理子流程（`apply_regex_rules`）
实现了**双阶段、双视图**的处理模式：

1. **规则应用**：
   - 正则规则已在数据加载阶段由 `data.collect_all_regex_rules` 统一收集。
   - 工作流直接从 `g.all_regex_rules` 获取规则，并从每条消息中读取**预先计算好**的 `source_type`。
   - 不再需要在工作流中进行 `source_type` 的映射。

2. **双视图处理**：
   - 用户视图（`user_view`）：优化显示效果
   - AI视图（`assistant_view`）：保留完整上下文信息
   - 每个视图独立应用相应的规则集

3. **Placement感知处理**：
   - **`after_macro`** (默认): 处理宏执行后产生的**最终文本**，并支持链式处理（一个规则的输出是下一个规则的输入）。
   - **`before_macro`**: 处理一个特殊的重构文本，即把宏的输出结果重新包装回 `{{xxx}}` 的格式。这使得规则可以对宏的**语法结构**本身进行操作，而不是其输出内容。
   - 这种双模式设计为处理流程提供了极大的灵活性。

### 4. 输出生成阶段
- **最终序列**：生成处理完成的消息序列
- **双版本输出**：同时提供用户视图和AI视图版本
- **质量保证**：确保所有宏处理完成，所有规则正确应用

## 技术创新点

### 1. 状态感知增量处理
通过精确的状态哈希算法，系统能够检测到变量状态的细微变化，只重新处理必要的部分，大大提升了性能。

### 2. 双阶段正则处理
Placement字段的引入使得正则规则可以在文本处理的不同阶段生效，提供了前所未有的处理灵活性。

### 3. 模块化宏架构
将宏处理分解为三个独立的专业模块，每个模块专注于特定职责，提高了代码的可维护性和扩展性。

### 4. 作用域隔离系统
六层作用域系统确保了变量的正确隔离，支持前缀变量访问，解决了复杂场景下的变量管理问题。

这些技术创新使得 ModularFlow Framework 成为了一个真正强大、灵活且高效的文本处理框架。

## LLM API架构重构

### 背景

为了提高代码的可维护性和扩展性，ModularFlow Framework 对 LLM API 管理进行了重大重构，采用了**模块分离**和**桥接模式**的设计。

### 重构架构

#### 1. 通用LLM API模块 (`modules/llm_api_module/`)

**设计目标**: 提供纯净的、与业务逻辑无关的 LLM API 调用功能。

**核心组件**:
- **[`LLMAPIManager`](modules/llm_api_module/llm_api_manager.py)**: 统一的API管理器类
- **[`APIConfiguration`](modules/llm_api_module/llm_api_manager.py:49)**: API配置数据类
- **[`APIResponse`](modules/llm_api_module/llm_api_manager.py:29)**: 标准化响应格式
- **[`StreamChunk`](modules/llm_api_module/llm_api_manager.py:42)**: 流式响应块

**支持的提供商**:
- **OpenAI**: 标准 OpenAI API 兼容接口
- **Anthropic**: Claude API，支持完整的消息格式和系统指令
- **Google Gemini**: Gemini API，支持配置参数和系统指令

**关键特性**:
- 统一的请求/响应格式处理
- 自动请求体转换（支持不同API格式）
- 流式和非流式响应支持
- 完整的错误处理和超时管理
- 模型列表获取功能（符合各提供商API规范）

#### 2. SmartTavern桥接模块 (`modules/SmartTavern/llm_bridge_module/`)

**设计目标**: 在通用API模块和SmartTavern业务逻辑之间提供桥接，保持向后兼容性。

**核心功能**:
- **管理器缓存**: 智能缓存LLM API管理器实例
- **配置管理**: 从SmartTavern全局变量读取API配置
- **接口转发**: 将SmartTavern的API调用转发到通用模块
- **向后兼容**: 保持所有现有API接口不变

**桥接接口**:
```python
# 主要API调用接口
api.call(messages, stream=False, model=None, ...)
api.call_streaming(messages, ...)

# 管理接口
api.get_providers()
api.set_provider(provider_name)
api.configure_provider(...)
api.get_models(provider)
api.get_stats()
api.reset_stats()
```

### API规范遵循

#### Anthropic 模型列表API
- **端点**: GET `/v1/models`
- **请求头**:
  - `anthropic-version`: "2023-06-01"
  - `x-api-key`: API密钥
- **分页参数**: `limit`, `before_id`, `after_id`
- **响应格式**: `{"data": [...], "first_id": "...", "has_more": true, "last_id": "..."}`

#### Gemini 模型列表API
- **端点**: GET `https://generativelanguage.googleapis.com/v1beta/models`
- **查询参数**: `pageSize`, `pageToken`, `key`
- **响应格式**: `{"models": [...], "nextPageToken": "..."}`

#### OpenAI 模型列表API
- **端点**: GET `/models`
- **请求头**: `Authorization: Bearer <token>`
- **响应格式**: `{"data": [...]}`

### 重构优势

#### 1. 职责分离
- **通用模块**: 专注于API调用逻辑，不依赖任何具体项目
- **桥接模块**: 专注于业务逻辑适配，处理SmartTavern特定需求

#### 2. 代码复用
- 通用LLM API模块可以被其他项目直接使用
- 减少代码重复，提高维护效率

#### 3. 扩展性
- 新增LLM提供商只需修改通用模块
- 新项目可以创建自己的桥接模块

#### 4. 向后兼容
- 所有现有的SmartTavern代码无需修改
- 保持完全的API兼容性

#### 5. 测试友好
- 通用模块和桥接模块可以独立测试
- 清晰的模块边界便于单元测试

### 使用示例

#### 直接使用通用模块
```python
from modules.llm_api_module.llm_api_manager import LLMAPIManager, APIConfiguration

# 创建配置
config = APIConfiguration(
    provider="anthropic",
    api_key="your-api-key",
    base_url="https://api.anthropic.com",
    models=["claude-3-sonnet-20240229"],
    enabled=True
)

# 创建管理器
manager = LLMAPIManager(config)

# 调用API
response = manager.call_api(messages=[
    {"role": "user", "content": "Hello"}
])

# 获取模型列表
models = manager.list_models(limit=10)
```

#### 通过桥接模块使用（SmartTavern）
```python
# 在SmartTavern工作流中，保持原有用法
from core.function_registry import get_registered_function

api_call = get_registered_function("api.call")
response = api_call(
    messages=[{"role": "user", "content": "Hello"}],
    model="claude-3-sonnet-20240229"
)
```

这种重构架构确保了代码的高内聚、低耦合，同时为未来的功能扩展提供了坚实的基础。