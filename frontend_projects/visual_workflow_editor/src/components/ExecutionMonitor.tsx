import React, { useState, useEffect, useRef } from 'react';
import { Card, Badge, Button, Timeline, Progress, Alert, Tabs, Typography, Space, Tag, Divider } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  StopOutlined, 
  BugOutlined,
  ClockCircleOutlined, 
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ThunderboltOutlined,
  EyeOutlined
} from '@ant-design/icons';
import type { WorkflowNode, WorkflowExecution, NodeExecutionResult } from '../types/workflow';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface ExecutionLog {
  id: string;
  timestamp: number;
  event_type: 'execution_start' | 'node_start' | 'node_complete' | 'node_error' | 'data_flow' | 'execution_complete' | 'execution_failed';
  node_id?: string;
  message: string;
  data?: any;
  level: 'info' | 'success' | 'warning' | 'error';
}

interface NodeState {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  startTime?: number;
  endTime?: number;
  result?: any;
  error?: string;
  progress?: number;
}

interface DataFlow {
  id: string;
  from_node: string;
  to_node: string;
  data: any;
  timestamp: number;
  animated?: boolean;
}

export interface ExecutionMonitorProps {
  workflowId: string;
  nodes: WorkflowNode[];
  execution?: WorkflowExecution | null;
  isExecuting: boolean;
  onStop?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStepNext?: () => void;
  className?: string;
}

const ExecutionMonitor: React.FC<ExecutionMonitorProps> = ({
  workflowId,
  nodes,
  execution,
  isExecuting,
  onStop,
  onPause,
  onResume,
  onStepNext,
  className
}) => {
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [nodeStates, setNodeStates] = useState<Map<string, NodeState>>(new Map());
  const [dataFlows, setDataFlows] = useState<DataFlow[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // 初始化节点状态
  useEffect(() => {
    const initialStates = new Map<string, NodeState>();
    nodes.forEach(node => {
      initialStates.set(node.id, {
        id: node.id,
        name: node.data.label,
        status: 'pending',
        progress: 0
      });
    });
    setNodeStates(initialStates);
  }, [nodes]);

  // WebSocket连接和消息处理
  useEffect(() => {
    if (!workflowId) return;

    const connectWebSocket = () => {
      // 注意：这里使用相对路径，实际部署时需要配置正确的WebSocket地址
      const wsUrl = `ws://localhost:8000/ws/workflow/${workflowId}`;
      
      try {
        websocketRef.current = new WebSocket(wsUrl);
        
        websocketRef.current.onopen = () => {
          console.log('ExecutionMonitor WebSocket连接已建立');
          addLog('info', 'WebSocket连接已建立', 'system');
        };
        
        websocketRef.current.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
          } catch (error) {
            console.error('WebSocket消息解析失败:', error);
          }
        };
        
        websocketRef.current.onclose = () => {
          console.log('ExecutionMonitor WebSocket连接已关闭');
          addLog('warning', 'WebSocket连接已关闭', 'system');
          
          // 自动重连（如果还在执行中）
          if (isExecuting) {
            setTimeout(connectWebSocket, 3000);
          }
        };
        
        websocketRef.current.onerror = (error) => {
          console.error('ExecutionMonitor WebSocket连接错误:', error);
          addLog('error', 'WebSocket连接错误', 'system');
        };
      } catch (error) {
        console.error('WebSocket连接失败:', error);
        addLog('error', `WebSocket连接失败: ${error}`, 'system');
      }
    };

    connectWebSocket();

    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, [workflowId, isExecuting]);

  // 处理WebSocket消息
  const handleWebSocketMessage = (message: any) => {
    const { type, execution_id, node_id, status, result, error, flow, state } = message;
    
    switch (type) {
      case 'execution_start':
        setCurrentExecutionId(execution_id);
        addLog('info', '工作流开始执行', 'execution', { execution_id });
        break;
        
      case 'node_state_change':
        updateNodeState(node_id, { status, result, error });
        const node = nodes.find(n => n.id === node_id);
        const nodeName = node?.data.label || node_id;
        
        if (status === 'running') {
          addLog('info', `节点开始执行: ${nodeName}`, node_id);
        } else if (status === 'completed') {
          addLog('success', `节点执行完成: ${nodeName}`, node_id, { result });
        } else if (status === 'error') {
          addLog('error', `节点执行失败: ${nodeName}`, node_id, { error });
        }
        break;
        
      case 'data_flow':
        if (flow) {
          const newFlow: DataFlow = {
            id: `flow_${Date.now()}`,
            from_node: flow.from_node,
            to_node: flow.to_node,
            data: flow.data,
            timestamp: flow.timestamp,
            animated: true
          };
          setDataFlows(prev => [...prev, newFlow]);
          
          // 3秒后移除动画效果
          setTimeout(() => {
            setDataFlows(prev => prev.map(f => 
              f.id === newFlow.id ? { ...f, animated: false } : f
            ));
          }, 3000);
          
          const fromNode = nodes.find(n => n.id === flow.from_node);
          const toNode = nodes.find(n => n.id === flow.to_node);
          addLog('info', `数据流动: ${fromNode?.data.label} → ${toNode?.data.label}`, 'flow', { data: flow.data });
        }
        break;
        
      case 'execution_complete':
        addLog('success', '工作流执行完成', 'execution', { final_result: state?.final_result });
        break;
        
      case 'execution_failed':
        addLog('error', `工作流执行失败: ${error}`, 'execution', { error });
        break;
    }
  };

  // 更新节点状态
  const updateNodeState = (nodeId: string, updates: Partial<NodeState>) => {
    setNodeStates(prev => {
      const newMap = new Map(prev);
      const currentState = newMap.get(nodeId) || { id: nodeId, name: '', status: 'pending' as const };
      const updatedState = { 
        ...currentState, 
        ...updates,
        endTime: updates.status === 'completed' || updates.status === 'error' ? Date.now() : currentState.endTime
      };
      newMap.set(nodeId, updatedState);
      return newMap;
    });
  };

  // 添加日志
  const addLog = (level: ExecutionLog['level'], message: string, nodeId?: string, data?: any) => {
    const newLog: ExecutionLog = {
      id: `log_${Date.now()}_${Math.random()}`,
      timestamp: Date.now(),
      event_type: nodeId === 'system' ? 'node_start' : 
                 nodeId === 'execution' ? 'execution_start' : 
                 nodeId === 'flow' ? 'data_flow' : 'node_start',
      node_id: nodeId,
      message,
      data,
      level
    };
    
    setExecutionLogs(prev => [...prev, newLog]);
  };

  // 滚动到日志底部
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [executionLogs]);

  // 获取执行状态颜色
  const getStatusColor = (status: NodeState['status']) => {
    switch (status) {
      case 'pending': return '#d9d9d9';
      case 'running': return '#1890ff';
      case 'completed': return '#52c41a';
      case 'error': return '#ff4d4f';
      case 'skipped': return '#faad14';
      default: return '#d9d9d9';
    }
  };

  // 获取执行状态图标
  const getStatusIcon = (status: NodeState['status']) => {
    switch (status) {
      case 'pending': return <ClockCircleOutlined />;
      case 'running': return <ThunderboltOutlined spin />;
      case 'completed': return <CheckCircleOutlined />;
      case 'error': return <ExclamationCircleOutlined />;
      case 'skipped': return <EyeOutlined />;
      default: return <ClockCircleOutlined />;
    }
  };

  // 计算总体进度
  const calculateProgress = () => {
    const states = Array.from(nodeStates.values());
    const completed = states.filter(s => s.status === 'completed').length;
    const total = states.length;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // 格式化持续时间
  const formatDuration = (startTime?: number, endTime?: number) => {
    if (!startTime) return '0ms';
    const end = endTime || Date.now();
    const duration = end - startTime;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  return (
    <div className={`execution-monitor ${className}`}>
      <Card 
        title={
          <Space>
            <ThunderboltOutlined />
            <span>执行监控</span>
            {isExecuting && <Badge status="processing" text="运行中" />}
          </Space>
        }
        extra={
          <Space>
            <Button
              type="text"
              icon={<BugOutlined />}
              onClick={() => setDebugMode(!debugMode)}
              style={{ color: debugMode ? '#1890ff' : undefined }}
            >
              调试模式
            </Button>
            {isExecuting && (
              <>
                {isPaused ? (
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={() => {
                      setIsPaused(false);
                      onResume?.();
                    }}
                    size="small"
                  >
                    继续
                  </Button>
                ) : (
                  <Button
                    icon={<PauseCircleOutlined />}
                    onClick={() => {
                      setIsPaused(true);
                      onPause?.();
                    }}
                    size="small"
                  >
                    暂停
                  </Button>
                )}
                {debugMode && (
                  <Button
                    icon={<ThunderboltOutlined />}
                    onClick={onStepNext}
                    size="small"
                  >
                    单步
                  </Button>
                )}
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={onStop}
                  size="small"
                >
                  停止
                </Button>
              </>
            )}
          </Space>
        }
        size="small"
      >
        {/* 总体进度 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>执行进度</Text>
            <Text type="secondary">{calculateProgress()}%</Text>
          </div>
          <Progress 
            percent={calculateProgress()} 
            status={isExecuting ? 'active' : 'normal'}
            strokeColor={{
              '0%': '#108ee9',
              '100%': '#87d068',
            }}
          />
        </div>

        {/* 执行信息标签页 */}
        <Tabs defaultActiveKey="nodes" size="small">
          {/* 节点状态 */}
          <TabPane tab="节点状态" key="nodes">
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {Array.from(nodeStates.values()).map(nodeState => (
                <div key={nodeState.id} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid #f0f0f0'
                }}>
                  <Space>
                    {getStatusIcon(nodeState.status)}
                    <Text>{nodeState.name}</Text>
                  </Space>
                  <Space>
                    <Tag color={getStatusColor(nodeState.status)}>
                      {nodeState.status === 'pending' ? '等待' :
                       nodeState.status === 'running' ? '运行中' :
                       nodeState.status === 'completed' ? '完成' :
                       nodeState.status === 'error' ? '错误' : '跳过'}
                    </Tag>
                    {nodeState.startTime && (
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {formatDuration(nodeState.startTime, nodeState.endTime)}
                      </Text>
                    )}
                  </Space>
                </div>
              ))}
            </div>
          </TabPane>

          {/* 数据流动 */}
          <TabPane tab="数据流动" key="flows">
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {dataFlows.length === 0 ? (
                <Text type="secondary">暂无数据流动</Text>
              ) : (
                dataFlows.slice(-10).reverse().map(flow => {
                  const fromNode = nodes.find(n => n.id === flow.from_node);
                  const toNode = nodes.find(n => n.id === flow.to_node);
                  return (
                    <div key={flow.id} style={{ 
                      padding: '8px 0',
                      borderBottom: '1px solid #f0f0f0',
                      ...(flow.animated && { backgroundColor: '#f6ffed' })
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Space>
                          <Text>{fromNode?.data.label}</Text>
                          <span>→</span>
                          <Text>{toNode?.data.label}</Text>
                        </Space>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {formatTime(flow.timestamp)}
                        </Text>
                      </div>
                      {flow.data && (
                        <div style={{ marginTop: 4, fontSize: '12px', color: '#666' }}>
                          数据: {typeof flow.data === 'string' ? 
                            (flow.data.length > 50 ? flow.data.substring(0, 50) + '...' : flow.data) :
                            JSON.stringify(flow.data).substring(0, 50) + '...'}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </TabPane>

          {/* 执行日志 */}
          <TabPane tab="执行日志" key="logs">
            <div style={{ maxHeight: 300, overflowY: 'auto', backgroundColor: '#fafafa', padding: 8 }}>
              {executionLogs.length === 0 ? (
                <Text type="secondary">暂无执行日志</Text>
              ) : (
                executionLogs.map(log => (
                  <div key={log.id} style={{ 
                    marginBottom: 8,
                    padding: '6px 8px',
                    backgroundColor: 'white',
                    borderRadius: 4,
                    borderLeft: `3px solid ${
                      log.level === 'error' ? '#ff4d4f' :
                      log.level === 'warning' ? '#faad14' :
                      log.level === 'success' ? '#52c41a' : '#1890ff'
                    }`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text 
                        style={{ 
                          fontSize: '13px',
                          color: log.level === 'error' ? '#ff4d4f' : undefined
                        }}
                      >
                        {log.message}
                      </Text>
                      <Text type="secondary" style={{ fontSize: '11px', marginLeft: 8, whiteSpace: 'nowrap' }}>
                        {formatTime(log.timestamp)}
                      </Text>
                    </div>
                    {log.data && debugMode && (
                      <div style={{ 
                        marginTop: 4, 
                        fontSize: '11px', 
                        color: '#666',
                        backgroundColor: '#f5f5f5',
                        padding: '4px 8px',
                        borderRadius: 2,
                        maxHeight: 60,
                        overflowY: 'auto'
                      }}>
                        {JSON.stringify(log.data, null, 2)}
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </TabPane>
        </Tabs>

        {/* 当前执行状态 */}
        {execution && (
          <Divider />
        )}
        {execution && (
          <div style={{ textAlign: 'center' }}>
            <Space direction="vertical" size="small">
              <Text type="secondary">执行ID: {currentExecutionId}</Text>
              <Text type="secondary">
                状态: {execution.status === 'running' ? '运行中' :
                      execution.status === 'completed' ? '已完成' :
                      execution.status === 'failed' ? '执行失败' : '等待中'}
              </Text>
              {execution.startTime && (
                <Text type="secondary">
                  开始时间: {new Date(execution.startTime).toLocaleString()}
                </Text>
              )}
            </Space>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ExecutionMonitor;