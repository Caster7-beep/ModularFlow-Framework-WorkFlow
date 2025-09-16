# SmartTavern 后端 API 接口文档

## 概述

SmartTavern后端系统提供了一套完整的RESTful API接口，支持AI对话、文件管理和系统管理等功能。所有接口都通过API网关提供，默认运行在端口6500。

**基础信息：**
- API网关端口：6500
- API基础URL：`http://localhost:6500/api/v1`
- API文档：`http://localhost:6500/docs`
- WebSocket连接：`ws://localhost:6500/ws`

## 通用响应格式

所有API响应都遵循统一的JSON格式：

```json
{
  "success": true|false,
  "data": {...},
  "error": "错误信息（仅在失败时）",
  "timestamp": "ISO 8601格式时间戳"
}
```

## API接口列表

### 1. 对话管理接口

#### 1.1 发送消息
- **端点**: `POST /api/v1/SmartTavern/send_message`
- **功能**: 发送消息给AI并获取回复，使用完整的SmartTavern工作流
- **参数**:
  ```json
  {
    "message": "用户消息内容",
    "stream": false
  }
  ```
- **参数说明**:
  - `message` (string, 必需): 用户发送的消息内容
  - `stream` (boolean, 可选): 是否启用流式响应，默认false
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "message": "消息处理成功",
      "display_history_path": "shared/SmartTavern/conversations/display_history/display_chat.json",
      "final_message_count": 4,
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

#### 1.2 获取对话历史
- **端点**: `GET /api/v1/SmartTavern/get_chat_history`
- **功能**: 获取干净的对话历史记录，适合前端显示
- **参数**:
  ```json
  {
    "limit": 50
  }
  ```
- **参数说明**:
  - `limit` (integer, 可选): 限制返回的历史记录数量，默认50
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "history": [
        {
          "role": "user",
          "content": "你好"
        },
        {
          "role": "assistant", 
          "content": "你好！我是SmartTavern AI助手。"
        }
      ],
      "total_messages": 2,
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

#### 1.3 清空对话历史
- **端点**: `POST /api/v1/SmartTavern/clear_history`
- **功能**: 清空当前对话的所有历史记录
- **参数**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "message": "对话历史已清空",
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

#### 1.4 加载对话文件
- **端点**: `POST /api/v1/SmartTavern/load_conversation`
- **功能**: 加载指定的对话文件作为当前对话
- **参数**:
  ```json
  {
    "filename": "chat_20231201_103000.json"
  }
  ```
- **参数说明**:
  - `filename` (string, 必需): 要加载的对话文件名
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "message": "已加载对话: chat_20231201_103000.json",
      "conversation_file": "chat_20231201_103000.json",
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

#### 1.5 保存对话文件
- **端点**: `POST /api/v1/SmartTavern/save_conversation`
- **功能**: 将当前对话保存到指定文件
- **参数**:
  ```json
  {
    "filename": "my_chat.json"
  }
  ```
- **参数说明**:
  - `filename` (string, 可选): 保存的文件名，如果不提供将自动生成带时间戳的文件名
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "message": "对话已保存: my_chat.json",
      "saved_file": "my_chat.json",
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

### 2. 配置管理接口

#### 2.1 获取配置选项
- **端点**: `GET /api/v1/SmartTavern/get_config_options`
- **功能**: 获取所有可用的配置文件选项
- **参数**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "config_options": {
        "presets": {
          "display_name": "预设配置",
          "icon": "⚙️",
          "files": [
            {
              "name": "Default.json",
              "path": "presets/Default.json",
              "display_name": "Default",
              "size": 1024,
              "modified": "2023-12-01T10:00:00.000Z"
            }
          ],
          "has_files": true
        },
        "world_books": {
          "display_name": "世界书",
          "icon": "📚",
          "files": [],
          "has_files": false
        },
        "regex_rules": {
          "display_name": "正则规则",
          "icon": "🔧",
          "files": [],
          "has_files": false
        },
        "characters": {
          "display_name": "角色卡",
          "icon": "👤",
          "files": [
            {
              "name": "许莲笙.json",
              "path": "characters/许莲笙.json",
              "display_name": "许莲笙",
              "size": 2048,
              "modified": "2023-12-01T10:00:00.000Z"
            }
          ],
          "has_files": true
        },
        "conversations": {
          "display_name": "对话历史",
          "icon": "💬",
          "files": [
            {
              "name": "current_chat.json",
              "path": "conversations/current_chat.json",
              "display_name": "current_chat",
              "size": 512,
              "modified": "2023-12-01T10:30:00.000Z"
            }
          ],
          "has_files": true
        }
      },
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

#### 2.2 设置活跃配置
- **端点**: `POST /api/v1/SmartTavern/set_active_config`
- **功能**: 设置当前活跃的配置文件
- **参数**:
  ```json
  {
    "config_type": "characters",
    "file_path": "characters/许莲笙.json"
  }
  ```
- **参数说明**:
  - `config_type` (string, 必需): 配置类型，可选值：presets, world_books, regex_rules, characters, conversations
  - `file_path` (string, 可选): 配置文件路径，如果为null则清空该配置
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "message": "已设置 characters 配置为: characters/许莲笙.json",
      "active_config": {
        "preset": null,
        "world_book": null,
        "regex_rule": null,
        "character": "characters/许莲笙.json",
        "conversation": "conversations/current_chat.json"
      },
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

#### 2.3 获取活跃配置
- **端点**: `GET /api/v1/SmartTavern/get_active_config`
- **功能**: 获取当前活跃的配置状态
- **参数**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "active_config": {
        "preset": "presets/Default.json",
        "world_book": null,
        "regex_rule": "regex_rules/remove_xml_tags.json",
        "character": "characters/许莲笙.json",
        "conversation": "conversations/current_chat.json"
      },
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

### 3. 文件管理接口

#### 3.1 获取所有文件结构
- **端点**: `POST /api/v1/SmartTavern/get_all_files`
- **功能**: 扫描shared/SmartTavern目录，返回完整的文件树结构
- **参数**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "file_structure": {
        "name": "SmartTavern",
        "type": "directory",
        "path": "shared/SmartTavern",
        "children": [
          {
            "name": "characters",
            "type": "directory",
            "path": "shared/SmartTavern/characters",
            "children": [
              {
                "name": "许莲笙.json",
                "type": "file",
                "path": "shared/SmartTavern/characters/许莲笙.json",
                "extension": ".json",
                "size": 2048,
                "modified": "2023-12-01T10:00:00.000Z"
              }
            ]
          }
        ]
      },
      "total_files": 15,
      "scanned_path": "/path/to/shared/SmartTavern",
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

#### 3.2 获取文件夹文件列表
- **端点**: `POST /api/v1/SmartTavern/get_folder_files`
- **功能**: 获取指定文件夹或所有文件夹的文件列表，带分类信息
- **参数**:
  ```json
  {
    "folder_name": "characters"
  }
  ```
- **参数说明**:
  - `folder_name` (string, 可选): 文件夹名称，如果不提供则返回所有文件夹
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "folder_files": {
        "characters": [
          {
            "name": "许莲笙.json",
            "path": "characters/许莲笙.json",
            "full_path": "/full/path/to/characters/许莲笙.json",
            "extension": ".json",
            "size": 2048,
            "modified": "2023-12-01T10:00:00.000Z",
            "folder": {
              "name": "characters",
              "display_name": "角色文件",
              "description": "角色定义文件",
              "icon": "👤"
            }
          }
        ]
      },
      "total_folders": 1,
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

#### 3.3 获取文件内容
- **端点**: `POST /api/v1/SmartTavern/get_file_content`
- **功能**: 读取指定文件的完整内容
- **参数**:
  ```json
  {
    "file_path": "characters/许莲笙.json"
  }
  ```
- **参数说明**:
  - `file_path` (string, 必需): 相对于shared/SmartTavern的文件路径
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "file_content": "{\"name\":\"许莲笙\",\"description\":\"...\"}",
      "file_info": {
        "path": "characters/许莲笙.json",
        "name": "许莲笙.json",
        "size": 2048,
        "modified": "2023-12-01T10:00:00.000Z",
        "extension": ".json"
      },
      "timestamp": "2023-12-01T10:30:00.000Z"
    }
  }
  ```

#### 3.4 保存文件内容
- **端点**: `POST /api/v1/SmartTavern/save_file_content`
- **功能**: 保存内容到指定文件，如果文件不存在则创建新文件
- **参数**:
  ```json
  {
    "file_path": "characters/新角色.json",
    "content": "{\"name\":\"新角色\",\"description\":\"这是一个新的角色设定\"}"
  }
  ```
- **参数说明**:
  - `file_path` (string, 必需): 相对于shared/SmartTavern的文件路径
  - `content` (string, 必需): 要保存的文件内容
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "message": "文件保存成功: characters/新角色.json",
      "file_info": {
        "path": "characters/新角色.json",
        "name": "新角色.json",
        "size": 1024,
        "modified": "2023-12-01T10:35:00.000Z",
        "extension": ".json",
        "created": true
      },
      "timestamp": "2023-12-01T10:35:00.000Z"
    }
  }
  ```

### 3. 系统管理接口

#### 3.1 获取系统状态
- **端点**: `GET /api/v1/SmartTavern/get_system_status`
- **功能**: 获取系统运行状态和配置信息
- **参数**: 无
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "system": {
        "project_name": "SmartTavern对话系统",
        "version": "1.0.0",
        "workflow": "prompt_api_call_workflow",
        "character_file": "许莲笙.json",
        "persona_file": "default_user.json",
        "conversation_storage": "shared/SmartTavern/conversations",
        "llm_provider": "gemini",
        "llm_model": "gemini-2.5-flash",
        "llm_available": true,
        "smarttavern_enabled": true,
        "timestamp": "2023-12-01T10:30:00.000Z"
      }
    }
  }
  ```

## 支持的文件类型

文件管理模块支持以下文件类型：
- JSON文件 (.json)
- 文本文件 (.txt)
- Markdown文件 (.md)
- YAML文件 (.yaml, .yml)
- XML文件 (.xml)
- CSV文件 (.csv)

## 文件夹类型映射

系统支持的文件夹类型及其显示信息：

| 文件夹名 | 显示名称 | 描述 | 图标 |
|----------|----------|------|------|
| characters | 角色文件 | 角色定义文件 | 👤 |
| conversations | 对话记录 | 对话历史文件 | 💬 |
| personas | 用户角色 | 用户角色设定文件 | 🎭 |
| presets | 预设配置 | LLM预设配置文件 | ⚙️ |
| world_books | 世界书 | 世界书知识文件 | 📚 |
| regex_rules | 正则规则 | 正则表达式规则文件 | 🔧 |
| cache | 缓存文件 | 系统缓存文件 | 💾 |

## WebSocket支持

系统支持WebSocket连接以实现实时通信：

- **连接地址**: `ws://localhost:6500/ws`
- **消息格式**:
  ```json
  {
    "type": "function_call",
    "function": "SmartTavern.send_message",
    "params": {
      "message": "用户消息"
    }
  }
  ```
- **响应格式**:
  ```json
  {
    "type": "function_result",
    "function": "SmartTavern.send_message",
    "success": true,
    "data": {...}
  }
  ```

## 错误处理

API遵循HTTP状态码标准：

- **200 OK**: 请求成功
- **400 Bad Request**: 请求参数错误
- **404 Not Found**: 资源不存在
- **500 Internal Server Error**: 服务器内部错误

错误响应格式：
```json
{
  "success": false,
  "error": "具体错误描述",
  "timestamp": "2023-12-01T10:30:00.000Z"
}
```

## 配置参数

系统支持的主要配置参数：

### SmartTavern配置
- `conversation_storage`: 对话存储路径 (默认: "shared/SmartTavern/conversations")
- `default_conversation_file`: 默认对话文件 (默认: "current_chat.json")
- `character_file`: 角色文件 (默认: "许莲笙.json")
- `persona_file`: 用户角色文件 (默认: "default_user.json")
- `workflow`: 工作流名称 (默认: "prompt_api_call_workflow")

### LLM配置
- `llm_provider`: LLM提供商 (默认: "gemini")
- `llm_model`: LLM模型 (默认: "gemini-2.5-flash")
- `api_key`: API密钥
- `base_url`: API基础URL
- `timeout`: 请求超时时间 (默认: 60秒)
- `max_tokens`: 最大令牌数 (默认: 2048)
- `temperature`: 温度参数 (默认: 0.7)

## 使用示例

### Python客户端示例
```python
import requests
import json

# 基础配置
API_BASE = "http://localhost:6500/api/v1"
headers = {"Content-Type": "application/json"}

# 发送消息
def send_message(message):
    url = f"{API_BASE}/SmartTavern/send_message"
    data = {"message": message}
    response = requests.post(url, json=data, headers=headers)
    return response.json()

# 获取对话历史
def get_history():
    url = f"{API_BASE}/SmartTavern/get_chat_history"
    response = requests.get(url, headers=headers)
    return response.json()

# 获取文件列表
def get_files():
    url = f"{API_BASE}/SmartTavern/get_folder_files"
    response = requests.post(url, json={}, headers=headers)
    return response.json()
```

### JavaScript客户端示例
```javascript
const API_BASE = 'http://localhost:6500/api/v1';

// 发送消息
async function sendMessage(message) {
  const response = await fetch(`${API_BASE}/SmartTavern/send_message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  return await response.json();
}

// 获取对话历史
async function getHistory() {
  const response = await fetch(`${API_BASE}/SmartTavern/get_chat_history`);
  return await response.json();
}

// WebSocket连接
const ws = new WebSocket('ws://localhost:6500/ws');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('收到消息:', data);
};
```

## 安全注意事项

1. **API密钥保护**: 确保API密钥安全存储，不要在客户端代码中硬编码
2. **CORS配置**: 生产环境中应正确配置CORS策略
3. **输入验证**: 所有用户输入都经过验证和清理
4. **文件访问限制**: 文件访问仅限于shared/SmartTavern目录内
5. **错误信息**: 生产环境中应避免暴露敏感的错误信息

## 更新日志

### v1.0.0 (2023-12-01)
- 初始版本发布
- 实现基础对话功能
- 添加文件管理功能
- 支持WebSocket实时通信
- 集成SmartTavern完整工作流

---

*本文档最后更新于 2023-12-01*