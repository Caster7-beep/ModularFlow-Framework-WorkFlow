import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnimatedButton from './AnimatedButton'
import { Api } from '@/services/api'
import '@/styles/ExportModal.css'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  fileContent: any
  fileType: string
  fileName: string
  panelTitle: string
}

export default function ExportModal({
  isOpen,
  onClose,
  fileContent,
  fileType,
  fileName,
  panelTitle
}: ExportModalProps) {
  const [baseImage, setBaseImage] = useState<string | null>(null)
  const [baseImagePreview, setBaseImagePreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleExportAsJson = async () => {
    setIsProcessing(true)
    try {
      // 准备文件数据
      const files = [{
        content: typeof fileContent === 'string' ? fileContent : JSON.stringify(fileContent, null, 2),
        type: fileType,
        name: fileName
      }]

      // 调用API导出为JSON格式
      const response = await Api.embedFilesToImage(files, undefined, "json")
      
      if (response.success && response.data) {
        // 创建下载链接
        const jsonData = JSON.stringify(response.data, null, 2)
        const blob = new Blob([jsonData], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        
        // 创建下载链接并触发下载
        const a = document.createElement('a')
        a.href = url
        a.download = `${fileName.replace('.json', '')}_export.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        alert('JSON文件导出成功！')
        onClose()
      } else {
        alert(`导出失败: ${response.message || '未知错误'}`)
      }
    } catch (err) {
      console.error('导出JSON失败:', err)
      alert('导出过程中发生错误，请重试')
    }
    setIsProcessing(false)
  }

  const handleExportAsImage = async () => {
    setIsProcessing(true)
    try {
      // 准备文件数据
      const files = [{
        content: typeof fileContent === 'string' ? fileContent : JSON.stringify(fileContent, null, 2),
        type: fileType,
        name: fileName
      }]

      // 调用API嵌入到图片
      const response = await Api.embedFilesToImage(files, baseImage || undefined, "image")
      
      if (response.success && response.image_data) {
        // 创建下载链接
        const imageData = `data:image/png;base64,${response.image_data}`
        const a = document.createElement('a')
        a.href = imageData
        a.download = `${fileName.replace('.json', '')}_embedded.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        
        alert('图片文件导出成功！')
        onClose()
      } else {
        alert(`导出失败: ${response.message || '未知错误'}`)
      }
    } catch (err) {
      console.error('导出图片失败:', err)
      alert('导出过程中发生错误，请重试')
    }
    setIsProcessing(false)
  }

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
                <h4 className="export-section-title">要导出的文件</h4>
                <div className="export-file-info">
                  <div className="export-file-item">
                    <div className="export-file-icon">📄</div>
                    <div className="export-file-details">
                      <div className="export-file-name">{fileName}</div>
                      <div className="export-file-type">{panelTitle}</div>
                      <div className="export-file-size">
                        {typeof fileContent === 'string' 
                          ? `${fileContent.length} 字符`
                          : `${JSON.stringify(fileContent).length} 字符`
                        }
                      </div>
                    </div>
                  </div>
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