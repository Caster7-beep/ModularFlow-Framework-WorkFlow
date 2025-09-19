import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api } from '@/services/api'
import OverlayScrollbar from './OverlayScrollbar'
import { EmbeddedWorldBook, EmbeddedRegexRules } from './EmbeddedPanels'
import '../styles/CharacterPanel.css'

interface CharacterPanelProps {
  characterOptions: any;
  activeConfig: any;
  onConfigChange: (configType: string, filePath: string) => void;
  loadConfigData: () => void;
}

export default function CharacterPanel({
  characterOptions,
  activeConfig,
  onConfigChange,
  loadConfigData,
}: CharacterPanelProps) {
  const [characterContents, setCharacterContents] = useState<{[path: string]: any}>({})
  const [expandedCharacter, setExpandedCharacter] = useState<string | null>(null)
  const [editedCharacters, setEditedCharacters] = useState<{[path: string]: any}>({})
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAllCharacterContents();
  }, [characterOptions])

  const loadAllCharacterContents = async () => {
    const characters = characterOptions.characters;
    if (!characters?.files?.length) {
      setCharacterContents({});
      return;
    }

    const contents: {[path: string]: any} = {};
    for (const file of characters.files) {
      try {
        const contentResult = await Api.getFileContent(file.path);
        if (contentResult.content) {
          const parsedContent = JSON.parse(contentResult.content);
          contents[file.path] = parsedContent;
        }
      } catch (err) {
        console.error(`加载角色卡 ${file.path} 失败:`, err);
      }
    }
    setCharacterContents(contents);
  };


  const handleCreateNewCharacter = async () => {
    const characterName = prompt('请输入新角色卡的名称：')
    if (!characterName) return

    const fileName = characterName.endsWith('.json') ? characterName : `${characterName}.json`
    const filePath = `characters/${fileName}`
    
    const defaultCharacterContent = {
      "name": characterName,
      "description": "新建的角色卡",
      "message": [],
      "code_block": "",
      "world_book": {
        "name": "",
        "entries": []
      },
      "extensions": {},
      "create_date": new Date().toISOString().split('T')[0],
      "regex_rules": []
    }

    try {
      await Api.saveFileContent(filePath, JSON.stringify(defaultCharacterContent, null, 2))
      await loadConfigData()
      await loadAllCharacterContents() // 重新加载所有角色卡
    } catch (err) {
      console.error('创建新角色卡失败:', err)
      alert('创建新角色卡失败，请重试')
    }
  }

  // 处理角色卡导入
  const handleImportCharacter = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    setIsImporting(true)

    try {
      if (file.type === 'application/json') {
        // 处理JSON文件
        const reader = new FileReader()
        reader.onload = async (event) => {
          const content = event.target?.result as string
          try {
            // 使用API导入JSON文件
            const response = await Api.importJsonFile(
              content,
              "CHARACTER",
              file.name,
              true
            )

            if (response.success) {
              alert(`成功导入角色卡文件: ${response.file.name}`)
              // 重新加载配置和角色卡列表
              await loadConfigData()
              await loadAllCharacterContents()
            } else {
              alert(`导入失败: ${response.message || '未知错误'}`)
            }
          } catch (err) {
            console.error('处理JSON文件失败:', err)
            alert('导入角色卡失败，请确保文件格式正确')
          }
          setIsImporting(false)
        }
        reader.readAsText(file)
      } else if (file.type === 'image/png') {
        // 处理PNG图片，可能包含嵌入的角色卡文件
        const reader = new FileReader()
        reader.onload = async (event) => {
          const content = event.target?.result as string
          try {
            // 使用API从图片导入文件，仅提取角色卡类型
            const response = await Api.importFilesFromImage(
              content,
              ["CH"], // CH是角色卡的文件类型标签
              true
            )

            if (response.success && response.files && response.files.length > 0) {
              alert(`成功从图片导入了 ${response.files.length} 个角色卡文件`)
              // 重新加载配置和角色卡列表
              await loadConfigData()
              await loadAllCharacterContents()
            } else {
              // 处理未找到文件或导入失败的情况
              const errorMsg = response.message || '导入失败'
              alert(`导入失败: ${errorMsg}`)
            }
          } catch (err) {
            console.error('处理PNG图片失败:', err)
            alert('从图片导入角色卡失败，请确保图片包含有效的角色卡文件')
          }
          setIsImporting(false)
        }
        reader.readAsDataURL(file)
      } else {
        alert('不支持的文件类型，请选择JSON文件或PNG图片')
        setIsImporting(false)
      }
    } catch (err) {
      console.error('导入文件失败:', err)
      alert('导入过程中发生错误，请重试')
      setIsImporting(false)
    }

    // 清空文件输入，以便可以重复选择同一个文件
    e.target.value = ''
  }

  const handleDeleteCharacter = async (filePath: string) => {
    const confirmDelete = confirm(`确定要删除角色卡文件 "${filePath}" 吗？此操作无法撤销。`)
    if (!confirmDelete) return

    try {
      await Api.deleteFile(filePath)
      await loadConfigData()
      await loadAllCharacterContents() // 重新加载所有角色卡
      
      // 如果删除的是当前选中的角色卡，清空选择
      if (activeConfig?.characters === filePath) {
        await onConfigChange('characters', '')
      }
    } catch (err) {
      console.error('删除角色卡失败:', err)
      alert('删除角色卡失败，请重试')
    }
  }

  const handleCharacterExpand = (filePath: string) => {
    if (expandedCharacter === filePath) {
      setExpandedCharacter(null)
      setEditedCharacters(prev => {
        const newState = { ...prev }
        delete newState[filePath]
        return newState
      })
    } else {
      setExpandedCharacter(filePath)
      const characterContent = characterContents[filePath]
      setEditedCharacters(prev => ({
        ...prev,
        [filePath]: characterContent ? { ...characterContent } : null
      }))
    }
  }

  const handleInputChange = (filePath: string, field: string, value: string | string[]) => {
    setEditedCharacters(prev => ({
      ...prev,
      [filePath]: { ...prev[filePath], [field]: value }
    }))
  }

  const handleBlur = async (filePath: string, field: string) => {
    const editedCharacter = editedCharacters[filePath]
    if (!editedCharacter) return

    try {
      await Api.saveFileContent(filePath, JSON.stringify(editedCharacter, null, 2))
      setCharacterContents(prev => ({
        ...prev,
        [filePath]: editedCharacter
      }))
    } catch (err) {
      console.error('保存角色卡失败:', err)
      alert('保存角色卡失败，请重试')
    }
  }


  const characters = characterOptions.characters;

  return (
    <motion.div
      className="character-panel"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="character-panel-content">
        <div className="character-panel-header">
          <span>角色卡列表</span>
          <div className="character-panel-header-buttons">
            <button
              className="character-panel-add-btn"
              onClick={handleCreateNewCharacter}
              title="添加角色卡"
            >
              ➕
            </button>
            <button
              className="character-panel-add-btn"
              onClick={handleImportCharacter}
              title="导入角色卡"
            >
              📥
            </button>
          </div>
        </div>

        {Object.keys(characterContents).length > 0 ? (
          <OverlayScrollbar
            className="character-scrollbar-container"
            showOnHover={true}
            autoHide={true}
          >
            {characters?.files?.map((file: any) => {
              const characterContent = characterContents[file.path]
              if (!characterContent) return null

              const editedCharacter = editedCharacters[file.path]

              return (
                <div key={file.path} className="character-card-container">
                  {/* 角色卡片显示 */}
                  <motion.div
                    className={`character-card ${
                      hoveredCard === file.path ? 'character-card-hover' : 'character-card-inactive'
                    }`}
                    onMouseEnter={() => setHoveredCard(file.path)}
                    onMouseLeave={() => setHoveredCard(null)}
                    onClick={() => handleCharacterExpand(file.path)}
                  >
                    {/* 头像区域 */}
                    <div className="character-avatar">
                      {characterContent.avatar ? (
                        <img
                          src={characterContent.avatar}
                          alt={characterContent.name}
                        />
                      ) : (
                        <span>👤</span>
                      )}
                    </div>

                    {/* 内容区域 */}
                    <div className="character-content">
                      <div className="character-name-row">
                        <span className="character-name">
                          {characterContent.name}
                        </span>
                      </div>
                      
                      <div className="character-description">
                        {characterContent.description || '暂无描述'}
                      </div>
                    </div>

                    {/* 展开按钮 */}
                    <div className="character-expand-button-container">
                      <span className={`character-expand-icon-inline ${expandedCharacter === file.path ? 'expanded' : ''}`}>
                        ▶
                      </span>
                    </div>

                    {/* 操作按钮区域 */}
                    <div className="character-actions-container">
                      <button
                        className="character-delete-button-inline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteCharacter(file.path)
                        }}
                        title="删除角色卡"
                      >
                        删除
                      </button>
                    </div>
                  </motion.div>

                  {/* 展开的编辑区域 */}
                  <AnimatePresence>
                    {expandedCharacter === file.path && editedCharacter && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="character-expanded-form"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* 名称编辑 */}
                        <div className="character-form-field">
                          <label className="character-form-label">
                            角色名称
                          </label>
                          <input
                            type="text"
                            className="character-form-input"
                            value={editedCharacter.name || ''}
                            onChange={(e) => handleInputChange(file.path, 'name', e.target.value)}
                            onBlur={() => handleBlur(file.path, 'name')}
                          />
                        </div>

                        {/* 描述编辑 */}
                        <div className="character-form-field">
                          <label className="character-form-label">
                            角色描述
                          </label>
                          <textarea
                            className="character-form-textarea"
                            value={editedCharacter.description || ''}
                            onChange={(e) => handleInputChange(file.path, 'description', e.target.value)}
                            onBlur={() => handleBlur(file.path, 'description')}
                          />
                        </div>

                        {/* 初始消息编辑 */}
                        <div>
                          <div className="character-messages-label-container">
                            <label className="character-messages-label">
                              初始消息 ({editedCharacter.message?.length || 0} 条)
                            </label>
                            <button
                              className="character-messages-add-button"
                              onClick={() => {
                                const newMessages = [...(editedCharacter.message || []), '']
                                handleInputChange(file.path, 'message', newMessages)
                              }}
                              title="添加新的初始消息"
                            >
                              ➕
                            </button>
                          </div>
                          
                          {editedCharacter.message && editedCharacter.message.length > 0 ? (
                            <div className="character-message-container-wrapper">
                              {editedCharacter.message.map((msg: string, index: number) => (
                                <div key={index} className="character-message-item-wrapper">
                                  <div className="character-message-header-container">
                                    <span className="character-message-number-label">
                                      消息 #{index + 1}
                                    </span>
                                    <button
                                      className="character-message-delete-button"
                                      onClick={() => {
                                        const newMessages = editedCharacter.message.filter((_: any, i: number) => i !== index)
                                        handleInputChange(file.path, 'message', newMessages)
                                        handleBlur(file.path, 'message')
                                      }}
                                      title="删除这条消息"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                  <textarea
                                    className="character-message-input-textarea"
                                    value={msg}
                                    onChange={(e) => {
                                      const newMessages = [...editedCharacter.message]
                                      newMessages[index] = e.target.value
                                      handleInputChange(file.path, 'message', newMessages)
                                    }}
                                    onBlur={() => handleBlur(file.path, 'message')}
                                    placeholder="输入初始消息内容..."
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="character-messages-empty-state">
                              暂无初始消息，点击 ➕ 按钮添加
                            </div>
                          )}
                        </div>


                        {/* 创建日期显示 */}
                        {editedCharacter.create_date && (
                          <div className="character-create-date-display">
                            创建日期: {editedCharacter.create_date}
                          </div>
                        )}

                        {/* 使用内嵌世界书组件 */}
                        <EmbeddedWorldBook
                          worldBookData={editedCharacter.world_book}
                          onSave={async (updatedWorldBook) => {
                            
                            const updatedCharacter = { ...editedCharacter, world_book: updatedWorldBook }
                            
                            // 直接保存，不依赖状态更新时序
                            try {
                              await Api.saveFileContent(file.path, JSON.stringify(updatedCharacter, null, 2));
                              
                              // 更新本地状态
                              setEditedCharacters(prev => ({
                                ...prev,
                                [file.path]: updatedCharacter
                              }));
                              setCharacterContents(prev => ({
                                ...prev,
                                [file.path]: updatedCharacter
                              }));
                            } catch (error) {
                              console.error('保存角色卡失败:', error);
                              alert('保存角色卡失败，请重试');
                            }
                          }}
                        />

                        {/* 使用内嵌正则规则组件 */}
                        <EmbeddedRegexRules
                          regexRules={editedCharacter.regex_rules}
                          onSave={async (updatedRules) => {
                            
                            const updatedCharacter = { ...editedCharacter, regex_rules: updatedRules }
                            
                            // 直接保存，不依赖状态更新时序
                            try {
                              await Api.saveFileContent(file.path, JSON.stringify(updatedCharacter, null, 2));
                              
                              // 更新本地状态
                              setEditedCharacters(prev => ({
                                ...prev,
                                [file.path]: updatedCharacter
                              }));
                              setCharacterContents(prev => ({
                                ...prev,
                                [file.path]: updatedCharacter
                              }));
                            } catch (error) {
                              console.error('保存角色卡失败:', error);
                              alert('保存角色卡失败，请重试');
                            }
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </OverlayScrollbar>
        ) : (
          <div className="character-panel-empty">
            暂无角色卡，点击 ➕ 按钮创建新角色卡
          </div>
        )}
      </div>

      {/* 隐藏的文件输入元素 */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".json,image/png"
        onChange={handleFileSelect}
      />
      
      {/* 导入中的加载指示器 */}
      {isImporting && (
        <div className="character-import-loading">
          <div className="character-import-spinner"></div>
          <div className="character-import-text">正在导入文件...</div>
        </div>
      )}
    </motion.div>
  )
}