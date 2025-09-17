import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnimatedButton from './AnimatedButton'
import '@/styles/DeleteConfirmModal.css'

interface DeleteConfirmModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  messageIndex: number
}

export default function DeleteConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  messageIndex
}: DeleteConfirmModalProps) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        className="delete-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onCancel}
      >
        <motion.div
          className="delete-modal-content"
          initial={{ opacity: 0, scale: 0.8, y: 0 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="delete-modal-header">
            <div className="delete-modal-icon">⚠️</div>
            <h3 className="delete-modal-title">确认删除消息</h3>
          </div>

          <div className="delete-modal-body">
            <p className="delete-modal-warning">
              您确定要删除第 <strong>#{messageIndex + 1}</strong> 条消息吗？
            </p>

            <p className="delete-modal-notice">
              此操作无法撤销，消息将永久删除。
            </p>
          </div>

          <div className="delete-modal-actions">
            <AnimatedButton
              variant="secondary"
              onClick={onCancel}
              icon="❌"
            >
              取消
            </AnimatedButton>
            <AnimatedButton
              variant="danger"
              onClick={onConfirm}
              icon="🗑️"
            >
              确认删除
            </AnimatedButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}