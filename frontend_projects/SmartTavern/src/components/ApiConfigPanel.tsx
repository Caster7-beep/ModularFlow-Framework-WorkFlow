import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api } from '@/services/api'
import OverlayScrollbar from './OverlayScrollbar'
import '../styles/ApiConfigPanel.css'

interface ApiConfigPanelProps {
  loadConfigData: () => void;
}

interface ApiProvider {
  id: string;  // 配置的唯一标识符
  name: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'openai_compatible';  // 实际的提供商类型，使用gemini而不是google
  api_url: string;
  api_key: string;
  model_id: string;
  max_tokens: number | null;  // 最大输出token数，允许null值
  temperature: number | null;  // 生成温度 (0.0-1.0)，允许null值
  custom_fields: string;  // 自定义字段，支持多行和嵌套结构
  // 字段开关控制
  enable_api_key: boolean;
  enable_model_id: boolean;
  enable_temperature: boolean;
  enable_max_tokens: boolean;
  enable_custom_fields: boolean;
}

export default function ApiConfigPanel({ loadConfigData }: ApiConfigPanelProps) {
  const [apiProviders, setApiProviders] = useState<ApiProvider[]>([])
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [editedProviders, setEditedProviders] = useState<{[id: string]: ApiProvider}>({})
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [activeProvider, setActiveProvider] = useState<string | null>(null)

  useEffect(() => {
    loadAllApiProviders();
    loadActiveProvider();
  }, [])

  const loadAllApiProviders = async () => {
    try {
      const result = await Api.getApiProviders();
      setApiProviders(result.providers || []);
    } catch (err) {
      console.error('加载API配置失败:', err);
    }
  };

  const loadActiveProvider = async () => {
    try {
      const result = await Api.getActiveApiProvider();
      if (result.success) {
        setActiveProvider(result.active_provider || null);
      }
    } catch (err) {
      console.error('加载活动API配置失败:', err);
    }
  };

  const handleUseProvider = async (providerId: string) => {
    try {
      const result = await Api.setActiveApiProvider(providerId);
      if (result.success) {
        setActiveProvider(providerId);
        alert(`✅ ${result.message || '设置成功'}`);
      } else {
        alert('❌ 设置失败，请重试');
      }
    } catch (err) {
      console.error('设置活动API配置失败:', err);
      alert('❌ 设置失败，请重试');
    }
  };

  const handleCreateNewProvider = async () => {
    const providerName = prompt('请输入新API配置的名称：')
    if (!providerName) return

    const newProvider: ApiProvider = {
      id: providerName,  // 现在id就是provider name
      name: providerName,
      provider: 'openai',
      api_url: 'https://api.openai.com/v1',
      api_key: '',
      model_id: 'gpt-3.5-turbo',
      max_tokens: 1024,
      temperature: 1.0,
      custom_fields: '',
      enable_api_key: true,
      enable_model_id: true,
      enable_temperature: true,
      enable_max_tokens: true,
      enable_custom_fields: false
    }

    try {
      await Api.saveApiProvider(newProvider)
      await loadAllApiProviders()
    } catch (err) {
      console.error('创建新API配置失败:', err)
      alert('创建新API配置失败，请重试')
    }
  }

  const handleDeleteProvider = async (providerId: string) => {
    const confirmDelete = confirm(`确定要删除API配置 "${providerId}" 吗？此操作无法撤销。`)
    if (!confirmDelete) return

    try {
      await Api.deleteApiProvider(providerId)
      await loadAllApiProviders()
    } catch (err) {
      console.error('删除API配置失败:', err)
      alert('删除API配置失败，请重试')
    }
  }

  const handleProviderExpand = (providerId: string) => {
    if (expandedProvider === providerId) {
      setExpandedProvider(null)
      setEditedProviders(prev => {
        const newState = { ...prev }
        delete newState[providerId]
        return newState
      })
    } else {
      setExpandedProvider(providerId)
      const provider = apiProviders.find(p => p.id === providerId)
      setEditedProviders(prev => ({
        ...prev,
        [providerId]: provider ? { ...provider } : {} as ApiProvider
      }))
    }
  }

  const handleInputChange = (providerId: string, field: keyof ApiProvider, value: string) => {
    setEditedProviders(prev => {
      const currentProvider = prev[providerId]
      let updatedProvider = { ...currentProvider }
      
      // 处理布尔值字段
      if (field === 'enable_api_key' || field === 'enable_model_id' || field === 'enable_temperature' || field === 'enable_max_tokens' || field === 'enable_custom_fields') {
        (updatedProvider as any)[field] = value === 'true'
      } else if (field === 'max_tokens') {
        // 处理max_tokens: 空字符串为null，否则转换为数字
        updatedProvider[field] = value === '' ? null : parseInt(value) || 0
      } else if (field === 'temperature') {
        // 处理temperature: 空字符串为null，否则转换为浮点数
        updatedProvider[field] = value === '' ? null : parseFloat(value) || 0.0
      } else {
        (updatedProvider as any)[field] = value
      }
      
      // 当API提供商类型改变时，自动更新默认URL、模型和参数
      if (field === 'provider') {
        switch (value) {
          case 'openai':
            updatedProvider.api_url = 'https://api.openai.com/v1'
            updatedProvider.model_id = 'gpt-5'
            updatedProvider.max_tokens = 1024
            updatedProvider.temperature = 1.0
            updatedProvider.custom_fields = updatedProvider.custom_fields || ''
            updatedProvider.enable_api_key = updatedProvider.enable_api_key ?? true
            updatedProvider.enable_model_id = updatedProvider.enable_model_id ?? true
            updatedProvider.enable_temperature = updatedProvider.enable_temperature ?? true
            updatedProvider.enable_max_tokens = updatedProvider.enable_max_tokens ?? true
            updatedProvider.enable_custom_fields = updatedProvider.enable_custom_fields ?? false
            break
          case 'anthropic':
            updatedProvider.api_url = 'https://api.anthropic.com/v1'
            updatedProvider.model_id = 'claude-sonnet-4'
            updatedProvider.max_tokens = 1024
            updatedProvider.temperature = 1.0
            updatedProvider.custom_fields = updatedProvider.custom_fields || ''
            updatedProvider.enable_api_key = updatedProvider.enable_api_key ?? true
            updatedProvider.enable_model_id = updatedProvider.enable_model_id ?? true
            updatedProvider.enable_temperature = updatedProvider.enable_temperature ?? true
            updatedProvider.enable_max_tokens = updatedProvider.enable_max_tokens ?? true
            updatedProvider.enable_custom_fields = updatedProvider.enable_custom_fields ?? false
            break
          case 'gemini':
            updatedProvider.api_url = 'https://generativelanguage.googleapis.com/v1beta'
            updatedProvider.model_id = 'gemini-2.5-flash'
            updatedProvider.max_tokens = 1024
            updatedProvider.temperature = 1.0
            updatedProvider.custom_fields = updatedProvider.custom_fields || ''
            updatedProvider.enable_api_key = updatedProvider.enable_api_key ?? true
            updatedProvider.enable_model_id = updatedProvider.enable_model_id ?? true
            updatedProvider.enable_temperature = updatedProvider.enable_temperature ?? true
            updatedProvider.enable_max_tokens = updatedProvider.enable_max_tokens ?? true
            updatedProvider.enable_custom_fields = updatedProvider.enable_custom_fields ?? false
            break
          case 'openai_compatible':
            updatedProvider.api_url = ''
            updatedProvider.model_id = ''
            updatedProvider.max_tokens = 1024
            updatedProvider.temperature = 1.0
            updatedProvider.custom_fields = updatedProvider.custom_fields || ''
            updatedProvider.enable_api_key = updatedProvider.enable_api_key ?? true
            updatedProvider.enable_model_id = updatedProvider.enable_model_id ?? true
            updatedProvider.enable_temperature = updatedProvider.enable_temperature ?? true
            updatedProvider.enable_max_tokens = updatedProvider.enable_max_tokens ?? true
            updatedProvider.enable_custom_fields = updatedProvider.enable_custom_fields ?? false
            break
        }
      }
      
      return {
        ...prev,
        [providerId]: updatedProvider
      }
    })
  }

  // 新增：专门处理字段开关的立即保存函数
  const handleToggleChange = async (providerId: string, field: keyof ApiProvider, value: string) => {
    // 先更新状态
    handleInputChange(providerId, field, value)
    
    // 立即保存到后端
    try {
      const updatedProvider = {
        ...editedProviders[providerId],
        [field]: value === 'true'
      }
      await Api.saveApiProvider(updatedProvider)
      await loadAllApiProviders()
    } catch (err) {
      console.error('保存字段开关失败:', err)
      // 如果保存失败，可以考虑恢复之前的状态
      alert('保存字段开关失败，请重试')
    }
  }

  const handleBlur = async (providerId: string) => {
    const editedProvider = editedProviders[providerId]
    if (!editedProvider) return

    try {
      await Api.saveApiProvider(editedProvider)
      await loadAllApiProviders()
    } catch (err) {
      console.error('保存API配置失败:', err)
      alert('保存API配置失败，请重试')
    }
  }

  const getProviderDisplayName = (provider: string) => {
    switch (provider) {
      case 'openai': return 'OpenAI'
      case 'anthropic': return 'Anthropic'
      case 'gemini': return 'Google Gemini'
      case 'openai_compatible': return 'OpenAI兼容格式'
      default: return provider
    }
  }

  return (
    <motion.div
      className="api-config-panel"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="api-config-panel-content">
        <div className="api-config-panel-header">
          <span>LLM API配置</span>
          <div className="api-config-panel-header-buttons">
            <button
              className="api-config-panel-add-btn"
              onClick={handleCreateNewProvider}
              title="添加API配置"
            >
              ➕
            </button>
          </div>
        </div>

        {apiProviders.length > 0 ? (
          <OverlayScrollbar
            className="api-config-scrollbar-container"
            showOnHover={true}
            autoHide={true}
          >
            {apiProviders.map((provider) => {
              const editedProvider = editedProviders[provider.id]

              return (
                <div key={provider.id} className="api-provider-card-container">
                  {/* API配置卡片显示 */}
                  <motion.div
                    className={`api-provider-card ${
                      activeProvider === provider.id
                        ? 'api-provider-card-active'
                        : hoveredCard === provider.id
                          ? 'api-provider-card-hover'
                          : 'api-provider-card-inactive'
                    }`}
                    onMouseEnter={() => setHoveredCard(provider.id)}
                    onMouseLeave={() => setHoveredCard(null)}
                    onClick={() => handleProviderExpand(provider.id)}
                  >
                    {/* 图标区域 */}
                    <div className="api-provider-icon">
                      🤖
                    </div>

                    {/* 内容区域 */}
                    <div className="api-provider-content">
                      <div className="api-provider-name-row">
                        <span className={`api-provider-name ${
                          activeProvider === provider.id ? 'api-provider-name-active' : 'api-provider-name-inactive'
                        }`}>
                          {provider.name}
                          {activeProvider === provider.id && (
                            <span className="api-provider-active-indicator">⚡</span>
                          )}
                        </span>
                      </div>
                      
                      <div className="api-provider-type">
                        {getProviderDisplayName(provider.provider)}
                      </div>
                    </div>

                    {/* 展开按钮 */}
                    <div className="api-provider-expand-btn">
                      <span className={`api-provider-expand-icon ${
                        expandedProvider === provider.id ? 'api-provider-expand-icon-expanded' : 'api-provider-expand-icon-collapsed'
                      }`}>
                        ▶
                      </span>
                    </div>

                    {/* 操作按钮区域 */}
                    <div className="api-provider-actions">
                      <button
                        className={`api-provider-use-btn ${
                          activeProvider === provider.id ? 'api-provider-use-btn-active' : 'api-provider-use-btn-inactive'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUseProvider(provider.id)
                        }}
                        title="使用此API"
                      >
                        使用
                      </button>
                      <button
                        className="api-provider-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteProvider(provider.id)
                        }}
                        title="删除API配置"
                      >
                        删除
                      </button>
                    </div>
                  </motion.div>

                  {/* 展开的编辑区域 */}
                  <AnimatePresence>
                    {expandedProvider === provider.id && editedProvider && (
                      <motion.div
                        className="api-provider-expanded"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* 名称编辑 */}
                        <div className="api-config-field-group">
                          <label className="api-config-field-label">
                            名称
                          </label>
                          <input
                            type="text"
                            className="api-config-input"
                            value={editedProvider.name || ''}
                            onChange={(e) => handleInputChange(provider.id, 'name', e.target.value)}
                            onBlur={() => handleBlur(provider.id)}
                          />
                        </div>

                        {/* API提供商选择 */}
                        <div className="api-config-field-group">
                          <label className="api-config-field-label">
                            API提供商
                          </label>
                          <select
                            className="api-config-select"
                            value={editedProvider.provider || 'openai'}
                            onChange={(e) => handleInputChange(provider.id, 'provider', e.target.value)}
                            onBlur={() => handleBlur(provider.id)}
                          >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="openai_compatible">OpenAI兼容格式</option>
                          </select>
                        </div>

                        {/* API URL编辑 */}
                        <div className="api-config-field-group">
                          <label className="api-config-field-label">
                            API URL
                          </label>
                          <input
                            type="text"
                            className="api-config-input"
                            value={editedProvider.api_url || ''}
                            onChange={(e) => handleInputChange(provider.id, 'api_url', e.target.value)}
                            onBlur={() => handleBlur(provider.id)}
                            placeholder="https://api.example.com/v1"
                          />
                        </div>

                        {/* API Key编辑 */}
                        <div className="api-config-field-group">
                          <div className="api-config-field-header">
                            <label className="api-config-field-label">
                              API Key
                            </label>
                            <div className="api-config-field-toggle">
                              <input
                                type="checkbox"
                                id={`api_key_${provider.id}`}
                                checked={editedProvider.enable_api_key ?? true}
                                onChange={(e) => handleToggleChange(provider.id, 'enable_api_key', e.target.checked.toString())}
                              />
                              <label htmlFor={`api_key_${provider.id}`} className="toggle-label">
                                启用
                              </label>
                            </div>
                          </div>
                          <input
                            type="password"
                            className="api-config-input"
                            value={editedProvider.api_key || ''}
                            onChange={(e) => handleInputChange(provider.id, 'api_key', e.target.value)}
                            onBlur={() => handleBlur(provider.id)}
                            placeholder="输入API密钥"
                            disabled={!(editedProvider.enable_api_key ?? true)}
                          />
                        </div>

                        {/* 模型ID编辑 */}
                        <div className="api-config-field-group">
                          <div className="api-config-field-header">
                            <label className="api-config-field-label">
                              模型ID
                            </label>
                            <div className="api-config-field-toggle">
                              <input
                                type="checkbox"
                                id={`model_id_${provider.id}`}
                                checked={editedProvider.enable_model_id ?? true}
                                onChange={(e) => handleToggleChange(provider.id, 'enable_model_id', e.target.checked.toString())}
                              />
                              <label htmlFor={`model_id_${provider.id}`} className="toggle-label">
                                启用
                              </label>
                            </div>
                          </div>
                          <input
                            type="text"
                            className="api-config-input"
                            value={editedProvider.model_id || ''}
                            onChange={(e) => handleInputChange(provider.id, 'model_id', e.target.value)}
                            onBlur={() => handleBlur(provider.id)}
                            placeholder="gpt-5"
                            disabled={!(editedProvider.enable_model_id ?? true)}
                          />
                        </div>

                        {/* 最大输出token编辑 */}
                        <div className="api-config-field-group">
                          <div className="api-config-field-header">
                            <label className="api-config-field-label">
                              最大输出token
                            </label>
                            <div className="api-config-field-toggle">
                              <input
                                type="checkbox"
                                id={`max_tokens_${provider.id}`}
                                checked={editedProvider.enable_max_tokens ?? true}
                                onChange={(e) => handleToggleChange(provider.id, 'enable_max_tokens', e.target.checked.toString())}
                              />
                              <label htmlFor={`max_tokens_${provider.id}`} className="toggle-label">
                                启用
                              </label>
                            </div>
                          </div>
                          <input
                            type="number"
                            className="api-config-input"
                            min="1"
                            max="32768"
                            value={editedProvider.max_tokens === null ? '' : String(editedProvider.max_tokens || '')}
                            onChange={(e) => handleInputChange(provider.id, 'max_tokens', e.target.value)}
                            onBlur={() => handleBlur(provider.id)}
                            placeholder="1024"
                            disabled={!(editedProvider.enable_max_tokens ?? true)}
                          />
                          <div className="api-config-field-hint">
                            限制模型生成的最大token数
                          </div>
                        </div>

                        {/* 温度编辑 */}
                        <div className="api-config-field-group">
                          <div className="api-config-field-header">
                            <label className="api-config-field-label">
                              温度 (Temperature)
                            </label>
                            <div className="api-config-field-toggle">
                              <input
                                type="checkbox"
                                id={`temperature_${provider.id}`}
                                checked={editedProvider.enable_temperature ?? true}
                                onChange={(e) => handleToggleChange(provider.id, 'enable_temperature', e.target.checked.toString())}
                              />
                              <label htmlFor={`temperature_${provider.id}`} className="toggle-label">
                                启用
                              </label>
                            </div>
                          </div>
                          <input
                            type="number"
                            className="api-config-input"
                            min="0"
                            max="1"
                            step="0.1"
                            value={editedProvider.temperature === null ? '' : String(editedProvider.temperature || '')}
                            onChange={(e) => handleInputChange(provider.id, 'temperature', e.target.value)}
                            onBlur={() => handleBlur(provider.id)}
                            placeholder="1.0"
                            disabled={!(editedProvider.enable_temperature ?? true)}
                          />
                          <div className="api-config-field-hint">
                            控制回复的创造性
                          </div>
                        </div>

                        {/* 自定义字段编辑 */}
                        <div className="api-config-field-group">
                          <div className="api-config-field-header">
                            <label className="api-config-field-label">
                              自定义API参数
                            </label>
                            <div className="api-config-field-toggle">
                              <input
                                type="checkbox"
                                id={`custom_fields_${provider.id}`}
                                checked={editedProvider.enable_custom_fields ?? false}
                                onChange={(e) => handleToggleChange(provider.id, 'enable_custom_fields', e.target.checked.toString())}
                              />
                              <label htmlFor={`custom_fields_${provider.id}`} className="toggle-label">
                                启用
                              </label>
                            </div>
                          </div>
                          <textarea
                            className="api-config-textarea"
                            rows={8}
                            value={editedProvider.custom_fields || ''}
                            onChange={(e) => handleInputChange(provider.id, 'custom_fields', e.target.value)}
                            onBlur={() => handleBlur(provider.id)}
                            placeholder={`输入额外的API参数，支持多行和嵌套结构：
top_p: 0.9
frequency_penalty: 0.1
presence_penalty: 0.1

或嵌套结构：
config: {
  thinkingConfig: {
    thinkingBudget: 0
  }
}`}
                            disabled={!(editedProvider.enable_custom_fields ?? false)}
                          />
                          <div className="api-config-field-hint">
                            支持多种格式：简单键值对、嵌套对象结构等。这些参数会直接转发到API请求体中
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </OverlayScrollbar>
        ) : (
          <div className="api-config-panel-empty">
            暂无API配置，点击 ➕ 按钮创建新配置
          </div>
        )}
      </div>
    </motion.div>
  )
}