import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api } from '@/services/api'
import { ReconnectableWS } from '@/services/ws'
import AnimatedButton from './AnimatedButton'
import TypewriterText from './TypewriterText'
import DeleteConfirmModal from './DeleteConfirmModal'
import MessageContent from './MessageContent'
import '@/styles/FloorChatWindow.css'

export type Role = 'user' | 'assistant' | 'system'
export type ChatMessage = {
  role: Role;
  content: string;
  timestamp?: number;
  streaming?: boolean;
  id?: string;
  error?: string; // 添加错误信息字段
}

type Props = {
  messages: ChatMessage[]
  onMessagesChange: (m: ChatMessage[]) => void
  onConnectionChange?: (connected: boolean) => void
  onHistoryLoaded?: (history: ChatMessage[]) => void
  conversationPath?: string // 新增：指定要加载的对话文件路径
}

export default function FloorChatWindow({
  messages,
  onMessagesChange,
  onHistoryLoaded,
  conversationPath,
}: Props) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [typing, setTyping] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean
    messageIndex: number
  }>({ isOpen: false, messageIndex: -1 })

  const messagesRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const wsRef = useRef<ReconnectableWS | null>(null)
  // 容器级滚轮转发：在容器任意位置滚轮可滚动楼层消息
  const containerRef = useRef<HTMLDivElement | null>(null)

  // 初始化：加载历史 + 建立 WebSocket
  useEffect(() => {
    void loadHistory()

    const ws = new ReconnectableWS(undefined, {
      onOpen: () => {
      },
      onClose: () => {
      },
      onError: () => {
      },
      onMessage: (data) => {
        try {
          if (data?.type === 'function_result' && data?.function === 'SmartTavern.send_message') {
            setTyping(false)
            setSending(false)
            if (data.result && data.result.success) {
              // WebSocket消息处理成功，如果有返回的历史数据则直接使用
              if (data.result.history && Array.isArray(data.result.history)) {
                onMessagesChange(data.result.history as ChatMessage[])
              } else {
                // 如果WebSocket没有返回历史数据，则通过HTTP API重新获取
                // 但这里需要确保调用LLM API来处理用户的消息
                if (conversationPath) {
                  void loadHistory()
                }
              }
            } else {
              const errorMessage = `API请求失败: ${data.result?.error || data.error || '未知错误'}`;
              
              // 先尝试为当前内存中的用户消息添加错误信息
              let lastUserMessageIndex = -1;
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                  lastUserMessageIndex = i;
                  break;
                }
              }
              
              if (lastUserMessageIndex !== -1) {
                // 直接在前端为用户消息添加错误信息
                const updatedMessages = [...messages];
                updatedMessages[lastUserMessageIndex] = {
                  ...updatedMessages[lastUserMessageIndex],
                  error: errorMessage
                };
                onMessagesChange(updatedMessages);
              } else {
                // 如果在当前消息数组中找不到用户消息，重新加载历史并添加错误信息
                if (conversationPath) {
                  setTimeout(async () => {
                    await loadHistory();
                    // 延迟后为最后一条用户消息添加错误
                    setTimeout(async () => {
                      const result = await Api.loadConversationFile(conversationPath)
                      if (result.success) {
                        const currentMessages = (result.history || []) as ChatMessage[]
                        let userMessageIndex = -1;
                        for (let i = currentMessages.length - 1; i >= 0; i--) {
                          if (currentMessages[i].role === 'user') {
                            userMessageIndex = i;
                            break;
                          }
                        }
                        
                        if (userMessageIndex !== -1) {
                          const newMessages = [...currentMessages];
                          newMessages[userMessageIndex] = {
                            ...newMessages[userMessageIndex],
                            error: errorMessage
                          };
                          onMessagesChange(newMessages);
                        }
                      }
                    }, 100);
                  }, 300);
                }
              }
            }
          }
        } catch {
          // 忽略非 JSON 或未知消息
        }
      },
    })
    ws.start()
    wsRef.current = ws

    return () => {
      wsRef.current?.close(1000, 'unmount')
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationPath]) // 添加conversationPath作为依赖项，当对话路径变化时重新加载

  // 消息变化时滚动到底部
  useEffect(() => {
    scrollToBottom()
  }, [messages, typing])

  // 输入变化时自适应高度
  useEffect(() => {
    autoResize()
  }, [input])

  // 在容器任意位置滚轮 => 滚动楼层消息（防止只能在中间区域滚动）
  useEffect(() => {
    const container = containerRef.current
    const messagesEl = messagesRef.current
    if (!container || !messagesEl) return

    const handleWheel = (e: WheelEvent) => {
      // 如果当前事件目标已经在楼层滚动容器内，则交给原生滚动
      const target = e.target as Node
      if (messagesEl.contains(target)) {
        return
      }
      // 在容器其他区域滚轮时，转发到楼层消息容器
      messagesEl.scrollTop += e.deltaY
      e.preventDefault()
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel as EventListener)
    }
  }, [])

  const hasMessages = useMemo(() => (messages?.length || 0) > 0, [messages])

  async function loadHistory() {
    try {
      // 如果指定了对话路径，加载该对话文件并直接获取返回的历史内容
      if (conversationPath) {
        const result = await Api.loadConversationFile(conversationPath)
        if (result.success) {
          // 直接使用后端返回的对话历史内容
          const history = (result.history || []) as ChatMessage[]
          onMessagesChange(history)
          onHistoryLoaded?.(history)
        } else {
          onMessagesChange([])
          onHistoryLoaded?.([])
        }
      } else {
        // 如果没有指定对话路径，清空消息
        onMessagesChange([])
        onHistoryLoaded?.([])
      }
    } catch (e: any) {
      onMessagesChange([])
    }
  }


  function appendMessage(m: ChatMessage) {
    onMessagesChange([...(messages || []), m])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void onSend()
    }
  }

  function autoResize() {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  function scrollToBottom() {
    const el = messagesRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  async function onSend() {
    const content = input.trim()
    if (!content || sending) return

    appendMessage({ role: 'user', content })
    setInput('')
    setTyping(true)
    setSending(true)
    setTimeout(autoResize)

    try {
      const ws = wsRef.current
      const sentByWS =
        !!ws &&
        ws.isOpen &&
        ws.send({
          type: 'function_call',
          function: 'SmartTavern.send_message',
          params: { message: content, conversation_file: conversationPath },
        })

      if (!sentByWS) {
        const result = await Api.sendMessage(content, false, conversationPath)
        setTyping(false)
        setSending(false)
        if (result?.success) {
          // 直接使用后端返回的对话历史内容
          const history = (result.history || []) as ChatMessage[]
          onMessagesChange(history)
        } else {
          // 为最后一条用户消息添加错误信息
          let lastUserMessageIndex = -1;
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
              lastUserMessageIndex = i;
              break;
            }
          }
          if (lastUserMessageIndex !== -1) {
            const updatedMessages = [...messages];
            updatedMessages[lastUserMessageIndex] = {
              ...updatedMessages[lastUserMessageIndex],
              error: `API请求失败: ${(result as any)?.error || '未知错误'}`
            };
            onMessagesChange(updatedMessages);
          }
        }
      }
    } catch (e: any) {
      setTyping(false)
      setSending(false)
      // 为最后一条用户消息添加错误信息
      let lastUserMessageIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          lastUserMessageIndex = i;
          break;
        }
      }
      if (lastUserMessageIndex !== -1) {
        const updatedMessages = [...messages];
        updatedMessages[lastUserMessageIndex] = {
          ...updatedMessages[lastUserMessageIndex],
          error: `网络错误: ${e?.message || '请稍后重试'}`
        };
        onMessagesChange(updatedMessages);
      }
    }
  }

  async function onClearHistory() {
    if (!confirm('确定要清空对话历史吗？')) return
    try {
      const res = await Api.clearHistory()
      if (res?.success) {
        onMessagesChange([])
      } else {
        alert('清空历史失败')
      }
    } catch (e: any) {
      alert('清空历史失败：' + (e?.message || e))
    }
  }

  async function onShowHistory() {
    // 显示当前消息统计
    const total = messages?.length || 0
    alert(`对话历史：当前显示 ${total} 条消息`)
  }

  function onDeleteMessage(messageIndex: number) {
    if (!conversationPath) {
      alert('没有指定对话文件，无法删除消息')
      return
    }

    const message = messages[messageIndex]
    if (!message) {
      alert('消息不存在')
      return
    }

    // 打开自定义删除确认面板
    setDeleteModal({
      isOpen: true,
      messageIndex
    })
  }

  async function confirmDeleteMessage() {
    const { messageIndex } = deleteModal
    
    try {
      const result = await Api.deleteMessage(conversationPath!, messageIndex)
      if (result?.success) {
        // 直接使用后端返回的对话历史内容
        const history = (result.history || []) as ChatMessage[]
        onMessagesChange(history)
        
        // 显示删除成功的消息
        const deletedMsg = result.deleted_message
        if (deletedMsg) {
          console.log(`✅ 已删除消息: ${deletedMsg.role} - ${deletedMsg.content.substring(0, 50)}...`)
        }

        // 关闭删除面板
        setDeleteModal({ isOpen: false, messageIndex: -1 })
      } else {
        alert(`删除消息失败: ${(result as any)?.error || '未知错误'}`)
      }
    } catch (e: any) {
      alert(`删除消息失败: ${e?.message || '网络错误'}`)
    }
  }

  function cancelDeleteMessage() {
    setDeleteModal({ isOpen: false, messageIndex: -1 })
  }

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    })
  }

  return (
    <div ref={containerRef} className="floor-chat-container" role="main" aria-label="楼层对话">
      {/* 右侧消息列表区域 */}
      <div className="chat-messages-panel">
        <div className="floor-messages" ref={messagesRef}>
          {!hasMessages && (
            <div className="empty-state" id="emptyState">
              <div className="empty-icon">🤖</div>
              <h3>开始与 SmartTavern 对话</h3>
              <p>
                体验楼层式对话模式，让交流更加清晰有序
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {(messages || []).map((m, idx) => (
              <motion.div
                key={`floor-${idx}`}
                className={`floor-message ${m.role}`}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                {/* 楼层标识 */}
                <div className="floor-header">
                  <div className="floor-number">#{idx + 1}</div>
                  <div className="floor-avatar">
                    <div className={`avatar-square ${m.role}`}></div>
                  </div>
                  <div className="floor-info">
                    <div className="floor-role">
                      {m.role === 'user' ? '您' : 'SmartTavern'}
                    </div>
                    {m.timestamp && (
                      <div className="floor-time">
                        {formatTimestamp(m.timestamp)}
                      </div>
                    )}
                  </div>
                </div>

                {/* 消息内容 - 使用MessageContent组件渲染 */}
                <div className="floor-content">
                  <MessageContent content={m.content} className="floor-message-content" />
                </div>

                {/* 错误信息显示 */}
                {m.error && (
                  <div className="floor-error-box">
                    <div className="floor-error-header">
                      <span className="floor-error-icon">⚠️</span>
                      <span className="floor-error-title">处理错误</span>
                    </div>
                    <div className="floor-error-content">
                      {m.error}
                    </div>
                  </div>
                )}

                {/* 消息操作 */}
                <div className="floor-actions">
                  <button
                    className="floor-action-btn"
                    onClick={() => navigator.clipboard.writeText(m.content)}
                    title="复制消息"
                  >
                    📋
                  </button>
                  <button
                    className="floor-action-btn"
                    onClick={() => {
                      const messageText = `#${idx + 1} ${m.role === 'user' ? '您' : 'SmartTavern'}:\n${m.content}`
                      navigator.clipboard.writeText(messageText)
                    }}
                    title="复制楼层"
                  >
                    📄
                  </button>
                  <button
                    className="floor-action-btn delete-btn"
                    onClick={() => onDeleteMessage(idx)}
                    title="删除消息"
                  >
                    🗑️
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* 打字指示器 */}
          <AnimatePresence>
            {typing && (
              <motion.div
                key="typing-floor"
                className="floor-message assistant typing-floor"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="floor-header">
                  <div className="floor-number">#{(messages?.length || 0) + 1}</div>
                  <div className="floor-avatar">
                    <div className="avatar-square assistant"></div>
                  </div>
                  <div className="floor-info">
                    <div className="floor-role">SmartTavern</div>
                  </div>
                </div>
                <div className="floor-content">
                  <div className="typing-indicator">
                    <div className="typing-dots">
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                    </div>
                    <span className="typing-text">正在思考回复...</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 底部固定输入栏 */}
      <div className="chat-input-panel">
        <motion.div
          className="floor-input-area"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <div className="floor-input-wrapper">
            <motion.div
              className="floor-send-area"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
            >
              <div className="floor-input-container">
                <motion.textarea
                  ref={inputRef}
                  className="floor-input"
                  placeholder="在此输入您的消息，按 Enter 发送..."
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onInput={autoResize}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  aria-label="输入消息"
                  whileFocus={{ scale: 1.001 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
                <div className="floor-input-actions">
                  <AnimatedButton
                    variant="primary"
                    onClick={() => void onSend()}
                    disabled={sending || !input.trim()}
                    loading={sending}
                    icon={sending ? undefined : "🚀"}
                    aria-label="发送消息"
                  >
                    {sending ? "发送中..." : "发送"}
                  </AnimatedButton>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* 自定义删除确认面板 */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        onConfirm={confirmDeleteMessage}
        onCancel={cancelDeleteMessage}
        messageIndex={deleteModal.messageIndex}
      />
    </div>
  )
}