import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import '../styles/Drawer.css'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  position?: 'left' | 'right'
  width?: string
  className?: string
}

export default function Drawer({
  isOpen,
  onClose,
  title,
  children,
  position = 'right',
  width = 'w-80 md:w-96',
  className = ''
}: DrawerProps) {
  const getWidthClass = (w: string) => {
    if (w.includes('w-full')) return 'drawer-width-responsive'
    if (w.includes('w-96')) return 'drawer-width-md'
    return 'drawer-width-sm'
  }
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const slideVariants = {
    hidden: {
      x: position === 'right' ? '100%' : '-100%',
      opacity: 0
    },
    visible: {
      x: 0,
      opacity: 1
    },
    exit: {
      x: position === 'right' ? '100%' : '-100%',
      opacity: 0
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className={`drawer ${position === 'right' ? 'drawer-right' : 'drawer-left'} ${getWidthClass(width)} ${className}`}
            variants={slideVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* Header */}
            <motion.div
              className="drawer-header"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="drawer-title">{title}</h2>
              <motion.button
                className="drawer-close-btn"
                onClick={onClose}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label="关闭"
              >
                ✕
              </motion.button>
            </motion.div>

            {/* Content */}
            <motion.div
              className="drawer-content"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {children}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Mobile-friendly drawer (full width on mobile)
export function MobileDrawer(props: DrawerProps) {
  return (
    <Drawer
      {...props}
      width="w-full md:w-80 lg:w-96"
      className="drawer-width-responsive"
    />
  )
}