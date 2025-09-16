import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import HtmlCodeRendererOptimized from './HtmlCodeRendererOptimized'
import {
  parseCodeBlocks,
  extractHtmlBlocks,
  prepareMessageForRendering,
  HtmlCodeBlock,
  CodeBlock
} from '../utils/htmlCodeBlockParser'

interface MessageContentOptimizedProps {
  content: string
  className?: string
  isVisible?: boolean // 新增：控制是否应该渲染内容
}

export default function MessageContentOptimized({ 
  content, 
  className = '',
  isVisible = true // 默认为可见
}: MessageContentOptimizedProps) {
  // 使用useMemo解析消息内容，避免不必要的重新计算
  const { content: processedContent, htmlBlocks } = useMemo(() => {
    // 如果不可见，返回一个空数组，不进行解析以节省资源
    if (!isVisible) {
      return { content: '', htmlBlocks: [] as HtmlCodeBlock[] }
    }
    
    // 使用现代化方法解析消息中的代码块
    const parsedMessage = parseCodeBlocks(content)
    const htmlCodeBlocks = extractHtmlBlocks(parsedMessage)
    
    // 如果没有HTML代码块，返回原始内容
    if (htmlCodeBlocks.length === 0) {
      return { content: content, htmlBlocks: [] as HtmlCodeBlock[] }
    }
    
    // 准备用于渲染的内容格式
    return prepareMessageForRendering(parsedMessage)
  }, [content, isVisible])

  // 如果不可见，则只渲染一个占位符
  if (!isVisible) {
    return (
      <div className={`message-content-placeholder ${className}`}>
        {/* 内容占位符，不渲染实际内容 */}
      </div>
    )
  }

  // 如果没有HTML代码块，直接使用ReactMarkdown渲染
  if (htmlBlocks.length === 0) {
    return (
      <div className={`message-content ${className}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            // 自定义渲染组件以适应楼层样式
            p: ({ children }) => <div className="floor-paragraph">{children}</div>,
            pre: ({ children }) => <div className="floor-code-block">{children}</div>,
            blockquote: ({ children }) => <div className="floor-quote">{children}</div>
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    )
  }

  // 处理包含HTML代码块的内容
  return (
    <div className={`message-content ${className}`}>
      <EnhancedContentRendererOptimized
        content={processedContent}
        htmlBlocks={htmlBlocks}
        isVisible={isVisible}
      />
    </div>
  )
}

interface EnhancedContentRendererProps {
  content: string
  htmlBlocks: HtmlCodeBlock[]
  isVisible?: boolean
}

function EnhancedContentRendererOptimized({ 
  content, 
  htmlBlocks,
  isVisible = true
}: EnhancedContentRendererProps) {
  // 将内容按HTML块占位符分割
  const parts = content.split(/\{\{HTML_BLOCK_\d+\}\}/g)
  const placeholders = content.match(/\{\{HTML_BLOCK_(\d+)\}\}/g) || []
  
  return (
    <>
      {parts.map((part, index) => (
        <React.Fragment key={`content-part-${index}`}>
          {/* 渲染普通文本内容 */}
          {part.trim() && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                p: ({ children }) => <div className="floor-paragraph">{children}</div>,
                pre: ({ children }) => <div className="floor-code-block">{children}</div>,
                blockquote: ({ children }) => <div className="floor-quote">{children}</div>
              }}
            >
              {part}
            </ReactMarkdown>
          )}
          
          {/* 渲染HTML代码块，传递isVisible属性 */}
          {index < placeholders.length && (() => {
            const placeholder = placeholders[index]
            const blockIndexMatch = placeholder.match(/HTML_BLOCK_(\d+)/)
            
            if (blockIndexMatch) {
              const blockIndex = parseInt(blockIndexMatch[1])
              const htmlBlock = htmlBlocks[blockIndex]
              
              if (htmlBlock) {
                return (
                  <HtmlCodeRendererOptimized
                    key={`html-${htmlBlock.id}`}
                    htmlContent={htmlBlock.content}
                    isVisible={isVisible}
                  />
                )
              }
            }
            return null
          })()}
        </React.Fragment>
      ))}
    </>
  )
}