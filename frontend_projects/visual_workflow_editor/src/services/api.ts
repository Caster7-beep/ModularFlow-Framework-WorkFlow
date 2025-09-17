import axios from 'axios';
import type { Workflow, WorkflowExecution, ApiResponse } from '../types/workflow';

// 创建axios实例
const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    console.error('API Error:', error);
    const message = error.response?.data?.message || error.message || '请求失败';
    return Promise.reject(new Error(message));
  }
);

// 工作流API
export const workflowApi = {
  // 获取所有工作流
  getWorkflows: (): Promise<ApiResponse<Workflow[]>> => {
    return api.get('/visual_workflow/workflows');
  },

  // 获取单个工作流
  getWorkflow: (id: string): Promise<ApiResponse<Workflow>> => {
    return api.get(`/visual_workflow/workflows/${id}`);
  },

  // 创建工作流
  createWorkflow: (workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Workflow>> => {
    return api.post('/visual_workflow/workflows', workflow);
  },

  // 更新工作流
  updateWorkflow: (id: string, workflow: Partial<Workflow>): Promise<ApiResponse<Workflow>> => {
    return api.put(`/visual_workflow/workflows/${id}`, workflow);
  },

  // 删除工作流
  deleteWorkflow: (id: string): Promise<ApiResponse<void>> => {
    return api.delete(`/visual_workflow/workflows/${id}`);
  },

  // 执行工作流
  executeWorkflow: (id: string, inputs?: Record<string, any>): Promise<ApiResponse<WorkflowExecution>> => {
    return api.post(`/visual_workflow/workflows/${id}/execute`, { inputs });
  },

  // 获取执行状态
  getExecutionStatus: (executionId: string): Promise<ApiResponse<WorkflowExecution>> => {
    return api.get(`/visual_workflow/executions/${executionId}`);
  },

  // 停止执行
  stopExecution: (executionId: string): Promise<ApiResponse<void>> => {
    return api.post(`/visual_workflow/executions/${executionId}/stop`);
  },
};

// 节点模板API
export const nodeTemplateApi = {
  // 获取节点模板
  getNodeTemplates: (): Promise<ApiResponse<any[]>> => {
    return api.get('/visual_workflow/node-templates');
  },

  // 验证节点配置
  validateNodeConfig: (nodeType: string, config: any): Promise<ApiResponse<boolean>> => {
    return api.post('/visual_workflow/validate-node', { nodeType, config });
  },
};

// LLM提供商API
export const llmApi = {
  // 获取可用的LLM提供商
  getProviders: (): Promise<ApiResponse<any[]>> => {
    return api.get('/llm/providers');
  },

  // 获取提供商的模型列表
  getModels: (provider: string): Promise<ApiResponse<string[]>> => {
    return api.get(`/llm/providers/${provider}/models`);
  },

  // 测试LLM连接
  testConnection: (provider: string, config: any): Promise<ApiResponse<boolean>> => {
    return api.post(`/llm/providers/${provider}/test`, config);
  },
};

// ========== WebSocket实时通信 ==========

export interface WebSocketMessage {
  type: 'execution_start' | 'node_state_change' | 'data_flow' | 'execution_complete' | 'execution_failed' | 'breakpoint_hit';
  execution_id?: string;
  workflow_id?: string;
  node_id?: string;
  status?: string;
  result?: any;
  error?: string;
  flow?: {
    from_node: string;
    to_node: string;
    data: any;
    timestamp: number;
  };
  state?: any;
  timestamp?: number;
}

export type WebSocketEventHandler = (message: WebSocketMessage) => void;

export interface WebSocketSubscription {
  id: string;
  handler: WebSocketEventHandler;
  topics?: string[];
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, WebSocketSubscription> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private shouldReconnect = true;
  private currentUrl = '';

  // 连接到WebSocket
  connect(workflowId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        reject(new Error('WebSocket连接正在进行中'));
        return;
      }

      // 构建WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = '8000'; // 后端WebSocket端口
      const url = workflowId ?
        `${protocol}//${host}:${port}/ws/workflow/${workflowId}` :
        `${protocol}//${host}:${port}/ws/monitor`;

      this.currentUrl = url;
      this.isConnecting = true;

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('✓ WebSocket连接已建立:', url);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.notifySubscribers({
            type: 'execution_start',
            timestamp: Date.now()
          });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('WebSocket消息解析失败:', error, event.data);
          }
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket连接已关闭:', event.code, event.reason);
          this.isConnecting = false;
          this.ws = null;

          if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket连接错误:', error);
          this.isConnecting = false;
          reject(error);
        };

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  // 断开连接
  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // 重连尝试
  private attemptReconnect() {
    if (!this.shouldReconnect || this.isConnecting) return;

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`WebSocket重连尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts}，${delay}ms后重试...`);

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect().catch(error => {
          console.error('WebSocket重连失败:', error);
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('WebSocket重连次数已达上限，停止重连');
            this.notifySubscribers({
              type: 'execution_failed',
              error: 'WebSocket连接失败',
              timestamp: Date.now()
            });
          }
        });
      }
    }, delay);
  }

  // 处理收到的消息
  private handleMessage(message: WebSocketMessage) {
    console.log('WebSocket收到消息:', message);
    this.notifySubscribers(message);
  }

  // 通知所有订阅者
  private notifySubscribers(message: WebSocketMessage) {
    this.subscriptions.forEach(subscription => {
      try {
        // 检查主题过滤
        if (subscription.topics && subscription.topics.length > 0) {
          const messageTopics = this.getMessageTopics(message);
          const hasMatchingTopic = subscription.topics.some(topic =>
            messageTopics.includes(topic)
          );
          if (!hasMatchingTopic) return;
        }

        subscription.handler(message);
      } catch (error) {
        console.error('WebSocket事件处理器执行失败:', error, subscription.id);
      }
    });
  }

  // 获取消息相关的主题
  private getMessageTopics(message: WebSocketMessage): string[] {
    const topics: string[] = [message.type];
    if (message.workflow_id) topics.push(`workflow:${message.workflow_id}`);
    if (message.node_id) topics.push(`node:${message.node_id}`);
    if (message.execution_id) topics.push(`execution:${message.execution_id}`);
    return topics;
  }

  // 订阅WebSocket事件
  subscribe(handler: WebSocketEventHandler, topics?: string[]): string {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      handler,
      topics
    });

    return subscriptionId;
  }

  // 取消订阅
  unsubscribe(subscriptionId: string) {
    this.subscriptions.delete(subscriptionId);
  }

  // 发送消息到服务器
  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket未连接，无法发送消息:', message);
    }
  }

  // 获取连接状态
  getConnectionState(): 'connecting' | 'open' | 'closing' | 'closed' {
    if (this.isConnecting) return 'connecting';
    if (!this.ws) return 'closed';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'open';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'closed';
      default: return 'closed';
    }
  }

  // 检查是否已连接
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// 全局WebSocket管理器实例
const webSocketManager = new WebSocketManager();

// WebSocket API接口
export const websocketApi = {
  // 连接到工作流WebSocket
  connectToWorkflow: (workflowId: string): Promise<void> => {
    return webSocketManager.connect(workflowId);
  },

  // 连接到监控WebSocket
  connectToMonitor: (): Promise<void> => {
    return webSocketManager.connect();
  },

  // 断开WebSocket连接
  disconnect: () => {
    webSocketManager.disconnect();
  },

  // 订阅WebSocket事件
  subscribe: (handler: WebSocketEventHandler, topics?: string[]): string => {
    return webSocketManager.subscribe(handler, topics);
  },

  // 取消订阅事件
  unsubscribe: (subscriptionId: string) => {
    webSocketManager.unsubscribe(subscriptionId);
  },

  // 发送消息
  send: (message: any) => {
    webSocketManager.send(message);
  },

  // 获取连接状态
  getConnectionState: () => {
    return webSocketManager.getConnectionState();
  },

  // 检查连接状态
  isConnected: () => {
    return webSocketManager.isConnected();
  }
};

// 调试和监控API扩展
export const debugApi = {
  // 设置断点
  setBreakpoint: (workflowId: string, nodeId: string, enabled: boolean): Promise<ApiResponse<void>> => {
    return api.post('/visual_workflow/set_breakpoint', {
      workflow_id: workflowId,
      node_id: nodeId,
      enabled
    });
  },

  // 单步执行
  stepExecute: (workflowId: string, executionId?: string): Promise<ApiResponse<any>> => {
    return api.post('/visual_workflow/step_execute', {
      workflow_id: workflowId,
      execution_id: executionId
    });
  },

  // 获取节点数据
  getNodeData: (workflowId: string, nodeId: string, executionId?: string): Promise<ApiResponse<any>> => {
    return api.post('/visual_workflow/get_node_data', {
      workflow_id: workflowId,
      node_id: nodeId,
      execution_id: executionId
    });
  },

  // 获取执行日志
  getExecutionLog: (workflowId: string, executionId?: string): Promise<ApiResponse<any[]>> => {
    return api.post('/visual_workflow/get_execution_log', {
      workflow_id: workflowId,
      execution_id: executionId
    });
  },

  // 启用/禁用调试模式
  enableDebugMode: (workflowId: string, enabled: boolean): Promise<ApiResponse<void>> => {
    return api.post('/visual_workflow/enable_debug_mode', {
      workflow_id: workflowId,
      enabled
    });
  }
};

// 实时监控Hooks工厂函数
export const createMonitoringHooks = () => {
  let subscriptionId: string | null = null;

  return {
    // 开始监控
    startMonitoring: (workflowId: string, onMessage: WebSocketEventHandler) => {
      return websocketApi.connectToWorkflow(workflowId).then(() => {
        subscriptionId = websocketApi.subscribe(onMessage, [`workflow:${workflowId}`]);
      });
    },

    // 停止监控
    stopMonitoring: () => {
      if (subscriptionId) {
        websocketApi.unsubscribe(subscriptionId);
        subscriptionId = null;
      }
      websocketApi.disconnect();
    },

    // 监控特定节点
    monitorNode: (nodeId: string, onMessage: WebSocketEventHandler) => {
      const nodeSubscriptionId = websocketApi.subscribe(onMessage, [`node:${nodeId}`]);
      return () => websocketApi.unsubscribe(nodeSubscriptionId);
    }
  };
};

export default api;