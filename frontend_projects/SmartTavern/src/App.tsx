import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import FloorChatWindow, { ChatMessage } from './components/FloorChatWindow'
import FloorChatWindowOptimized from './components/FloorChatWindowOptimized'
import HomePage from './components/HomePage'
import Sidebar from './components/Sidebar'
import { MobileDrawer } from './components/Drawer'
import './styles.css'
import './styles/App.css'

type ViewMode = 'home' | 'chat'

// 是否使用优化版聊天窗口
const USE_OPTIMIZED_CHAT = true; // 可以设置为false以使用原始版本进行对比测试

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentView, setCurrentView] = useState<ViewMode>('home')
  const [currentConversationPath, setCurrentConversationPath] = useState<string>('')
  
  // 抽屉状态
  const [presetDrawerOpen, setPresetDrawerOpen] = useState(false)
  const [personaDrawerOpen, setPersonaDrawerOpen] = useState(false)
  const [worldBookDrawerOpen, setWorldBookDrawerOpen] = useState(false)
  const [regexDrawerOpen, setRegexDrawerOpen] = useState(false)

  const handleHistoryLoaded = (history: ChatMessage[]) => {
    setMessages(history)
  }

  const handleSwitchToChat = () => {
    setCurrentView('chat')
  }

  const handleSwitchToHome = () => {
    setCurrentView('home')
  }

  const handleLoadConversation = (conversationPath: string) => {
    // 设置当前对话路径，这样FloorChatWindow就会加载该对话
    setCurrentConversationPath(conversationPath)
    console.log('加载对话:', conversationPath)
  }


  return (
    <div className="app-root">
      {/* Skip to content link for keyboard navigation */}
      <a href="#main-content" className="skip-to-content">
        跳转到主要内容
      </a>
      
      
      <div className="main-layout">
        {/* 侧边栏 */}
        <Sidebar
          onPresetClick={() => setPresetDrawerOpen(true)}
          onPersonaClick={() => setPersonaDrawerOpen(true)}
          onWorldBookClick={() => setWorldBookDrawerOpen(true)}
          onRegexClick={() => setRegexDrawerOpen(true)}
          currentView={currentView}
          onSwitchToHome={handleSwitchToHome}
          onSwitchToChat={handleSwitchToChat}
        />
        
        {/* 主内容区域 */}
        <motion.section
          id="main-content"
          className="main-content-wrapper"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          role="main"
          aria-label="主要内容区域"
        >
          <AnimatePresence mode="wait">
            {currentView === 'home' ? (
              <motion.div
                key="home-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.3 }}
                className="view-container"
              >
                <HomePage
                  onSwitchToChat={handleSwitchToChat}
                  onLoadConversation={handleLoadConversation}
                />
              </motion.div>
            ) : (
              <motion.div
                key="chat-view"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="view-container"
              >
                {USE_OPTIMIZED_CHAT ? (
                  <FloorChatWindowOptimized
                    messages={messages}
                    onMessagesChange={setMessages}
                    onHistoryLoaded={handleHistoryLoaded}
                    conversationPath={currentConversationPath}
                  />
                ) : (
                  <FloorChatWindow
                    messages={messages}
                    onMessagesChange={setMessages}
                    onHistoryLoaded={handleHistoryLoaded}
                    conversationPath={currentConversationPath}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </div>


      {/* 预设抽屉 */}
      <MobileDrawer
        isOpen={presetDrawerOpen}
        onClose={() => setPresetDrawerOpen(false)}
        title="🎛️ 预设配置"
        position="right"
      >
        <div className="drawer-content-padding">
          <p>预设配置功能已集成到左侧边栏，请使用侧边栏进行配置。</p>
        </div>
      </MobileDrawer>

      {/* 用户信息抽屉 */}
      <MobileDrawer
        isOpen={personaDrawerOpen}
        onClose={() => setPersonaDrawerOpen(false)}
        title="👤 用户信息"
        position="right"
      >
        <div className="drawer-content-padding">
          <p>用户信息配置功能开发中...</p>
        </div>
      </MobileDrawer>

      {/* 世界书抽屉 */}
      <MobileDrawer
        isOpen={worldBookDrawerOpen}
        onClose={() => setWorldBookDrawerOpen(false)}
        title="📖 世界书"
        position="right"
      >
        <div className="drawer-content-padding">
          <p>世界书配置功能已集成到左侧边栏，请使用侧边栏进行配置。</p>
        </div>
      </MobileDrawer>

      {/* 正则规则抽屉 */}
      <MobileDrawer
        isOpen={regexDrawerOpen}
        onClose={() => setRegexDrawerOpen(false)}
        title="🔧 正则规则"
        position="right"
      >
        <div className="drawer-content-padding">
          <p>正则规则配置功能开发中...</p>
        </div>
      </MobileDrawer>
    </div>
  )
}