import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api, ConversationWithCharacter } from '@/services/api'
import '@/styles/HomePage.css'
import OverlayScrollbar from './OverlayScrollbar'
import AnimatedButton from './AnimatedButton'

interface Character {
  path: string
  name: string
  description?: string
  avatar?: string
  create_date?: string
}

interface User {
  path: string
  name: string
  description?: string
}

interface HomePageProps {
  onSwitchToChat: () => void
  onLoadConversation?: (conversationPath: string) => void
}

export default function HomePage({ onSwitchToChat, onLoadConversation }: HomePageProps) {
  const [conversations, setConversations] = useState<ConversationWithCharacter[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [showCharacterSelector, setShowCharacterSelector] = useState<boolean>(false)
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [showNewConversationModal, setShowNewConversationModal] = useState<boolean>(false)
  const [newConversationName, setNewConversationName] = useState<string>('')
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>([])
  const [availableUsers, setAvailableUsers] = useState<User[]>([])
  const [showUserSelector, setShowUserSelector] = useState<boolean>(false)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadConversations(), loadAvailableCharacters(), loadAvailableUsers()])
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadConversations = async () => {
    try {
      const result = await Api.getConversationsWithFullBindings()
      if (result.success) {
        setConversations(result.conversations || [])
      }
    } catch (error) {
      console.error('加载对话列表失败:', error)
      setConversations([])
    }
  }

  const loadAvailableCharacters = async () => {
    try {
      // 获取可用的角色卡列表（用于选择器）
      const configResult = await Api.getConfigOptions()
      const characterFiles = configResult.config_options?.characters?.files || []
      
      const charactersData: any[] = []
      for (const file of characterFiles) {
        try {
          const contentResult = await Api.getFileContent(file.path)
          if (contentResult.content) {
            const parsedContent = JSON.parse(contentResult.content)
            charactersData.push({
              path: file.path,
              name: parsedContent.name || '未命名角色',
              description: parsedContent.description,
              avatar: parsedContent.avatar,
              create_date: parsedContent.create_date
            })
          }
        } catch (error) {
          console.error(`加载角色卡 ${file.path} 失败:`, error)
        }
      }
      setAvailableCharacters(charactersData)
    } catch (error) {
      console.error('加载角色卡列表失败:', error)
      setAvailableCharacters([])
    }
  }

  const loadAvailableUsers = async () => {
    try {
      // 通过获取配置选项来加载用户信息列表
      const configResult = await Api.getConfigOptions()
      if (configResult.success && configResult.config_options?.personas?.files) {
        const userFiles = configResult.config_options.personas.files
        
        const usersData: any[] = []
        for (const file of userFiles) {
          try {
            const contentResult = await Api.getFileContent(file.path)
            if (contentResult.success && contentResult.content) {
              const parsedContent = JSON.parse(contentResult.content)
              usersData.push({
                path: file.path,
                name: parsedContent.name || '未命名用户',
                description: parsedContent.description
              })
            }
          } catch (error) {
            console.error(`加载用户信息 ${file.path} 失败:`, error)
          }
        }
        setAvailableUsers(usersData)
      } else {
        console.warn('未找到personas配置或文件列表为空')
        setAvailableUsers([])
      }
    } catch (error) {
      console.error('加载用户信息列表失败:', error)
      setAvailableUsers([])
    }
  }

  const handleLoadConversation = (conversationPath: string) => {
    onLoadConversation?.(conversationPath)
    onSwitchToChat()
  }

  const handleBindCharacter = async (conversationPath: string, characterPath: string | null) => {
    try {
      const result = await Api.setFullBinding(conversationPath, undefined, characterPath || undefined)
      if (result.success) {
        setShowCharacterSelector(false)
        setSelectedConversation(null)
        await loadConversations() // 重新加载对话列表以更新绑定信息
        const character = availableCharacters.find(c => c.path === characterPath)
        alert(characterPath
          ? `已为对话绑定角色卡: ${character?.name || '未知角色'}`
          : '已解除对话的角色卡绑定'
        )
      } else {
        alert('绑定角色卡失败，请重试')
      }
    } catch (error) {
      console.error('绑定角色卡失败:', error)
      alert('绑定角色卡失败，请重试')
    }
  }

  const handleBindUser = async (conversationPath: string, userPath: string | null) => {
    try {
      const result = await Api.setFullBinding(conversationPath, userPath || undefined, undefined)
      if (result.success) {
        setShowUserSelector(false)
        setSelectedConversation(null)
        await loadConversations() // 重新加载对话列表以更新绑定信息
        const user = availableUsers.find(u => u.path === userPath)
        alert(userPath
          ? `已为对话绑定用户: ${user?.name || '未知用户'}`
          : '已解除对话的用户绑定'
        )
      } else {
        alert('绑定用户失败，请重试')
      }
    } catch (error) {
      console.error('绑定用户失败:', error)
      alert('绑定用户失败，请重试')
    }
  }

  const handleCreateFullBinding = async (conversationName: string, userPath: string, characterPath: string) => {
    try {
      const result = await Api.createNewConversationWithFullBinding(conversationName, userPath, characterPath)
      if (result.success) {
        setShowNewConversationModal(false)
        setNewConversationName('')
        
        // 直接加载新创建的对话并进入聊天界面
        if (result.conversation_path) {
          handleLoadConversation(result.conversation_path)
        }
      } else {
        alert('创建新对话失败，请重试')
      }
    } catch (error) {
      console.error('创建新对话失败:', error)
      alert('创建新对话失败，请重试')
    }
  }

  const handleCreateNewChat = () => {
    setShowNewConversationModal(true)
    setNewConversationName('')
  }

  const handleCreateConversationWithCharacter = async (characterPath: string, conversationName: string) => {
    try {
      // 检查是否选择了用户
      if (!selectedUser) {
        alert('请先选择用户')
        return
      }
      
      const result = await Api.createNewConversationWithFullBinding(conversationName, selectedUser, characterPath)
      if (result.success) {
        setShowNewConversationModal(false)
        setNewConversationName('')
        setSelectedUser(null)
        setSelectedCharacter(null)
        
        // 直接加载新创建的对话并进入聊天界面
        if (result.conversation_path) {
          handleLoadConversation(result.conversation_path)
        }
      } else {
        alert('创建新对话失败，请重试')
      }
    } catch (error) {
      console.error('创建新对话失败:', error)
      alert('创建新对话失败，请重试')
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '未知日期'
    try {
      return new Date(dateString).toLocaleDateString('zh-CN')
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="home-page loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>正在加载数据...</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="home-page"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* 页面标题 */}
      <motion.div
        className="home-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <h1>SmartTavern</h1>
      </motion.div>

      {/* 内容区域 - 显示对话和绑定的角色卡 */}
      <motion.div
        className="content-area"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <OverlayScrollbar className="home-scrollbar-container">
          {/* 新建对话卡片始终显示在第一位 */}
          <div className="conversations-grid">
            {/* 新建对话按钮卡片 */}
            <motion.div
              className="conversation-with-character-card new-conversation-card"
              onClick={() => setShowNewConversationModal(true)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="conversation-section new-conversation-section">
                <div className="conversation-header">
                  <div className="conversation-icon new-conversation-icon">✨</div>
                  <h3 className="conversation-title">创建新对话</h3>
                </div>
                <div className="conversation-meta">
                  <p className="new-conversation-description">选择角色卡开始全新的对话体验</p>
                </div>
              </div>
            </motion.div>
            
            {/* 现有对话列表 */}
            {conversations.length > 0 && conversations.map((conversation) => (
                <motion.div
                  key={conversation.path}
                  className={`conversation-with-character-card ${hoveredItem === conversation.path ? 'hovered' : ''}`}
                  onMouseEnter={() => setHoveredItem(conversation.path)}
                  onMouseLeave={() => setHoveredItem(null)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* 对话信息区域 */}
                  <div className="conversation-section" onClick={() => handleLoadConversation(conversation.path)}>
                    <div className="conversation-header">
                      <div className="conversation-icon">💬</div>
                      <h3 className="conversation-title">{conversation.display_name}</h3>
                    </div>
                    <div className="conversation-meta">
                      <p className="message-count">{conversation.message_count || 0} 条消息</p>
                      {conversation.last_modified && (
                        <p className="last-modified">
                          {formatDate(conversation.last_modified)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 角色卡信息区域 */}
                  <div className="character-section">
                    {conversation.character_path ? (
                      <div className="bound-character">
                        <div className="character-avatar-small">
                          {conversation.character_avatar ? (
                            <img src={conversation.character_avatar} alt={conversation.character_name} />
                          ) : (
                            <span className="avatar-placeholder-small">🎭</span>
                          )}
                        </div>
                        <div className="character-info">
                          <h4 className="character-name">{conversation.character_name || '未命名角色'}</h4>
                          <p className="character-description">
                            {conversation.character_description || '暂无描述'}
                          </p>
                        </div>
                        <div className="character-actions">
                          <AnimatedButton
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedConversation(conversation.path)
                              setShowCharacterSelector(true)
                            }}
                            icon="🔄"
                          >
                            更换
                          </AnimatedButton>
                        </div>
                      </div>
                    ) : (
                      <div className="no-character">
                        <div className="no-character-icon">❓</div>
                        <p className="no-character-text">未绑定角色卡</p>
                        <AnimatedButton
                          variant="primary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedConversation(conversation.path)
                            setShowCharacterSelector(true)
                          }}
                          icon="➕"
                        >
                          绑定角色卡
                        </AnimatedButton>
                      </div>
                    )}
                  </div>

                </motion.div>
              ))}
          </div>

          {/* 空状态 */}
          {conversations.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3>暂无历史对话</h3>
              <p>开始您的第一次对话吧！</p>
              <AnimatedButton
                variant="primary"
                onClick={handleCreateNewChat}
                icon="✨"
              >
                创建新对话
              </AnimatedButton>
            </div>
          )}
        </OverlayScrollbar>
      </motion.div>

      {/* 角色卡选择弹窗 */}
      <AnimatePresence>
        {showCharacterSelector && selectedConversation && (
          <motion.div
            className="character-selector-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setShowCharacterSelector(false)
              setSelectedConversation(null)
            }}
          >
            <motion.div
              className="character-selector-modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="character-selector-header">
                <h3>选择角色卡</h3>
                <button
                  className="close-button"
                  onClick={() => {
                    setShowCharacterSelector(false)
                    setSelectedConversation(null)
                  }}
                >
                  ✕
                </button>
              </div>
              
              <div className="character-selector-content">
                {/* 用户选择区域 */}
                <div className="binding-user-section">
                  <h4 className="section-title">选择用户</h4>
                  <div className="character-list">
                    {availableUsers.length > 0 ? (
                      availableUsers.map((user) => (
                        <motion.div
                          key={user.path}
                          className={`character-option ${selectedUser === user.path ? 'selected' : ''}`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedUser(user.path)}
                        >
                          <div className="character-avatar-small">
                            <span className="avatar-placeholder-small">👤</span>
                          </div>
                          <div className="character-info">
                            <h4 className="character-name">{user.name}</h4>
                            <p className="character-description">
                              {user.description || '暂无描述'}
                            </p>
                          </div>
                          {selectedUser === user.path && (
                            <div className="selection-indicator">✓</div>
                          )}
                        </motion.div>
                      ))
                    ) : (
                      <div className="no-characters-available">
                        <p>暂无可用的用户信息</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 角色卡选择区域 */}
                <div className="binding-character-section">
                  <h4 className="section-title">选择角色卡</h4>
                  <div className="character-list">
                    {availableCharacters.length > 0 ? (
                      availableCharacters.map((character) => (
                        <motion.div
                          key={character.path}
                          className={`character-option ${selectedCharacter === character.path ? 'selected' : ''}`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedCharacter(character.path)}
                        >
                          <div className="character-avatar-small">
                            {character.avatar ? (
                              <img src={character.avatar} alt={character.name} />
                            ) : (
                              <span className="avatar-placeholder-small">🎭</span>
                            )}
                          </div>
                          <div className="character-info">
                            <h4 className="character-name">{character.name}</h4>
                            <p className="character-description">
                              {character.description || '暂无描述'}
                            </p>
                          </div>
                          {selectedCharacter === character.path && (
                            <div className="selection-indicator">✓</div>
                          )}
                        </motion.div>
                      ))
                    ) : (
                      <div className="no-characters-available">
                        <p>暂无可用的角色卡</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="character-selector-actions">
                  <AnimatedButton
                    variant="primary"
                    disabled={!selectedUser && !selectedCharacter}
                    onClick={async () => {
                      if (selectedConversation) {
                        try {
                          const result = await Api.setFullBinding(selectedConversation, selectedUser || undefined, selectedCharacter || undefined)
                          if (result.success) {
                            setShowCharacterSelector(false)
                            setSelectedConversation(null)
                            setSelectedUser(null)
                            setSelectedCharacter(null)
                            await loadConversations() // 重新加载对话列表以更新绑定信息
                            alert('绑定设置已更新')
                          } else {
                            alert('设置绑定失败，请重试')
                          }
                        } catch (error) {
                          console.error('设置绑定失败:', error)
                          alert('设置绑定失败，请重试')
                        }
                      }
                    }}
                  >
                    应用绑定
                  </AnimatedButton>
                  <AnimatedButton
                    variant="ghost"
                    onClick={async () => {
                      if (selectedConversation) {
                        try {
                          const result = await Api.setFullBinding(selectedConversation, undefined, undefined)
                          if (result.success) {
                            setShowCharacterSelector(false)
                            setSelectedConversation(null)
                            setSelectedUser(null)
                            setSelectedCharacter(null)
                            await loadConversations() // 重新加载对话列表以更新绑定信息
                            alert('已解除所有绑定')
                          } else {
                            alert('解除绑定失败，请重试')
                          }
                        } catch (error) {
                          console.error('解除绑定失败:', error)
                          alert('解除绑定失败，请重试')
                        }
                      }
                    }}
                  >
                    解除绑定
                  </AnimatedButton>
                  <AnimatedButton
                    variant="ghost"
                    onClick={() => {
                      setShowCharacterSelector(false)
                      setSelectedConversation(null)
                      setSelectedUser(null)
                      setSelectedCharacter(null)
                    }}
                  >
                    取消
                  </AnimatedButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 新建对话弹窗 */}
      <AnimatePresence>
        {showNewConversationModal && (
          <motion.div
            className="character-selector-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setShowNewConversationModal(false)
              setNewConversationName('')
              setSelectedUser(null)
              setSelectedCharacter(null)
            }}
          >
            <motion.div
              className="character-selector-modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="character-selector-header">
                <h3>创建新对话</h3>
                <button
                  className="close-button"
                  onClick={() => {
                    setShowNewConversationModal(false)
                    setNewConversationName('')
                  }}
                >
                  ✕
                </button>
              </div>
              
              <div className="character-selector-content">
                {/* 对话名称输入 */}
                <div className="new-conversation-input-section">
                  <label htmlFor="conversation-name" className="input-label">对话名称</label>
                  <input
                    id="conversation-name"
                    type="text"
                    className="conversation-name-input"
                    placeholder="请输入对话名称..."
                    value={newConversationName}
                    onChange={(e) => setNewConversationName(e.target.value)}
                    autoFocus
                  />
                </div>

                {/* 用户选择 */}
                <div className="new-conversation-user-section">
                  <h4 className="section-title">选择用户</h4>
                  <div className="character-list">
                    {availableUsers.length > 0 ? (
                      availableUsers.map((user) => (
                        <motion.div
                          key={user.path}
                          className={`character-option ${selectedUser === user.path ? 'selected' : ''}`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedUser(user.path)}
                        >
                          <div className="character-avatar-small">
                            <span className="avatar-placeholder-small">👤</span>
                          </div>
                          <div className="character-info">
                            <h4 className="character-name">{user.name}</h4>
                            <p className="character-description">
                              {user.description || '暂无描述'}
                            </p>
                          </div>
                          {selectedUser === user.path && (
                            <div className="selection-indicator">✓</div>
                          )}
                        </motion.div>
                      ))
                    ) : (
                      <div className="no-characters-available">
                        <p>暂无可用的用户信息</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 角色卡选择 */}
                <div className="new-conversation-character-section">
                  <h4 className="section-title">选择角色卡</h4>
                  <div className="character-list">
                    {availableCharacters.length > 0 ? (
                      availableCharacters.map((character) => (
                        <motion.div
                          key={character.path}
                          className={`character-option ${selectedCharacter === character.path ? 'selected' : ''}`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedCharacter(character.path)}
                        >
                          <div className="character-avatar-small">
                            {character.avatar ? (
                              <img src={character.avatar} alt={character.name} />
                            ) : (
                              <span className="avatar-placeholder-small">🎭</span>
                            )}
                          </div>
                          <div className="character-info">
                            <h4 className="character-name">{character.name}</h4>
                            <p className="character-description">
                              {character.description || '暂无描述'}
                            </p>
                          </div>
                          {selectedCharacter === character.path && (
                            <div className="selection-indicator">✓</div>
                          )}
                        </motion.div>
                      ))
                    ) : (
                      <div className="no-characters-available">
                        <p>暂无可用的角色卡</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="character-selector-actions character-selector-actions-flex">
                  <AnimatedButton
                    variant="ghost"
                    onClick={() => {
                      setShowNewConversationModal(false)
                      setNewConversationName('')
                      setSelectedUser(null)
                      setSelectedCharacter(null)
                    }}
                  >
                    取消
                  </AnimatedButton>
                  <AnimatedButton
                    variant="primary"
                    disabled={!newConversationName.trim() || !selectedUser || !selectedCharacter}
                    onClick={() => {
                      if (newConversationName.trim() && selectedUser && selectedCharacter) {
                        handleCreateConversationWithCharacter(selectedCharacter, newConversationName.trim())
                      } else {
                        alert('请输入对话名称并选择用户和角色卡')
                      }
                    }}
                    icon="✨"
                  >
                    创建对话
                  </AnimatedButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}