import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import HtmlCodeRenderer from './HtmlCodeRenderer'
import {
  parseCodeBlocks,
  extractHtmlBlocks,
  prepareMessageForRendering,
  HtmlCodeBlock,
  CodeBlock
} from '../utils/htmlCodeBlockParser'

interface MessageContentProps {
  content: string
  className?: string
}

export default function MessageContent({ content, className = '' }: MessageContentProps) {
  // 使用useMemo解析消息内容，避免不必要的重新计算
  const { content: processedContent, htmlBlocks } = useMemo(() => {
    // 使用现代化方法解析消息中的代码块
    const parsedMessage = parseCodeBlocks(content)
    const htmlCodeBlocks = extractHtmlBlocks(parsedMessage)
    
    // 如果没有HTML代码块，返回原始内容
    if (htmlCodeBlocks.length === 0) {
      return { content: content, htmlBlocks: [] as HtmlCodeBlock[] }
    }
    
    // 准备用于渲染的内容格式
    return prepareMessageForRendering(parsedMessage)
  }, [content])

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
      <EnhancedContentRenderer
        content={processedContent}
        htmlBlocks={htmlBlocks}
      />
    </div>
  )
}

interface EnhancedContentRendererProps {
  content: string
  htmlBlocks: HtmlCodeBlock[]
}

function EnhancedContentRenderer({ content, htmlBlocks }: EnhancedContentRendererProps) {
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
          
          {/* 渲染HTML代码块 */}
          {index < placeholders.length && (() => {
            const placeholder = placeholders[index]
            const blockIndexMatch = placeholder.match(/HTML_BLOCK_(\d+)/)
            
            if (blockIndexMatch) {
              const blockIndex = parseInt(blockIndexMatch[1])
              const htmlBlock = htmlBlocks[blockIndex]
              
              if (htmlBlock) {
                return (
                  <HtmlCodeRenderer
                    key={`html-${htmlBlock.id}`}
                    htmlContent={htmlBlock.content}
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