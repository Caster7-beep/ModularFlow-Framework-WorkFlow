import React, { Component, ReactNode } from 'react';
import { Result, Button, Typography, Collapse, Space } from 'antd';
import { ReloadOutlined, BugOutlined, HomeOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;
const { Panel } = Collapse;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  level?: 'page' | 'component' | 'critical';
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  errorId: string;
}

/**
 * React 错误边界组件
 * 捕获组件树中的 JavaScript 错误，防止整个应用崩溃
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorId: '',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // 更新 state 以显示降级 UI
    return {
      hasError: true,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 记录错误信息
    this.setState({
      error,
      errorInfo,
    });

    // 调用错误回调
    this.props.onError?.(error, errorInfo);

    // 记录到控制台和错误日志系统
    console.error('ErrorBoundary 捕获到错误:', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo,
      errorId: this.state.errorId,
      level: this.props.level || 'component',
      timestamp: new Date().toISOString(),
    });

    // 发送错误到监控系统
    this.reportError(error, errorInfo);
  }

  // 错误上报
  private reportError = (error: Error, errorInfo: React.ErrorInfo) => {
    try {
      // 这里可以集成第三方监控服务如 Sentry
      const errorData = {
        errorId: this.state.errorId,
        name: error.name,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        level: this.props.level || 'component',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      };

      // 发送到后端错误收集服务
      fetch('/api/v1/errors/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorData),
      }).catch((reportError) => {
        console.error('错误上报失败:', reportError);
      });
    } catch (reportError) {
      console.error('错误上报异常:', reportError);
    }
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      errorId: '',
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private getErrorLevel() {
    return this.props.level || 'component';
  }

  private renderErrorDetails() {
    const { error, errorInfo } = this.state;
    if (!this.props.showDetails || !error) return null;

    return (
      <Collapse style={{ marginTop: 16, textAlign: 'left' }}>
        <Panel header="错误详情（开发模式）" key="details">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text strong>错误信息:</Text>
              <Paragraph code copyable>
                {error.message}
              </Paragraph>
            </div>
            
            <div>
              <Text strong>错误堆栈:</Text>
              <Paragraph code copyable style={{ whiteSpace: 'pre-wrap' }}>
                {error.stack}
              </Paragraph>
            </div>
            
            {errorInfo && (
              <div>
                <Text strong>组件堆栈:</Text>
                <Paragraph code copyable style={{ whiteSpace: 'pre-wrap' }}>
                  {errorInfo.componentStack}
                </Paragraph>
              </div>
            )}
            
            <div>
              <Text strong>错误ID:</Text>
              <Paragraph code copyable>
                {this.state.errorId}
              </Paragraph>
            </div>
          </Space>
        </Panel>
      </Collapse>
    );
  }

  private renderActions() {
    const level = this.getErrorLevel();
    
    const actions = [];
    
    if (level === 'component') {
      actions.push(
        <Button key="retry" type="primary" icon={<ReloadOutlined />} onClick={this.handleRetry}>
          重试
        </Button>
      );
    }
    
    if (level === 'page' || level === 'critical') {
      actions.push(
        <Button key="reload" icon={<ReloadOutlined />} onClick={this.handleReload}>
          刷新页面
        </Button>
      );
    }
    
    if (level === 'critical') {
      actions.push(
        <Button key="home" icon={<HomeOutlined />} onClick={this.handleGoHome}>
          返回首页
        </Button>
      );
    }

    return actions;
  }

  private renderErrorUI() {
    const level = this.getErrorLevel();
    const { error } = this.state;

    // 使用自定义降级UI
    if (this.props.fallback) {
      return this.props.fallback;
    }

    // 根据错误级别显示不同的UI
    let status: 'error' | 'warning' | 'info' = 'error';
    let title = '出现了一些问题';
    let subTitle = '很抱歉，应用遇到了意外错误';

    switch (level) {
      case 'critical':
        status = 'error';
        title = '系统严重错误';
        subTitle = '应用遇到严重问题，请刷新页面或联系技术支持';
        break;
      case 'page':
        status = 'warning';
        title = '页面加载失败';
        subTitle = '页面无法正常显示，请重试或刷新页面';
        break;
      case 'component':
        status = 'info';
        title = '组件渲染失败';
        subTitle = '部分功能无法正常工作，您可以尝试重试';
        break;
    }

    return (
      <div style={{ padding: '48px 24px' }}>
        <Result
          status={status}
          title={title}
          subTitle={subTitle}
          icon={<BugOutlined />}
          extra={this.renderActions()}
        >
          <div style={{ textAlign: 'center' }}>
            <Paragraph type="secondary">
              如果问题持续出现，请联系技术支持团队
            </Paragraph>
            <Paragraph type="secondary">
              错误ID: {this.state.errorId}
            </Paragraph>
          </div>
          {this.renderErrorDetails()}
        </Result>
      </div>
    );
  }

  render() {
    if (this.state.hasError) {
      return this.renderErrorUI();
    }

    return this.props.children;
  }
}

// 高阶组件包装器
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

export default ErrorBoundary;