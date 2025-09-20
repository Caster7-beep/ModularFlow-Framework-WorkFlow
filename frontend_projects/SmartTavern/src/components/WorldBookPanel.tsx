import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Api } from '@/services/api'
import OverlayScrollbar from './OverlayScrollbar'
import ExportModal from './ExportModal'
import '@/styles/WorldBookPanel.css'
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

// 可拖拽的世界书条目组件
interface SortableWorldBookItemProps {
  item: any;
  index: number;
  isEnabled: boolean;
  expandedItem: number | null;
  onToggle: (id: number, enabled: boolean) => void;
  onExpand: (id: number) => void;
  onUpdate: (id: number, updatedItem: any) => void;
}

function SortableWorldBookItem({
  item,
  index,
  isEnabled,
  expandedItem,
  onToggle,
  onExpand,
  onUpdate,
}: SortableWorldBookItemProps) {
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

  const [editedItem, setEditedItem] = useState(item);

  useEffect(() => {
    setEditedItem(item);
  }, [item]);

  const handleInputChange = (field: string, value: string | number | string[]) => {
    setEditedItem((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: string) => {
    if (item[field] === undefined && editedItem[field] === '') {
      const { [field]: _, ...rest } = editedItem;
      onUpdate(item.id, rest);
      return;
    }
    onUpdate(item.id, editedItem);
  };


  return (
    <div ref={setNodeRef} style={style}>
      <motion.div
        className={`sortable-item-container ${isEnabled ? 'enabled' : 'disabled'}`}
        whileHover={{ backgroundColor: 'var(--panel-item-hover-bg)' }}
        onClick={() => onExpand(item.id)}
      >
        <div
          {...attributes}
          {...listeners}
          className="sortable-item-drag-handle"
          title="拖拽排序"
        >
          ⋮⋮
        </div>
        
        <div className="sortable-item-main-content">
          <span className="sortable-item-expand-icon">
            {expandedItem === item.id ? '▼' : '▶'}
          </span>
          
          <span className={`sortable-item-name ${isEnabled ? 'enabled' : 'disabled'}`}>
            {item.name || `条目 #${item.id}`}
          </span>
        </div>
        
        <label
          className="sortable-item-toggle-wrapper"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onToggle(item.id, e.target.checked)}
            className="sortable-item-toggle-input"
          />
          <span className={`sortable-item-toggle-slider ${isEnabled ? 'enabled' : 'disabled'}`} />
          <span className={`sortable-item-toggle-dot ${isEnabled ? 'enabled' : 'disabled'}`} />
        </label>
      </motion.div>
      
      <AnimatePresence>
        {expandedItem === item.id && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="sortable-item-edit-area"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sortable-item-form-grid">
              <div className="sortable-item-form-field">
                <label className="sortable-item-form-label">ID</label>
                <input type="number" className="sortable-item-form-input" value={editedItem.id} readOnly />
              </div>
              <div className="sortable-item-form-field">
                <label className="sortable-item-form-label">名称</label>
                <input type="text" className="sortable-item-form-input" value={editedItem.name || ''} onChange={(e) => handleInputChange('name', e.target.value)} onBlur={() => handleBlur('name')} />
              </div>
              <div className="sortable-item-form-field">
                <label className="sortable-item-form-label">模式</label>
                <select className="sortable-item-form-input" value={editedItem.mode || 'always'} onChange={(e) => handleInputChange('mode', e.target.value)} onBlur={() => handleBlur('mode')}>
                  <option value="always">Always</option>
                  <option value="conditional">Conditional</option>
                </select>
              </div>
              <div className="sortable-item-form-field">
                <label className="sortable-item-form-label">位置</label>
                <select className="sortable-item-form-input" value={editedItem.position || 'before_char'} onChange={(e) => handleInputChange('position', e.target.value)} onBlur={() => handleBlur('position')}>
                  <option value="before_char">角色之前</option>
                  <option value="after_char">角色之后</option>
                  <option value="user">@Duser</option>
                  <option value="assistant">@Dassistant</option>
                  <option value="system">@Dsystem</option>
                </select>
              </div>
              <div className="sortable-item-form-field">
                <label className="sortable-item-form-label">顺序</label>
                <input type="number" className="sortable-item-form-input" value={editedItem.order ?? ''} onChange={(e) => handleInputChange('order', parseInt(e.target.value, 10))} onBlur={() => handleBlur('order')} />
              </div>
              <div className="sortable-item-form-field">
                <label className="sortable-item-form-label">深度</label>
                <input type="number" className="sortable-item-form-input" value={editedItem.depth ?? ''} onChange={(e) => handleInputChange('depth', parseInt(e.target.value, 10))} onBlur={() => handleBlur('depth')} />
              </div>
            </div>
            <div className="sortable-item-keys-field">
              <label className="sortable-item-keys-label">关键词 (逗号分隔)</label>
              <input type="text" className="sortable-item-keys-input" value={(editedItem.keys || []).join(',')} onChange={(e) => handleInputChange('keys', e.target.value.split(','))} onBlur={() => handleBlur('keys')} />
            </div>
            <div className="sortable-item-content-field">
              <label className="sortable-item-content-label">内容</label>
              <textarea
                className="sortable-item-content-textarea"
                value={editedItem.content || ''}
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

interface WorldBookPanelProps {
  worldBookOptions: any;
  activeConfig: any;
  onConfigChange: (configType: string, filePath: string) => void;
  loadConfigData: () => void;
}

export default function WorldBookPanel({ 
  worldBookOptions, 
  activeConfig, 
  onConfigChange,
  loadConfigData,
}: WorldBookPanelProps) {
  const [worldBookContent, setWorldBookContent] = useState<any[] | null>(null)
  const [expandedItem, setExpandedItem] = useState<number | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activeConfig?.world_books) {
      loadWorldBookContent(activeConfig.world_books);
    } else {
      setWorldBookContent(null);
    }
  }, [activeConfig?.world_books])

  const loadWorldBookContent = async (filePath: string) => {
    try {
      const contentResult = await Api.getFileContent(filePath)
      if (!contentResult.content) throw new Error('No content returned');
      const parsedContent = JSON.parse(contentResult.content)
      setWorldBookContent(parsedContent[0] || []) // API returns [[...]]
    } catch (err) {
      console.error('加载世界书内容失败:', err)
      setWorldBookContent(null)
    }
  }

  const saveContent = async (content: any[]) => {
    if (!activeConfig.world_books) return;
    try {
      await Api.saveFileContent(activeConfig.world_books, JSON.stringify([content], null, 4));
    } catch (err) {
      console.error("保存世界书失败", err);
      alert("保存失败，请重试");
    }
  }

  const handleItemToggle = async (id: number, newEnabled: boolean) => {
    if (!worldBookContent) return;
    const updatedContent = worldBookContent.map(item => item.id === id ? { ...item, enabled: newEnabled } : item);
    setWorldBookContent(updatedContent);
    await saveContent(updatedContent);
  }

  const handleItemUpdate = async (id: number, updatedItem: any) => {
    if (!worldBookContent) return;
    const updatedContent = worldBookContent.map(item => item.id === id ? updatedItem : item);
    setWorldBookContent(updatedContent);
    await saveContent(updatedContent);
  };

  const handleItemExpand = (id: number) => {
    setExpandedItem(expandedItem === id ? null : id)
  }

  const handleCreateNewFile = async () => {
    const fileName = prompt('请输入新世界书文件的名称：')
    if (!fileName) return;
    const filePath = `world_books/${fileName.endsWith('.json') ? fileName : `${fileName}.json`}`
    try {
      await Api.saveFileContent(filePath, JSON.stringify([[]], null, 4));
      await loadConfigData();
      await onConfigChange('world_books', filePath);
    } catch (err) {
      console.error('创建新世界书失败:', err);
      alert('创建失败');
    }
  }

  // 处理世界书导入
  const handleImportWorldBook = () => {
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
              "WORLDBOOK",
              file.name,
              true
            )

            if (response.success) {
              alert(`成功导入世界书文件: ${response.file.name}`)
              // 重新加载配置和世界书列表
              await loadConfigData()
              // 如果当前没有选择世界书，自动选择导入的世界书
              if (!activeConfig.world_books) {
                await onConfigChange('world_books', response.file.path)
              }
            } else {
              alert(`导入失败: ${response.message || '未知错误'}`)
            }
          } catch (err) {
            console.error('处理JSON文件失败:', err)
            alert('导入世界书失败，请确保文件格式正确')
          }
          setIsImporting(false)
        }
        reader.readAsText(file)
      } else if (file.type === 'image/png') {
        // 处理PNG图片，可能包含嵌入的世界书文件
        const reader = new FileReader()
        reader.onload = async (event) => {
          const content = event.target?.result as string
          try {
            // 使用API从图片导入文件，仅提取世界书类型
            const response = await Api.importFilesFromImage(
              content,
              ["WB"], // WB是世界书的文件类型标签
              true
            )

            if (response.success && response.files && response.files.length > 0) {
              alert(`成功从图片导入了 ${response.files.length} 个世界书文件`)
              // 重新加载配置和世界书列表
              await loadConfigData()
              // 如果当前没有选择世界书，自动选择第一个导入的世界书
              if (!activeConfig.world_books && response.files[0].path) {
                await onConfigChange('world_books', response.files[0].path)
              }
            } else {
              // 处理未找到文件或导入失败的情况
              const errorMsg = response.message || '导入失败'
              alert(`导入失败: ${errorMsg}`)
            }
          } catch (err) {
            console.error('处理PNG图片失败:', err)
            alert('从图片导入世界书失败，请确保图片包含有效的世界书文件')
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

  // 准备要导出的世界书文件
  const prepareWorldBookExport = () => {
    if (!activeConfig?.world_books || !worldBookContent) return [];
    
    // 从路径中获取文件名
    const fileName = activeConfig.world_books.split('/').pop() || 'world_book.json';
    const displayName = fileName.replace('.json', '');
    
    // 创建导出文件对象
    const exportFile = {
      content: [worldBookContent], // API返回格式为嵌套数组
      type: "WB", // 世界书文件类型标识
      name: fileName,
      displayName: displayName,
      category: "世界书",
      icon: "📚",
      selected: true,
      path: activeConfig.world_books
    };
    
    return [exportFile];
  };

  const handleExportWorldBooks = () => {
    if (!activeConfig?.world_books || !worldBookContent) return;
    
    // 打开导出模态框
    setShowExportModal(true);
  }

  const handleDeleteFile = async () => {
    if (!activeConfig?.world_books) return;
    if (!confirm(`确定删除 "${activeConfig.world_books}"?`)) return;
    try {
      await Api.deleteFile(activeConfig.world_books);
      await loadConfigData();
      await onConfigChange('world_books', '');
    } catch (err) {
      console.error('删除世界书失败:', err);
      alert('删除失败');
    }
  }

  const handleAddItem = async () => {
    if (!worldBookContent) return;
    const newItemName = prompt('请输入新条目名称:');
    if (!newItemName) return;

    const newId = worldBookContent.length > 0 ? Math.max(...worldBookContent.map(i => i.id)) + 1 : 1;
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
    };
    const updatedContent = [newItem, ...worldBookContent];
    setWorldBookContent(updatedContent);
    await saveContent(updatedContent);
  }

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<number>>(new Set())

  const handleDeleteItems = async () => {
    setSelectedForDeletion(new Set())
    setShowDeleteModal(true)
  }

  const toggleDeleteSelection = (id: number) => {
    const newSelection = new Set(selectedForDeletion)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedForDeletion(newSelection)
  }

  const handleDeleteSelectedItems = async () => {
    if (!worldBookContent || selectedForDeletion.size === 0) return

    const confirmDelete = confirm(`确定要删除选中的 ${selectedForDeletion.size} 个条目吗？此操作无法撤销。`)
    if (!confirmDelete) return

    try {
      const updatedContent = worldBookContent.filter(item =>
        !selectedForDeletion.has(item.id)
      )

      setWorldBookContent(updatedContent)
      await saveContent(updatedContent)
      setShowDeleteModal(false)
      setSelectedForDeletion(new Set())
    } catch (err) {
      console.error('删除世界书条目失败:', err)
      alert('删除世界书条目失败，请重试')
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !worldBookContent) return;

    if (active.id !== over.id) {
      const oldIndex = worldBookContent.findIndex(item => item.id === active.id)
      const newIndex = worldBookContent.findIndex(item => item.id === over.id)
      const newItems = arrayMove(worldBookContent, oldIndex, newIndex)
      setWorldBookContent(newItems);
      await saveContent(newItems);
    }
  }

  const worldBooks = worldBookOptions.world_books;

  return (
    <motion.div
      className="worldbook-panel-container"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="worldbook-panel-content">
        <div className="worldbook-panel-header">
          <span>选择世界书</span>
          <div className="worldbook-panel-buttons">
            <button className="worldbook-panel-button" onClick={handleCreateNewFile} title="添加文件">➕</button>
            <button className="worldbook-panel-button" onClick={handleImportWorldBook} title="导入世界书">📥</button>
            <button className="worldbook-panel-button" onClick={handleExportWorldBooks} title="导出世界书" disabled={!activeConfig?.world_books}>📤</button>
            <button className={`worldbook-panel-button ${activeConfig?.world_books ? 'worldbook-panel-button-active' : 'worldbook-panel-button-inactive'}`} onClick={handleDeleteFile} disabled={!activeConfig?.world_books} title="删除文件">🗑️</button>
          </div>
        </div>
        <select
          className="worldbook-panel-select"
          value={activeConfig.world_books || ''}
          onChange={(e) => onConfigChange('world_books', e.target.value)}
        >
          <option value="">未选择</option>
          {worldBooks?.files?.map((file: any) => (
            <option key={file.path} value={file.path}>{file.display_name || file.name}</option>
          ))}
        </select>
        <div className="worldbook-status-indicator">
          <div className={`worldbook-status-dot ${activeConfig.world_books ? 'active' : 'inactive'}`} />
          {activeConfig.world_books ? '已选择' : '未选择'}
        </div>

        {worldBookContent ? (
          <div className="worldbook-content-section">
            <div className="worldbook-items-header">
              <span>世界书条目 ({worldBookContent.length || 0})</span>
              <div className="worldbook-items-controls">
                <button className="worldbook-items-control-btn" onClick={handleAddItem} title="添加条目">➕</button>
                <button className="worldbook-items-control-btn" onClick={handleDeleteItems} title="删除条目">🗑️</button>
              </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} autoScroll={false}>
              <SortableContext items={worldBookContent.map(item => item.id)} strategy={verticalListSortingStrategy}>
                <OverlayScrollbar className="worldbook-scrollbar-container" showOnHover={true} autoHide={true}>
                  <div className="worldbook-items-container">
                    {worldBookContent.map((item: any, index: number) => (
                      <SortableWorldBookItem
                        key={item.id}
                        item={item}
                        index={index}
                        isEnabled={item.enabled}
                        expandedItem={expandedItem}
                        onToggle={handleItemToggle}
                        onExpand={handleItemExpand}
                        onUpdate={handleItemUpdate}
                      />
                    ))}
                  </div>
                </OverlayScrollbar>
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          <div className="worldbook-empty-state">
            {activeConfig.world_books ? '正在加载...' : '请选择世界书'}
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
            className="worldbook-modal-backdrop"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="worldbook-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="worldbook-modal-header">
                <h3 className="worldbook-modal-title">
                  删除世界书条目
                </h3>
                <button
                  className="worldbook-modal-close"
                  onClick={() => setShowDeleteModal(false)}
                >
                  ✕
                </button>
              </div>
              <p className="worldbook-modal-description">
                选择要删除的世界书条目。
              </p>
              <div className="worldbook-modal-content">
                {worldBookContent?.map((item: any, index: number) => (
                  <div
                    key={item.id}
                    className={`worldbook-modal-item ${selectedForDeletion.has(item.id) ? 'selected' : ''}`}
                    onClick={() => toggleDeleteSelection(item.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedForDeletion.has(item.id)}
                      onChange={() => toggleDeleteSelection(item.id)}
                      className="worldbook-modal-item-checkbox"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="worldbook-modal-item-info">
                      <div className="worldbook-modal-item-name">
                        {item.name || `条目 #${item.id}`}
                      </div>
                      <div className="worldbook-modal-item-details">
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
              <div className="worldbook-modal-footer">
                <div className="worldbook-modal-count">
                  已选择 {selectedForDeletion.size} 个条目
                </div>
                <div className="worldbook-modal-actions">
                  <button
                    className="worldbook-modal-button cancel"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    取消
                  </button>
                  <button
                    className={`worldbook-modal-button ${selectedForDeletion.size > 0 ? 'danger' : ''}`}
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

      {/* 导出模态框 */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        files={prepareWorldBookExport()}
        panelTitle="世界书"
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
        <div className="worldbook-import-loading">
          <div className="worldbook-import-spinner"></div>
          <div className="worldbook-import-text">正在导入文件...</div>
        </div>
      )}
    </motion.div>
  )
}