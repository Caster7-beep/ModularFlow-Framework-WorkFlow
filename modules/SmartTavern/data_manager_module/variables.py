"""data_manager_module 的模块变量"""

# 定义各个数据类型的子目录名称和对应的全局变量名
# (目录名, 全局变量名, 是否为列表)
# 子目录是相对于项目共享路径 (e.g., shared/SmartTavern/)
DATA_MAPPING = {
    "presets": ("presets", "presets", True),
    "world_books": ("world_books", "world_book_entries", True),
    "regex_rules_files": ("regex_rules", "regex_rules_files", True),
    "characters": ("characters", "character_data", False),
    "personas": ("personas", "persona_data", False),
    "conversations": ("conversations", "conversation_history", False)
}