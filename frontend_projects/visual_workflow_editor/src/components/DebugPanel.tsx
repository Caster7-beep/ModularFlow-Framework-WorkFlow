import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  List,
  Switch,
  Table,
  Tabs,
  Space,
  Tag,
  Tooltip,
  Input,
  Modal,
  Tree,
  Typography,
  Collapse,
  Badge,
  Alert,
  Divider,
  Select
} from 'antd';
import {
  BugOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StepForwardOutlined,
  StepBackwardOutlined,
  ReloadOutlined,
  ClearOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  SettingOutlined,
  HistoryOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  CaretRightOutlined,
  PlusOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import type { WorkflowNode, WorkflowEdge } from '../types/workflow';
import { workflowApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;
const { TextArea } = Input;

interface Breakpoint {
  id: string;
  nodeId: string;
  nodeName: string;
  enabled: boolean;
  condition?: string;
  hitCount: number;
}

interface ExecutionStep {
  id: string;
  stepNumber: number;
  timestamp: number;
  nodeId: string;
  nodeName: string;
  action: 'enter' | 'execute' | 'exit' | 'error';
  data: any;
  variables: Record<string, any>;
  duration?: number;
}

interface VariableInfo {
  name: string;
  value: any;
  type: string;
  source: 'input' | 'output' | 'local' | 'global';
  nodeId?: string;
}

export interface DebugPanelProps {
  workflowId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId?: string;
  isDebugging: boolean;
  isPaused: boolean;
  onDebugToggle: (enabled: boolean) => void;
  onStepExecute: () => void;
  onContinue: () => void;
  onReset: () => void;
  className?: string;
}

const DebugPanel: React.FC<DebugPanelProps> = ({
  workflowId,
  nodes,
  edges,
  selectedNodeId,
  isDebugging,
  isPaused,
  onDebugToggle,
  onStepExecute,
  onContinue,
  onReset,
  className
}) => {
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [executionHistory, setExecutionHistory] = useState<ExecutionStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [variables, setVariables] = useState<VariableInfo[]>([]);
  const [isAddBreakpointModalVisible, setIsAddBreakpointModalVisible] = useState(false);
  const [selectedBreakpointNodeId, setSelectedBreakpointNodeId] = useState<string>('');
  const [breakpointCondition, setBreakpointCondition] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [debugSettings, setDebugSettings] = useState({
    stepIntoDetaileds: true,
    pauseOnExceptions: true,
    showSystemVariables: false,
    recordExecutionTime: true
  });

  // 初始化调试状态
  useEffect(() => {
    if (isDebugging && workflowId) {
      initializeDebugSession();
    }
  }, [isDebugging, workflowId]);

  // 监听当前选中的节点，自动添加到断点候选
  useEffect(() => {
    if (selectedNodeId && !breakpoints.some(bp => bp.nodeId === selectedNodeId)) {
      setSelectedBreakpointNodeId(selectedNodeId);
    }
  }, [selectedNodeId, breakpoints]);

  // 初始化调试会话
  const initializeDebugSession = useCallback(async () => {
    try {
      // 启用后端调试模式
      await workflowApi.executeWorkflow(workflowId, { debug_mode: true });
      console.log('调试模式已启用');
    } catch (error) {
      console.error('启用调试模式失败:', error);
    }
  }, [workflowId]);

  // 添加断点
  const addBreakpoint = useCallback(async () => {
    if (!selectedBreakpointNodeId) return;

    const node = nodes.find(n => n.id === selectedBreakpointNodeId);
    if (!node) return;

    const newBreakpoint: Breakpoint = {
      id: `bp_${Date.now()}`,
      nodeId: selectedBreakpointNodeId,
      nodeName: node.data.label,
      enabled: true,
      condition: breakpointCondition || undefined,
      hitCount: 0
    };

    try {
      // 调用后端API设置断点
      const response = await fetch(`/api/v1/visual_workflow.set_breakpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          node_id: selectedBreakpointNodeId,
          enabled: true
        })
      });

      if (response.ok) {
        setBreakpoints(prev => [...prev, newBreakpoint]);
        setIsAddBreakpointModalVisible(false);
        setSelectedBreakpointNodeId('');
        setBreakpointCondition('');
      }
    } catch (error) {
      console.error('设置断点失败:', error);
    }
  }, [selectedBreakpointNodeId, breakpointCondition, workflowId, nodes]);

  // 移除断点
  const removeBreakpoint = useCallback(async (breakpointId: string) => {
    const breakpoint = breakpoints.find(bp => bp.id === breakpointId);
    if (!breakpoint) return;

    try {
      // 调用后端API移除断点
      await fetch(`/api/v1/visual_workflow.set_breakpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          node_id: breakpoint.nodeId,
          enabled: false
        })
      });

      setBreakpoints(prev => prev.filter(bp => bp.id !== breakpointId));
    } catch (error) {
      console.error('移除断点失败:', error);
    }
  }, [breakpoints, workflowId]);

  // 切换断点状态
  const toggleBreakpoint = useCallback(async (breakpointId: string) => {
    const breakpoint = breakpoints.find(bp => bp.id === breakpointId);
    if (!breakpoint) return;

    const newEnabled = !breakpoint.enabled;

    try {
      await fetch(`/api/v1/visual_workflow.set_breakpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          node_id: breakpoint.nodeId,
          enabled: newEnabled
        })
      });

      setBreakpoints(prev =>
        prev.map(bp =>
          bp.id === breakpointId ? { ...bp, enabled: newEnabled } : bp
        )
      );
    } catch (error) {
      console.error('切换断点状态失败:', error);
    }
  }, [breakpoints, workflowId]);

  // 获取节点数据和变量
  const fetchNodeVariables = useCallback(async (nodeId: string, executionId?: string) => {
    try {
      const response = await fetch(`/api/v1/visual_workflow.get_node_data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId,
          node_id: nodeId,
          execution_id: executionId
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const nodeData = result.data;
          const newVariables: VariableInfo[] = [];

          // 处理节点输入变量
          if (nodeData.node_info?.data) {
            Object.entries(nodeData.node_info.data).forEach(([key, value]) => {
              newVariables.push({
                name: key,
                value: value,
                type: typeof value,
                source: 'local',
                nodeId: nodeId
              });
            });
          }

          // 处理执行结果
          if (nodeData.last_result) {
            newVariables.push({
              name: 'result',
              value: nodeData.last_result,
              type: typeof nodeData.last_result,
              source: 'output',
              nodeId: nodeId
            });
          }

          setVariables(newVariables);
        }
      }
    } catch (error) {
      console.error('获取节点变量失败:', error);
    }
  }, [workflowId]);

  // 步进执行
  const handleStepExecute = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/visual_workflow.step_execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: workflowId
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // 创建执行步骤记录
          const step: ExecutionStep = {
            id: `step_${Date.now()}`,
            stepNumber: executionHistory.length + 1,
            timestamp: Date.now(),
            nodeId: 'unknown', // 这需要从结果中获取
            nodeName: '步骤执行',
            action: 'execute',
            data: result.result,
            variables: {}
          };

          setExecutionHistory(prev => [...prev, step]);
          setCurrentStepIndex(prev => prev + 1);

          // 更新变量信息
          if (selectedNodeId) {
            await fetchNodeVariables(selectedNodeId);
          }
        }
      }

      onStepExecute();
    } catch (error) {
      console.error('单步执行失败:', error);
    }
  }, [workflowId, executionHistory, selectedNodeId, onStepExecute, fetchNodeVariables]);

  // 清空执行历史
  const clearExecutionHistory = useCallback(() => {
    setExecutionHistory([]);
    setCurrentStepIndex(-1);
    setVariables([]);
  }, []);

  // 回放到指定步骤
  const replayToStep = useCallback(async (stepIndex: number) => {
    // 这里可以实现执行历史的回放逻辑
    setCurrentStepIndex(stepIndex);
    const step = executionHistory[stepIndex];
    if (step && step.variables) {
      // 恢复该步骤的变量状态
      const variableList = Object.entries(step.variables).map(([name, value]) => ({
        name,
        value,
        type: typeof value,
        source: 'local' as const,
        nodeId: step.nodeId
      }));
      setVariables(variableList);
    }
  }, [executionHistory]);

  // 渲染断点列表
  const renderBreakpointList = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text strong>断点管理 ({breakpoints.length})</Text>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setIsAddBreakpointModalVisible(true)}
        >
          添加断点
        </Button>
      </div>

      <List
        size="small"
        dataSource={breakpoints}
        renderItem={breakpoint => (
          <List.Item
            actions={[
              <Switch
                key="toggle"
                size="small"
                checked={breakpoint.enabled}
                onChange={() => toggleBreakpoint(breakpoint.id)}
              />,
              <Button
                key="delete"
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeBreakpoint(breakpoint.id)}
              />
            ]}
          >
            <List.Item.Meta
              title={
                <Space>
                  <Text style={{ opacity: breakpoint.enabled ? 1 : 0.5 }}>
                    {breakpoint.nodeName}
                  </Text>
                  {breakpoint.hitCount > 0 && (
                    <Badge count={breakpoint.hitCount} size="small" />
                  )}
                </Space>
              }
              description={
                <div style={{ opacity: breakpoint.enabled ? 1 : 0.5 }}>
                  {breakpoint.condition && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      条件: {breakpoint.condition}
                    </Text>
                  )}
                </div>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );

  // 渲染执行历史
  const renderExecutionHistory = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text strong>执行历史 ({executionHistory.length})</Text>
        <Space>
          <Switch
            size="small"
            checked={autoScroll}
            onChange={setAutoScroll}
            checkedChildren="自动滚动"
            unCheckedChildren="固定视图"
          />
          <Button
            size="small"
            icon={<ClearOutlined />}
            onClick={clearExecutionHistory}
          >
            清空
          </Button>
        </Space>
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        <List
          size="small"
          dataSource={executionHistory}
          renderItem={(step, index) => (
            <List.Item
              className={index === currentStepIndex ? 'current-step' : ''}
              style={{
                backgroundColor: index === currentStepIndex ? '#e6f7ff' : undefined,
                cursor: 'pointer'
              }}
              onClick={() => replayToStep(index)}
            >
              <List.Item.Meta
                avatar={
                  <Badge
                    count={step.stepNumber}
                    size="small"
                    style={{ backgroundColor: index <= currentStepIndex ? '#52c41a' : '#d9d9d9' }}
                  />
                }
                title={
                  <Space>
                    <Text>{step.nodeName}</Text>
                    <Tag color={step.action === 'error' ? 'red' : 'blue'}>
                      {step.action === 'enter' ? '进入' :
                       step.action === 'execute' ? '执行' :
                       step.action === 'exit' ? '退出' : '错误'}
                    </Tag>
                  </Space>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(step.timestamp).toLocaleTimeString()}
                    {step.duration && ` (${step.duration}ms)`}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </div>
  );

  // 渲染变量检查器
  const renderVariableInspector = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text strong>变量检查器</Text>
        <Switch
          size="small"
          checked={debugSettings.showSystemVariables}
          onChange={(checked) => setDebugSettings(prev => ({ ...prev, showSystemVariables: checked }))}
          checkedChildren="显示系统变量"
          unCheckedChildren="仅用户变量"
        />
      </div>

      <Collapse size="small" ghost>
        {['input', 'local', 'output', 'global'].map(source => {
          const sourceVariables = variables.filter(v => v.source === source);
          if (sourceVariables.length === 0 && !debugSettings.showSystemVariables) return null;

          return (
            <Panel
              key={source}
              header={
                <Space>
                  <Text>
                    {source === 'input' ? '输入变量' :
                     source === 'local' ? '本地变量' :
                     source === 'output' ? '输出变量' : '全局变量'}
                  </Text>
                  <Badge count={sourceVariables.length} size="small" />
                </Space>
              }
            >
              {sourceVariables.map((variable, index) => (
                <div key={`${variable.name}_${index}`} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong>{variable.name}</Text>
                    <Tag>{variable.type}</Tag>
                  </div>
                  <div style={{ 
                    marginTop: 4,
                    padding: '4px 8px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: 4,
                    fontFamily: 'monospace',
                    fontSize: 12,
                    maxHeight: 100,
                    overflowY: 'auto'
                  }}>
                    {typeof variable.value === 'object' ? 
                      JSON.stringify(variable.value, null, 2) : 
                      String(variable.value)
                    }
                  </div>
                </div>
              ))}
              {sourceVariables.length === 0 && (
                <Text type="secondary">暂无{source === 'input' ? '输入' : source === 'local' ? '本地' : source === 'output' ? '输出' : '全局'}变量</Text>
              )}
            </Panel>
          );
        })}
      </Collapse>
    </div>
  );

  return (
    <div className={`debug-panel ${className}`}>
      <Card
        title={
          <Space>
            <BugOutlined />
            <span>调试面板</span>
            {isDebugging && <Badge status="processing" text="调试中" />}
          </Space>
        }
        extra={
          <Space>
            <Switch
              checked={isDebugging}
              onChange={onDebugToggle}
              checkedChildren="调试开"
              unCheckedChildren="调试关"
            />
          </Space>
        }
        size="small"
      >
        {/* 调试控制工具栏 */}
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Tooltip title="单步执行">
              <Button
                type="primary"
                icon={<StepForwardOutlined />}
                onClick={handleStepExecute}
                disabled={!isDebugging}
                size="small"
              >
                单步
              </Button>
            </Tooltip>
            <Tooltip title="继续执行">
              <Button
                icon={<PlayCircleOutlined />}
                onClick={onContinue}
                disabled={!isDebugging || !isPaused}
                size="small"
              >
                继续
              </Button>
            </Tooltip>
            <Tooltip title="重置执行">
              <Button
                icon={<ReloadOutlined />}
                onClick={onReset}
                disabled={!isDebugging}
                size="small"
              >
                重置
              </Button>
            </Tooltip>
          </Space>
        </div>

        {isDebugging ? (
          <Tabs defaultActiveKey="breakpoints" size="small">
            <TabPane tab="断点" key="breakpoints">
              {renderBreakpointList()}
            </TabPane>
            
            <TabPane tab="变量" key="variables">
              {renderVariableInspector()}
            </TabPane>
            
            <TabPane tab="历史" key="history">
              {renderExecutionHistory()}
            </TabPane>
            
            <TabPane tab="设置" key="settings">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Switch
                    checked={debugSettings.stepIntoDetaileds}
                    onChange={(checked) => setDebugSettings(prev => ({ ...prev, stepIntoDetaileds: checked }))}
                  />
                  <Text style={{ marginLeft: 8 }}>单步进入详细模式</Text>
                </div>
                <div>
                  <Switch
                    checked={debugSettings.pauseOnExceptions}
                    onChange={(checked) => setDebugSettings(prev => ({ ...prev, pauseOnExceptions: checked }))}
                  />
                  <Text style={{ marginLeft: 8 }}>异常时暂停</Text>
                </div>
                <div>
                  <Switch
                    checked={debugSettings.recordExecutionTime}
                    onChange={(checked) => setDebugSettings(prev => ({ ...prev, recordExecutionTime: checked }))}
                  />
                  <Text style={{ marginLeft: 8 }}>记录执行时间</Text>
                </div>
              </Space>
            </TabPane>
          </Tabs>
        ) : (
          <Alert
            message="调试功能未启用"
            description="启用调试模式以使用断点、单步执行和变量检查功能"
            type="info"
            showIcon
          />
        )}

        {/* 添加断点的模态框 */}
        <Modal
          title="添加断点"
          open={isAddBreakpointModalVisible}
          onOk={addBreakpoint}
          onCancel={() => {
            setIsAddBreakpointModalVisible(false);
            setSelectedBreakpointNodeId('');
            setBreakpointCondition('');
          }}
          width={500}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text>节点:</Text>
              <div style={{ marginTop: 8 }}>
                <Select
                  style={{ width: '100%' }}
                  placeholder="选择要设置断点的节点"
                  value={selectedBreakpointNodeId}
                  onChange={setSelectedBreakpointNodeId}
                >
                  {nodes.map(node => (
                    <Select.Option key={node.id} value={node.id}>
                      {node.data.label} ({node.type})
                    </Select.Option>
                  ))}
                </Select>
              </div>
            </div>
            
            <div>
              <Text>条件 (可选):</Text>
              <TextArea
                style={{ marginTop: 8 }}
                placeholder="输入断点条件，例如：input.length > 10"
                value={breakpointCondition}
                onChange={(e) => setBreakpointCondition(e.target.value)}
                rows={3}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                留空表示无条件断点，否则只有当条件为真时才会暂停
              </Text>
            </div>
          </Space>
        </Modal>
      </Card>

      <style>{`
        .debug-panel .current-step {
          border-left: 3px solid #1890ff;
        }
      `}</style>
    </div>
  );
};

export default DebugPanel;