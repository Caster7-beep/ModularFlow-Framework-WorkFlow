/**
 * HTML代码块解析器
 * 使用现代化方法检测和提取消息中的HTML代码块
 */

// 标准化的代码块类型
export type CodeBlockType = 'html' | 'javascript' | 'css' | 'markdown' | 'unknown';

export interface CodeBlock {
  id: string;
  content: string;
  type: CodeBlockType;
  meta?: string;
}

export interface HtmlCodeBlock extends CodeBlock {
  type: 'html';
  hasScript: boolean;
  useSandbox: boolean;
}

export interface ParsedMessage {
  blocks: (string | CodeBlock)[];
}

/**
 * 解析并识别消息中的所有代码块
 * 基于更现代的解析器，支持多种代码块类型的处理
 */
export function parseCodeBlocks(content: string): ParsedMessage {
  // 更宽松的正则表达式：支持有无语言标识符的代码块
  const codeBlockRegex = /```([a-zA-Z0-9_+-]*)?[\s]*\n?([\s\S]*?)\n?```/g;
  const blocks: (string | CodeBlock)[] = [];
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockId = 0;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [fullMatch, lang, codeContent] = match;
    const startIndex = match.index;
    
    // 添加代码块前的普通文本
    if (startIndex > lastIndex) {
      const textPart = content.slice(lastIndex, startIndex);
      blocks.push(textPart);
    }
    
    // 规范化语言类型
    const normalizedLang = normalizeLanguage(lang?.toLowerCase().trim());
    
    // 创建适当类型的代码块
    if (normalizedLang === 'html' || (!lang && isLikelyHtml(codeContent))) {
      // 分析HTML代码是否包含脚本
      const hasScript = containsScript(codeContent);
      
      blocks.push({
        id: `code-block-${blockId++}`,
        content: codeContent,
        type: 'html',
        meta: undefined,
        hasScript,
        useSandbox: true // 默认使用沙箱环境
      } as HtmlCodeBlock);
    } else if (normalizedLang !== 'unknown') {
      // 处理其他类型的代码块
      blocks.push({
        id: `code-block-${blockId++}`,
        content: codeContent,
        type: normalizedLang,
        meta: undefined
      });
    } else {
      // 未知类型，当作普通文本
      blocks.push(fullMatch);
    }
    
    lastIndex = startIndex + fullMatch.length;
  }
  
  // 添加最后剩余的文本
  if (lastIndex < content.length) {
    const remainingText = content.slice(lastIndex);
    blocks.push(remainingText);
  }
  
  return { blocks };
}

/**
 * 智能检测内容是否为HTML
 */
function isLikelyHtml(content: string): boolean {
  if (!content || typeof content !== 'string') return false;
  
  const trimmed = content.trim();
  
  // 检查是否以DOCTYPE或html标签开头
  if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html/i.test(trimmed)) {
    return true;
  }
  
  // 检查是否包含HTML标签
  const htmlTagRegex = /<\s*\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[^>]*)?\s*>/;
  if (htmlTagRegex.test(trimmed)) {
    return true;
  }
  
  // 检查常见HTML结构
  const htmlStructureRegex = /<(head|body|div|span|p|h[1-6]|ul|ol|li|table|tr|td|form|input|script|style)\b/i;
  if (htmlStructureRegex.test(trimmed)) {
    return true;
  }
  
  return false;
}

/**
 * 从解析后的消息中提取HTML代码块
 */
export function extractHtmlBlocks(parsedMessage: ParsedMessage): HtmlCodeBlock[] {
  return parsedMessage.blocks.filter(
    (block): block is HtmlCodeBlock =>
      typeof block !== 'string' && block.type === 'html'
  );
}

/**
 * 将解析后的消息转换为可渲染的格式
 */
export function prepareMessageForRendering(parsedMessage: ParsedMessage): {
  content: string;
  htmlBlocks: HtmlCodeBlock[];
} {
  const htmlBlocks: HtmlCodeBlock[] = [];
  const contentParts: string[] = [];
  
  parsedMessage.blocks.forEach((block) => {
    if (typeof block === 'string') {
      contentParts.push(block);
    } else if (block.type === 'html') {
      const htmlBlock = block as HtmlCodeBlock;
      const placeholderId = htmlBlocks.length;
      htmlBlocks.push(htmlBlock);
      contentParts.push(`{{HTML_BLOCK_${placeholderId}}}`);
    } else {
      // 将其他类型的代码块转换回Markdown格式
      contentParts.push(
        '```' + block.type + (block.meta ? ' ' + block.meta : '') + '\n' +
        block.content + '\n' +
        '```'
      );
    }
  });
  
  return {
    content: contentParts.join('\n\n'),
    htmlBlocks
  };
}

/**
 * 规范化语言标识
 */
function normalizeLanguage(lang?: string): CodeBlockType {
  if (!lang) return 'unknown';
  
  // 映射常见的语言别名
  const langMap: Record<string, CodeBlockType> = {
    'html': 'html',
    'htm': 'html',
    'xhtml': 'html',
    'js': 'javascript',
    'javascript': 'javascript',
    'jsx': 'javascript',
    'ts': 'javascript',
    'typescript': 'javascript',
    'tsx': 'javascript',
    'css': 'css',
    'scss': 'css',
    'sass': 'css',
    'less': 'css',
    'md': 'markdown',
    'markdown': 'markdown'
  };
  
  return langMap[lang] || 'unknown';
}

/**
 * 检测HTML代码中是否包含脚本
 */
function containsScript(htmlContent: string): boolean {
  // 检查明确的script标签
  const hasScriptTag = /<script\b[^>]*>([\s\S]*?)<\/script>/i.test(htmlContent);
  if (hasScriptTag) return true;
  
  // 检查可能包含脚本的事件处理属性
  const scriptEventAttributes = [
    'onclick', 'onload', 'onmouseover', 'onmouseout',
    'onkeydown', 'onkeyup', 'onkeypress', 'onchange',
    'oninput', 'onsubmit', 'onfocus', 'onblur'
  ];
  
  for (const attr of scriptEventAttributes) {
    const attrRegex = new RegExp(`\\s${attr}\\s*=\\s*["']`, 'i');
    if (attrRegex.test(htmlContent)) return true;
  }
  
  // 检查javascript: URL
  const javascriptUrl = /\bhref\s*=\s*["']javascript:/i.test(htmlContent);
  if (javascriptUrl) return true;
  
  return false;
}