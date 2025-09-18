# Image Binding Module Variables
# 定义图像绑定模块使用的变量和常量

# 文件类型标签，用于标识嵌入图片中的文件类型
FILE_TYPE_TAGS = {
    "WORLD_BOOK": "WB",     # 世界书
    "REGEX": "RG",          # 正则规则
    "CHARACTER": "CH",      # 角色卡
    "PRESET": "PS",         # 预设
    "USER_CONFIG": "UC",    # 用户配置
    "OTHER": "OT"           # 其他类型
}

# 嵌入到PNG图片中的数据块标识符
PNG_CHUNK_NAME = b'stBN'    # SmartTavern Binding Name

# 嵌入文件的最大大小限制（字节）
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# 文件绑定标头格式版本
BINDING_VERSION = "1.0"

# 默认文件存储目录
DEFAULT_EXPORT_DIR = "exports"