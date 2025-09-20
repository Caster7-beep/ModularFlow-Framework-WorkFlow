import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api } from '@/services/api'
import OverlayScrollbar from './OverlayScrollbar'
import ExportModal from './ExportModal'
import '@/styles/RegexPanel.css'
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

// 可拖拽的正则规则组件
interface SortableRegexRuleProps {
  rule: any;
  index: number;
  isEnabled: boolean;
  expandedRule: string | null;
  onToggle: (id: string, enabled: boolean) => void;
  onExpand: (id: string) => void;
  onUpdate: (id: string, updatedRule: any) => void;
}

function SortableRegexRule({
  rule,
  index,
  isEnabled,
  expandedRule,
  onToggle,
  onExpand,
  onUpdate,
}: SortableRegexRuleProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: rule.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [editedRule, setEditedRule] = useState(rule);

  useEffect(() => {
    setEditedRule(rule);
  }, [rule]);

  const handleInputChange = (field: string, value: string | string[]) => {
    setEditedRule((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: string) => {
    if (rule[field] === undefined && editedRule[field] === '') {
      const { [field]: _, ...rest } = editedRule;
      onUpdate(rule.id, rest);
      return;
    }
    onUpdate(rule.id, editedRule);
  };

  return (
    <div ref={setNodeRef} style={style} className={`sortable-regex-wrapper sortable-regex-style ${isDragging ? 'dragging' : ''}`}>
      <motion.div
        className={`regex-rule-item ${isEnabled ? 'enabled' : 'disabled'}`}
        whileHover={{ backgroundColor: 'var(--panel-item-hover-bg)' }}
        onClick={() => onExpand(rule.id)}
      >
        <div
          {...attributes}
          {...listeners}
          className="regex-rule-drag-handle"
          title="拖拽排序"
        >
          ⋮⋮
        </div>
        
        <div className="regex-rule-content">
          <span className={`regex-rule-expand-icon ${expandedRule === rule.id ? 'expanded' : ''}`}>
            {expandedRule === rule.id ? '▼' : '▶'}
          </span>
          
          <span className={`regex-rule-title ${isEnabled ? 'enabled' : 'disabled'}`}>
            {rule.name || rule.id}
          </span>
          
          {rule.placement && (
            <span className="regex-rule-tag">
              {rule.placement}
            </span>
          )}
        </div>
        
        <label
          className="regex-rule-toggle"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onToggle(rule.id, e.target.checked)}
          />
          <span className={`regex-toggle-slider ${isEnabled ? 'enabled' : 'disabled'}`} />
          <span className={`regex-toggle-dot ${isEnabled ? 'enabled' : 'disabled'}`} />
        </label>
      </motion.div>
      
      <AnimatePresence>
        {expandedRule === rule.id && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="regex-rule-expanded"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="regex-rule-fields">
              <div className="regex-field">
                <label className="regex-field-label">ID</label>
                <input
                  type="text"
                  className="regex-field-input"
                  value={editedRule.id || ''}
                  onChange={(e) => handleInputChange('id', e.target.value)}
                  onBlur={() => handleBlur('id')}
                />
              </div>

              <div className="regex-field">
                <label className="regex-field-label">名称</label>
                <input
                  type="text"
                  className="regex-field-input"
                  value={editedRule.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  onBlur={() => handleBlur('name')}
                />
              </div>

              <div className="regex-field">
                <label className="regex-field-label">位置</label>
                <select
                  className="regex-field-select"
                  value={editedRule.placement || 'after_macro'}
                  onChange={(e) => handleInputChange('placement', e.target.value)}
                  onBlur={() => handleBlur('placement')}
                >
                  <option value="after_macro">宏之后</option>
                  <option value="before_macro">宏之前</option>
                </select>
              </div>
            </div>
            
            <div className="regex-content-field">
              <label className="regex-content-label">查找正则 (find_regex)</label>
              <textarea
                className="regex-content-textarea"
                value={editedRule.find_regex || ''}
                onChange={(e) => handleInputChange('find_regex', e.target.value)}
                onBlur={() => handleBlur('find_regex')}
                placeholder="输入正则表达式模式"
              />
            </div>

            <div className="regex-content-field">
              <label className="regex-content-label">替换正则 (replace_regex)</label>
              <textarea
                className="regex-content-textarea"
                value={editedRule.replace_regex || ''}
                onChange={(e) => handleInputChange('replace_regex', e.target.value)}
                onBlur={() => handleBlur('replace_regex')}
                placeholder="输入替换内容"
              />
            </div>

            <div className="regex-targets-field">
              <label className="regex-content-label">目标范围 (targets)</label>
              <div className="regex-targets-list">
                {['user', 'assistant', 'world_book', 'preset', 'assistant_thinking'].map(target => (
                  <label key={target} className="regex-target-item">
                    <input
                      type="checkbox"
                      className="regex-target-checkbox"
                      checked={(editedRule.targets || []).includes(target)}
                      onChange={(e) => {
                        const allTargets = ['user', 'assistant', 'world_book', 'preset', 'assistant_thinking'];
                        const currentTargets = editedRule.targets || [];
                        let newTargets;
                        
                        if (e.target.checked) {
                          // 添加目标时按照复选框顺序排列
                          newTargets = allTargets.filter(t =>
                            currentTargets.includes(t) || t === target
                          );
                        } else {
                          // 移除目标
                          newTargets = currentTargets.filter((t: string) => t !== target);
                        }
                        
                        handleInputChange('targets', newTargets);
                        onUpdate(rule.id, { ...editedRule, targets: newTargets });
                      }}
                    />
                    <span>{target}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="regex-views-field">
              <label className="regex-content-label">视图范围 (views)</label>
              <div className="regex-views-list">
                {['user_view', 'assistant_view'].map(view => (
                  <label key={view} className="regex-view-item">
                    <input
                      type="checkbox"
                      className="regex-view-checkbox"
                      checked={(editedRule.views || []).includes(view)}
                      onChange={(e) => {
                        const allViews = ['user_view', 'assistant_view'];
                        const currentViews = editedRule.views || [];
                        let newViews;
                        
                        if (e.target.checked) {
                          // 添加视图时按照复选框顺序排列
                          newViews = allViews.filter(v =>
                            currentViews.includes(v) || v === view
                          );
                        } else {
                          // 移除视图
                          newViews = currentViews.filter((v: string) => v !== view);
                        }
                        
                        handleInputChange('views', newViews);
                        onUpdate(rule.id, { ...editedRule, views: newViews });
                      }}
                    />
                    <span>{view}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="regex-description-field">
              <label className="regex-description-label">描述</label>
              <textarea
                className="regex-description-textarea"
                value={editedRule.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
                onBlur={() => handleBlur('description')}
                placeholder="描述此正则规则的用途"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface RegexPanelProps {
  regexOptions: any;
  activeConfig: any;
  onConfigChange: (configType: string, filePath: string) => void;
  loadConfigData: () => void;
}

export default function RegexPanel({ 
  regexOptions, 
  activeConfig, 
  onConfigChange,
  loadConfigData,
}: RegexPanelProps) {
  const [regexContent, setRegexContent] = useState<any[] | null>(null)
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activeConfig?.regex_rules) {
      loadRegexContent(activeConfig.regex_rules);
    } else {
      setRegexContent(null);
    }
  }, [activeConfig?.regex_rules])

  const loadRegexContent = async (filePath: string) => {
    try {
      const contentResult = await Api.getFileContent(filePath)
      if (!contentResult.content) {
        throw new Error('No content returned from API');
      }
      const parsedContent = JSON.parse(contentResult.content)
      setRegexContent(parsedContent)
    } catch (contentErr) {
      console.error('加载正则规则内容失败:', contentErr)
      setRegexContent(null)
    }
  }

  const saveContent = async (content: any[]) => {
    if (!activeConfig.regex_rules) return;
    try {
      await Api.saveFileContent(activeConfig.regex_rules, JSON.stringify(content, null, 4));
    } catch (err) {
      console.error("保存正则规则失败", err);
      alert("保存失败，请重试");
    }
  }

  const handleRuleToggle = async (ruleId: string, newEnabled: boolean) => {
    if (!regexContent) return
    
    const updatedContent = regexContent.map(rule =>
      rule.id === ruleId
        ? { ...rule, enabled: newEnabled }
        : rule
    )
    
    setRegexContent(updatedContent)
    await saveContent(updatedContent)
  }

  const handleRuleUpdate = async (originalId: string, updatedRule: any) => {
    if (!regexContent) return;

    const updatedContent = regexContent.map(rule =>
      rule.id === originalId ? updatedRule : rule
    );

    setRegexContent(updatedContent);
    await saveContent(updatedContent);
    
    if (originalId !== updatedRule.id) {
      setExpandedRule(updatedRule.id);
    }
  };

  const handleRuleExpand = (ruleId: string) => {
    setExpandedRule(expandedRule === ruleId ? null : ruleId)
  }

  const handleCreateNewFile = async () => {
    const fileName = prompt('请输入新正则规则文件的名称：')
    if (!fileName) return

    const filePath = `regex_rules/${fileName.endsWith('.json') ? fileName : `${fileName}.json`}`
    
    const defaultContent: any[] = []

    try {
      await Api.saveFileContent(filePath, JSON.stringify(defaultContent, null, 4))
      await loadConfigData()
      await onConfigChange('regex_rules', filePath)
    } catch (err) {
      console.error('创建新正则规则文件失败:', err)
      alert('创建新正则规则文件失败，请重试')
    }
  }

  // 处理正则规则导入
  const handleImportRegex = () => {
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
              "REGEX",
              file.name,
              true
            )

            if (response.success) {
              alert(`成功导入正则规则文件: ${response.file.name}`)
              // 重新加载配置和正则规则列表
              await loadConfigData()
              // 如果当前没有选择正则规则，自动选择导入的正则规则
              if (!activeConfig.regex_rules) {
                await onConfigChange('regex_rules', response.file.path)
              }
            } else {
              alert(`导入失败: ${response.message || '未知错误'}`)
            }
          } catch (err) {
            console.error('处理JSON文件失败:', err)
            alert('导入正则规则失败，请确保文件格式正确')
          }
          setIsImporting(false)
        }
        reader.readAsText(file)
      } else if (file.type === 'image/png') {
        // 处理PNG图片，可能包含嵌入的正则规则文件
        const reader = new FileReader()
        reader.onload = async (event) => {
          const content = event.target?.result as string
          try {
            // 使用API从图片导入文件，仅提取正则规则类型
            const response = await Api.importFilesFromImage(
              content,
              ["RX"], // RX是正则规则的文件类型标签
              true
            )

            if (response.success && response.files && response.files.length > 0) {
              alert(`成功从图片导入了 ${response.files.length} 个正则规则文件`)
              // 重新加载配置和正则规则列表
              await loadConfigData()
              // 如果当前没有选择正则规则，自动选择第一个导入的正则规则
              if (!activeConfig.regex_rules && response.files[0].path) {
                await onConfigChange('regex_rules', response.files[0].path)
              }
            } else {
              // 处理未找到文件或导入失败的情况
              const errorMsg = response.message || '导入失败'
              alert(`导入失败: ${errorMsg}`)
            }
          } catch (err) {
            console.error('处理PNG图片失败:', err)
            alert('从图片导入正则规则失败，请确保图片包含有效的正则规则文件')
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

  // 准备要导出的正则规则文件
  const prepareRegexExport = () => {
    if (!activeConfig?.regex_rules || !regexContent) return [];
    
    // 从路径中获取文件名
    const fileName = activeConfig.regex_rules.split('/').pop() || 'regex_rules.json';
    const displayName = fileName.replace('.json', '');
    
    // 创建导出文件对象
    const exportFile = {
      content: regexContent,
      type: "RX", // 正则规则文件类型标识
      name: fileName,
      displayName: displayName,
      category: "正则规则",
      icon: "⚙️",
      selected: true,
      path: activeConfig.regex_rules
    };
    
    return [exportFile];
  };

  // 处理导出正则规则
  const handleExportRegex = () => {
    if (!activeConfig?.regex_rules || !regexContent) return;
    
    // 打开导出模态框
    setShowExportModal(true);
  };

  const handleDeleteCurrentFile = async () => {
    if (!activeConfig?.regex_rules) {
      alert('没有选中的正则规则文件可删除')
      return
    }

    const confirmDelete = confirm(`确定要删除正则规则文件 "${activeConfig.regex_rules}" 吗？此操作无法撤销。`)
    if (!confirmDelete) return

    try {
      await Api.deleteFile(activeConfig.regex_rules)
      await loadConfigData()
      await onConfigChange('regex_rules', '')
      setRegexContent(null)
    } catch (err) {
      console.error('删除正则规则文件失败:', err)
      alert('删除正则规则文件失败，请重试')
    }
  }

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set())

  const handleAddRule = async () => {
    if (!regexContent) return

    const ruleName = prompt('请输入新正则规则的名称：')
    if (!ruleName) return

    const newRule = {
      id: ruleName.toLowerCase().replace(/\s+/g, '_') + '_rule',
      name: ruleName,
      enabled: false,
      find_regex: "",
      replace_regex: "",
      targets: ["user", "assistant"],
      placement: "after_macro",
      views: ["user_view", "assistant_view"],
      description: "新建的正则规则"
    }

    const updatedContent = [newRule, ...regexContent]
    setRegexContent(updatedContent)
    await saveContent(updatedContent)
  }

  const handleOpenDeleteModal = () => {
    setSelectedForDeletion(new Set())
    setShowDeleteModal(true)
  }

  const toggleDeleteSelection = (id: string) => {
    const newSelection = new Set(selectedForDeletion)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedForDeletion(newSelection)
  }

  const handleDeleteSelectedRules = async () => {
    if (!regexContent || selectedForDeletion.size === 0) return

    const confirmDelete = confirm(`确定要删除选中的 ${selectedForDeletion.size} 个规则吗？此操作无法撤销。`)
    if (!confirmDelete) return

    try {
      const updatedContent = regexContent.filter(rule =>
        !selectedForDeletion.has(rule.id)
      )

      setRegexContent(updatedContent)
      await saveContent(updatedContent)
      setShowDeleteModal(false)
      setSelectedForDeletion(new Set())
    } catch (err) {
      console.error('删除正则规则失败:', err)
      alert('删除正则规则失败，请重试')
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
    if (!over || !regexContent) return

    if (active.id !== over.id) {
      const oldIndex = regexContent.findIndex(rule => rule.id === active.id)
      const newIndex = regexContent.findIndex(rule => rule.id === over.id)
      const newRules = arrayMove(regexContent, oldIndex, newIndex)
      
      setRegexContent(newRules)
      await saveContent(newRules)
    }
  }

  const regexRules = regexOptions.regex_rules;

  return (
    <motion.div
      className="regex-panel-container"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="regex-panel-content">
        <div className="regex-panel-header">
          <span>选择正则规则</span>
          <div className="regex-panel-buttons">
            <button
              className="regex-panel-button"
              onClick={handleCreateNewFile}
              title="添加文件"
            >
              ➕
            </button>
            <button
              className="regex-panel-button"
              onClick={handleImportRegex}
              title="导入正则规则"
            >
              📥
            </button>
            <button
              className="regex-panel-button"
              onClick={handleExportRegex}
              title="导出正则规则"
              disabled={!activeConfig?.regex_rules}
            >
              📤
            </button>
            <button
              className={`regex-panel-button ${activeConfig?.regex_rules ? 'regex-panel-button-active' : 'regex-panel-button-inactive'}`}
              onClick={handleDeleteCurrentFile}
              disabled={!activeConfig?.regex_rules}
              title="删除当前文件"
            >
              🗑️
            </button>
          </div>
        </div>
        <select
          className="regex-panel-select"
          value={activeConfig.regex_rules || ''}
          onChange={(e) => onConfigChange('regex_rules', e.target.value)}
        >
          <option value="">未选择</option>
          {regexRules?.files?.map((file: any) => (
            <option key={file.path} value={file.path}>
              {file.display_name || file.name}
            </option>
          ))}
        </select>
        <div className="regex-status-indicator">
          <div className={`regex-status-dot ${activeConfig.regex_rules ? 'active' : 'inactive'}`} />
          {activeConfig.regex_rules ? '已选择' : '未选择'}
        </div>

        {regexContent ? (
          <div className="regex-content-section">
            <div className="regex-items-header">
              <span>正则规则 ({regexContent.length || 0})</span>
              <div className="regex-items-actions">
                <button
                  className="regex-action-button"
                  onClick={handleAddRule}
                  title="添加规则"
                >
                  ➕
                </button>
                <button
                  className="regex-action-button"
                  onClick={handleOpenDeleteModal}
                  title="删除规则"
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
                items={regexContent.map(rule => rule.id)}
                strategy={verticalListSortingStrategy}
              >
                <OverlayScrollbar
                  className="regex-scrollbar-container"
                  showOnHover={true}
                  autoHide={true}
                >
                  <div
                    id="regex-rules-container"
                    className="regex-items-container"
                  >
                  {regexContent.map((rule: any, index: number) => (
                    <SortableRegexRule
                      key={rule.id || index}
                      rule={rule}
                      index={index}
                      isEnabled={rule.enabled === true}
                      expandedRule={expandedRule}
                      onToggle={handleRuleToggle}
                      onExpand={handleRuleExpand}
                      onUpdate={handleRuleUpdate}
                    />
                  ))}
                  </div>
                </OverlayScrollbar>
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          <div className="regex-empty-message">
            {activeConfig.regex_rules ? '正在加载正则规则内容...' : '请先选择正则规则文件'}
          </div>
        )}
      </div>

      {/* Delete Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="regex-delete-modal-backdrop"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="regex-delete-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="regex-delete-modal-header">
                <h3 className="regex-delete-modal-title">
                  删除正则规则
                </h3>
                <button
                  className="regex-delete-modal-close"
                  onClick={() => setShowDeleteModal(false)}
                >
                  ✕
                </button>
              </div>
              <p className="regex-delete-modal-description">
                选择要删除的正则规则。
              </p>
              <div className="regex-delete-modal-content">
                {regexContent?.map((rule: any, index: number) => (
                  <div
                    key={rule.id || index}
                    className={`regex-delete-modal-item ${selectedForDeletion.has(rule.id) ? 'selected' : ''}`}
                    onClick={() => toggleDeleteSelection(rule.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedForDeletion.has(rule.id)}
                      onChange={() => toggleDeleteSelection(rule.id)}
                      className="regex-delete-modal-item-checkbox"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="regex-delete-modal-item-info">
                      <div className="regex-delete-modal-item-name">
                        {rule.name || rule.id}
                      </div>
                      <div className="regex-delete-modal-item-details">
                        <span>状态: {rule.enabled ? '启用' : '禁用'}</span>
                        <span>•</span>
                        <span>位置: {rule.placement || 'after_macro'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="regex-delete-modal-footer">
                <div className="regex-delete-modal-count">
                  已选择 {selectedForDeletion.size} 个规则
                </div>
                <div className="regex-delete-modal-actions">
                  <button
                    className="regex-delete-modal-button cancel"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    取消
                  </button>
                  <button
                    className={`regex-delete-modal-button delete ${selectedForDeletion.size > 0 ? 'enabled' : 'disabled'}`}
                    onClick={handleDeleteSelectedRules}
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
      
      {/* 导出模态框 */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        files={prepareRegexExport()}
        panelTitle="正则规则"
      />

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
        <div className="regex-import-loading">
          <div className="regex-import-spinner"></div>
          <div className="regex-import-text">正在导入文件...</div>
        </div>
      )}
    </motion.div>
  )
}