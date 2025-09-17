import React from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import '@/styles/AnimatedButton.css'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface AnimatedButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  loading?: boolean
  icon?: React.ReactNode
}

export default function AnimatedButton({
  variant = 'secondary',
  size = 'md',
  children,
  loading = false,
  icon,
  className = '',
  disabled,
  ...props
}: AnimatedButtonProps) {
  const baseClasses = 'animated-btn'
  const variantClasses = {
    primary: 'animated-btn--primary',
    secondary: 'animated-btn--secondary', 
    ghost: 'animated-btn--ghost',
    danger: 'animated-btn--danger'
  }
  
  const sizeClasses = {
    sm: 'animated-btn--sm',
    md: 'animated-btn--md',
    lg: 'animated-btn--lg'
  }

  const classes = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    loading && 'animated-btn--loading',
    disabled && 'animated-btn--disabled',
    className
  ].filter(Boolean).join(' ')

  return (
    <motion.button
      className={classes}
      disabled={disabled || loading}
      whileHover={disabled || loading ? {} : { scale: 1.02, y: -1 }}
      whileTap={disabled || loading ? {} : { scale: 0.98, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      {...props}
    >
      <motion.span
        className="animated-btn__content"
        initial={false}
        animate={loading ? { opacity: 0.7 } : { opacity: 1 }}
      >
        {icon && (
          <motion.span 
            className="animated-btn__icon"
            animate={loading ? { rotate: 360 } : { rotate: 0 }}
            transition={loading ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
          >
            {icon}
          </motion.span>
        )}
        {children}
      </motion.span>
      
      {loading && (
        <motion.span
          className="animated-btn__spinner"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="spinner"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          />
        </motion.span>
      )}
      
      <motion.div
        className="animated-btn__ripple"
        initial={{ scale: 0, opacity: 0.6 }}
        animate={{ scale: 0 }}
        whileTap={disabled || loading ? {} : { 
          scale: [0, 1.2], 
          opacity: [0.6, 0] 
        }}
        transition={{ duration: 0.4 }}
      />
    </motion.button>
  )
}