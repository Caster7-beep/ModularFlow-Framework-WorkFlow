import React from 'react'
import '@/styles/StatusBar.css'

type Props = {
  connected: boolean
  messageCount: number
}

export default function StatusBar({ connected, messageCount }: Props) {
  return (
    <div className="status-bar" role="contentinfo" aria-label="连接状态与统计">
      <div className="status-indicator" aria-live="polite">
        <div className={`status-dot ${connected ? '' : 'disconnected'}`} aria-hidden />
        <span>{connected ? '已连接' : '连接断开'}</span>
      </div>
      <div>
        消息数: <span>{messageCount}</span>
      </div>
    </div>
  )
}