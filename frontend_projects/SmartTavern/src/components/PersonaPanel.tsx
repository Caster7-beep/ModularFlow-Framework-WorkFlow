import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api } from '@/services/api'
import OverlayScrollbar from './OverlayScrollbar'
import ExportModal from './ExportModal'
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
  const [isImporting, setIsImporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [selectedPersonas, setSelectedPersonas] = useState<Set<string>>(new Set())
  const [exportPersonas, setExportPersonas] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // 处理用户信息导入
  const handleImportPersona = () => {
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
              "PERSONA",
              file.name,
              true
            )

            if (response.success) {
              alert(`成功导入用户信息文件: ${response.file.name}`)
              // 重新加载配置和用户信息列表
              await loadConfigData()
              await loadAllPersonaContents()
            } else {
              alert(`导入失败: ${response.message || '未知错误'}`)
            }
          } catch (err) {
            console.error('处理JSON文件失败:', err)
            alert('导入用户信息失败，请确保文件格式正确')
          }
          setIsImporting(false)
        }
        reader.readAsText(file)
      } else if (file.type === 'image/png') {
        // 处理PNG图片，可能包含嵌入的用户信息文件
        const reader = new FileReader()
        reader.onload = async (event) => {
          const content = event.target?.result as string
          try {
            // 使用API从图片导入文件，仅提取用户信息类型
            const response = await Api.importFilesFromImage(
              content,
              ["PE"], // PE是用户信息的文件类型标签
              true
            )

            if (response.success && response.files && response.files.length > 0) {
              alert(`成功从图片导入了 ${response.files.length} 个用户信息文件`)
              // 重新加载配置和用户信息列表
              await loadConfigData()
              await loadAllPersonaContents()
            } else {
              // 处理未找到文件或导入失败的情况
              const errorMsg = response.message || '导入失败'
              alert(`导入失败: ${errorMsg}`)
            }
          } catch (err) {
            console.error('处理PNG图片失败:', err)
            alert('从图片导入用户信息失败，请确保图片包含有效的用户信息文件')
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

  // 处理用户信息导出
  const handleExportPersonas = () => {
    // 准备导出数据
    const exportData = Object.entries(personaContents).map(([path, content]) => {
      return {
        content: content,
        type: "PE", // 用户信息类型标识
        name: path.split('/').pop() || "",
        displayName: content.name || path.split('/').pop() || "",
        category: "用户信息",
        icon: "👥",
        selected: true,
        path: path
      };
    });
    
    setExportPersonas(exportData);
    setShowExportModal(true);
  };
  
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
            <button
              className="persona-panel-button"
              onClick={handleImportPersona}
              title="导入用户信息"
            >
              📥
            </button>
            <button
              className="persona-panel-button"
              onClick={handleExportPersonas}
              title="导出用户信息"
              disabled={Object.keys(personaContents).length === 0}
            >
              📤
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
        <div className="persona-import-loading">
          <div className="persona-import-spinner"></div>
          <div className="persona-import-text">正在导入文件...</div>
        </div>
      )}

      {/* 导出模态框 */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        files={exportPersonas}
        panelTitle="用户信息"
      />
    </motion.div>
  )
}