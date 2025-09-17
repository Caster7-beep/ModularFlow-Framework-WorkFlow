import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api } from '@/services/api'
import OverlayScrollbar from './OverlayScrollbar'
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
import '../styles/EmbeddedPanels.css'

// 内嵌世界书面板组件
interface EmbeddedWorldBookProps {
  worldBookData: any;
  onSave: (updatedData: any) => void;
  title?: string;
}

interface SortableEmbeddedWorldBookItemProps {
  item: any;
  index: number;
  isEnabled: boolean;
  expandedItem: number | null;
  onToggle: (id: number, enabled: boolean) => Promise<void>;
  onExpand: (id: number) => void;
  onUpdate: (id: number, updatedItem: any) => Promise<void>;
  onDelete: (id: number) => void;
}

function SortableEmbeddedWorldBookItem({
  item,
  index,
  isEnabled,
  expandedItem,
  onToggle,
  onExpand,
  onUpdate,
  onDelete,
}: SortableEmbeddedWorldBookItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // 使用本地状态管理编辑的项
  const [editedItem, setEditedItem] = useState(item);

  useEffect(() => {
    setEditedItem(item);
  }, [item]);

  // 即时更新本地状态
  const handleInputChange = useCallback((field: string, value: string | number | string[]) => {
    setEditedItem((prev: any) => ({ ...prev, [field]: value }));
  }, []);

  // 保存时使用最新状态
  const handleBlur = useCallback(async (field: string) => {
    await onUpdate(item.id, editedItem);
  }, [editedItem, item.id, onUpdate]);

  return (
    <div ref={setNodeRef} style={style}>
      <motion.div
        className={`sortable-worldbook-item sortable-worldbook-item-hover ${
          isEnabled ? 'sortable-worldbook-item-enabled' : 'sortable-worldbook-item-disabled'
        }`}
        onClick={() => onExpand(item.id)}
      >
        <div
          {...attributes}
          {...listeners}
          className="sortable-worldbook-drag-handle"
          title="拖拽排序"
        >
          ⋮⋮
        </div>
        
        <div className="sortable-worldbook-content">
          <span className="sortable-worldbook-expand">
            {expandedItem === item.id ? '▼' : '▶'}
          </span>
          
          <span className={`sortable-worldbook-name ${
            isEnabled ? 'sortable-worldbook-name-enabled' : 'sortable-worldbook-name-disabled'
          }`}>
            {item.name || `条目 #${item.id}`}
          </span>
        </div>
        
        <label
          className="sortable-worldbook-toggle"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onToggle(item.id, e.target.checked)}
          />
          <span className={`sortable-worldbook-toggle-track ${
            isEnabled ? 'sortable-worldbook-toggle-track-enabled' : 'sortable-worldbook-toggle-track-disabled'
          }`} />
          <span className={`sortable-worldbook-toggle-thumb ${
            isEnabled ? 'sortable-worldbook-toggle-thumb-enabled' : 'sortable-worldbook-toggle-thumb-disabled'
          }`} />
        </label>
      </motion.div>
      
      <AnimatePresence>
        {expandedItem === item.id && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="sortable-worldbook-expanded"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sortable-worldbook-form-grid">
              <div className="sortable-worldbook-form-field">
                <label className="sortable-worldbook-form-label">ID</label>
                <input
                  type="text"
                  className="sortable-worldbook-form-input"
                  value={editedItem.id}
                  onChange={(e) => handleInputChange('id', e.target.value)}
                  onBlur={() => handleBlur('id')}
                />
              </div>
              <div className="sortable-worldbook-form-field">
                <label className="sortable-worldbook-form-label">名称</label>
                <input 
                  type="text" 
                  className="sortable-worldbook-form-input" 
                  value={editedItem.name || ''} 
                  onChange={(e) => handleInputChange('name', e.target.value)} 
                  onBlur={() => handleBlur('name')} 
                />
              </div>
              <div className="sortable-worldbook-form-field">
                <label className="sortable-worldbook-form-label">模式</label>
                <select 
                  className="sortable-worldbook-form-input" 
                  value={editedItem.mode || 'always'} 
                  onChange={(e) => handleInputChange('mode', e.target.value)} 
                  onBlur={() => handleBlur('mode')}
                >
                  <option value="always">Always</option>
                  <option value="conditional">Conditional</option>
                </select>
              </div>
              <div className="sortable-worldbook-form-field">
                <label className="sortable-worldbook-form-label">位置</label>
                <select 
                  className="sortable-worldbook-form-input" 
                  value={editedItem.position || 'before_char'} 
                  onChange={(e) => handleInputChange('position', e.target.value)} 
                  onBlur={() => handleBlur('position')}
                >
                  <option value="before_char">角色之前</option>
                  <option value="after_char">角色之后</option>
                  <option value="user">@Duser</option>
                  <option value="assistant">@Dassistant</option>
                  <option value="system">@Dsystem</option>
                </select>
              </div>
              <div className="sortable-worldbook-form-field">
                <label className="sortable-worldbook-form-label">顺序</label>
                <input 
                  type="number" 
                  className="sortable-worldbook-form-input" 
                  value={editedItem.order ?? ''} 
                  onChange={(e) => handleInputChange('order', parseInt(e.target.value, 10) || 0)} 
                  onBlur={() => handleBlur('order')} 
                />
              </div>
              <div className="sortable-worldbook-form-field">
                <label className="sortable-worldbook-form-label">深度</label>
                <input 
                  type="number" 
                  className="sortable-worldbook-form-input" 
                  value={editedItem.depth ?? ''} 
                  onChange={(e) => handleInputChange('depth', parseInt(e.target.value, 10) || 0)} 
                  onBlur={() => handleBlur('depth')} 
                />
              </div>
            </div>
            <div className="sortable-worldbook-form-field">
              <label className="sortable-worldbook-content-label">关键词 (逗号分隔)</label>
              <input 
                type="text" 
                className="sortable-worldbook-form-input" 
                value={(editedItem.keys || []).join(',')} 
                onChange={(e) => handleInputChange('keys', e.target.value.split(',').map(k => k.trim()).filter(k => k))} 
                onBlur={() => handleBlur('keys')} 
              />
            </div>
            <div className="sortable-worldbook-form-field">
              <label className="sortable-worldbook-content-label">内容</label>
              <textarea
                className="sortable-worldbook-content-textarea"
                value={editedItem.content || ''}
                onChange={(e) => handleInputChange('content', e.target.value)}
                onBlur={() => handleBlur('content')}
              />
            </div>
            <div className="embedded-action-buttons-container">
              <button
                className="sortable-worldbook-delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  const confirmDelete = confirm(`确定要删除条目 "${item.name || `#${item.id}`}" 吗？此操作无法撤销。`)
                  if (confirmDelete) {
                    onDelete(item.id)
                  }
                }}
                title="删除条目"
              >
                删除
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function EmbeddedWorldBook({ worldBookData, onSave, title = "内嵌世界书" }: EmbeddedWorldBookProps) {
  const [expanded, setExpanded] = useState<boolean>(false)
  const [expandedItem, setExpandedItem] = useState<number | null>(null)
  const [worldBookEntries, setWorldBookEntries] = useState<any[]>(worldBookData?.entries || [])

  useEffect(() => {
    setWorldBookEntries(worldBookData?.entries || [])
  }, [worldBookData])

  // 参考独立面板的实现，添加异步保存逻辑
  const saveContent = useCallback(async (updatedEntries: any[]) => {
    const updatedWorldBook = { ...worldBookData, entries: updatedEntries };
    setWorldBookEntries(updatedEntries);
    onSave(updatedWorldBook);
  }, [worldBookData, onSave]);

  const handleItemToggle = useCallback(async (id: number, newEnabled: boolean) => {
    const updatedEntries = worldBookEntries.map(item =>
      item.id === id ? { ...item, enabled: newEnabled } : item
    );
    await saveContent(updatedEntries);
  }, [worldBookEntries, saveContent]);

  const handleItemUpdate = useCallback(async (originalId: number, updatedItem: any) => {
    const updatedEntries = worldBookEntries.map(item =>
      item.id === originalId ? updatedItem : item
    );
    await saveContent(updatedEntries);
    
    // 如果ID发生了变化，更新展开状态以保持条目展开
    if (originalId !== updatedItem.id && expandedItem === originalId) {
      setExpandedItem(updatedItem.id);
    }
  }, [worldBookEntries, saveContent, expandedItem]);

  const handleItemExpand = useCallback((id: number) => {
    setExpandedItem(expandedItem === id ? null : id)
  }, [expandedItem]);

  const handleAddItem = useCallback(async () => {
    const newItemName = prompt('请输入新条目名称:')
    if (!newItemName) return

    const newId = worldBookEntries.length > 0 ? Math.max(...worldBookEntries.map(i => i.id)) + 1 : 1
    const newItem = {
      id: newId,
      name: newItemName,
      content: "",
      mode: "always",
      position: "before_char",
      order: 100,
      depth: 0,
      enabled: true,
      keys: []
    }
    const updatedEntries = [newItem, ...worldBookEntries]
    await saveContent(updatedEntries);
  }, [worldBookEntries, saveContent]);

  const handleDeleteItem = useCallback(async (id: number) => {
    const updatedEntries = worldBookEntries.filter(item => item.id !== id)
    await saveContent(updatedEntries);
  }, [worldBookEntries, saveContent]);

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<number>>(new Set())

  const handleOpenDeleteModal = useCallback(() => {
    setSelectedForDeletion(new Set())
    setShowDeleteModal(true)
  }, []);

  const toggleDeleteSelection = useCallback((id: number) => {
    const newSelection = new Set(selectedForDeletion)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedForDeletion(newSelection)
  }, [selectedForDeletion]);

  const handleDeleteSelectedItems = useCallback(async () => {
    if (selectedForDeletion.size === 0) return

    const confirmDelete = confirm(`确定要删除选中的 ${selectedForDeletion.size} 个条目吗？此操作无法撤销。`)
    if (!confirmDelete) return

    const updatedEntries = worldBookEntries.filter(item =>
      !selectedForDeletion.has(item.id)
    )
    await saveContent(updatedEntries);
    setShowDeleteModal(false)
    setSelectedForDeletion(new Set())
  }, [selectedForDeletion, worldBookEntries, saveContent]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    if (active.id !== over.id) {
      const oldIndex = worldBookEntries.findIndex(item => item.id === active.id)
      const newIndex = worldBookEntries.findIndex(item => item.id === over.id)
      const newEntries = arrayMove(worldBookEntries, oldIndex, newIndex)
      await saveContent(newEntries);
    }
  }, [worldBookEntries, saveContent]);

  if (!worldBookData?.entries || worldBookData.entries.length === 0) {
    return null
  }

  return (
    <div>
      <div
        className="embedded-worldbook-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`embedded-worldbook-expand-icon ${expanded ? 'embedded-worldbook-expand-icon-expanded' : 'embedded-worldbook-expand-icon-collapsed'}`}>
          ▶
        </span>
        <span>{title} ({worldBookEntries.length} 条)</span>
        <div className="embedded-worldbook-actions">
          <button
            className="embedded-worldbook-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              handleAddItem()
            }}
            title="添加条目"
          >
            ➕
          </button>
          <button
            className="embedded-worldbook-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              handleOpenDeleteModal()
            }}
            title="删除条目"
          >
            🗑️
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="embedded-worldbook-container"
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              autoScroll={false}
            >
              <SortableContext
                items={worldBookEntries.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <OverlayScrollbar
                  className="embedded-scrollbar-container"
                  showOnHover={true}
                  autoHide={true}
                >
                  <div className="embedded-worldbook-items">
                    {worldBookEntries.map((item: any, index: number) => (
                      <SortableEmbeddedWorldBookItem
                        key={item.id}
                        item={item}
                        index={index}
                        isEnabled={item.enabled}
                        expandedItem={expandedItem}
                        onToggle={handleItemToggle}
                        onExpand={handleItemExpand}
                        onUpdate={handleItemUpdate}
                        onDelete={handleDeleteItem}
                      />
                    ))}
                  </div>
                </OverlayScrollbar>
              </SortableContext>
            </DndContext>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Delete Modal for World Book */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            className="worldbook-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              className="worldbook-modal-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="worldbook-modal-header-section">
                <h3 className="worldbook-modal-title-text">
                  删除世界书条目
                </h3>
                <button
                  className="worldbook-modal-close-btn"
                  onClick={() => setShowDeleteModal(false)}
                >
                  ✕
                </button>
              </div>
              <p className="worldbook-modal-description-text">
                选择要删除的世界书条目。
              </p>
              <div className="worldbook-modal-item-list">
                {worldBookEntries.map((item: any, index: number) => (
                  <div
                    key={item.id}
                    className={`worldbook-modal-list-item ${selectedForDeletion.has(item.id) ? 'worldbook-modal-item-selected' : ''}`}
                    onClick={() => toggleDeleteSelection(item.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedForDeletion.has(item.id)}
                      onChange={() => toggleDeleteSelection(item.id)}
                      className="worldbook-modal-item-checkbox"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="worldbook-modal-item-details">
                      <div className="worldbook-modal-item-name-text">
                        {item.name || `条目 #${item.id}`}
                      </div>
                      <div className="worldbook-modal-item-info-text">
                        <span>状态: {item.enabled ? '启用' : '禁用'}</span>
                        <span>•</span>
                        <span>模式: {item.mode || 'always'}</span>
                        <span>•</span>
                        <span>位置: {item.position || 'before_char'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="worldbook-modal-footer-section">
                <div className="worldbook-modal-count-text">
                  已选择 {selectedForDeletion.size} 个条目
                </div>
                <div className="worldbook-modal-action-buttons">
                  <button
                    className="worldbook-modal-cancel-btn"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    取消
                  </button>
                  <button
                    className={`worldbook-modal-confirm-btn ${selectedForDeletion.size > 0 ? 'worldbook-modal-confirm-enabled' : 'worldbook-modal-confirm-disabled'}`}
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
    </div>
  )
}

// 内嵌正则规则面板组件
interface EmbeddedRegexRulesProps {
  regexRules: any[];
  onSave: (updatedRules: any[]) => void;
  title?: string;
}

interface SortableEmbeddedRegexRuleProps {
  rule: any;
  index: number;
  isEnabled: boolean;
  expandedRule: string | null;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onExpand: (id: string) => void;
  onUpdate: (id: string, updatedRule: any) => Promise<void>;
  onDelete: (id: string) => void;
}

function SortableEmbeddedRegexRule({
  rule,
  index,
  isEnabled,
  expandedRule,
  onToggle,
  onExpand,
  onUpdate,
  onDelete,
}: SortableEmbeddedRegexRuleProps) {
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
    opacity: isDragging ? 0.5 : 1,
  }

  const [editedRule, setEditedRule] = useState(rule);

  useEffect(() => {
    setEditedRule(rule);
  }, [rule]);

  const handleInputChange = useCallback((field: string, value: string | string[]) => {
    setEditedRule((prev: any) => ({ ...prev, [field]: value }));
  }, []);

  const handleBlur = useCallback(async (field: string) => {
    await onUpdate(rule.id, editedRule);
  }, [editedRule, rule.id, onUpdate]);

  // 实时保存复选框更改
  const handleCheckboxChange = useCallback(async (field: string, target: string, checked: boolean) => {
    let newValues: string[];
    const currentValues = editedRule[field] || [];
    
    if (checked) {
      newValues = [...currentValues, target];
    } else {
      newValues = currentValues.filter((v: string) => v !== target);
    }
    
    const updatedRule = { ...editedRule, [field]: newValues };
    setEditedRule(updatedRule);
    await onUpdate(rule.id, updatedRule);
  }, [editedRule, rule.id, onUpdate]);

  return (
    <div ref={setNodeRef} style={style}>
      <motion.div
        className={`embedded-regex-item-container embedded-regex-item-hover ${isEnabled ? '' : 'disabled'}`}
        onClick={() => onExpand(rule.id)}
      >
        <div
          {...attributes}
          {...listeners}
          className="embedded-regex-drag-handle"
          title="拖拽排序"
        >
          ⋮⋮
        </div>
        
        <div className="embedded-regex-content-wrapper">
          <span className="embedded-regex-expand-icon">
            {expandedRule === rule.id ? '▼' : '▶'}
          </span>
          
          <span className={`embedded-regex-title-text ${isEnabled ? 'enabled' : 'disabled'}`}>
            {rule.name || rule.id}
          </span>
          
          {rule.placement && (
            <span className="embedded-regex-tag">
              {rule.placement}
            </span>
          )}
        </div>
        
        <label
          className="embedded-regex-toggle-container"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onToggle(rule.id, e.target.checked)}
            className="embedded-regex-toggle-input"
          />
          <span className={`embedded-regex-toggle-slider ${isEnabled ? 'enabled' : 'disabled'}`} />
          <span className={`embedded-regex-toggle-thumb ${isEnabled ? 'enabled' : 'disabled'}`} />
        </label>
      </motion.div>
      
      <AnimatePresence>
        {expandedRule === rule.id && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="sortable-regex-expanded"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sortable-regex-form-grid">
              <div className="sortable-regex-form-field">
                <label className="sortable-regex-form-label">ID</label>
                <input
                  type="text"
                  className="sortable-regex-form-input"
                  value={editedRule.id || ''}
                  onChange={(e) => handleInputChange('id', e.target.value)}
                  onBlur={() => handleBlur('id')}
                />
              </div>

              <div className="sortable-regex-form-field">
                <label className="sortable-regex-form-label">名称</label>
                <input
                  type="text"
                  className="sortable-regex-form-input"
                  value={editedRule.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  onBlur={() => handleBlur('name')}
                />
              </div>

              <div className="sortable-regex-form-field">
                <label className="sortable-regex-form-label">位置</label>
                <select
                  className="sortable-regex-form-input"
                  value={editedRule.placement || 'after_macro'}
                  onChange={(e) => handleInputChange('placement', e.target.value)}
                  onBlur={() => handleBlur('placement')}
                >
                  <option value="after_macro">宏之后</option>
                  <option value="before_macro">宏之前</option>
                </select>
              </div>
            </div>
            
            <div className="sortable-regex-form-field">
              <label className="sortable-regex-form-label">查找正则 (find_regex)</label>
              <textarea
                className="sortable-regex-textarea"
                value={editedRule.find_regex || ''}
                onChange={(e) => handleInputChange('find_regex', e.target.value)}
                onBlur={() => handleBlur('find_regex')}
                placeholder="输入正则表达式模式"
              />
            </div>

            <div className="sortable-regex-form-field">
              <label className="sortable-regex-form-label">替换正则 (replace_regex)</label>
              <textarea
                className="sortable-regex-textarea"
                value={editedRule.replace_regex || ''}
                onChange={(e) => handleInputChange('replace_regex', e.target.value)}
                onBlur={() => handleBlur('replace_regex')}
                placeholder="输入替换内容"
              />
            </div>

            <div className="sortable-regex-form-field">
              <label className="sortable-regex-form-label">目标范围 (targets)</label>
              <div className="sortable-regex-checkbox-group">
                {['user', 'assistant', 'world_book', 'preset', 'assistant_thinking'].map(target => (
                  <label key={target} className="sortable-regex-checkbox-label">
                    <input
                      type="checkbox"
                      checked={(editedRule.targets || []).includes(target)}
                      onChange={(e) => handleCheckboxChange('targets', target, e.target.checked)}
                      className="sortable-regex-checkbox"
                    />
                    <span>{target}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="sortable-regex-form-field">
              <label className="sortable-regex-form-label">视图范围 (views)</label>
              <div className="sortable-regex-checkbox-group">
                {['user_view', 'assistant_view'].map(view => (
                  <label key={view} className="sortable-regex-checkbox-label">
                    <input
                      type="checkbox"
                      checked={(editedRule.views || []).includes(view)}
                      onChange={(e) => handleCheckboxChange('views', view, e.target.checked)}
                      className="sortable-regex-checkbox"
                    />
                    <span>{view}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="sortable-regex-form-field">
              <label className="sortable-regex-form-label">描述</label>
              <textarea
                className="sortable-regex-textarea"
                value={editedRule.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
                onBlur={() => handleBlur('description')}
                placeholder="描述此正则规则的用途"
              />
            </div>
            <div className="embedded-action-buttons-container">
              <button
                className="sortable-regex-delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  const confirmDelete = confirm(`确定要删除规则 "${rule.name || rule.id}" 吗？此操作无法撤销。`)
                  if (confirmDelete) {
                    onDelete(rule.id)
                  }
                }}
                title="删除规则"
              >
                删除
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function EmbeddedRegexRules({ regexRules, onSave, title = "内嵌正则规则" }: EmbeddedRegexRulesProps) {
  const [expanded, setExpanded] = useState<boolean>(false)
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [rules, setRules] = useState<any[]>(regexRules || [])

  useEffect(() => {
    setRules(regexRules || [])
  }, [regexRules])

  const saveContent = useCallback(async (updatedRules: any[]) => {
    setRules(updatedRules);
    onSave(updatedRules);
  }, [onSave]);

  const handleRuleToggle = useCallback(async (ruleId: string, newEnabled: boolean) => {
    const updatedRules = rules.map(rule =>
      rule.id === ruleId ? { ...rule, enabled: newEnabled } : rule
    )
    await saveContent(updatedRules);
  }, [rules, saveContent]);

  const handleRuleUpdate = useCallback(async (originalId: string, updatedRule: any) => {
    const updatedRules = rules.map(rule =>
      rule.id === originalId ? updatedRule : rule
    )
    await saveContent(updatedRules);
    
    if (originalId !== updatedRule.id) {
      setExpandedRule(updatedRule.id)
    }
  }, [rules, saveContent]);

  const handleRuleExpand = useCallback((ruleId: string) => {
    setExpandedRule(expandedRule === ruleId ? null : ruleId)
  }, [expandedRule]);

  const handleAddRule = useCallback(async () => {
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

    const updatedRules = [newRule, ...rules]
    await saveContent(updatedRules);
  }, [rules, saveContent]);

  const handleDeleteRule = useCallback(async (id: string) => {
    const updatedRules = rules.filter(rule => rule.id !== id)
    await saveContent(updatedRules);
  }, [rules, saveContent]);

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set())

  const handleOpenDeleteModal = useCallback(() => {
    setSelectedForDeletion(new Set())
    setShowDeleteModal(true)
  }, []);

  const toggleDeleteSelection = useCallback((id: string) => {
    const newSelection = new Set(selectedForDeletion)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedForDeletion(newSelection)
  }, [selectedForDeletion]);

  const handleDeleteSelectedRules = useCallback(async () => {
    if (selectedForDeletion.size === 0) return

    const confirmDelete = confirm(`确定要删除选中的 ${selectedForDeletion.size} 个规则吗？此操作无法撤销。`)
    if (!confirmDelete) return

    const updatedRules = rules.filter(rule =>
      !selectedForDeletion.has(rule.id)
    )
    await saveContent(updatedRules);
    setShowDeleteModal(false)
    setSelectedForDeletion(new Set())
  }, [selectedForDeletion, rules, saveContent]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    if (active.id !== over.id) {
      const oldIndex = rules.findIndex(rule => rule.id === active.id)
      const newIndex = rules.findIndex(rule => rule.id === over.id)
      const newRules = arrayMove(rules, oldIndex, newIndex)
      
      await saveContent(newRules);
    }
  }, [rules, saveContent]);

  if (!regexRules || regexRules.length === 0) {
    return null
  }

  return (
    <div>
      <div
        className="embedded-regex-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`embedded-regex-expand-icon ${expanded ? 'embedded-regex-expand-icon-expanded' : 'embedded-regex-expand-icon-collapsed'}`}>
          ▶
        </span>
        <span>{title} ({rules.length} 条)</span>
        <div className="embedded-regex-actions">
          <button
            className="embedded-regex-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              handleAddRule()
            }}
            title="添加规则"
          >
            ➕
          </button>
          <button
            className="embedded-regex-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              handleOpenDeleteModal()
            }}
            title="删除规则"
          >
            🗑️
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="embedded-regex-container"
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              autoScroll={false}
            >
              <SortableContext
                items={rules.map(rule => rule.id)}
                strategy={verticalListSortingStrategy}
              >
                <OverlayScrollbar
                  className="embedded-regex-scrollbar-container"
                  showOnHover={true}
                  autoHide={true}
                >
                  <div className="embedded-regex-items">
                    {rules.map((rule: any, index: number) => (
                      <SortableEmbeddedRegexRule
                        key={rule.id || index}
                        rule={rule}
                        index={index}
                        isEnabled={rule.enabled === true}
                        expandedRule={expandedRule}
                        onToggle={handleRuleToggle}
                        onExpand={handleRuleExpand}
                        onUpdate={handleRuleUpdate}
                        onDelete={handleDeleteRule}
                      />
                    ))}
                  </div>
                </OverlayScrollbar>
              </SortableContext>
            </DndContext>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Delete Modal for Regex Rules */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="embedded-delete-modal-backdrop"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="embedded-delete-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="embedded-delete-modal-header-flex">
                <h3 className="embedded-delete-modal-title-text">
                  删除正则规则
                </h3>
                <button
                  className="embedded-delete-modal-close-button"
                  onClick={() => setShowDeleteModal(false)}
                >
                  ✕
                </button>
              </div>
              <p className="embedded-delete-modal-description-text">
                选择要删除的正则规则。
              </p>
              <div className="embedded-delete-modal-content-list">
                {rules.map((rule: any, index: number) => (
                  <div
                    key={rule.id || index}
                    className={`embedded-delete-modal-item-row ${selectedForDeletion.has(rule.id) ? 'selected' : ''} ${
                      index < rules.length - 1 ? 'border-bottom' : 'no-border-bottom'
                    }`}
                    onClick={() => toggleDeleteSelection(rule.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedForDeletion.has(rule.id)}
                      onChange={() => toggleDeleteSelection(rule.id)}
                      className="embedded-delete-modal-checkbox"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="embedded-delete-modal-item-info">
                      <div className="embedded-delete-modal-item-title">
                        {rule.name || rule.id}
                      </div>
                      <div className="embedded-delete-modal-item-details">
                        <span>状态: {rule.enabled ? '启用' : '禁用'}</span>
                        <span>•</span>
                        <span>位置: {rule.placement || 'after_macro'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="embedded-delete-modal-footer-flex">
                <div className="embedded-delete-modal-count-info">
                  已选择 {selectedForDeletion.size} 个规则
                </div>
                <div className="embedded-delete-modal-button-group">
                  <button
                    className="embedded-delete-modal-cancel-button"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    取消
                  </button>
                  <button
                    className={`embedded-delete-modal-confirm-button ${selectedForDeletion.size > 0 ? 'enabled' : 'disabled'}`}
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
    </div>
  )
}