import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnimatedButton from './AnimatedButton'
import OverlayScrollbar from './OverlayScrollbar'
import { Api } from '@/services/api'
import '@/styles/ExportModal.css'

// 导出文件的接口定义
interface ExportFile {
  content: any
  type: string  // 文件类型标识 (例如 "PS" 预设, "CH" 角色卡, "PE" 用户信息)
  name: string  // 文件名
  displayName?: string  // 显示名称
  category?: string  // 分类（例如 "预设", "角色卡", "用户信息"）
  icon?: string  // 文件图标 (例如 "📄", "👤", "⚙️")
  selected?: boolean  // 是否被选中
  path?: string  // 文件路径（可选）
}

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  fileContent?: any  // 单文件内容 (兼容旧接口)
  fileType?: string  // 单文件类型 (兼容旧接口)
  fileName?: string  // 单文件名称 (兼容旧接口)
  files?: ExportFile[]  // 多文件数组
  panelTitle: string
}

export default function ExportModal({
  isOpen,
  onClose,
  fileContent,
  fileType,
  fileName,
  files = [],
  panelTitle
}: ExportModalProps) {
  const [baseImage, setBaseImage] = useState<string | null>(null)
  const [baseImagePreview, setBaseImagePreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [exportFiles, setExportFiles] = useState<ExportFile[]>([])
  const [fileCategories, setFileCategories] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 初始化导出文件列表和文件分类
  useEffect(() => {
    // 优先使用files参数，如果没有则使用单文件参数构造
    let processedFiles: ExportFile[] = [];
    
    if (files && files.length > 0) {
      processedFiles = files.map(file => ({
        ...file,
        selected: file.selected !== undefined ? file.selected : true
      }));
    } else if (fileContent && fileType && fileName) {
      processedFiles = [{
        content: fileContent,
        type: fileType,
        name: fileName,
        category: panelTitle,
        selected: true
      }];
    }
    
    // 计算文件分类
    const categories = new Set<string>();
    processedFiles.forEach(file => {
      if (file.category) {
        categories.add(file.category);
      }
    });
    
    setExportFiles(processedFiles);
    setFileCategories(categories);
  }, [files, fileContent, fileType, fileName, panelTitle]);

  if (!isOpen) return null

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result as string
      setBaseImage(result)
      setBaseImagePreview(result)
    }
    reader.readAsDataURL(file)
  }

  const handleSelectImage = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleRemoveImage = () => {
    setBaseImage(null)
    setBaseImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 切换文件选择状态
  const toggleFileSelection = (index: number) => {
    setExportFiles(prev => {
      const newFiles = [...prev];
      newFiles[index] = {
        ...newFiles[index],
        selected: !newFiles[index].selected
      };
      return newFiles;
    });
  };

  // 切换全选/取消全选
  const toggleSelectAll = (selected: boolean) => {
    setExportFiles(prev => prev.map(file => ({
      ...file,
      selected
    })));
  };

  // 处理导出为JSON
  const handleExportAsJson = async () => {
    setIsProcessing(true);
    try {
      // 获取选中的文件
      const selectedFiles = exportFiles.filter(file => file.selected).map(file => ({
        content: typeof file.content === 'string' ? file.content : JSON.stringify(file.content, null, 2),
        type: file.type,
        name: file.name
      }));

      if (selectedFiles.length === 0) {
        alert('请至少选择一个文件进行导出');
        setIsProcessing(false);
        return;
      }

      // 调用API导出为JSON格式
      const response = await Api.embedFilesToImage(selectedFiles, undefined, "json");
      
      if (response.success && response.data) {
        // 创建下载链接
        const jsonData = JSON.stringify(response.data, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // 生成下载文件名
        const downloadName = selectedFiles.length === 1
          ? `${selectedFiles[0].name.replace('.json', '')}_export.json`
          : `${panelTitle}_bundle_export.json`;
        
        // 创建下载链接并触发下载
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('JSON文件导出成功！');
        onClose();
      } else {
        alert(`导出失败: ${response.message || '未知错误'}`);
      }
    } catch (err) {
      console.error('导出JSON失败:', err);
      alert('导出过程中发生错误，请重试');
    }
    setIsProcessing(false);
  };

  // 处理导出为图片
  const handleExportAsImage = async () => {
    setIsProcessing(true);
    try {
      // 获取选中的文件
      const selectedFiles = exportFiles.filter(file => file.selected).map(file => ({
        content: typeof file.content === 'string' ? file.content : JSON.stringify(file.content, null, 2),
        type: file.type,
        name: file.name
      }));

      if (selectedFiles.length === 0) {
        alert('请至少选择一个文件进行导出');
        setIsProcessing(false);
        return;
      }

      // 调用API嵌入到图片
      const response = await Api.embedFilesToImage(selectedFiles, baseImage || undefined, "image");
      
      if (response.success && response.image_data) {
        // 创建下载链接
        const imageData = `data:image/png;base64,${response.image_data}`;
        const a = document.createElement('a');
        a.href = imageData;
        
        // 生成下载文件名
        const downloadName = selectedFiles.length === 1
          ? `${selectedFiles[0].name.replace('.json', '')}_embedded.png`
          : `${panelTitle}_bundle_embedded.png`;
        
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        alert('图片文件导出成功！');
        onClose();
      } else {
        alert(`导出失败: ${response.message || '未知错误'}`);
      }
    } catch (err) {
      console.error('导出图片失败:', err);
      alert('导出过程中发生错误，请重试');
    }
    setIsProcessing(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="export-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          className="export-modal-content"
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="export-modal-header">
            <div className="export-modal-icon">📤</div>
            <h3 className="export-modal-title">导出{panelTitle}</h3>
            <button
              className="export-modal-close"
              onClick={onClose}
              disabled={isProcessing}
            >
              ✕
            </button>
          </div>

          <div className="export-modal-body">
            <div className="export-modal-section">
              <div className="export-section-left">
                <h4 className="export-section-title">基础图片 (可选)</h4>
                <div className="export-image-upload-area">
                  {baseImagePreview ? (
                    <div className="export-image-preview">
                      <img 
                        src={baseImagePreview} 
                        alt="预览图片" 
                        className="export-preview-image"
                      />
                      <div className="export-image-actions">
                        <button 
                          className="export-image-action-btn"
                          onClick={handleSelectImage}
                          disabled={isProcessing}
                        >
                          更换
                        </button>
                        <button 
                          className="export-image-action-btn remove"
                          onClick={handleRemoveImage}
                          disabled={isProcessing}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="export-image-placeholder" onClick={handleSelectImage}>
                      <div className="export-placeholder-icon">🖼️</div>
                      <div className="export-placeholder-text">
                        点击选择图片
                      </div>
                      <div className="export-placeholder-hint">
                        可选：选择一张PNG图片作为载体
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="export-section-right">
                <div className="export-files-header">
                  <h4 className="export-section-title">要导出的文件</h4>
                  <div className="export-files-actions">
                    <button
                      className="export-select-all-btn"
                      onClick={() => toggleSelectAll(true)}
                      title="全选"
                    >
                      全选
                    </button>
                    <button
                      className="export-select-none-btn"
                      onClick={() => toggleSelectAll(false)}
                      title="取消全选"
                    >
                      取消全选
                    </button>
                  </div>
                </div>
                
                <div className="export-files-list">
                  {exportFiles.length > 0 ? (
                    <OverlayScrollbar
                      className="export-files-scrollbar"
                      showOnHover={true}
                      autoHide={true}
                    >
                      {/* 按类别分组显示文件 */}
                      {Array.from(fileCategories).map(category => {
                        // 获取当前类别的文件
                        const categoryFiles = exportFiles.filter(file => file.category === category);
                        
                        // 检查该类别的所有文件是否都被选中
                        const allSelected = categoryFiles.every(file => file.selected);
                        const anySelected = categoryFiles.some(file => file.selected);
                        
                        // 如果该类别没有文件，则跳过
                        if (categoryFiles.length === 0) return null;
                        
                        return (
                          <div key={category} className="export-files-category">
                            <div className="export-category-header">
                              <div className="export-category-info">
                                <span className="export-category-icon">
                                  {category === "角色卡" ? "👤" :
                                   category === "用户信息" ? "👥" :
                                   category === "预设" ? "📝" : "📁"}
                                </span>
                                <span className="export-category-title">{category}</span>
                                <span className="export-category-count">({categoryFiles.length})</span>
                              </div>
                              <div className="export-category-actions">
                                <button
                                  className={`export-category-select-btn ${allSelected ? 'selected' : anySelected ? 'partial' : ''}`}
                                  onClick={() => {
                                    // 如果全部选中，则取消全选；否则全选
                                    const newSelected = !allSelected;
                                    setExportFiles(prev =>
                                      prev.map(file =>
                                        file.category === category
                                          ? {...file, selected: newSelected}
                                          : file
                                      )
                                    );
                                  }}
                                >
                                  {allSelected ? '取消全选' : '全选'}
                                </button>
                              </div>
                            </div>
                            
                            <div className="export-category-files">
                              {categoryFiles.map((file, index) => {
                                // 根据文件类型设置图标
                                let fileIcon = "📄";
                                if (file.icon) {
                                  fileIcon = file.icon;
                                } else if (file.type === "CH") {
                                  fileIcon = "👤";
                                } else if (file.type === "PE") {
                                  fileIcon = "👥";
                                } else if (file.type === "PS") {
                                  fileIcon = "📝";
                                }
                                
                                // 获取文件在整个列表中的索引
                                const globalIndex = exportFiles.findIndex(f =>
                                  f.path === file.path && f.name === file.name);
                                
                                return (
                                  <div
                                    key={globalIndex}
                                    className={`export-file-item ${file.selected ? 'selected' : ''}`}
                                    onClick={() => toggleFileSelection(globalIndex)}
                                  >
                                    <input
                                      type="checkbox"
                                      className="export-file-checkbox"
                                      checked={file.selected || false}
                                      onChange={() => toggleFileSelection(globalIndex)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <div className="export-file-icon">{fileIcon}</div>
                                    <div className="export-file-details">
                                      <div className="export-file-name">{file.displayName || file.name}</div>
                                      <div className="export-file-size">
                                        {typeof file.content === 'string'
                                          ? `${file.content.length} 字符`
                                          : `${JSON.stringify(file.content).length} 字符`
                                        }
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* 显示未分类文件 */}
                      {exportFiles.filter(file => !file.category).length > 0 && (
                        <div className="export-files-category">
                          <div className="export-category-header">
                            <span className="export-category-title">其他文件</span>
                            <span className="export-category-count">
                              ({exportFiles.filter(file => !file.category).length})
                            </span>
                          </div>
                          
                          <div className="export-category-files">
                            {exportFiles.filter(file => !file.category).map((file, index) => {
                              const globalIndex = exportFiles.findIndex(f => f === file);
                              return (
                                <div
                                  key={globalIndex}
                                  className={`export-file-item ${file.selected ? 'selected' : ''}`}
                                  onClick={() => toggleFileSelection(globalIndex)}
                                >
                                  <input
                                    type="checkbox"
                                    className="export-file-checkbox"
                                    checked={file.selected || false}
                                    onChange={() => toggleFileSelection(globalIndex)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <div className="export-file-icon">📄</div>
                                  <div className="export-file-details">
                                    <div className="export-file-name">{file.displayName || file.name}</div>
                                    <div className="export-file-size">
                                      {typeof file.content === 'string'
                                        ? `${file.content.length} 字符`
                                        : `${JSON.stringify(file.content).length} 字符`
                                      }
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </OverlayScrollbar>
                  ) : (
                    <div className="export-no-files">
                      没有可导出的文件
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="export-modal-notice">
              <div className="export-notice-icon">💡</div>
              <div className="export-notice-text">
                选择导出格式：图片格式会将文件嵌入到PNG图片中，JSON格式会直接导出文件内容
              </div>
            </div>
          </div>

          <div className="export-modal-actions">
            <AnimatedButton
              variant="secondary"
              onClick={onClose}
              icon="❌"
              disabled={isProcessing}
            >
              取消
            </AnimatedButton>
            <AnimatedButton
              variant="primary"
              onClick={handleExportAsJson}
              icon="📋"
              disabled={isProcessing}
            >
              {isProcessing ? '处理中...' : '导出为JSON'}
            </AnimatedButton>
            <AnimatedButton
              variant="primary"
              onClick={handleExportAsImage}
              icon="🖼️"
              disabled={isProcessing}
            >
              {isProcessing ? '处理中...' : '导出为图片'}
            </AnimatedButton>
          </div>

          {/* 隐藏的文件输入元素 */}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="image/*"
            onChange={handleImageUpload}
          />

          {/* 处理中的加载指示器 */}
          {isProcessing && (
            <div className="export-processing-overlay">
              <div className="export-processing-spinner"></div>
              <div className="export-processing-text">正在处理...</div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}