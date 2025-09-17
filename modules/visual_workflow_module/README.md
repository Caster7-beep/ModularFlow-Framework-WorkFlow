# 可视化工作流模块 (Visual Workflow Module)

可视化工作流模块是ModularFlow Framework的扩展，提供拖拽式可视化工作流编排功能，支持多LLM协同工作。

## ✨ 核心特性

- **🎨 可视化编排**: 支持拖拽式节点和连接创建
- **🤖 多LLM支持**: 集成OpenAI、Anthropic、Gemini等多个LLM提供商
- **🔀 条件分支**: 支持基于LLM输出的动态路径选择
- **💻 代码块**: 允许插入自定义Python逻辑处理
- **📊 实时监控**: 提供工作流执行状态的实时跟踪
- **🔗 完美集成**: 通过function_registry自动暴露REST API

## 🏗️ 模块结构

```
modules/visual_workflow_module/
├── __init__.py                    # 模块初始化
├── visual_workflow_module.py      # 主要API函数实现
├── variables.py                   # 配置变量和常量
└── README.md                      # 文档
```

## 📋 支持的节点类型

| 节点类型 | 功能描述 | 输入 | 输出 |
|----------|----------|------|------|
| `input` | 接收用户输入 | 原始数据 | 格式化文本 |
| `llm_call` | 调用LLM API | 文本提示 | LLM响应 |
| `code_block` | 执行Python代码 | 任意数据 | 处理结果 |
| `condition` | 条件判断 | 数据 | 布尔信号 |
| `switch` | 路径选择 | 信号值 | 路由结果 |
| `merger` | 结果聚合 | 多个输入 | 合并输出 |
| `output` | 格式化输出 | 处理结果 | 最终输出 |

## 🚀 API接口

所有API函数都通过`function_registry`注册，自动暴露为REST端点。

### 工作流管理

- `visual_workflow.create` - 创建新工作流
- `visual_workflow.get` - 获取工作流详情
- `visual_workflow.update` - 更新工作流信息
- `visual_workflow.delete` - 删除工作流
- `visual_workflow.list` - 列出所有工作流

### 节点管理

- `visual_workflow.add_node` - 添加节点
- `visual_workflow.update_node` - 更新节点配置
- `visual_workflow.delete_node` - 删除节点

### 连接管理

- `visual_workflow.create_connection` - 创建节点连接
- `visual_workflow.delete_connection` - 删除连接

### 执行控制

- `visual_workflow.execute` - 执行工作流
- `visual_workflow.get_execution_state` - 获取执行状态

### 工具函数

- `visual_workflow.get_node_types` - 获取支持的节点类型
- `visual_workflow.validate_workflow` - 验证工作流完整性

## 📖 使用示例

### 创建简单的LLM工作流

```python
from modules.visual_workflow_module import get_visual_workflow_manager
from core.function_registry import get_registry

# 获取注册器
registry = get_registry()

# 1. 创建工作流
result = registry.call("visual_workflow.create", 
                      name="文本分析工作流",
                      description="分析用户输入文本的情感倾向")

workflow_id = result["workflow_id"]

# 2. 添加输入节点
input_result = registry.call("visual_workflow.add_node",
                           workflow_id=workflow_id,
                           node_type="input",
                           position={"x": 100, "y": 100},
                           config={"name": "用户输入"})

input_node_id = input_result["node_id"]

# 3. 添加LLM节点
llm_result = registry.call("visual_workflow.add_node",
                         workflow_id=workflow_id,
                         node_type="llm_call",
                         position={"x": 300, "y": 100},
                         config={
                             "name": "情感分析",
                             "provider": "gemini",
                             "prompt": "分析以下文本的情感倾向：{{input}}"
                         })

llm_node_id = llm_result["node_id"]

# 4. 添加输出节点
output_result = registry.call("visual_workflow.add_node",
                            workflow_id=workflow_id,
                            node_type="output",
                            position={"x": 500, "y": 100},
                            config={"name": "分析结果"})

output_node_id = output_result["node_id"]

# 5. 创建连接
registry.call("visual_workflow.create_connection",
             workflow_id=workflow_id,
             source_node_id=input_node_id,
             target_node_id=llm_node_id)

registry.call("visual_workflow.create_connection",
             workflow_id=workflow_id,
             source_node_id=llm_node_id,
             target_node_id=output_node_id)

# 6. 执行工作流
execution_result = registry.call("visual_workflow.execute",
                                workflow_id=workflow_id,
                                input_data={"input": "今天天气真不错！"})

print("执行结果:", execution_result["result"])
```

### 创建带条件分支的复杂工作流

```python
# 创建包含条件判断的工作流
workflow_result = registry.call("visual_workflow.create",
                               name="智能路由工作流", 
                               description="根据文本长度选择不同处理方式")

workflow_id = workflow_result["workflow_id"]

# 添加输入节点
input_node = registry.call("visual_workflow.add_node",
                          workflow_id=workflow_id,
                          node_type="input",
                          position={"x": 100, "y": 100})

# 添加条件判断节点
condition_node = registry.call("visual_workflow.add_node",
                              workflow_id=workflow_id,
                              node_type="condition",
                              position={"x": 300, "y": 100},
                              config={
                                  "condition": "len(text) > 100",
                                  "name": "长度判断"
                              })

# 添加两个不同的LLM处理节点
short_llm_node = registry.call("visual_workflow.add_node",
                              workflow_id=workflow_id,
                              node_type="llm_call",
                              position={"x": 500, "y": 50},
                              config={
                                  "name": "简短处理",
                                  "prompt": "简要总结：{{input}}"
                              })

detailed_llm_node = registry.call("visual_workflow.add_node",
                                 workflow_id=workflow_id,
                                 node_type="llm_call",
                                 position={"x": 500, "y": 150},
                                 config={
                                     "name": "详细分析",
                                     "prompt": "详细分析以下文本：{{input}}"
                                 })

# 创建条件分支连接
# 这里需要在实际实现中支持条件连接
```

## ⚙️ 配置说明

### 默认配置

模块提供了各种节点类型的默认配置，可在`variables.py`中查看和修改：

```python
DEFAULT_NODE_CONFIG = {
    'llm_call': {
        'provider': 'gemini',
        'model': 'gemini-2.5-flash',
        'temperature': 0.7,
        'max_tokens': 2048,
        'prompt': '{{input}}'
    }
    # ... 其他节点配置
}
```

### 限制参数

- 最大工作流数量: 100
- 每个工作流最大节点数: 50
- 执行超时时间: 300秒

## 🔧 开发指南

### 添加新的节点类型

1. 在`orchestrators/visual_workflow.py`中的`NodeType`枚举添加新类型
2. 在`VisualWorkflow`类中添加对应的`_create_xxx_node`方法
3. 在`variables.py`中添加默认配置
4. 更新`get_node_types`函数

### 扩展API功能

通过`@register_function`装饰器添加新的API函数：

```python
@register_function(name="visual_workflow.custom_function", outputs=["result"])
def custom_function(param1: str, param2: int) -> Dict[str, Any]:
    # 实现自定义功能
    return {"result": "success"}
```

## 🧪 测试

模块包含完整的集成测试，验证：

- 工作流创建和管理
- 节点添加和配置
- 连接建立和数据流
- LLM调用和响应处理
- 错误处理和异常情况

## 📚 相关文档

- [ModularFlow Framework 架构文档](../../ARCHITECTURE.md)
- [可视化工作流开发指南](../../VISUAL_WORKFLOW_DEVELOPMENT_GUIDE.md)
- [Function Registry 使用说明](../../core/function_registry.py)

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个模块！

---

**版本**: 1.0.0  
**维护团队**: ModularFlow开发团队  
**最后更新**: 2025-01-17