# SmartTavern React 聊天界面

这是一个使用 React + Vite + TypeScript 构建的现代化 SmartTavern 对话系统前端。

## ✨ 功能特性

- 🤖 **智能对话**: 与后端的 SmartTavern 工作流完全集成，支持角色扮演、世界书和宏处理。
- ⚙️ **配置管理**: 提供一个简洁的界面来选择和管理预设、角色卡、世界书、正则表达式规则和对话历史。
- 🔄 **实时通信**: 使用 WebSocket 实现实时双向通信，并具备自动重连机制以保证连接的稳定性。
- 🎨 **现代化的用户界面**: 采用玻璃拟物化设计风格，结合流畅的动画效果和响应式布局，提供卓越的用户体验。
- 📝 **Markdown 支持**: 聊天消息支持 Markdown 格式，并提供代码高亮功能。
- ♿ **无障碍访问**: 遵循无障碍设计原则，提供完整的 ARIA 标签和键盘导航支持。

## 🚀 快速开始

### 环境要求

- Node.js 16.0 或更高版本
- npm 8.0 或更高版本

### 安装依赖

在项目根目录下运行以下命令来安装所有必需的依赖项：

```bash
npm install
```

### 启动开发服务器

要启动本地开发服务器，请运行：

```bash
npm run dev
```

应用将在 [http://localhost:3000](http://localhost:3000) 上可用。

### 构建生产版本

要为生产环境构建优化后的静态文件，请运行：

```bash
npm run build
```

构建后的文件将输出到 `dist` 目录。

### 预览生产版本

要在本地预览生产构建的版本，请运行：

```bash
npm run preview
```

## 📂 项目结构

```
frontend_projects/SmartTavern/
├── public/                # 静态资源
├── src/
│   ├── components/        # React 组件
│   │   ├── Header.tsx     # 顶部标题栏
│   │   ├── ConfigPanel.tsx# 配置选择面板
│   │   ├── ChatWindow.tsx # 聊天主界面
│   │   └── StatusBar.tsx  # 状态栏
│   ├── services/          # API 和 WebSocket 服务
│   │   ├── api.ts         # HTTP API 客户端
│   │   └── ws.ts          # WebSocket 客户端
│   ├── App.tsx            # 主应用组件
│   ├── main.tsx           # 应用入口
│   ├── styles.css         # 全局样式
│   └── vite-env.d.ts      # Vite 环境变量类型定义
├── index.html             # HTML 入口文件
├── package.json           # 项目依赖和脚本
├── tsconfig.json          # TypeScript 配置文件
└── vite.config.ts         # Vite 配置文件