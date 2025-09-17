# SmartTavern 文件管理模块

该模块负责扫描和管理 `shared/SmartTavern` 目录下的所有文件，提供文件列表、目录结构和文件内容的访问功能。

## 功能特性

- **完整文件扫描**: 扫描整个 `shared/SmartTavern` 目录结构
- **分类文件管理**: 按文件夹分类管理不同类型的文件
- **文件内容读取**: 安全读取文件内容
- **JSON 格式输出**: 所有数据以 JSON 格式包装返回
- **智能过滤**: 自动排除不必要的文件和目录

## 注册函数

### file_manager.scan_all_files
扫描 `shared/SmartTavern` 目录下的所有文件，返回完整的文件结构信息。

**输出**:
```json
{
  "success": true,
  "file_structure": {
    "name": "SmartTavern",
    "type": "directory", 
    "path": "shared/SmartTavern",
    "children": [...]
  },
  "total_files": 15,
  "scanned_path": "/path/to/shared/SmartTavern",
  "timestamp": "2023-..."
}
```

### file_manager.get_folder_files
获取指定文件夹或所有文件夹的文件列表。

**参数**:
- `folder_name` (可选): 文件夹名称，如果为空则返回所有文件夹

**输出**:
```json
{
  "success": true,
  "folder_files": {
    "characters": [...],
    "conversations": [...],
    "presets": [...]
  },
  "total_folders": 3,
  "timestamp": "2023-..."
}
```

### file_manager.get_file_content
获取指定文件的内容。

**参数**:
- `file_path`: 相对于 `shared/SmartTavern` 的文件路径

**输出**:
```json
{
  "success": true,
  "file_content": "文件内容...",
  "file_info": {
    "path": "characters/许莲笙.json",
    "name": "许莲笙.json",
    "size": 2048,
    "modified": "2023-...",
    "extension": ".json"
  },
  "timestamp": "2023-..."
}
```

## 支持的文件类型

- JSON 文件 (.json)
- 文本文件 (.txt)
- Markdown 文件 (.md)
- YAML 文件 (.yaml, .yml)
- XML 文件 (.xml)
- CSV 文件 (.csv)

## 文件夹映射

模块为不同的文件夹提供友好的显示名称和图标:

- **characters** (👤): 角色文件
- **conversations** (💬): 对话记录
- **personas** (🎭): 用户角色
- **presets** (⚙️): 预设配置
- **world_books** (📚): 世界书
- **regex_rules** (🔧): 正则规则
- **cache** (💾): 缓存文件

## 使用示例

```python
# 扫描所有文件
result = file_manager.scan_all_files()

# 获取角色文件
result = file_manager.get_folder_files("characters")

# 获取所有文件夹的文件
result = file_manager.get_folder_files()

# 读取文件内容
result = file_manager.get_file_content("characters/许莲笙.json")