"""history_module 的模块变量"""
from typing import List, Dict, Any

# 在内存中缓存的对话历史
# 格式: [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
history: List[Dict[str, Any]] = []

# 默认的历史记录文件保存路径
# 注意：这只是一个模块内的默认值，实际路径应由工作流在调用时传入。
history_file_path: str = "conversation_history.json"