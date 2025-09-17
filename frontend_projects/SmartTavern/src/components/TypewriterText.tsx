import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import '@/styles/TypewriterText.css'

interface TypewriterTextProps {
  text: string
  speed?: number
  showCursor?: boolean
  onComplete?: () => void
  className?: string
  enableMarkdown?: boolean
}

export default function TypewriterText({
  text,
  speed = 30,
  showCursor = true,
  onComplete,
  className = '',
  enableMarkdown = true
}: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    if (currentIndex < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex])
        setCurrentIndex(prev => prev + 1)
      }, speed)

      return () => clearTimeout(timer)
    } else if (currentIndex >= text.length && !isComplete) {
      setIsComplete(true)
      onComplete?.()
    }
  }, [currentIndex, text, speed, onComplete, isComplete])

  useEffect(() => {
    // 重置状态当文本改变时
    setDisplayedText('')
    setCurrentIndex(0)
    setIsComplete(false)
  }, [text])

  const content = enableMarkdown ? (
    <ReactMarkdown 
      remarkPlugins={[remarkGfm]} 
      rehypePlugins={[rehypeHighlight]}
      className="markdown-content"
    >
      {displayedText}
    </ReactMarkdown>
  ) : (
    displayedText
  )

  return (
    <motion.div
      className={`typewriter-container ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <span className="typewriter-text">
        {content}
      </span>
      {showCursor && !isComplete && (
        <motion.span
          className="typewriter-cursor"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ 
            duration: 1, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
        >
          |
        </motion.span>
      )}
    </motion.div>
  )
}

// 用于流式响应的增强版本
interface StreamingTypewriterProps extends Omit<TypewriterTextProps, 'text'> {
  stream: string[]
  chunkDelay?: number
}

export function StreamingTypewriter({
  stream,
  speed = 20,
  chunkDelay = 100,
  showCursor = true,
  onComplete,
  className = '',
  enableMarkdown = true
}: StreamingTypewriterProps) {
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [displayedText, setDisplayedText] = useState('')
  const [isTypingChunk, setIsTypingChunk] = useState(false)

  useEffect(() => {
    if (currentChunkIndex < stream.length && !isTypingChunk) {
      setIsTypingChunk(true)
      const chunk = stream[currentChunkIndex]
      let chunkCharIndex = 0
      
      const typeChunk = () => {
        if (chunkCharIndex < chunk.length) {
          setDisplayedText(prev => prev + chunk[chunkCharIndex])
          chunkCharIndex++
          setTimeout(typeChunk, speed)
        } else {
          setIsTypingChunk(false)
          setTimeout(() => {
            setCurrentChunkIndex(prev => prev + 1)
          }, chunkDelay)
        }
      }
      
      typeChunk()
    } else if (currentChunkIndex >= stream.length) {
      onComplete?.()
    }
  }, [currentChunkIndex, stream, speed, chunkDelay, isTypingChunk, onComplete])

  useEffect(() => {
    // 重置状态当流改变时
    setCurrentChunkIndex(0)
    setDisplayedText('')
    setIsTypingChunk(false)
  }, [stream])

  const content = enableMarkdown ? (
    <ReactMarkdown 
      remarkPlugins={[remarkGfm]} 
      rehypePlugins={[rehypeHighlight]}
      className="markdown-content"
    >
      {displayedText}
    </ReactMarkdown>
  ) : (
    displayedText
  )

  const isComplete = currentChunkIndex >= stream.length && !isTypingChunk

  return (
    <motion.div
      className={`typewriter-container ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <span className="typewriter-text">
        {content}
      </span>
      {showCursor && !isComplete && (
        <motion.span
          className="typewriter-cursor"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ 
            duration: 1, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
        >
          |
        </motion.span>
      )}
    </motion.div>
  )
}