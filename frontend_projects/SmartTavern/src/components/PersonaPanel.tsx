import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api } from '@/services/api'
import OverlayScrollbar from './OverlayScrollbar'
import '@/styles/PersonaPanel.css'

interface PersonaPanelProps {
  personaOptions: any;
  activeConfig: any;
  onConfigChange: (configType: string, filePath: string) => void;
  loadConfigData: () => void;
}

export default function PersonaPanel({
  personaOptions,
  activeConfig,
  onConfigChange,
  loadConfigData,
}: PersonaPanelProps) {
  const [personaContents, setPersonaContents] = useState<{[path: string]: any}>({})
  const [expandedPersona, setExpandedPersona] = useState<string | null>(null)
  const [editedPersonas, setEditedPersonas] = useState<{[path: string]: any}>({})
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)

  useEffect(() => {
    loadAllPersonaContents();
  }, [personaOptions])

  const loadAllPersonaContents = async () => {
    const personas = personaOptions.personas;
    if (!personas?.files?.length) {
      setPersonaContents({});
      return;
    }

    const contents: {[path: string]: any} = {};
    for (const file of personas.files) {
      try {
        const contentResult = await Api.getFileContent(file.path);
        if (contentResult.content) {
          const parsedContent = JSON.parse(contentResult.content);
          contents[file.path] = parsedContent;
        }
      } catch (err) {
        console.error(`加载用户信息 ${file.path} 失败:`, err);
      }
    }
    setPersonaContents(contents);
  };

  const handleCreateNewPersona = async () => {
    const personaName = prompt('请输入新用户信息文件的名称：')
    if (!personaName) return

    const fileName = personaName.endsWith('.json') ? personaName : `${personaName}.json`
    const filePath = `personas/${fileName}`
    
    const defaultPersonaContent = {
      "name": personaName,
      "description": "新建的用户角色"
    }

    try {
      await Api.saveFileContent(filePath, JSON.stringify(defaultPersonaContent, null, 2))
      await loadConfigData()
      await loadAllPersonaContents() // 重新加载所有用户信息
    } catch (err) {
      console.error('创建新用户信息失败:', err)
      alert('创建新用户信息失败，请重试')
    }
  }

  const handleDeletePersona = async (filePath: string) => {
    const confirmDelete = confirm(`确定要删除用户信息文件 "${filePath}" 吗？此操作无法撤销。`)
    if (!confirmDelete) return

    try {
      await Api.deleteFile(filePath)
      await loadConfigData()
      await loadAllPersonaContents() // 重新加载所有用户信息
    } catch (err) {
      console.error('删除用户信息失败:', err)
      alert('删除用户信息失败，请重试')
    }
  }

  const handlePersonaExpand = (filePath: string) => {
    if (expandedPersona === filePath) {
      setExpandedPersona(null)
      setEditedPersonas(prev => {
        const newState = { ...prev }
        delete newState[filePath]
        return newState
      })
    } else {
      setExpandedPersona(filePath)
      const personaContent = personaContents[filePath]
      setEditedPersonas(prev => ({
        ...prev,
        [filePath]: personaContent ? { ...personaContent } : null
      }))
    }
  }

  const handleInputChange = (filePath: string, field: string, value: string) => {
    setEditedPersonas(prev => ({
      ...prev,
      [filePath]: { ...prev[filePath], [field]: value }
    }))
  }

  const handleBlur = async (filePath: string, field: string) => {
    const editedPersona = editedPersonas[filePath]
    if (!editedPersona) return

    try {
      await Api.saveFileContent(filePath, JSON.stringify(editedPersona, null, 2))
      setPersonaContents(prev => ({
        ...prev,
        [filePath]: editedPersona
      }))
    } catch (err) {
      console.error('保存用户信息失败:', err)
      alert('保存用户信息失败，请重试')
    }
  }

  const personas = personaOptions.personas;

  return (
    <motion.div
      className="persona-panel-container"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="persona-panel-content">
        <div className="persona-panel-header">
          <span>用户信息列表</span>
          <div className="persona-panel-buttons">
            <button
              className="persona-panel-button"
              onClick={handleCreateNewPersona}
              title="添加用户信息"
            >
              ➕
            </button>
          </div>
        </div>

        {Object.keys(personaContents).length > 0 ? (
          <OverlayScrollbar
            className="persona-scrollbar-container"
            showOnHover={true}
            autoHide={true}
          >
            {personas?.files?.map((file: any) => {
              const personaContent = personaContents[file.path]
              if (!personaContent) return null

              const editedPersona = editedPersonas[file.path]

              return (
                <div key={file.path} className="persona-card-container">
                  {/* 用户信息卡片显示 */}
                  <motion.div
                    className={`persona-card ${hoveredCard === file.path ? 'hover' : 'inactive'}`}
                    onMouseEnter={() => setHoveredCard(file.path)}
                    onMouseLeave={() => setHoveredCard(null)}
                    onClick={() => handlePersonaExpand(file.path)}
                  >
                    {/* 头像区域 */}
                    <div className="persona-avatar">
                      <span>👤</span>
                    </div>

                    {/* 内容区域 */}
                    <div className="persona-info">
                      <div className="persona-info-header">
                        <span className="persona-name">
                          {personaContent.name}
                        </span>
                      </div>
                      
                      <div className="persona-description">
                        {personaContent.description || '暂无描述'}
                      </div>
                    </div>

                    {/* 展开按钮 */}
                    <div className="persona-expand-button">
                      <span className={`persona-expand-icon ${expandedPersona === file.path ? 'expanded' : ''}`}>
                        ▶
                      </span>
                    </div>

                    {/* 操作按钮区域 */}
                    <div className="persona-actions">
                      <button
                        className="persona-delete-button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeletePersona(file.path)
                        }}
                        title="删除用户信息"
                      >
                        删除
                      </button>
                    </div>
                  </motion.div>

                  {/* 展开的编辑区域 */}
                  <AnimatePresence>
                    {expandedPersona === file.path && editedPersona && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="persona-edit-form"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* 名称编辑 */}
                        <div className="persona-form-field">
                          <label className="persona-form-label">
                            用户名称
                          </label>
                          <input
                            type="text"
                            className="persona-form-input"
                            value={editedPersona.name || ''}
                            onChange={(e) => handleInputChange(file.path, 'name', e.target.value)}
                            onBlur={() => handleBlur(file.path, 'name')}
                          />
                        </div>

                        {/* 描述编辑 */}
                        <div className="persona-form-field">
                          <label className="persona-form-label">
                            用户描述
                          </label>
                          <textarea
                            className="persona-form-textarea"
                            value={editedPersona.description || ''}
                            onChange={(e) => handleInputChange(file.path, 'description', e.target.value)}
                            onBlur={() => handleBlur(file.path, 'description')}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </OverlayScrollbar>
        ) : (
          <div className="persona-empty-state">
            暂无用户信息，点击 ➕ 按钮创建新用户信息
          </div>
        )}
      </div>
    </motion.div>
  )
}