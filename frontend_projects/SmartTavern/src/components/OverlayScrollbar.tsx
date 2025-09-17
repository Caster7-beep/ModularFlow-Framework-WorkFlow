import React, { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import '@/styles/OverlayScrollbar.css'

interface OverlayScrollbarProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  maxHeight?: string | number
  trackColor?: string
  thumbColor?: string
  thumbHoverColor?: string
  thumbActiveColor?: string
  trackWidth?: number
  showOnHover?: boolean
  autoHide?: boolean
  autoHideDelay?: number
  onMouseEnterContainer?: () => void
  onMouseLeaveContainer?: () => void
}

export default function OverlayScrollbar({
  children,
  className = '',
  style = {},
  maxHeight,
  trackColor = 'rgba(255, 255, 255, 0.1)',
  thumbColor = 'rgba(59, 130, 246, 0.6)',
  thumbHoverColor = 'rgba(59, 130, 246, 0.8)',
  thumbActiveColor = 'rgba(59, 130, 246, 1)',
  trackWidth = 8,
  showOnHover = true,
  autoHide = true,
  autoHideDelay = 1500,
  onMouseEnterContainer,
  onMouseLeaveContainer
}: OverlayScrollbarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  
  const [isVisible, setIsVisible] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [thumbHeight, setThumbHeight] = useState(0)
  const [thumbTop, setThumbTop] = useState(0)
  const [isScrollable, setIsScrollable] = useState(false)
  
  const hideTimeoutRef = useRef<number | undefined>()
  const resizeObserverRef = useRef<ResizeObserver>()

  // 计算滚动条位置和大小
  const updateScrollbar = useCallback(() => {
    if (!containerRef.current || !contentRef.current) return

    const container = containerRef.current
    const content = contentRef.current
    
    const containerHeight = container.clientHeight
    const contentHeight = content.scrollHeight
    const scrollTop = container.scrollTop

    // 判断是否可滚动
    const scrollable = contentHeight > containerHeight
    setIsScrollable(scrollable)

    if (!scrollable) {
      setIsVisible(false)
      return
    }

    // 计算滑块高度（最小20px）
    const calculatedThumbHeight = Math.max(
      20,
      (containerHeight / contentHeight) * containerHeight
    )
    setThumbHeight(calculatedThumbHeight)

    // 计算滑块位置
    const maxScrollTop = contentHeight - containerHeight
    const scrollPercentage = maxScrollTop > 0 ? scrollTop / maxScrollTop : 0
    const maxThumbTop = containerHeight - calculatedThumbHeight
    const calculatedThumbTop = scrollPercentage * maxThumbTop
    setThumbTop(calculatedThumbTop)

    // 显示滚动条
    if (!showOnHover || isHovering || isDragging) {
      setIsVisible(true)
    }
  }, [showOnHover, isHovering, isDragging])

  // 处理滚动事件
  const handleScroll = useCallback(() => {
    updateScrollbar()
    
    // 滚动时显示滚动条
    if (isScrollable) {
      setIsVisible(true)
      
      // 清除之前的隐藏定时器
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current)
        hideTimeoutRef.current = undefined
      }
      
      // 如果启用自动隐藏且不是悬停/拖拽状态，设置自动隐藏
      if (autoHide && !isHovering && !isDragging) {
        hideTimeoutRef.current = window.setTimeout(() => {
          if (!isHovering && !isDragging) {
            setIsVisible(false)
          }
        }, autoHideDelay)
      }
    }
  }, [updateScrollbar, autoHide, isScrollable, isHovering, isDragging, autoHideDelay])

  // 处理鼠标悬停
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true)
    if (isScrollable) {
      setIsVisible(true)
    }
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = undefined
    }
    onMouseEnterContainer?.()
  }, [isScrollable, onMouseEnterContainer])

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false)
    if (autoHide && !isDragging && isScrollable) {
      hideTimeoutRef.current = window.setTimeout(() => {
        setIsVisible(false)
      }, autoHideDelay)
    }
    onMouseLeaveContainer?.()
  }, [autoHide, isDragging, isScrollable, autoHideDelay, onMouseLeaveContainer])

  // 处理拖拽
  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    setIsDragging(true)
    const startY = e.clientY
    const startThumbTop = thumbTop
    const container = containerRef.current
    const content = contentRef.current

    if (!container || !content) return

    const containerHeight = container.clientHeight
    const contentHeight = content.scrollHeight
    const maxScrollTop = contentHeight - containerHeight
    const maxThumbTop = containerHeight - thumbHeight

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startY
      const newThumbTop = Math.max(0, Math.min(maxThumbTop, startThumbTop + deltaY))
      
      const scrollPercentage = maxThumbTop > 0 ? newThumbTop / maxThumbTop : 0
      const newScrollTop = scrollPercentage * maxScrollTop
      
      container.scrollTop = newScrollTop
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
  }, [thumbTop, thumbHeight])

  // 处理轨道点击
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const container = containerRef.current
    const content = contentRef.current
    const track = trackRef.current

    if (!container || !content || !track) return

    const trackRect = track.getBoundingClientRect()
    const clickY = e.clientY - trackRect.top
    const containerHeight = container.clientHeight
    const contentHeight = content.scrollHeight
    const maxScrollTop = contentHeight - containerHeight

    // 计算点击位置对应的滚动位置
    const scrollPercentage = clickY / containerHeight
    const newScrollTop = Math.max(0, Math.min(maxScrollTop, scrollPercentage * maxScrollTop))
    
    // 平滑滚动到目标位置
    container.scrollTo({
      top: newScrollTop,
      behavior: 'smooth'
    })
  }, [])

  // 设置ResizeObserver来监听尺寸变化
  useEffect(() => {
    if (!containerRef.current || !contentRef.current) return

    const container = containerRef.current
    const content = contentRef.current

    resizeObserverRef.current = new ResizeObserver(() => {
      updateScrollbar()
    })

    resizeObserverRef.current.observe(container)
    resizeObserverRef.current.observe(content)

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
      }
    }
  }, [updateScrollbar])

  // 初始化和清理
  useEffect(() => {
    updateScrollbar()

    return () => {
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current)
        hideTimeoutRef.current = undefined
      }
    }
  }, [updateScrollbar])

  // 添加滚动事件监听器
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll)
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  return (
    <div
      className={`overlay-scrollbar-container ${className}`}
      style={{
        ...style,
        ...(maxHeight ? { maxHeight } : {})
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 内容容器 */}
      <div
        ref={containerRef}
        className={`hide-native-scrollbar ${isScrollable ? 'overlay-scrollbar-content scrollable' : 'overlay-scrollbar-content'}`}
        style={{
          paddingRight: isScrollable ? trackWidth + 2 : 0,
          marginRight: isScrollable ? -(trackWidth + 2) : 0,
        }}
      >
        <div ref={contentRef}>
          {children}
        </div>
      </div>

      {/* 自定义滚动条 */}
      <AnimatePresence>
        {isScrollable && isVisible && (
          <motion.div
            ref={trackRef}
            className="overlay-scrollbar-track"
            style={{
              width: trackWidth,
              backgroundColor: trackColor,
              borderRadius: trackWidth / 2,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={handleTrackClick}
          >
            {/* 滑块 */}
            <motion.div
              ref={thumbRef}
              className={`overlay-scrollbar-thumb ${isDragging ? 'dragging dragging-shadow' : 'default-shadow'}`}
              style={{
                width: trackWidth,
                height: thumbHeight,
                backgroundColor: isDragging ? thumbActiveColor : isHovering ? thumbHoverColor : thumbColor,
                borderRadius: trackWidth / 2,
                transform: `translateY(${thumbTop}px)`
              }}
              onMouseDown={handleThumbMouseDown}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}