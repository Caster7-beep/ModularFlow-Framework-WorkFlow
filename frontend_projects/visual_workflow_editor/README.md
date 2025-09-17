# 可视化工作流编辑器

基于React Flow的可视化工作流编辑器，支持拖拽式工作流构建。

## 🚀 功能特性

- **可视化编辑**：拖拽式节点创建和连接
- **多种节点类型**：LLM节点、输入节点、输出节点、代码块节点
- **实时配置**：点击节点即可编辑属性
- **工作流管理**：保存、加载、导入、导出工作流
- **工作流执行**：一键执行工作流并查看结果
- **响应式设计**：支持不同屏幕尺寸

## 🛠️ 技术栈

- **React 18** + **TypeScript** - 前端框架
- **Vite** - 构建工具
- **Ant Design 5.x** - UI组件库
- **React Flow 11.x** - 流程图编辑器
- **Monaco Editor** - 代码编辑器
- **Zustand** - 状态管理
- **Axios** - HTTP客户端

## 📦 安装依赖

```bash
# 进入项目目录
cd frontend_projects/visual_workflow_editor

# 安装依赖
npm install
```

## 🏃‍♂️ 运行项目

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

项目将在 `http://localhost:3002` 运行。

## 📁 项目结构

```
src/
├── App.tsx                 # 主应用组件
├── App.css                 # 主样式文件
├── main.tsx               # 应用入口
├── components/            # 组件目录
│   ├── WorkflowCanvas.tsx # 主画布组件
│   ├── NodePanel.tsx      # 节点面板
│   ├── PropertyPanel.tsx  # 属性面板
│   ├── Toolbar.tsx        # 工具栏
│   └── nodes/             # 节点组件
│       ├── LLMNode.tsx    # LLM节点
│       ├── InputNode.tsx  # 输入节点
│       ├── OutputNode.tsx # 输出节点
│       └── CodeBlockNode.tsx # 代码块节点
├── services/              # 服务层
│   └── api.ts            # API服务
├── types/                 # 类型定义
│   └── workflow.ts       # 工作流类型
└── utils/                 # 工具函数
    └── nodeFactory.ts    # 节点工厂
```

## 🎯 使用指南

### 1. 创建工作流

1. 从左侧节点面板拖拽节点到画布
2. 点击节点配置属性
3. 拖拽节点端口创建连接
4. 保存工作流

### 2. 节点类型

- **LLM节点**：配置AI模型和提示词
- **输入节点**：设置工作流的输入参数
- **输出节点**：定义工作流的输出格式
- **代码块节点**：编写Python或JavaScript代码

### 3. 工作流执行

1. 点击工具栏的"执行"按钮
2. 查看执行状态和结果
3. 调试和优化工作流

## 🔧 API集成

项目集成了后端可视化工作流API：

- **基础URL**：`http://localhost:6500/api/v1`
- **工作流CRUD**：创建、读取、更新、删除工作流
- **工作流执行**：执行工作流并获取结果
- **节点模板**：获取节点模板和验证配置

## 🎨 自定义样式

项目使用CSS变量和Ant Design主题系统，可以轻松自定义样式：

```css
/* 自定义节点颜色 */
.node-llm {
  border-color: #52c41a;
}

.node-input {
  border-color: #1890ff;
}

.node-output {
  border-color: #fa541c;
}

.node-code {
  border-color: #722ed1;
}
```

## 🚀 部署

```bash
# 构建生产版本
npm run build

# 部署到静态服务器
# 将 dist/ 目录部署到你的服务器
```

## 🤝 贡献

欢迎提交Issue和Pull Request来改进项目。

## 📄 许可证

MIT License