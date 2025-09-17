import React, { useEffect, useState } from 'react';
import { notification, Button, Typography } from 'antd';
import { ExclamationCircleOutlined, CloseCircleOutlined, WarningOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { errorService, type ErrorReport, ERROR_LEVEL } from '../../services/errorService';

const { Text, Paragraph } = Typography;

interface ErrorNotificationConfig {
  showRetry?: boolean;
  autoClose?: boolean;
  duration?: number;
  showDetails?: boolean;
}

/**
 * 错误通知组件
 * 提供用户友好的错误提示
 */
class ErrorNotificationManager {
  private static instance: ErrorNotificationManager;
  private notificationIds: Set<string> = new Set();
  
  public static getInstance(): ErrorNotificationManager {
    if (!ErrorNotificationManager.instance) {
      ErrorNotificationManager.instance = new ErrorNotificationManager();
    }
    return ErrorNotificationManager.instance;
  }

  /**
   * 显示错误通知
   */
  public showError(
    error: ErrorReport,
    config: ErrorNotificationConfig = {}
  ): void {
    const {
      showRetry = false,
      autoClose = true,
      duration = 4.5,
      showDetails = false
    } = config;

    // 防止重复通知
    if (this.notificationIds.has(error.id)) {
      return;
    }
    this.notificationIds.add(error.id);

    const icon = this.getErrorIcon(error.level);
    const { title, description } = this.getErrorContent(error);
    
    const actions = [];
    
    if (showRetry) {
      actions.push(
        <Button
          key="retry"
          type="primary"
          size="small"
          onClick={() => this.handleRetry(error)}
        >
          重试
        </Button>
      );
    }

    if (showDetails && (error.stack || error.context)) {
      actions.push(
        <Button
          key="details"
          type="link"
          size="small"
          onClick={() => this.showErrorDetails(error)}
        >
          查看详情
        </Button>
      );
    }

    notification.open({
      key: error.id,
      message: title,
      description,
      icon,
      duration: autoClose ? duration : 0,
      placement: 'topRight',
      style: {
        width: 400,
      },
      btn: actions.length > 0 ? <div style={{ textAlign: 'right' }}>{actions}</div> : undefined,
      onClose: () => {
        this.notificationIds.delete(error.id);
      },
    });
  }

  /**
   * 显示成功通知
   */
  public showSuccess(message: string, description?: string): void {
    notification.success({
      message,
      description,
      duration: 3,
      placement: 'topRight',
    });
  }

  /**
   * 显示警告通知
   */
  public showWarning(message: string, description?: string): void {
    notification.warning({
      message,
      description,
      duration: 4,
      placement: 'topRight',
    });
  }

  /**
   * 显示信息通知
   */
  public showInfo(message: string, description?: string): void {
    notification.info({
      message,
      description,
      duration: 3,
      placement: 'topRight',
    });
  }

  /**
   * 显示网络错误通知
   */
  public showNetworkError(error: ErrorReport): void {
    this.showError(error, {
      showRetry: true,
      autoClose: false,
      showDetails: true,
    });
  }

  /**
   * 显示工作流错误通知
   */
  public showWorkflowError(error: ErrorReport): void {
    this.showError(error, {
      showRetry: true,
      autoClose: false,
      showDetails: true,
    });
  }

  /**
   * 显示组件错误通知
   */
  public showComponentError(error: ErrorReport): void {
    this.showError(error, {
      showRetry: false,
      autoClose: true,
      duration: 6,
      showDetails: true,
    });
  }

  /**
   * 关闭所有通知
   */
  public closeAll(): void {
    notification.destroy();
    this.notificationIds.clear();
  }

  /**
   * 关闭特定通知
   */
  public close(errorId: string): void {
    notification.destroy(errorId);
    this.notificationIds.delete(errorId);
  }

  /**
   * 获取错误图标
   */
  private getErrorIcon(level: string): React.ReactNode {
    switch (level) {
      case ERROR_LEVEL.ERROR:
      case ERROR_LEVEL.FATAL:
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case ERROR_LEVEL.WARN:
        return <WarningOutlined style={{ color: '#faad14' }} />;
      case ERROR_LEVEL.INFO:
        return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
      default:
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
    }
  }

  /**
   * 获取错误内容
   */
  private getErrorContent(error: ErrorReport): { title: string; description: React.ReactNode } {
    let title = error.title;
    let description: React.ReactNode = error.message;

    // 根据错误类别自定义内容
    switch (error.category) {
      case 'network':
        title = '网络连接错误';
        description = (
          <div>
            <Paragraph>{error.message}</Paragraph>
            <Text type="secondary">
              请检查网络连接后重试
            </Text>
          </div>
        );
        break;
      
      case 'workflow':
        title = '工作流执行错误';
        description = (
          <div>
            <Paragraph>{error.message}</Paragraph>
            {error.context?.nodeId && (
              <Text type="secondary">
                节点: {error.context.nodeId}
              </Text>
            )}
          </div>
        );
        break;
      
      case 'component':
        title = '组件错误';
        description = (
          <div>
            <Paragraph>部分功能暂时不可用</Paragraph>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {error.message}
            </Text>
          </div>
        );
        break;
      
      case 'websocket':
        title = '实时连接断开';
        description = (
          <div>
            <Paragraph>实时监控功能可能受影响</Paragraph>
            <Text type="secondary">系统将自动尝试重连</Text>
          </div>
        );
        break;
    }

    return { title, description };
  }

  /**
   * 处理重试
   */
  private handleRetry(error: ErrorReport): void {
    this.close(error.id);
    
    // 根据错误类型执行不同的重试逻辑
    switch (error.category) {
      case 'network':
        // 重试网络请求
        errorService.processRetryQueue();
        this.showInfo('正在重试...', '请稍候');
        break;
      
      case 'workflow':
        // 可以触发工作流重新执行
        this.showInfo('请手动重新执行工作流');
        break;
      
      default:
        window.location.reload();
        break;
    }
  }

  /**
   * 显示错误详情
   */
  private showErrorDetails(error: ErrorReport): void {
    const content = (
      <div style={{ maxHeight: '400px', overflow: 'auto' }}>
        <div style={{ marginBottom: '12px' }}>
          <Text strong>错误ID: </Text>
          <Text code copyable>{error.id}</Text>
        </div>
        
        <div style={{ marginBottom: '12px' }}>
          <Text strong>发生时间: </Text>
          <Text>{new Date(error.timestamp).toLocaleString()}</Text>
        </div>
        
        <div style={{ marginBottom: '12px' }}>
          <Text strong>错误级别: </Text>
          <Text>{error.level.toUpperCase()}</Text>
        </div>
        
        {error.stack && (
          <div style={{ marginBottom: '12px' }}>
            <Text strong>堆栈信息: </Text>
            <Paragraph 
              code 
              copyable
              style={{ 
                whiteSpace: 'pre-wrap', 
                fontSize: '12px',
                maxHeight: '200px',
                overflow: 'auto' 
              }}
            >
              {error.stack}
            </Paragraph>
          </div>
        )}
        
        {error.context && Object.keys(error.context).length > 0 && (
          <div>
            <Text strong>上下文信息: </Text>
            <Paragraph 
              code 
              copyable
              style={{ 
                whiteSpace: 'pre-wrap', 
                fontSize: '12px' 
              }}
            >
              {JSON.stringify(error.context, null, 2)}
            </Paragraph>
          </div>
        )}
      </div>
    );

    notification.info({
      key: `${error.id}_details`,
      message: '错误详细信息',
      description: content,
      duration: 0,
      style: { width: 600 },
      placement: 'top',
    });
  }
}

// 导出单例实例
export const errorNotification = ErrorNotificationManager.getInstance();

/**
 * React Hook 用于错误通知
 */
export const useErrorNotification = () => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      // 配置 notification 全局设置
      notification.config({
        maxCount: 5,
        rtl: false,
      });
      
      setIsInitialized(true);
    }
  }, [isInitialized]);

  return {
    showError: errorNotification.showError.bind(errorNotification),
    showSuccess: errorNotification.showSuccess.bind(errorNotification),
    showWarning: errorNotification.showWarning.bind(errorNotification),
    showInfo: errorNotification.showInfo.bind(errorNotification),
    showNetworkError: errorNotification.showNetworkError.bind(errorNotification),
    showWorkflowError: errorNotification.showWorkflowError.bind(errorNotification),
    showComponentError: errorNotification.showComponentError.bind(errorNotification),
    closeAll: errorNotification.closeAll.bind(errorNotification),
    close: errorNotification.close.bind(errorNotification),
  };
};

export default errorNotification;