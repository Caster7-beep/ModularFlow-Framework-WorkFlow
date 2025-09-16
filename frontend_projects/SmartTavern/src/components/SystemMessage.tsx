import React from 'react'
import { motion } from 'framer-motion'
import '@/styles/SystemMessage.css'

export type MessageType = 'system' | 'warning' | 'error' | 'success' | 'info'

interface SystemMessageProps {
  type?: MessageType
  title?: string
  children: React.ReactNode
  className?: string
  dismissible?: boolean
  onDismiss?: () => void
}

const MESSAGE_CONFIG = {
  system: {
    icon: '🔧',
    title: '系统消息',
    colorClass: 'system-message'
  },
  warning: {
    icon: '⚠️',
    title: '警告',
    colorClass: 'warning-message'
  },
  error: {
    icon: '❌',
    title: '错误',
    colorClass: 'error-message'
  },
  success: {
    icon: '✅',
    title: '成功',
    colorClass: 'success-message'
  },
  info: {
    icon: 'ℹ️',
    title: '信息',
    colorClass: 'info-message'
  }
}

export default function SystemMessage({
  type = 'system',
  title,
  children,
  className = '',
  dismissible = false,
  onDismiss
}: SystemMessageProps) {
  const config = MESSAGE_CONFIG[type]
  const displayTitle = title || config.title

  return (
    <motion.div
      className={`system-message ${config.colorClass} ${className}`}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      role="alert"
    >
      <div className="system-message-header">
        <div className="system-title">
          <span className="system-icon" aria-hidden="true">{config.icon}</span>
          {displayTitle}
        </div>
        {dismissible && (
          <motion.button
            className="system-dismiss"
            onClick={onDismiss}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            aria-label="关闭消息"
          >
            ✕
          </motion.button>
        )}
      </div>
      <div className="system-content">
        {children}
      </div>
    </motion.div>
  )
}

// 预定义的系统消息组件
export function ConnectionMessage({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <SystemMessage type="success" title="连接状态">
        WebSocket 连接已建立，可以进行实时对话
      </SystemMessage>
    )
  }

  return (
    <SystemMessage type="warning" title="连接状态">
      WebSocket 连接断开，将使用 HTTP 方式发送消息
    </SystemMessage>
  )
}

export function WelcomeMessage() {
  return (
    <SystemMessage type="info" title="欢迎使用 SmartTavern">
      <p>这是一个现代化的 AI 对话界面，支持：</p>
      <ul>
        <li>📝 Markdown 格式渲染</li>
        <li>🎨 代码语法高亮</li>
        <li>⚡ 实时 WebSocket 通信</li>
        <li>🔧 完整的 SmartTavern 工作流</li>
      </ul>
      <p>开始在下方输入框中输入消息来体验吧！</p>
    </SystemMessage>
  )
}

export function ErrorMessage({ error }: { error: string }) {
  return (
    <SystemMessage type="error" title="操作失败">
      {error}
    </SystemMessage>
  )
}

export function LoadingMessage({ message = "处理中..." }: { message?: string }) {
  return (
    <SystemMessage type="info" title="处理状态">
      <div className="loading-spinner">
        <motion.div
          className="loading-spinner-icon"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          ⚙️
        </motion.div>
        {message}
      </div>
    </SystemMessage>
  )
}