# 正则模块 (`regex_module`) 文档

本模块提供了一个统一的、基于规则的正则表达式替换功能，旨在作为工作流中的一个可重用组件。模块支持**placement字段**来区分宏处理前后的文本处理时机。

## 🎯 核心功能

该模块的核心是一个已注册的函数 `apply_regex_rules`，它能够根据传入的一组规则对文本进行处理。

### 1. `apply_regex_rules`

此函数接收文本和一组规则，并根据规则中定义的条件（如 `placement`, `views`, `targets` 等）来决定是否执行替换。

-   **函数名**: `apply_regex_rules`
-   **描述**: 根据传入的规则列表，对指定的文本执行正则表达式查找和替换。

#### 输入 (`inputs`)

| 参数名              | 类型                     | 描述                                                                                                   |
| :------------------ | :----------------------- | :----------------------------------------------------------------------------------------------------- |
| `before_macro_text` | `str`                    | **必需**。宏处理前的原始文本。                                                                         |
| `after_macro_text`  | `str`                    | **必需**。宏处理后的文本。                                                                             |
| `rules`             | `List[Dict[str, Any]]`   | **必需**。一个包含正则规则对象的列表。每个规则的结构见下文的 `RegexRule` 数据结构。                   |
| `source_type`       | `str`                    | **必需**。内容的来源类型，用于与规则的 `targets` 字段进行匹配。合法值见下文 `targets` 字段说明。      |
| `current_view`      | `str`                    | **必需**。当前视图，用于与规则的 `views` 字段匹配 (例如, `'user_view'`, `'assistant_view'`)。        |
| `depth`             | `int`                    | (可选)。内容的深度，用于范围匹配。                                                                     |
| `order`             | `int`                    | (可选)。内容的次序，用于范围匹配。                                                                     |

#### 输出 (`outputs`)

| 字段名           | 类型  | 描述             |
| :--------------- | :---- | :--------------- |
| `processed_text` | `str` | 经过规则处理后的文本。 |

## 📋 `RegexRule` 数据结构

传递给 `rules` 参数的列表中的每个对象都应遵循以下结构：

```json
{
  "id": "rule_unique_identifier",
  "name": "规则的可读名称",
  "enabled": true,
  "find_regex": "要查找的正则表达式",
  "replace_regex": "用于替换的字符串或模式",
  "targets": ["user", "assistant", "world_book"],
  "placement": "after_macro",
  "views": ["user_view", "assistant_view"],
  "min_depth": 1,
  "max_depth": 10,
  "min_order": 1,
  "max_order": 5,
  "description": "规则功能的简要描述",
  "enabled_expression": "{{python:getvar('enable_rule')}}"
}
```

### 字段详解

#### 基础字段
-   **`id`** (`str`): 规则的唯一标识符。
-   **`name`** (`str`): 规则的可读名称。
-   **`enabled`** (`bool`): 规则是否启用。
-   **`find_regex`** (`str`): 用于查找的正则表达式。
-   **`replace_regex`** (`str`): 用于替换的字符串，支持捕获组引用 (如 `$1`)。
-   **`description`** (`str`, 可选): 规则的描述。

#### 作用域控制
-   **`targets`** (`List[str]`): 规则的作用对象。只有当 `source_type` 参数在此列表中时，规则才会生效。
    -   **权威列表**: `["user", "assistant", "world_book", "preset", "assistant_thinking"]`
    
-   **`views`** (`List[str]`): 作用视图。只有当 `current_view` 参数在此列表中时，规则才会执行替换。
    -   **常用值**: `["user_view", "assistant_view"]`

#### ⚡ 关键特性：Placement 字段
-   **`placement`** (`str`): **处理文本的选择**，这是本模块的核心特性之一。
    -   **`"before_macro"`**: 规则作用于**宏处理后的原始文本** (`before_macro_text`)
    -   **`"after_macro"`**: 规则作用于**当前处理进度的文本** (`processed_content`)
    -   **默认值**: `"after_macro"`

**Placement 字段的工作原理**：
- **核心概念**：所有正则处理都发生在宏处理**完成之后**，处理的是最终的文本结果
- **`"after_macro"`**（默认）：规则处理宏执行后产生的**最终文本**，实现**链式处理**
- **`"before_macro"`**：规则处理经过特殊包装的文本，即把宏的输出重新包装为 `{{xxx}}` 格式
- **关键区别**：`"before_macro"` 让某些规则能够看到和处理 `{{xxx}}` 宏语法格式，而非实际的宏执行结果
- **使用场景**：当需要对宏语法本身进行处理（如转换宏格式、移除特定宏标记等）而不是处理宏的执行结果时，使用 `"before_macro"`

#### 范围限制
-   **`min_depth` / `max_depth`** (`int`, 可选): 规则应用的深度范围。
-   **`min_order` / `max_order`** (`int`, 可选): 规则应用的次序范围。

#### 动态控制
-   **`enabled_expression`** (`Any`, 可选): 动态启用表达式，支持宏表达式来动态控制规则是否启用。

## 🏗️ 模块架构

### 核心类

#### 1. `RegexRule` (数据类)
表示单个正则表达式规则的数据结构，包含所有规则配置信息。

#### 2. `RegexProcessor` (处理器)
正则表达式规则的核心处理器，负责：
- 规则的加载、编译和排序
- 规则适用性的筛选
- 实际的正则表达式替换执行
- 支持动态启用表达式的评估

### 处理流程

1. **规则加载**: 从规则数据中创建 `RegexRule` 对象
2. **规则编译**: 将正则表达式预编译以提高性能
3. **规则筛选**: 根据 `source_type`, `depth`, `order` 等条件筛选适用的规则
4. **文本选择**: 根据规则的 `placement` 字段选择要处理的文本
5. **规则执行**: 按顺序应用所有适用的规则
6. **结果返回**: 返回处理后的文本

## 📊 使用示例

### 示例1: 基本的宏后处理
```python
# 假设 registry 已经初始化并加载了模块
rules = [
    {
        "id": "remove_ids_for_user",
        "name": "为用户视图隐藏内部ID",
        "find_regex": "\\(id: \\d+\\)",
        "replace_regex": "",
        "targets": ["world_book"],
        "placement": "after_macro",  # 在宏处理后执行
        "views": ["user_view"]
    }
]

before_text = "这是世界书条目 (id: 123)。"
after_text = "这是世界书条目 (id: 123)。{{getvar('processed')}}"

result = registry.call(
    "apply_regex_rules",
    before_macro_text=before_text,
    after_macro_text=after_text,
    rules=rules,
    source_type="world_book",
    current_view="user_view"
)
# result['processed_text'] 将是去掉ID的文本
```

### 示例2: 宏前预处理
```python
rules = [
    {
        "id": "preprocess_variables",
        "name": "预处理变量引用",
        "find_regex": "\\$\\{(\\w+)\\}",
        "replace_regex": "{{getvar:'$1'}}",
        "targets": ["preset"],
        "placement": "before_macro",  # 在宏处理前执行
        "views": ["assistant_view"]
    }
]

before_text = "设置值为 ${my_variable}"
after_text = "设置值为 some_processed_value"

result = registry.call(
    "apply_regex_rules",
    before_macro_text=before_text,
    after_macro_text=after_text,
    rules=rules,
    source_type="preset",
    current_view="assistant_view"
)
# 规则会作用于 before_macro_text，将 ${my_variable} 转换为 {{getvar:'my_variable'}}
```

### 示例3: 条件性规则执行
```python
rules = [
    {
        "id": "conditional_rule",
        "name": "条件性替换规则",
        "enabled_expression": "{{python:getvar('enable_formatting')}}",
        "find_regex": "\\*\\*(.*?)\\*\\*",
        "replace_regex": "<strong>$1</strong>",
        "targets": ["assistant"],
        "placement": "after_macro",
        "views": ["user_view"]
    }
]

# 规则只有在 enable_formatting 变量为真时才会执行
```

### 示例4: 双视图处理
```python
rules = [
    {
        "id": "user_view_rule",
        "name": "用户视图美化",
        "find_regex": "\\[DEBUG\\].*?\\n",
        "replace_regex": "",
        "targets": ["assistant"],
        "placement": "after_macro",
        "views": ["user_view"]  # 只在用户视图中移除调试信息
    },
    {
        "id": "ai_view_rule", 
        "name": "AI视图增强",
        "find_regex": "^(.*)$",
        "replace_regex": "[CONTEXT] $1",
        "targets": ["world_book"],
        "placement": "after_macro", 
        "views": ["assistant_view"]  # 只在AI视图中添加上下文标记
    }
]

# 相同的内容会根据不同的视图产生不同的输出
```

## 🔧 性能优化

### 规则编译
- 所有正则表达式在初始化时预编译，避免重复编译开销
- 失败的正则表达式会被跳过，不影响其他规则的执行

### 规则筛选
- 多层筛选机制，只处理适用的规则
- 按目标数量和ID排序，优化匹配效率

### 错误处理
- 单个规则的错误不会影响其他规则的执行
- 详细的错误日志帮助调试和维护

## 🔍 调试支持

### 日志信息
- 规则编译成功/失败状态
- 规则筛选和匹配过程
- 实际的替换执行结果
- 详细的错误信息和堆栈跟踪

### 规则验证
- 自动检测和报告无效的正则表达式
- 规则配置完整性检查
- 运行时动态启用表达式的评估

## 🚀 扩展开发

### 自定义规则类型
通过继承 `RegexRule` 类添加新的规则类型：

```python
@dataclass
class CustomRegexRule(RegexRule):
    custom_field: str = ""
    # 添加自定义字段和逻辑
```

### 自定义处理器
继承 `RegexProcessor` 类实现特殊的处理逻辑：

```python
class CustomRegexProcessor(RegexProcessor):
    def _filter_applicable_rules(self, source_type, depth, order):
        # 实现自定义的规则筛选逻辑
        pass
```

### 宏表达式集成
模块自动集成宏处理器来评估动态启用表达式，支持复杂的条件逻辑。