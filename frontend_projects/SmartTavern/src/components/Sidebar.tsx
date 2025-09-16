import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api } from '@/services/api'
import '@/styles/Sidebar.css'
import OverlayScrollbar from './OverlayScrollbar'
import PresetPanel from './PresetPanel'
import WorldBookPanel from './WorldBookPanel'
import RegexPanel from './RegexPanel'
import PersonaPanel from './PersonaPanel'
import CharacterPanel from './CharacterPanel'
import ApiConfigPanel from './ApiConfigPanel'
import CustomizationPanel from './CustomizationPanel'
import SettingsPanel from './SettingsPanel'

type ViewMode = 'home' | 'chat'

interface SidebarProps {
  onPresetClick?: () => void
  onPersonaClick?: () => void
  onWorldBookClick?: () => void
  onRegexClick?: () => void
  onCharacterClick?: () => void
  currentView?: ViewMode
  onSwitchToHome?: () => void
  onSwitchToChat?: () => void
}

export default function Sidebar({
  onPresetClick,
  onPersonaClick,
  onWorldBookClick,
  onRegexClick,
  onCharacterClick,
  currentView = 'home',
  onSwitchToHome,
  onSwitchToChat
}: SidebarProps) {
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null)
  const [presetOptions, setPresetOptions] = useState<any>(null)
  const [activeConfig, setActiveConfig] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadConfigData()
  }, [])

  const loadConfigData = async () => {
    setLoading(true)
    try {
      // 首先尝试加载用户偏好设置，这会自动应用保存的配置
      try {
        await Api.loadUserPreferences()
        console.log('✓ 用户偏好设置已加载')
      } catch (prefErr) {
        console.warn('⚠️ 加载用户偏好设置失败，使用默认配置:', prefErr)
      }

      // 然后获取配置选项和当前活跃配置
      const [optionsRes, activeRes] = await Promise.all([
        Api.getConfigOptions(),
        Api.getActiveConfig()
      ])
      setPresetOptions(optionsRes.config_options)
      setActiveConfig(activeRes.active_config)
    } catch (err) {
      console.error('加载配置失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSectionToggle = (sectionId: string) => {
    setActiveDrawer(activeDrawer === sectionId ? null : sectionId)
  }

  const handleConfigChange = async (configType: string, filePath: string) => {
    try {
      const result = await Api.setActiveConfig(configType as any, filePath || null)
      setActiveConfig(result.active_config)
    } catch (err) {
      console.error('设置配置失败:', err)
    }
  }

  const navigationButtons = [
    { id: 'home', icon: '🏠', label: '首页', description: '查看历史对话和角色卡', isNavigation: true },
    { id: 'chat', icon: '💬', label: '对话', description: '楼层式对话界面', isNavigation: true }
  ]

  const sidebarButtons = [
    { id: 'preset', icon: '📋', label: '预设配置', description: '管理提示词预设', hasContent: true },
    { id: 'character', icon: '🎭', label: '角色卡', description: '管理角色卡片', hasContent: true },
    { id: 'persona', icon: '👤', label: '用户信息', description: '设置用户角色信息', hasContent: true },
    { id: 'worldbook', icon: '📖', label: '世界书', description: '管理世界书设定', hasContent: true },
    { id: 'regex', icon: '🔧', label: '正则规则', description: '配置文本替换规则', hasContent: true },
    { id: 'apiconfig', icon: '🤖', label: 'LLM API配置', description: '管理LLM API配置', hasContent: true },
    { id: 'customization', icon: '🎨', label: '自定义美化', description: '管理前端美化组件和样式', hasContent: true },
    { id: 'settings', icon: '⚙️', label: '应用设置', description: '调整应用程序界面和功能', hasContent: true }
  ]

  const renderDrawerContent = (sectionId: string) => {
    if (!presetOptions || !activeConfig) {
      return null
    }

    switch (sectionId) {
      case 'preset':
        return (
          <PresetPanel
            presetOptions={presetOptions}
            activeConfig={activeConfig}
            onConfigChange={handleConfigChange}
            loadConfigData={loadConfigData}
          />
        )
      case 'character':
        return (
          <CharacterPanel
            characterOptions={presetOptions}
            activeConfig={activeConfig}
            onConfigChange={handleConfigChange}
            loadConfigData={loadConfigData}
          />
        )
      case 'worldbook':
        return (
          <WorldBookPanel
            worldBookOptions={presetOptions}
            activeConfig={activeConfig}
            onConfigChange={handleConfigChange}
            loadConfigData={loadConfigData}
          />
        )
      case 'regex':
        return (
          <RegexPanel
            regexOptions={presetOptions}
            activeConfig={activeConfig}
            onConfigChange={handleConfigChange}
            loadConfigData={loadConfigData}
          />
        )
      case 'persona':
        return (
          <PersonaPanel
            personaOptions={presetOptions}
            activeConfig={activeConfig}
            onConfigChange={handleConfigChange}
            loadConfigData={loadConfigData}
          />
        )
      case 'apiconfig':
        return (
          <ApiConfigPanel
            loadConfigData={loadConfigData}
          />
        )
      case 'customization':
        return (
          <CustomizationPanel
            loadConfigData={loadConfigData}
          />
        )
      case 'settings':
        return (
          <SettingsPanel
            loadConfigData={loadConfigData}
          />
        )
      default:
        return (
          <motion.div
            className="sidebar-drawer-placeholder"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            功能开发中...
          </motion.div>
        )
    }
  }

  return (
    <>
      {/* 固定侧边栏 - 只显示图标 */}
      <motion.aside
        className={`sidebar-dynamic-position ${activeDrawer ? 'drawer-open' : 'drawer-closed'}`}
        initial={{ x: -60 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* 导航按钮 */}
        <div className="sidebar-nav-container">
          {navigationButtons.map((button, index) => (
            <motion.button
              key={button.id}
              className={`sidebar-nav-button-base ${currentView === button.id ? 'active' : ''}`}
              onClick={() => {
                if (button.id === 'home') onSwitchToHome?.()
                else if (button.id === 'chat') onSwitchToChat?.()
              }}
              whileHover={{
                backgroundColor: 'var(--sidebar-nav-hover-bg)',
                scale: 1.03
              }}
              whileTap={{ scale: 0.97 }}
              title={button.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
            >
              {button.icon}
            </motion.button>
          ))}
        </div>

        {/* 功能按钮 */}
        <div className="sidebar-functions-container">
          {sidebarButtons.map((button, index) => (
            <motion.button
              key={button.id}
              className={`sidebar-function-button-base ${activeDrawer === button.id ? 'active' : ''}`}
              onClick={() => handleSectionToggle(button.id)}
              whileHover={{
                backgroundColor: 'var(--sidebar-button-hover-bg)',
                borderColor: 'var(--accent)',
                scale: 1.05
              }}
              whileTap={{ scale: 0.95 }}
              title={button.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: (index + 2) * 0.1, duration: 0.3 }}
            >
              {button.icon}
            </motion.button>
          ))}
        </div>

        <div className="sidebar-footer-info">
        </div>
      </motion.aside>

      {/* 左侧抽屉 */}
      <AnimatePresence>
        {activeDrawer && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              className="sidebar-drawer-backdrop-style"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setActiveDrawer(null)}
            />

            {/* 抽屉内容 */}
            <motion.div
              className="sidebar-drawer-container"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {/* 抽屉头部 */}
              <div className="sidebar-drawer-header-container">
                <div className="sidebar-drawer-title-area">
                  <span className="sidebar-drawer-title-icon-style">
                    {sidebarButtons.find(btn => btn.id === activeDrawer)?.icon}
                  </span>
                  <h3 className="sidebar-drawer-title-text">
                    {sidebarButtons.find(btn => btn.id === activeDrawer)?.label}
                  </h3>
                </div>
                <motion.button
                  className="sidebar-drawer-close-button"
                  onClick={() => setActiveDrawer(null)}
                  whileHover={{
                    backgroundColor: 'var(--drawer-close-hover-bg)',
                    color: 'var(--text)'
                  }}
                  whileTap={{ scale: 0.9 }}
                >
                  ✕
                </motion.button>
              </div>

              {/* 抽屉内容区域 */}
              <div className="sidebar-drawer-content-area">
                <OverlayScrollbar
                  className="sidebar-drawer-scroll-container"
                  showOnHover={true}
                  autoHide={true}
                  autoHideDelay={2000}
                  thumbColor="var(--scrollbar-thumb-color)"
                  thumbHoverColor="var(--scrollbar-thumb-hover-color)"
                  thumbActiveColor="var(--scrollbar-thumb-active-color)"
                  trackColor="var(--scrollbar-track-color)"
                >
                  {renderDrawerContent(activeDrawer)}
                </OverlayScrollbar>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}