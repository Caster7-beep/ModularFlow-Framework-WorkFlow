# 📜 History Module

## 🎯 核心职责

`history_module` 是一个专注于管理和持久化**原始对话历史**的模块。

它的核心设计理念是**单一职责**和**数据纯净**：

-   **唯一职责**: 只负责加载、保存、添加和检索对话历史记录。
-   **数据纯净**: 存储的对话历史是完全原始的，不包含任何经过宏处理、世界书注入或其他形式修改的内容。它是所有后续处理流程的起点和“事实来源”。

## 📦 API 接口

本模块向工作流系统注册了以下函数：

### 1. `history.load_history(file_path: str)`

从指定的JSON文件加载对话历史到内存中。如果文件不存在，内存中的历史将为空。

-   **输入**:
    -   `file_path` (str): 对话历史文件的完整路径。
-   **输出**: 无。

### 2. `history.save_history(file_path: str)`

将当前内存中的对话历史以JSON格式保存到指定文件。

-   **输入**:
    -   `file_path` (str): 保存对话历史的目标文件路径。
-   **输出**: 无。

### 3. `history.add_message(role: str, content: str)`

向内存中的对话历史列表追加一条新消息。

-   **输入**:
    -   `role` (str): 消息的角色，必须是 `'user'`, `'assistant'` 或 `'system'` 之一。
    -   `content` (str): 消息的原始文本内容。
-   **输出**: 无。

### 4. `history.get_history() -> Dict[str, Any]`

获取当前内存中的完整对话历史列表。

-   **输入**: 无。
-   **输出**:
    -   `history` (List[Dict[str, str]]): 一个包含对话历史的列表，例如 `[{'role': 'user', 'content': '...'}, ...]`。

### 5. `history.clear_history()`

清空当前内存中的所有对话历史记录。

-   **输入**: 无。
-   **输出**: 无。

## 💾 数据格式

本模块使用简单、通用的JSON格式来存储对话历史。文件内容是一个JSON数组，每个对象代表一条消息。

**示例 `conversation_history.json`:**

```json
[
    {
        "role": "user",
        "content": "你好，这是一个原始的用户输入。"
    },
    {
        "role": "assistant",
        "content": "你好，这是一个未经处理的AI回复。"
    }
]
```

## 🚀 使用示例 (在工作流中)

```python
# (在一个工作流文件中)

# 假设 registry 是通过 get_registry() 获取的
registry = get_registry()

# 定义历史文件路径
history_file = "path/to/my_conversation.json"

# 1. 加载历史
registry.call("history.load_history", file_path=history_file)

# 2. 添加一条新消息
registry.call("history.add_message", role="user", content="这是我的新问题。")

# 3. 获取完整的历史记录以进行处理
result = registry.call("history.get_history")
current_history = result.get("history")

# ... (在这里可以对 current_history 进行各种处理)

# 4. 添加AI的回复
registry.call("history.add_message", role="assistant", content="这是AI的回复。")

# 5. 保存更新后的历史
registry.call("history.save_history", file_path=history_file)