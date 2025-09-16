import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import OverlayScrollbar from './OverlayScrollbar'
import { Api } from '@/services/api'
import '../styles/SettingsPanel.css'

interface SettingsPanelProps {
  loadConfigData: () => void;
}

// 设置项的数据结构
interface AppSettings {
  floorCount: number;
  messagePanelWidth: number;
  inputPanelWidth: number;
}

// 默认设置值
const DEFAULT_SETTINGS: AppSettings = {
  floorCount: 10,
  messagePanelWidth: 100, // 百分比
  inputPanelWidth: 100, // 百分比
}

export default function SettingsPanel({ loadConfigData }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [statusTimeout, setStatusTimeout] = useState<number | null>(null)

  // 加载设置
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setIsLoading(true)
    try {
      // 首先尝试从后端API获取设置
      const response = await Api.getUiSettings()
      
      if (response.success && response.ui_settings) {
        setSettings(response.ui_settings)
        // 应用设置到DOM
        applySettings(response.ui_settings)
        console.log('从后端加载设置成功')
      } else {
        // 如果后端API失败，尝试从本地存储获取
        const savedSettings = localStorage.getItem('app_settings')
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings)
          setSettings(parsedSettings)
          // 应用设置到DOM
          applySettings(parsedSettings)
          console.log('从本地存储加载设置成功')
        }
      }
    } catch (err) {
      console.error('加载设置失败:', err)
      // 出错时尝试本地存储
      try {
        const savedSettings = localStorage.getItem('app_settings')
        if (savedSettings) {
          setSettings(JSON.parse(savedSettings))
        }
      } catch (localErr) {
        console.error('本地存储加载也失败:', localErr)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // 保存设置
  const saveSettings = async () => {
    // 防止重复保存
    if (isSaving) return
    
    setIsSaving(true)
    setSaveStatus('idle')
    
    try {
      // 保存到本地存储
      localStorage.setItem('app_settings', JSON.stringify(settings))
      
      // 应用设置到DOM
      applySettings(settings)
      
      // 触发设置变更事件
      const event = new CustomEvent('settings-changed', { detail: settings })
      window.dispatchEvent(event)
      
      // 模拟后端保存
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // 设置状态为成功
      setSaveStatus('success')
      
      // 更新全局配置（如果需要）
      loadConfigData()
    } catch (err) {
      console.error('保存设置失败:', err)
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
      
      // 清除之前的超时
      if (statusTimeout) {
        clearTimeout(statusTimeout)
      }
      
      // 3秒后重置状态
      const timeout = window.setTimeout(() => {
        setSaveStatus('idle')
      }, 3000)
      
      setStatusTimeout(timeout as unknown as number)
    }
  }

  // 当组件卸载时清除超时
  useEffect(() => {
    return () => {
      if (statusTimeout) {
        clearTimeout(statusTimeout)
      }
    }
  }, [statusTimeout])

  // 应用设置到DOM
  const applySettings = (settings: AppSettings) => {
    // 设置CSS变量
    document.documentElement.style.setProperty('--message-panel-width', `${settings.messagePanelWidth}%`)
    document.documentElement.style.setProperty('--input-panel-width', `${settings.inputPanelWidth}%`)
    
    // 设置消息面板宽度
    const chatPanel = document.querySelector('.chat-messages-panel') as HTMLElement
    if (chatPanel) {
      chatPanel.style.width = `${settings.messagePanelWidth}%`
    }
    
    // 设置输入框宽度
    const inputPanel = document.querySelector('.floor-input-container') as HTMLElement
    if (inputPanel) {
      inputPanel.style.width = `${settings.inputPanelWidth}%`
      inputPanel.style.margin = '0 auto'
    }
    
    // 设置楼层数 - 只需要保存到localStorage，不需要立即应用
    // FloorChatWindowOptimized组件会在下次渲染时读取
    console.log(`楼层显示数量已更新为: ${settings.floorCount}`)
  }

  // 处理设置变更
  const handleSettingChange = (key: keyof AppSettings, value: number) => {
    // 更新设置状态
    setSettings(prev => {
      const newSettings = {
        ...prev,
        [key]: value
      }
      
      // 延迟保存，避免频繁调用
      const debounced = setTimeout(async () => {
        try {
          // 先应用设置到DOM以获得立即响应
          applySettings(newSettings)
          
          // 触发设置变更事件
          const event = new CustomEvent('settings-changed', { detail: newSettings })
          window.dispatchEvent(event)
          
          // 保存到本地存储作为备份
          localStorage.setItem('app_settings', JSON.stringify(newSettings))
          
          // 尝试保存到后端
          const response = await Api.updateUiSettings(newSettings)
          
          if (response.success) {
            console.log('设置已成功保存到后端')
            setSaveStatus('success')
          } else {
            console.warn('保存到后端失败，但已保存到本地存储', response.message || '未知错误')
            setSaveStatus('success') // 仍然显示成功，因为本地保存成功了
          }
        } catch (err) {
          console.error('保存设置时出错:', err)
          setSaveStatus('error')
        } finally {
          // 3秒后重置状态
          if (statusTimeout) {
            clearTimeout(statusTimeout)
          }
          const timeout = window.setTimeout(() => {
            setSaveStatus('idle')
          }, 3000)
          setStatusTimeout(timeout as unknown as number)
        }
      }, 300)
      
      return newSettings
    })
  }

  // 验证楼层数输入
  const validateFloorCount = (value: number) => {
    return Math.max(3, Math.min(50, value))
  }

  // 验证消息面板宽度输入
  const validatePanelWidth = (value: number) => {
    return Math.max(20, Math.min(100, value))
  }

  // 验证输入框宽度输入
  const validateInputWidth = (value: number) => {
    return Math.max(20, Math.min(100, value))
  }

  return (
    <motion.div
      className="settings-panel"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="settings-panel-content">
        <div className="settings-panel-header">
          <span>应用设置</span>
        </div>

        <OverlayScrollbar
          className="settings-scrollbar-container"
          showOnHover={true}
          autoHide={true}
        >
          <div className="settings-section">
            <h3 className="settings-section-title">界面设置</h3>
            
            {/* 楼层数设置 */}
            <div className="settings-field-group">
              <label className="settings-field-label">
                楼层显示数量
                <span className="settings-field-description">
                  显示的最大楼层数（3-50）
                </span>
              </label>
              <div className="settings-input-group">
                <input
                  type="number"
                  className="settings-input-number"
                  value={settings.floorCount}
                  onChange={(e) => {
                    const value = parseInt(e.target.value)
                    if (!isNaN(value)) {
                      handleSettingChange('floorCount', validateFloorCount(value))
                    }
                  }}
                  onBlur={() => loadConfigData()}
                  min={3}
                  max={50}
                />
                <div className="settings-range-container">
                  <input
                    type="range"
                    className="settings-input-range"
                    value={settings.floorCount}
                    onChange={(e) => {
                      const value = parseInt(e.target.value)
                      handleSettingChange('floorCount', value)
                    }}
                    onMouseUp={() => loadConfigData()}
                    onTouchEnd={() => loadConfigData()}
                    min={3}
                    max={50}
                    step={1}
                  />
                  <div className="settings-range-labels">
                    <span>3</span>
                    <span>50</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 消息面板宽度设置 */}
            <div className="settings-field-group">
              <label className="settings-field-label">
                消息面板宽度
                <span className="settings-field-description">
                  消息面板的宽度占比（20%-100%）
                </span>
              </label>
              <div className="settings-input-group">
                <input
                  type="number"
                  className="settings-input-number"
                  value={settings.messagePanelWidth}
                  onChange={(e) => {
                    const value = parseInt(e.target.value)
                    if (!isNaN(value)) {
                      handleSettingChange('messagePanelWidth', validatePanelWidth(value))
                    }
                  }}
                  onBlur={() => loadConfigData()}
                  min={20}
                  max={100}
                />
                <div className="settings-range-container">
                  <input
                    type="range"
                    className="settings-input-range"
                    value={settings.messagePanelWidth}
                    onChange={(e) => {
                      const value = parseInt(e.target.value)
                      handleSettingChange('messagePanelWidth', validatePanelWidth(value))
                    }}
                    onMouseUp={() => loadConfigData()}
                    onTouchEnd={() => loadConfigData()}
                    min={20}
                    max={100}
                    step={1}
                  />
                  <div className="settings-range-labels">
                    <span>20%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 输入框宽度设置 */}
            <div className="settings-field-group">
              <label className="settings-field-label">
                输入框宽度
                <span className="settings-field-description">
                  底部输入框的宽度占比（20%-100%）
                </span>
              </label>
              <div className="settings-input-group">
                <input
                  type="number"
                  className="settings-input-number"
                  value={settings.inputPanelWidth}
                  onChange={(e) => {
                    const value = parseInt(e.target.value)
                    if (!isNaN(value)) {
                      handleSettingChange('inputPanelWidth', validateInputWidth(value))
                    }
                  }}
                  onBlur={() => loadConfigData()}
                  min={20}
                  max={100}
                />
                <div className="settings-range-container">
                  <input
                    type="range"
                    className="settings-input-range"
                    value={settings.inputPanelWidth}
                    onChange={(e) => {
                      const value = parseInt(e.target.value)
                      handleSettingChange('inputPanelWidth', validateInputWidth(value))
                    }}
                    onMouseUp={() => loadConfigData()}
                    onTouchEnd={() => loadConfigData()}
                    min={20}
                    max={100}
                    step={1}
                  />
                  <div className="settings-range-labels">
                    <span>20%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 状态提示 */}
          <div className="settings-status">
            {saveStatus === 'success' && (
              <div className="settings-save-success">✓ 设置已自动保存并应用</div>
            )}
            
            {saveStatus === 'error' && (
              <div className="settings-save-error">❌ 保存设置时出错，请重试</div>
            )}
          </div>
        </OverlayScrollbar>
      </div>
    </motion.div>
  )
}