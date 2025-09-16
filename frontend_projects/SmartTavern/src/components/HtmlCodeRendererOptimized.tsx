import React, { useEffect, useRef, useState } from 'react'
import '../styles/HtmlCodeRenderer.css'

interface HtmlCodeRendererProps {
  htmlContent: string
  isVisible?: boolean // 新增：控制是否应该渲染iframe内容
}

export default function HtmlCodeRendererOptimized({
  htmlContent,
  isVisible = true // 默认为可见
}: HtmlCodeRendererProps) {
  const sandboxRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [containerWidth, setContainerWidth] = useState<number>(0)
  const [contentDimensions, setContentDimensions] = useState<{width: number, height: number} | null>(null)
  const [iframeCreated, setIframeCreated] = useState(false)
  
  // 监听容器尺寸变化
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerWidth(rect.width)
      }
    }

    // 初始化尺寸
    updateSize()

    // 监听窗口尺寸变化
    const resizeObserver = new ResizeObserver(updateSize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    // 窗口resize事件作为备用
    window.addEventListener('resize', updateSize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [])

  // 监听iframe发送的尺寸消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'htmlDimensions') {
        const { width, height } = event.data;
        setContentDimensions({ width, height });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // 基于可见性和HTML内容创建或销毁iframe
  useEffect(() => {
    // 如果不可见，则卸载iframe内容
    if (!isVisible) {
      if (sandboxRef.current) {
        sandboxRef.current.innerHTML = '';
        setIframeCreated(false);
      }
      return;
    }
    
    // 如果可见且iframe尚未创建，则创建iframe
    if (isVisible && !iframeCreated) {
      setIsLoading(true);
      
      const setupSandbox = () => {
        // 直接使用HTML内容，脚本会在iframe中自然执行
        const fullHtmlContent = htmlContent.includes('<!DOCTYPE html>')
          ? htmlContent  // 如果已经是完整的HTML文档，直接使用
          : `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HTML Preview</title>
    <style>
        /* 最小化默认样式，让用户的HTML保持原有布局 */
        body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100vh;
            overflow: auto;
        }
        /* 确保用户内容可以完全展示 */
        body > * {
            max-width: 100%;
        }
    </style>
</head>
<body>
    ${htmlContent}
    
    <script>
        // 向父窗口报告实际需要的尺寸
        function reportDimensions() {
            try {
                const width = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
                const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
                
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'htmlDimensions',
                        width: width,
                        height: height,
                        source: 'html-renderer'
                    }, '*');
                }
            } catch (e) {
                console.log('Dimension reporting restricted by sandbox');
            }
        }
        
        // 监听DOM变化
        const observer = new MutationObserver(() => {
            setTimeout(reportDimensions, 100);
        });
        
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true
            });
        }
        
        // 页面加载完成后报告尺寸
        window.addEventListener('load', reportDimensions);
        window.addEventListener('resize', reportDimensions);
        
        // 初始化报告
        setTimeout(reportDimensions, 100);
    </script>
</body>
</html>`;

        const blob = new Blob([fullHtmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        // 创建iframe元素
        const iframe = document.createElement('iframe');
        iframe.className = 'html-renderer-iframe';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        // 更安全的沙箱配置：允许脚本和模态框，但不允许same-origin以防止沙箱逃逸
        iframe.sandbox.add('allow-scripts');
        iframe.sandbox.add('allow-modals');
        iframe.sandbox.add('allow-forms');
        iframe.title = 'HTML内容预览';
        iframe.src = url;
        
        // 清空容器并添加iframe
        if (sandboxRef.current) {
          sandboxRef.current.innerHTML = '';
          sandboxRef.current.appendChild(iframe);
          setIframeCreated(true);
        }
        
        // 设置iframe加载完成事件
        iframe.onload = () => {
          setIsLoading(false);
          // 释放Blob URL
          setTimeout(() => URL.revokeObjectURL(url), 100);
        };
        
        return () => {
          URL.revokeObjectURL(url);
        };
      };
      
      const cleanup = setupSandbox();
      return cleanup;
    }
  }, [htmlContent, isVisible, iframeCreated]);

  // 使用16:9比例尺寸
  const dynamicHeight = containerWidth ? (containerWidth * 16) / 9 : 400;

  // 不可见时返回一个占位符
  if (!isVisible) {
    return (
      <div 
        ref={containerRef}
        className="html-renderer-placeholder"
        style={{
          width: '100%',
          height: `${dynamicHeight}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.03)',
          borderRadius: '8px',
          border: '1px dashed rgba(0,0,0,0.1)'
        }}
      >
        <div style={{ color: 'rgba(0,0,0,0.4)', fontSize: '14px' }}>
          HTML内容（滚动到可见区域时加载）
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`html-renderer-borderless ${isLoading ? 'loading' : ''}`}
      style={{
        width: '100%',
        height: `${dynamicHeight}px`,
        maxWidth: '100%',
        position: 'relative'
      }}
    >
      <div ref={sandboxRef} className="html-sandbox"></div>
      
      {isLoading && (
        <div className="html-renderer-loading">
          <div className="html-loading-spinner"></div>
          <div className="html-loading-text">加载HTML内容中...</div>
        </div>
      )}
    </div>
  );
}