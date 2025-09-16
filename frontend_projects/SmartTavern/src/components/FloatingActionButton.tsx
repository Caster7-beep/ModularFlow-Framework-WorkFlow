import React from 'react'
import { motion } from 'framer-motion'
import '../styles/FloatingActionButton.css'

interface FloatingActionButtonProps {
  onClick: () => void
  icon: React.ReactNode
  label: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function FloatingActionButton({
  onClick,
  icon,
  label,
  position = 'bottom-right',
  className = '',
  size = 'md'
}: FloatingActionButtonProps) {
  return (
    <motion.button
      className={`floating-action-btn floating-action-btn-${size} floating-action-btn-${position} ${className}`}
      onClick={onClick}
      whileHover={{
        scale: 1.1,
        boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)'
      }}
      whileTap={{ scale: 0.95 }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
        delay: 0.5
      }}
      title={label}
      aria-label={label}
    >
      <motion.div
        className="floating-action-btn-icon"
        whileHover={{ rotate: 15 }}
        transition={{ duration: 0.2 }}
      >
        {icon}
      </motion.div>
      
      {/* Tooltip */}
      <motion.div
        className="floating-action-btn-tooltip"
        whileHover={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {label}
      </motion.div>
    </motion.button>
  )
}

// Multiple floating buttons container
interface FloatingButtonGroupProps {
  children: React.ReactNode
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
}

export function FloatingButtonGroup({
  children,
  position = 'bottom-right'
}: FloatingButtonGroupProps) {
  return (
    <motion.div
      className={`floating-button-group-base floating-button-group-${position}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      {children}
    </motion.div>
  )
}