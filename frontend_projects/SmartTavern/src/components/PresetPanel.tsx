import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api } from '@/services/api'
import OverlayScrollbar from './OverlayScrollbar'
import { EmbeddedRegexRules } from './EmbeddedPanels'
import '@/styles/PresetPanel.css'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// 可拖拽的预设条目组件
interface SortablePresetItemProps {
  prompt: any;
  index: number;
  isEnabled: boolean;
  expandedPrompt: string | null;
  onToggle: (identifier: string, enabled: boolean) => void;
  onExpand: (identifier: string) => void;
  onUpdate: (identifier: string, updatedPrompt: any) => void;
  onVisibilityToggle: (identifier: string) => void;
}

function SortablePresetItem({
  prompt,
  index,
  isEnabled,
  expandedPrompt,
  onToggle,
  onExpand,
  onUpdate,
  onVisibilityToggle,
}: SortablePresetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: prompt.identifier })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const [editedPrompt, setEditedPrompt] = useState(prompt);

  useEffect(() => {
    setEditedPrompt(prompt);
  }, [prompt]);

  const handleInputChange = (field: string, value: string | number) => {
    setEditedPrompt((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: string) => {
    if (prompt[field] === undefined && editedPrompt[field] === '') {
      const { [field]: _, ...rest } = editedPrompt;
      onUpdate(prompt.identifier, rest);
      return;
    }
    onUpdate(prompt.identifier, editedPrompt);
  };

  return (
    <div ref={setNodeRef} style={style} className={`sortable-item ${isDragging ? 'dragging' : ''}`}>
      <motion.div
        className={`preset-item ${isEnabled ? 'enabled' : 'disabled'}`}
        whileHover={{ backgroundColor: 'var(--preset-item-hover-bg)' }}
        onClick={() => onExpand(prompt.identifier)}
      >
        <div
          {...attributes}
          {...listeners}
          className="preset-item-drag-handle"
          title="拖拽排序"
        >
          ⋮⋮
        </div>
        
        <div className="preset-item-content">
          <span className={`preset-item-expand-icon ${expandedPrompt === prompt.identifier ? 'expanded' : ''}`}>
            ▶
          </span>
          
          <span className={`preset-item-title ${isEnabled ? 'enabled' : 'disabled'}`}>
            {prompt.name || prompt.identifier}
          </span>
          
          {prompt.role && (
            <span className="preset-item-tag">
              {prompt.role}
            </span>
          )}
        </div>
        
        <label
          className="preset-item-toggle"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onToggle(prompt.identifier, e.target.checked)}
          />
          <span className={`preset-toggle-slider ${isEnabled ? 'enabled' : 'disabled'}`} />
          <span className={`preset-toggle-dot ${isEnabled ? 'enabled' : 'disabled'}`} />
        </label>
      </motion.div>
      
      <AnimatePresence>
        {expandedPrompt === prompt.identifier && (
          <motion.div
            className="preset-item-expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preset-item-fields">
              <div className="preset-field">
                <label className="preset-field-label">ID</label>
                <input
                  type="text"
                  className="preset-field-input"
                  value={editedPrompt.identifier || ''}
                  onChange={(e) => handleInputChange('identifier', e.target.value)}
                  onBlur={() => handleBlur('identifier')}
                />
              </div>

              <div className="preset-field">
                <label className="preset-field-label">角色</label>
                <select
                  className="preset-field-select"
                  value={editedPrompt.role || ''}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  onBlur={() => handleBlur('role')}
                >
                  <option value="system">system</option>
                  <option value="user">user</option>
                  <option value="assistant">assistant</option>
                </select>
              </div>

              <div className="preset-field">
                <label className="preset-field-label">位置</label>
                <select
                  className="preset-field-select"
                  value={editedPrompt.position || ''}
                  onChange={(e) => handleInputChange('position', e.target.value)}
                  onBlur={() => handleBlur('position')}
                >
                  <option value="relative">relative</option>
                  <option value="in-chat">in-chat</option>
                </select>
              </div>

              {editedPrompt.position === 'in-chat' && (
                <div className="preset-field">
                  <label className="preset-field-label">顺序</label>
                  <input
                    type="number"
                    className="preset-field-input"
                    value={editedPrompt.order ?? ''}
                    onChange={(e) => handleInputChange('order', parseInt(e.target.value, 10))}
                    onBlur={() => handleBlur('order')}
                  />
                </div>
              )}

              {editedPrompt.position === 'in-chat' && (
                <div className="preset-field">
                  <label className="preset-field-label">深度</label>
                  <input
                    type="number"
                    className="preset-field-input"
                    value={editedPrompt.depth ?? ''}
                    onChange={(e) => handleInputChange('depth', parseInt(e.target.value, 10))}
                    onBlur={() => handleBlur('depth')}
                  />
                </div>
              )}
            </div>
            
            <div className="preset-content-field">
              <label className="preset-content-label">
                内容
              </label>
              <textarea
                className="preset-content-textarea"
                value={editedPrompt.content || ''}
                onChange={(e) => handleInputChange('content', e.target.value)}
                onBlur={() => handleBlur('content')}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface PresetPanelProps {
  presetOptions: any;
  activeConfig: any;
  onConfigChange: (configType: string, filePath: string) => void;
  loadConfigData: () => void;
}

export default function PresetPanel({ 
  presetOptions, 
  activeConfig, 
  onConfigChange,
  loadConfigData,
}: PresetPanelProps) {
  const [presetContent, setPresetContent] = useState<any>(null)
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null)

  useEffect(() => {
    if (activeConfig?.presets) {
      loadPresetContent(activeConfig.presets);
    } else {
      setPresetContent(null);
    }
  }, [activeConfig?.presets])

  const loadPresetContent = async (filePath: string) => {
    try {
      const contentResult = await Api.getFileContent(filePath)
      if (!contentResult.content) {
        throw new Error('No content returned from API');
      }
      const parsedContent = JSON.parse(contentResult.content)
      setPresetContent(parsedContent)
    } catch (contentErr) {
      console.error('加载预设内容失败:', contentErr)
      setPresetContent(null)
    }
  }

  const handlePromptToggle = async (promptIdentifier: string, newEnabled: boolean | null) => {
    if (!presetContent || !activeConfig.presets) return
    
    try {
      const updatedContent = {
        ...presetContent,
        prompts: presetContent.prompts.map((prompt: any) =>
          prompt.identifier === promptIdentifier
            ? {
                ...prompt,
                enabled: prompt.enabled === null && newEnabled !== null ? true : newEnabled
              }
            : prompt
        )
      }
      
      await Api.saveFileContent(activeConfig.presets, JSON.stringify(updatedContent, null, 4))
      setPresetContent(updatedContent)
    } catch (err) {
      console.error('更新预设条目失败:', err)
    }
  }

  const handlePromptUpdate = async (originalIdentifier: string, updatedPrompt: any) => {
    if (!presetContent || !activeConfig.presets) return;

    const updatedContent = {
      ...presetContent,
      prompts: presetContent.prompts.map((p: any) =>
        p.identifier === originalIdentifier ? updatedPrompt : p
      ),
    };

    try {
      await Api.saveFileContent(activeConfig.presets, JSON.stringify(updatedContent, null, 4));
      setPresetContent(updatedContent);
      if (originalIdentifier !== updatedPrompt.identifier) {
        setExpandedPrompt(updatedPrompt.identifier);
      }
    } catch (err) {
      console.error('更新预设条目失败:', err);
    }
  };

  const handlePromptExpand = (promptIdentifier: string) => {
    setExpandedPrompt(expandedPrompt === promptIdentifier ? null : promptIdentifier)
  }

  const handleCreateNewPreset = async () => {
    const presetName = prompt('请输入新预设文件的名称：')
    if (!presetName) return

    const fileName = presetName.endsWith('.json') ? presetName : `${presetName}.json`
    const filePath = `presets/${fileName}`
    
    const defaultPresetContent = {
      "name": presetName,
      "description": "新建的预设文件",
      "prompts": []
    }

    try {
      await Api.saveFileContent(filePath, JSON.stringify(defaultPresetContent, null, 4))
      await loadConfigData()
      await onConfigChange('presets', filePath)
    } catch (err) {
      console.error('创建新预设失败:', err)
      alert('创建新预设失败，请重试')
    }
  }

  const handleDeleteCurrentPreset = async () => {
    if (!activeConfig?.presets) {
      alert('没有选中的预设文件可删除')
      return
    }

    const confirmDelete = confirm(`确定要删除预设文件 "${activeConfig.presets}" 吗？此操作无法撤销。`)
    if (!confirmDelete) return

    try {
      await Api.deleteFile(activeConfig.presets)
      await loadConfigData()
      await onConfigChange('presets', '')
      setPresetContent(null)
    } catch (err) {
      console.error('删除预设失败:', err)
      alert('删除预设失败，请重试')
    }
  }

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set())
  const [showVisibilityModal, setShowVisibilityModal] = useState(false)

  const handleAddPresetItem = async () => {
    if (!presetContent || !activeConfig.presets) return

    const itemName = prompt('请输入新预设条目的名称：')
    if (!itemName) return

    const newPrompt = {
      identifier: itemName.toLowerCase().replace(/\s+/g, '_'),
      name: itemName,
      content: "在这里输入提示词内容",
      role: "system",
      position: "relative",
      enabled: false
    }

    const updatedContent = {
      ...presetContent,
      prompts: [newPrompt, ...presetContent.prompts]
    }

    try {
      await Api.saveFileContent(activeConfig.presets, JSON.stringify(updatedContent, null, 4))
      setPresetContent(updatedContent)
    } catch (err) {
      console.error('添加预设条目失败:', err)
      alert('添加预设条目失败，请重试')
    }
  }

  const handleOpenDeleteModal = () => {
    setSelectedForDeletion(new Set())
    setShowDeleteModal(true)
  }

  const toggleDeleteSelection = (identifier: string) => {
    const newSelection = new Set(selectedForDeletion)
    if (newSelection.has(identifier)) {
      newSelection.delete(identifier)
    } else {
      newSelection.add(identifier)
    }
    setSelectedForDeletion(newSelection)
  }

  const handleDeleteSelectedItems = async () => {
    if (!presetContent || selectedForDeletion.size === 0) return

    const confirmDelete = confirm(`确定要删除选中的 ${selectedForDeletion.size} 个条目吗？此操作无法撤销。`)
    if (!confirmDelete) return

    try {
      const updatedContent = {
        ...presetContent,
        prompts: presetContent.prompts.filter((prompt: any) =>
          !selectedForDeletion.has(prompt.identifier)
        )
      }

      await Api.saveFileContent(activeConfig.presets, JSON.stringify(updatedContent, null, 4))
      setPresetContent(updatedContent)
      setShowDeleteModal(false)
      setSelectedForDeletion(new Set())
    } catch (err) {
      console.error('删除预设条目失败:', err)
      alert('删除预设条目失败，请重试')
    }
  }

  const handleOpenVisibilityModal = () => {
    setShowVisibilityModal(true)
  }

  const handleVisibilityToggleInModal = async (promptIdentifier: string) => {
    if (!presetContent || !activeConfig.presets) return
    
    try {
      const updatedContent = {
        ...presetContent,
        prompts: presetContent.prompts.map((prompt: any) => {
          if (prompt.identifier === promptIdentifier) {
            let newEnabled;
            if (prompt.enabled === true) newEnabled = false;
            else if (prompt.enabled === false) newEnabled = null;
            else newEnabled = true;
            return { ...prompt, enabled: newEnabled };
          }
          return prompt;
        })
      }
      
      setPresetContent(updatedContent)
      await Api.saveFileContent(activeConfig.presets, JSON.stringify(updatedContent, null, 4))
    } catch (err) {
      console.error('切换条目可见性失败:', err)
      alert('保存可见性设置失败，请重试')
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !presetContent || !activeConfig.presets) return

    if (active.id !== over.id) {
      const oldIndex = presetContent.prompts.findIndex((p: any) => p.identifier === active.id)
      const newIndex = presetContent.prompts.findIndex((p: any) => p.identifier === over.id)
      const newPrompts = arrayMove(presetContent.prompts, oldIndex, newIndex)
      const updatedContent = { ...presetContent, prompts: newPrompts }
      
      setPresetContent(updatedContent)

      try {
        await Api.saveFileContent(activeConfig.presets, JSON.stringify(updatedContent, null, 4))
      } catch (err) {
        console.error('保存拖拽排序失败:', err)
        setPresetContent(presetContent) // Revert on failure
        alert('保存拖拽排序失败，请重试')
      }
    }
  }

  const presets = presetOptions.presets;

  return (
    <motion.div
      className="preset-panel-container"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="preset-panel-content">
        <div className="preset-panel-header">
          <span>选择预设</span>
          <div className="preset-panel-buttons">
            <button
              className="preset-panel-button"
              onClick={handleCreateNewPreset}
              title="添加预设"
            >
              ➕
            </button>
            <button
              className="preset-panel-button"
              onClick={handleDeleteCurrentPreset}
              disabled={!activeConfig?.presets}
              title="删除当前预设"
            >
              🗑️
            </button>
          </div>
        </div>
        <select
          className="preset-panel-select"
          value={activeConfig.presets || ''}
          onChange={(e) => onConfigChange('presets', e.target.value)}
        >
          <option value="">未选择</option>
          {presets?.files?.map((file: any) => (
            <option key={file.path} value={file.path}>
              {file.display_name || file.name}
            </option>
          ))}
        </select>
        <div className="preset-status-indicator">
          <div className={`preset-status-dot ${activeConfig.presets ? 'active' : 'inactive'}`} />
          {activeConfig.presets ? '已选择' : '未选择'}
        </div>

        {presetContent ? (
          <div className="preset-content-section">
            <div className="preset-items-header">
              <span>预设条目 ({presetContent.prompts?.length || 0})</span>
              <div className="preset-items-actions">
                <button
                  className="preset-action-button"
                  onClick={handleAddPresetItem}
                  title="添加条目"
                >
                  ➕
                </button>
                <button
                  className="preset-action-button"
                  onClick={handleOpenVisibilityModal}
                  title="可见性配置"
                >
                  💡
                </button>
                <button
                  className="preset-action-button"
                  onClick={handleOpenDeleteModal}
                  title="删除条目"
                >
                  🗑️
                </button>
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              autoScroll={false}
            >
              <SortableContext
                items={presetContent.prompts?.filter((p: any) => p.enabled !== null).map((p: any) => p.identifier) || []}
                strategy={verticalListSortingStrategy}
              >
                <OverlayScrollbar
                  className="preset-scrollbar-container"
                  showOnHover={true}
                  autoHide={true}
                >
                  <div
                    id="preset-items-container"
                    className="preset-items-container"
                  >
                  {presetContent.prompts?.map((prompt: any, index: number) => {
                    const isHidden = prompt.enabled === null
                    if (isHidden) return null
                    
                    return (
                      <SortablePresetItem
                        key={prompt.identifier || index}
                        prompt={prompt}
                        index={index}
                        isEnabled={prompt.enabled === true}
                        expandedPrompt={expandedPrompt}
                        onToggle={handlePromptToggle}
                        onExpand={handlePromptExpand}
                        onUpdate={handlePromptUpdate}
                        onVisibilityToggle={() => {}} // Placeholder
                      />
                    )
                  })}
                  </div>
                </OverlayScrollbar>
              </SortableContext>
            </DndContext>

            {/* 使用内嵌正则规则组件 */}
            <EmbeddedRegexRules
              regexRules={presetContent.regex_rules}
              onSave={async (updatedRules) => {
                const updatedContent = { ...presetContent, regex_rules: updatedRules }
                setPresetContent(updatedContent)
                await Api.saveFileContent(activeConfig.presets, JSON.stringify(updatedContent, null, 4))
              }}
              title="预设绑定正则规则"
            />
          </div>
        ) : (
          <div className="preset-empty-state">
            {activeConfig.presets ? '正在加载预设内容...' : '请先选择预设'}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            className="preset-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              className="preset-modal large"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="preset-modal-header">
                <h3 className="preset-modal-title">
                  删除预设条目
                </h3>
                <button
                  className="preset-modal-close"
                  onClick={() => setShowDeleteModal(false)}
                >
                  ✕
                </button>
              </div>
              <p className="preset-modal-description">
                选择要删除的条目。所有类型的条目（启用、禁用、隐藏）都会显示。
              </p>
              <div className="preset-modal-content">
                {presetContent?.prompts?.map((prompt: any, index: number) => (
                  <div
                    key={prompt.identifier || index}
                    className={`preset-modal-item ${selectedForDeletion.has(prompt.identifier) ? 'selected' : ''}`}
                    onClick={() => toggleDeleteSelection(prompt.identifier)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedForDeletion.has(prompt.identifier)}
                      onChange={() => toggleDeleteSelection(prompt.identifier)}
                      className="preset-modal-item-checkbox-wrapper"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="preset-modal-item-content-wrapper">
                      <div className="preset-modal-item-title">
                        {prompt.name || prompt.identifier}
                      </div>
                      <div className="preset-modal-item-meta">
                        <span>角色: {prompt.role || 'system'}</span>
                        <span>•</span>
                        <span>状态: { prompt.enabled === null ? '隐藏' : prompt.enabled ? '开启' : '关闭' }</span>
                        {prompt.position && ( <><span>•</span><span>位置: {prompt.position}</span></> )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="preset-modal-footer">
                <div className="preset-modal-count">
                  已选择 {selectedForDeletion.size} 个条目
                </div>
                <div className="preset-modal-actions">
                  <button
                    className="preset-modal-button cancel"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    取消
                  </button>
                  <button
                    className="preset-modal-button danger"
                    onClick={handleDeleteSelectedItems}
                    disabled={selectedForDeletion.size === 0}
                  >
                    删除选中 ({selectedForDeletion.size})
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVisibilityModal && (
          <motion.div
            className="preset-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowVisibilityModal(false)}
          >
            <motion.div
              className="preset-modal large"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="preset-modal-header">
                <h3 className="preset-modal-title">
                  可见性配置
                </h3>
                <button
                  className="preset-modal-close"
                  onClick={() => setShowVisibilityModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className="visibility-info-section">
                <p className="visibility-info-title">💡 状态说明</p>
                <p><strong>开启</strong>：条目会在聊天中应用，且在列表中显示为开启状态</p>
                <p><strong>关闭</strong>：条目会在列表中显示，但处于关闭状态，不会在聊天中应用</p>
                <p><strong>隐藏</strong>：条目完全不在主列表中显示，但仍保存在文件中</p>
              </div>
              <div className="preset-modal-content">
                {presetContent?.prompts?.map((prompt: any, index: number) => {
                  const getStatusInfo = (enabled: boolean | null) => {
                    if (enabled === true) return { text: '开启', displayText: '开启' }
                    if (enabled === false) return { text: '关闭', displayText: '关闭' }
                    return { text: '隐藏', displayText: '隐藏' }
                  }
                  const statusInfo = getStatusInfo(prompt.enabled)
                  return (
                    <div
                      key={prompt.identifier || index}
                      className="visibility-modal-item"
                    >
                      <div className="visibility-modal-item-header-wrapper">
                        <div className="visibility-modal-item-title-wrapper">
                          <span className="visibility-modal-item-title-text">{prompt.name || prompt.identifier}</span>
                          {prompt.role && (
                            <span className="visibility-modal-item-role-tag">{prompt.role}</span>
                          )}
                        </div>
                        <div className="visibility-modal-item-subtitle">
                          <span className="visibility-modal-item-id">ID: {prompt.identifier}</span>
                          {prompt.position && ( <><span>•</span><span>位置: {prompt.position}</span></> )}
                        </div>
                      </div>
                      <div className="visibility-modal-controls">
                        <button
                          className={`visibility-toggle-button-text ${prompt.enabled === true ? 'enabled' : prompt.enabled === false ? 'disabled' : 'hidden'}`}
                          onClick={(e) => { e.stopPropagation(); handleVisibilityToggleInModal(prompt.identifier) }}
                          title="点击切换状态（开启 → 关闭 → 隐藏 → 开启）"
                        >
                          {statusInfo.displayText}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="preset-modal-footer">
                <div className="visibility-modal-stats">
                  <span>总条目: {presetContent?.prompts?.length || 0}</span>
                  <span>开启: {presetContent?.prompts?.filter((p: any) => p.enabled === true).length || 0}</span>
                  <span>关闭: {presetContent?.prompts?.filter((p: any) => p.enabled === false).length || 0}</span>
                  <span>隐藏: {presetContent?.prompts?.filter((p: any) => p.enabled === null).length || 0}</span>
                </div>
                <div className="preset-modal-actions">
                  <button
                    className="preset-modal-button primary"
                    onClick={() => setShowVisibilityModal(false)}
                  >
                    完成
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}