import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Badge, Button, Tabs, Typography, Space, Tag, Divider, Alert, Progress } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  BugOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import type { WorkflowNode, WorkflowExecution } from '../types/workflow';
import { websocketApi } from '../services/api';

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

type SummaryEvent = {
  t: number; // timestamp (ms)
  type: 'execution_start' | 'node_state_change' | 'data_flow' | 'execution_complete' | 'execution_failed' | 'breakpoint_hit' | string;
  execution_id?: string;
};

export interface ExecutionMonitorProps {
  // 新增可选 executionId：若存在则仅展示该执行的事件
  executionId?: string;
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

const MAX_EVENT_BUFFER = 200;
const SUMMARY_DISPLAY_SIZE = 20;
const DUP_WINDOW_MS = 100;

const ExecutionMonitor: React.FC<ExecutionMonitorProps> = ({
  executionId,
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

  // WS 连接状态与失败提示
  const [connectionState, setConnectionState] = useState<'connecting' | 'open' | 'closing' | 'closed'>('closed');
  const [wsFailed, setWsFailed] = useState(false);

  // 事件摘要（仅显示最近20条类型+时间）
  const eventBufferRef = useRef<SummaryEvent[]>([]);
  const [summaryEvents, setSummaryEvents] = useState<SummaryEvent[]>([]);

    // 订阅ID，用于卸载时取消订阅；不直接关闭全局WS，避免影响其它组件
    const subscriptionIdRef = useRef<string | null>(null);
    const logsEndRef = useRef<HTMLDivElement | null>(null);
  
    // 批量渲染与去重控制
    const BATCH_INTERVAL_MS = 80; // 50–100ms 之间，取 80ms
    const SEEN_KEY_LIMIT = 1000;
  
    const msgBufferRef = useRef<any[]>([]);
    const flushTimerRef = useRef<any | null>(null);
    const seenKeysRef = useRef<Set<string>>(new Set());
    const seenQueueRef = useRef<string[]>([]);
    const fallbackWindowRef = useRef<Map<string, number>>(new Map());
  
    const [runStats, setRunStats] = useState<{ totalRuns: number; lastRunId: string | null; lastRunStatus: 'running' | 'completed' | 'error' | null }>({
      totalRuns: 0, lastRunId: null, lastRunStatus: null
    });
  
    const getRunId = (m: any): string | undefined => m?.run_id || m?.execution_id || m?.executionId;
    const parseTimestampMs = (m: any): number | undefined => {
      const ts = m?.ts ?? m?.timestamp;
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string') {
        const n = Date.parse(ts);
        if (!Number.isNaN(n)) return n;
        const maybeNum = Number(ts);
        if (!Number.isNaN(maybeNum)) return maybeNum;
      }
      return undefined;
    };
    const buildDedupKey = (m: any): string => {
      const runId = getRunId(m) || '';
      const type = m?.type || 'unknown';
      const nodeId = m?.node_id || '';
      const seq = m?.seq;
      const ts = m?.ts ?? m?.timestamp;
      const tsPart = (seq !== undefined && seq !== null) ? String(seq) : (ts !== undefined && ts !== null) ? String(ts) : '';
      return `${runId}:${tsPart}:${type}:${nodeId}`;
    };
  
    const flushBuffer = () => {
      const buf = msgBufferRef.current;
      if (!buf.length) return;
      msgBufferRef.current = [];
  
      buf.forEach((message) => {
        const runId = getRunId(message);
        const type = message?.type || 'unknown';
        const now = parseTimestampMs(message) ?? Date.now();
  
        // 去重主键：run_id:seq|ts:type:node_id
        const k = buildDedupKey(message);
        const hasStableKey = !k.includes('::') && k.split(':')[1] !== '';
        if (!hasStableKey) {
          // 无 seq 且无 ts：使用“100ms 时间窗 + type + run_id”兜底
          const fwKey = `${runId || ''}:${type}`;
          const last = fallbackWindowRef.current.get(fwKey) || 0;
          if (now - last <= DUP_WINDOW_MS) return;
          fallbackWindowRef.current.set(fwKey, now);
        } else {
          if (seenKeysRef.current.has(k)) return;
          seenKeysRef.current.add(k);
          seenQueueRef.current.push(k);
          if (seenQueueRef.current.length > SEEN_KEY_LIMIT) {
            const old = seenQueueRef.current.shift();
            if (old) seenKeysRef.current.delete(old);
          }
        }
  
        // 事件摘要
        addEventSummary({ t: now, type, execution_id: runId });
  
        switch (type) {
          case 'execution_start': {
            setCurrentExecutionId(runId || null);
            setRunStats(prev => ({
              totalRuns: prev.totalRuns + 1,
              lastRunId: runId || null,
              lastRunStatus: 'running'
            }));
            addLog('info', '工作流开始执行', 'execution');
            break;
          }
          case 'node_state_change': {
            const node_id = message?.node_id;
            const status = message?.status || message?.state?.status;
            const result = message?.result ?? message?.state?.result;
            const error = message?.error ?? message?.state?.error;
            updateNodeState(node_id, { status, result, error });
            const node = nodes.find(n => n.id === node_id);
            const nodeName = node?.data.label || node_id;
  
            if (status === 'running') {
              addLog('info', `节点开始执行: ${nodeName}`, node_id);
            } else if (status === 'completed') {
              addLog('success', `节点执行完成: ${nodeName}`, node_id);
            } else if (status === 'error') {
              addLog('error', `节点执行失败: ${nodeName}`, node_id);
            }
            break;
          }
          case 'data_flow': {
            const flow = message?.flow || {
              from_node: message?.from || message?.from_node,
              to_node: message?.to || message?.to_node,
              data: message?.payload || message?.data,
              timestamp: now
            };
            if (flow && flow.from_node && flow.to_node) {
              const newFlow: DataFlow = {
                id: `flow_${Date.now()}_${Math.random()}`,
                from_node: flow.from_node,
                to_node: flow.to_node,
                data: flow.data,
                timestamp: typeof flow.timestamp === 'number' ? flow.timestamp : now,
                animated: true
              };
              setDataFlows(prev => {
                const next = [...prev, newFlow];
                return next.length > MAX_EVENT_BUFFER ? next.slice(-MAX_EVENT_BUFFER) : next;
              });
              setTimeout(() => {
                setDataFlows(prev => prev.map(f =>
                  f.id === newFlow.id ? { ...f, animated: false } : f
                ));
              }, 3000);
  
              const fromNode = nodes.find(n => n.id === newFlow.from_node);
              const toNode = nodes.find(n => n.id === newFlow.to_node);
              addLog('info', `数据流动: ${fromNode?.data.label} → ${toNode?.data.label}`, 'flow');
            }
            break;
          }
          case 'execution_complete': {
            setRunStats(prev => ({
              ...prev,
              lastRunId: runId || prev.lastRunId,
              lastRunStatus: 'completed'
            }));
            addLog('success', '工作流执行完成', 'execution');
            break;
          }
          case 'execution_failed': {
            setRunStats(prev => ({
              ...prev,
              lastRunId: runId || prev.lastRunId,
              lastRunStatus: 'error'
            }));
            const err = message?.error;
            if (err) {
              addLog('error', `工作流执行失败: ${err}`, 'execution');
            } else {
              addLog('error', '工作流执行失败', 'execution');
            }
            break;
          }
          default:
            break;
        }
      });
    };
  
    const scheduleFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushBuffer();
      }, BATCH_INTERVAL_MS);
    };
  
    const enqueueMessage = (m: any) => {
      // 运行ID过滤：若 props.executionId 存在，仅缓冲匹配 run_id 的消息
      const rid = getRunId(m);
      if (executionId && (!rid || rid !== executionId)) return;
      msgBufferRef.current.push(m);
      scheduleFlush();
    };

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

  // 轮询连接状态（轻量，每1s）
  useEffect(() => {
    const timer = setInterval(() => {
      setConnectionState(websocketApi.getConnectionState());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 统一通过 services 层的 websocketApi 接入；仅在未连接时尝试连接；并基于 executionId/workflowId 订阅主题
  useEffect(() => {
    // 计算订阅主题：优先 executionId（按 run:{id} 订阅，兼容保留 execution:{id}），其次 workflowId，否则全局
    const topics: string[] | undefined = executionId ? [`run:${executionId}`, `execution:${executionId}`] : (workflowId ? [`workflow:${workflowId}`] : undefined);

    let mounted = true;

    const ensureConnectedAndSubscribe = async () => {
      try {
        if (!websocketApi.isConnected()) {
          await websocketApi.connectToMonitor(); // 统一 /ws
        }
        // 清理旧订阅
        if (subscriptionIdRef.current) {
          websocketApi.unsubscribe(subscriptionIdRef.current);
          subscriptionIdRef.current = null;
        }
        // 订阅
        const sid = websocketApi.subscribe((msg) => {
          // 捕捉服务层“连接失败达上限”通知
          if (msg?.type === 'execution_failed' && msg?.error === 'WebSocket连接失败' && !msg?.execution_id) {
            setWsFailed(true);
            return;
          }
          // 正常事件处理
          handleWebSocketMessage(msg as any);
        }, topics);
        subscriptionIdRef.current = sid;
        setWsFailed(false);
        setConnectionState(websocketApi.getConnectionState());
      } catch (_e) {
        // 连接失败时交由自动重连机制处理；若超限，服务层会推送“WebSocket连接失败”
      }
    };

    ensureConnectedAndSubscribe();

    return () => {
      mounted = false;
      if (subscriptionIdRef.current) {
        websocketApi.unsubscribe(subscriptionIdRef.current);
        subscriptionIdRef.current = null;
      }
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // 不调用 websocketApi.disconnect()，避免影响其他使用者
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId, workflowId]);

    // 处理WebSocket消息（批量缓冲 → 50–100ms 合并渲染）
    const handleWebSocketMessage = (message: any) => {
      enqueueMessage(message);
    };

  // 事件摘要 ring buffer（最多200），去重：同一 timestamp±100ms 且 type/execution_id 相同跳过
  const addEventSummary = (evt: SummaryEvent) => {
    const buf = eventBufferRef.current;
    // 去重检查：从尾部向前扫描，直到时间差 > 100ms
    for (let i = buf.length - 1; i >= 0; i--) {
      const e = buf[i];
      if (Math.abs(e.t - evt.t) > DUP_WINDOW_MS) break;
      if (e.type === evt.type && (e.execution_id || '') === (evt.execution_id || '')) {
        return; // 视为重复，跳过
      }
    }
    buf.push(evt);
    if (buf.length > MAX_EVENT_BUFFER) {
      buf.splice(0, buf.length - MAX_EVENT_BUFFER);
    }
    // 若传入了 executionId，仅摘要此执行；若未传 executionId，则显示全局摘要（含无 execution_id 的事件）
    let filtered = buf;
    if (executionId) {
      filtered = buf.filter(e => (e.execution_id || '') === executionId);
    }
    setSummaryEvents(filtered.slice(-SUMMARY_DISPLAY_SIZE));
  };

  // 更新节点状态
  const updateNodeState = (nodeId: string, updates: Partial<NodeState>) => {
    if (!nodeId) return;
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

  // 添加日志（限制最多200条）
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

    setExecutionLogs(prev => {
      const arr = [...prev, newLog];
      return arr.length > MAX_EVENT_BUFFER ? arr.slice(-MAX_EVENT_BUFFER) : arr;
    });
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

  // 时间格式
  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const handleManualReconnect = async () => {
    setWsFailed(false);
    try {
      await websocketApi.connectToMonitor();
      setConnectionState(websocketApi.getConnectionState());
      // 订阅保持由 useEffect 管理，当连接恢复时仍有效；若已被清理，App 侧/本组件会再次订阅
    } catch {
      // 由服务层自动重连与告警处理
    }
  };

  const connectionBadge = useMemo(() => {
    const map: Record<typeof connectionState, { text: string; status: any }> = {
      connecting: { text: '连接中', status: 'processing' },
      open: { text: '已连接', status: 'success' },
      closing: { text: '关闭中', status: 'warning' },
      closed: { text: '已断开', status: 'error' }
    };
    const it = map[connectionState];
    return <Badge status={it.status} text={it.text} />;
  }, [connectionState]);

  return (
    <div className={`execution-monitor ${className || ''}`}>
      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            <span>执行监控</span>
            {connectionBadge}
            {isExecuting && <Badge status="processing" text="运行中" />}
            {runStats.lastRunStatus && (
              <Text type="secondary" style={{ marginLeft: 8 }}>
                最近运行: {runStats.lastRunStatus}{runStats.lastRunId ? ` (${runStats.lastRunId})` : ''}
              </Text>
            )}
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
            {connectionState === 'closed' && (
              <Button size="small" icon={<ReloadOutlined />} onClick={handleManualReconnect}>重试连接</Button>
            )}
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
        {/* 断开告警与手动重连 */}
        {wsFailed && (
          <Alert
            type="warning"
            message="实时连接已断开（点击重试以恢复）"
            action={<Button size="small" type="primary" onClick={handleManualReconnect}>重试</Button>}
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}

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

        {/* 事件摘要（最近20条，仅显示类型与时间） */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text strong>事件摘要（最近{SUMMARY_DISPLAY_SIZE}条）</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>仅显示类型与时间，隐藏敏感内容</Text>
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', padding: '6px 8px', background: '#fafafa', borderRadius: 4 }}>
            {summaryEvents.length === 0 ? (
              <Text type="secondary">暂无事件</Text>
            ) : (
              summaryEvents.slice().reverse().map((e, idx) => (
                <div key={`${e.t}_${e.type}_${idx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <Text style={{ fontSize: 12 }}>{e.type}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{formatTime(e.t)}</Text>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 执行信息标签页（保持原风格） */}
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
                        {nodeState.endTime ? `${Math.max(0, Math.round((nodeState.endTime - nodeState.startTime) / 100) / 10)}s` : ''}
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
                    </div>
                  );
                })
              )}
            </div>
          </TabPane>

          {/* 执行日志（受 debugMode 控制是否显示详情，默认隐藏敏感信息） */}
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

        {/* 当前执行状态（保持原结构） */}
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