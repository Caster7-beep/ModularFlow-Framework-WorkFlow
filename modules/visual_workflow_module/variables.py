"""
可视化工作流模块配置变量
"""

# 默认配置
DEFAULT_WORKFLOW_STORAGE_PATH = "workflows/visual"
DEFAULT_MAX_WORKFLOWS = 100
DEFAULT_MAX_NODES_PER_WORKFLOW = 50
DEFAULT_EXECUTION_TIMEOUT = 300  # 秒

# 节点默认配置
DEFAULT_NODE_CONFIG = {
    'input': {
        'default_value': '',
        'data_type': 'text'
    },
    'llm_call': {
        'provider': 'gemini',
        'model': 'gemini-2.5-flash',
        'temperature': 0.7,
        'max_tokens': 2048,
        'prompt': '{{input}}'
    },
    'code_block': {
        'code_type': 'python',
        'code': '# 在这里编写代码\n# 使用 inputs 访问输入数据\n# 设置 output 变量作为输出\noutput = {"text": str(inputs)}'
    },
    'condition': {
        'condition': 'len(text) > 0'
    },
    'switch': {
        'switch_map': {
            '1': '路径1',
            '0': '路径0',
            'default': '默认路径'
        }
    },
    'merger': {
        'merge_strategy': 'concat'
    },
    'output': {
        'format': 'text'
    }
}

# 支持的数据类型
SUPPORTED_DATA_TYPES = ['text', 'signal', 'all']

# 支持的代码块类型
SUPPORTED_CODE_TYPES = ['python']

# 支持的输出格式
SUPPORTED_OUTPUT_FORMATS = ['text', 'json', 'html']

# 错误消息
ERROR_MESSAGES = {
    'workflow_not_found': '工作流不存在',
    'node_not_found': '节点不存在',
    'invalid_node_type': '无效的节点类型',
    'invalid_connection': '无效的连接',
    'execution_timeout': '工作流执行超时',
    'max_workflows_exceeded': '超过最大工作流数量限制',
    'max_nodes_exceeded': '超过每个工作流的最大节点数量限制'
}

# 成功消息
SUCCESS_MESSAGES = {
    'workflow_created': '工作流创建成功',
    'workflow_updated': '工作流更新成功',
    'workflow_deleted': '工作流删除成功',
    'node_added': '节点添加成功',
    'node_updated': '节点更新成功',
    'node_deleted': '节点删除成功',
    'connection_created': '连接创建成功',
    'connection_deleted': '连接删除成功',
    'workflow_executed': '工作流执行完成'
}