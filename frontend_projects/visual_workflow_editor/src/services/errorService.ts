import { message } from 'antd';
import type { WebSocketMessage } from './api';

export type ErrorLevelType = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export const ERROR_LEVEL = {
  TRACE: 'trace' as const,
  DEBUG: 'debug' as const,
  INFO: 'info' as const,
  WARN: 'warn' as const,
  ERROR: 'error' as const,
  FATAL: 'fatal' as const,
} as const;

export interface ErrorReport {
  id: string;
  level: ErrorLevelType;
  category: 'runtime' | 'network' | 'component' | 'workflow' | 'websocket';
  title: string;
  message: string;
  stack?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  timestamp: string;
  userAgent: string;
  context?: Record<string, any>;
  userId?: string;
  sessionId: string;
}

export interface ErrorContext {
  workflowId?: string;
  nodeId?: string;
  executionId?: string;
  component?: string;
  action?: string;
  data?: any;
}

/**
 * 全局错误处理服务
 */
class ErrorService {
  private errorQueue: ErrorReport[] = [];
  private retryQueue: (() => Promise<void>)[] = [];
  private sessionId: string;
  private isOnline: boolean = true;
  private maxQueueSize: number = 100;
  private reportEndpoint: string = '/api/v1/errors/report';

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeGlobalHandlers();
    this.initializeNetworkStatusListener();
  }

  /**
   * 初始化全局错误处理器
   */
  private initializeGlobalHandlers() {
    // 捕获 JavaScript 运行时错误
    window.addEventListener('error', this.handleWindowError.bind(this));
    
    // 捕获未处理的 Promise 错误
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));
    
    // 捕获资源加载错误
    window.addEventListener('error', this.handleResourceError.bind(this), true);
    
    // 页面卸载时上报剩余错误
    window.addEventListener('beforeunload', this.flushErrors.bind(this));
  }

  /**
   * 初始化网络状态监听器
   */
  private initializeNetworkStatusListener() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processErrorQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  /**
   * 处理 window.onerror
   */
  private handleWindowError(event: ErrorEvent) {
    this.reportError({
      level: ERROR_LEVEL.ERROR,
      category: 'runtime',
      title: 'JavaScript运行时错误',
      message: event.message,
      stack: event.error?.stack,
      url: event.filename,
      lineNumber: event.lineno,
      columnNumber: event.colno,
    });
  }

  /**
   * 处理未捕获的 Promise 错误
   */
  private handleUnhandledRejection(event: PromiseRejectionEvent) {
    const error = event.reason;
    let message = '未处理的 Promise 错误';
    let stack: string | undefined;

    if (error instanceof Error) {
      message = error.message;
      stack = error.stack;
    } else if (typeof error === 'string') {
      message = error;
    } else {
      message = JSON.stringify(error);
    }

    this.reportError({
      level: ERROR_LEVEL.ERROR,
      category: 'runtime',
      title: 'Promise错误',
      message,
      stack,
    });
  }

  /**
   * 处理资源加载错误
   */
  private handleResourceError(event: Event) {
    const target = event.target as HTMLElement | null;
    
    if (target && target.tagName) {
      this.reportError({
        level: ERROR_LEVEL.WARN,
        category: 'runtime',
        title: '资源加载失败',
        message: `无法加载资源: ${(target as any).src || (target as any).href || target.tagName}`,
        url: window.location.href,
      });
    }
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 上报错误
   */
  public reportError(errorData: Partial<ErrorReport>, context?: ErrorContext) {
    const error: ErrorReport = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level: ERROR_LEVEL.ERROR,
      category: 'runtime',
      title: '未知错误',
      message: '发生了一个未知的错误',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      ...errorData,
      context: {
        ...errorData.context,
        ...context,
        url: window.location.href,
      },
    };

    console.error('ErrorService报告错误:', error);

    // 添加到队列
    this.addToQueue(error);

    // 立即尝试上报
    if (this.isOnline) {
      this.processErrorQueue();
    }

    // 显示用户提示
    this.showUserNotification(error);

    return error.id;
  }

  /**
   * 添加错误到队列
   */
  private addToQueue(error: ErrorReport) {
    this.errorQueue.push(error);
    
    // 限制队列大小
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift();
    }
  }

  /**
   * 处理错误队列
   */
  private async processErrorQueue() {
    if (!this.isOnline || this.errorQueue.length === 0) {
      return;
    }

    const errorsToProcess = [...this.errorQueue];
    this.errorQueue = [];

    for (const error of errorsToProcess) {
      try {
        await this.sendErrorReport(error);
      } catch (sendError) {
        console.error('发送错误报告失败:', sendError);
        // 重新添加到队列
        this.errorQueue.push(error);
      }
    }
  }

  /**
   * 发送错误报告到后端
   */
  private async sendErrorReport(error: ErrorReport): Promise<void> {
    const response = await fetch(this.reportEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(error),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * 显示用户通知
   */
  private showUserNotification(error: ErrorReport) {
    // 只显示严重错误的通知
    if (error.level === ERROR_LEVEL.ERROR || error.level === ERROR_LEVEL.FATAL) {
      if (error.category === 'network') {
        message.error('网络连接异常，请检查网络设置');
      } else if (error.category === 'workflow') {
        message.error('工作流执行出错，请检查配置');
      } else {
        message.error('系统出现错误，已自动上报');
      }
    }
  }

  /**
   * 网络错误处理
   */
  public reportNetworkError(error: Error, options?: {
    url?: string;
    method?: string;
    status?: number;
    context?: ErrorContext;
  }) {
    return this.reportError({
      level: ERROR_LEVEL.ERROR,
      category: 'network',
      title: '网络请求失败',
      message: error.message,
      stack: error.stack,
      context: {
        ...options?.context,
        requestUrl: options?.url,
        requestMethod: options?.method,
        responseStatus: options?.status,
      },
    }, options?.context);
  }

  /**
   * 工作流错误处理
   */
  public reportWorkflowError(error: Error, context: ErrorContext) {
    return this.reportError({
      level: ERROR_LEVEL.ERROR,
      category: 'workflow',
      title: '工作流执行错误',
      message: error.message,
      stack: error.stack,
    }, context);
  }

  /**
   * WebSocket错误处理
   */
  public reportWebSocketError(error: Error | CloseEvent, message?: WebSocketMessage) {
    const isCloseEvent = error instanceof CloseEvent;
    
    return this.reportError({
      level: ERROR_LEVEL.WARN,
      category: 'websocket',
      title: 'WebSocket连接错误',
      message: isCloseEvent ? `WebSocket连接关闭: ${error.code} ${error.reason}` : error.message,
      stack: !isCloseEvent ? (error as Error).stack : undefined,
      context: {
        websocketMessage: message,
        closeCode: isCloseEvent ? error.code : undefined,
        closeReason: isCloseEvent ? error.reason : undefined,
      },
    });
  }

  /**
   * 组件错误处理
   */
  public reportComponentError(error: Error, errorInfo: React.ErrorInfo, component?: string) {
    return this.reportError({
      level: ERROR_LEVEL.ERROR,
      category: 'component',
      title: 'React组件错误',
      message: error.message,
      stack: error.stack,
      context: {
        component,
        componentStack: errorInfo.componentStack,
      },
    });
  }

  /**
   * 添加重试任务
   */
  public addRetryTask(task: () => Promise<void>) {
    this.retryQueue.push(task);
  }

  /**
   * 处理重试队列
   */
  public async processRetryQueue() {
    const tasksToRetry = [...this.retryQueue];
    this.retryQueue = [];

    for (const task of tasksToRetry) {
      try {
        await task();
      } catch (error) {
        console.error('重试任务失败:', error);
        if (error instanceof Error) {
          this.reportError({
            level: ERROR_LEVEL.WARN,
            category: 'runtime',
            title: '重试任务失败',
            message: error.message,
            stack: error.stack,
          });
        }
      }
    }
  }

  /**
   * 手动刷新错误队列
   */
  public async flushErrors() {
    await this.processErrorQueue();
  }

  /**
   * 获取会话信息
   */
  public getSessionInfo() {
    return {
      sessionId: this.sessionId,
      isOnline: this.isOnline,
      queueLength: this.errorQueue.length,
      retryQueueLength: this.retryQueue.length,
    };
  }
}

// 全局错误服务实例
export const errorService = new ErrorService();

export default errorService;