import React, { useState, useEffect, useCallback } from 'react';
import { Layout, message, Tabs, Drawer } from 'antd';
import { ThemeProvider } from './contexts/ThemeContext';
import { AnimationProvider } from './components/animations/AnimationProvider';
import ResponsiveLayout from './components/responsive/ResponsiveLayout';
import WorkflowCanvas from './components/WorkflowCanvas';
import NodePanel from './components/NodePanel';
import PropertyPanel from './components/PropertyPanel';
import Toolbar from './components/Toolbar';
import ExecutionMonitor from './components/ExecutionMonitor';
import DebugPanel from './components/DebugPanel';
import UserGuide from './components/UserGuide';
import ErrorBoundary from './components/error/ErrorBoundary';
import { useErrorNotification } from './components/error/ErrorNotification';
import { workflowApi, websocketApi, debugApi, createMonitoringHooks } from './services/api';
import { errorService } from './services/errorService';
import type { WorkflowNode, WorkflowEdge, Workflow, WorkflowExecution } from './types/workflow';
import './App.css';
import './styles/theme.css';
import './styles/responsive.css';

const { Header, Sider, Content } = Layout;
const { TabPane } = Tabs;

const App: React.FC = () => {
  // 基础状态
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  
  // 调试和监控状态
  const [isDebugging, setIsDebugging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<WorkflowExecution | null>(null);
  const [showExecutionMonitor, setShowExecutionMonitor] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  // WebSocket监控钩子
  const monitoringHooks = createMonitoringHooks();
  
  // 错误通知钩子
  const errorNotification = useErrorNotification();

  // 初始化WebSocket连接
  useEffect(() => {
    if (currentWorkflow?.id && (showExecutionMonitor || isDebugging)) {
      monitoringHooks.startMonitoring(currentWorkflow.id, (message) => {
        console.log('WebSocket消息:', message);
        // 这里可以处理WebSocket消息，更新UI状态
      });

      return () => {
        monitoringHooks.stopMonitoring();
      };
    }
  }, [currentWorkflow?.id, showExecutionMonitor, isDebugging]);

  // 添加节点
  const handleAddNode = (nodeType: string, position: { x: number; y: number }) => {
    const newNode: WorkflowNode = {
      id: `node_${Date.now()}`,
      type: nodeType as any,
      position,
      data: {
        label: `${nodeType}节点`,
        config: getDefaultNodeConfig(nodeType) as any,
      },
    };
    setNodes(prev => [...prev, newNode]);
  };

  // 获取默认节点配置
  const getDefaultNodeConfig = (nodeType: string) => {
    switch (nodeType) {
      case 'llm':
        return {
          label: 'LLM节点',
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          prompt: '',
          temperature: 0.7,
          maxTokens: 1000,
        };
      case 'input':
        return {
          label: '输入节点',
          inputType: 'text',
          defaultValue: '',
          placeholder: '请输入内容',
        };
      case 'output':
        return {
          label: '输出节点',
          outputType: 'text',
          format: 'plain',
        };
      case 'code':
        return {
          label: '代码块节点',
          language: 'python',
          code: '# 在这里编写代码\nprint("Hello, World!")',
          dependencies: [],
        };
      case 'condition':
        return {
          label: '条件判断节点',
          condition: 'input.length > 10',
          true_output: '长文本',
          false_output: '短文本',
        };
      case 'switch':
        return {
          label: '开关路由节点',
          switch_map: {
            '1': '路径1',
            '2': '路径2',
            'default': '默认路径'
          },
        };
      case 'merger':
        return {
          label: '结果聚合节点',
          merge_strategy: 'concat',
          separator: '\n',
        };
      default:
        return { label: '未知节点' };
    }
  };

  // 更新节点
  const handleUpdateNode = (nodeId: string, updates: Partial<WorkflowNode>) => {
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, ...updates } : node
    ));
    
    // 如果更新的是当前选中的节点，也要更新选中状态
    if (selectedNode?.id === nodeId) {
      setSelectedNode(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  // 删除节点
  const handleDeleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(node => node.id !== nodeId));
    setEdges(prev => prev.filter(edge => 
      edge.source !== nodeId && edge.target !== nodeId
    ));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  };

  // 添加连接
  const handleAddEdge = (edge: WorkflowEdge) => {
    setEdges(prev => [...prev, edge]);
  };

  // 删除连接
  const handleDeleteEdge = (edgeId: string) => {
    setEdges(prev => prev.filter(edge => edge.id !== edgeId));
  };

  // 保存工作流
  const handleSaveWorkflow = async (name: string, description?: string) => {
    try {
      const workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'> = {
        name,
        description,
        nodes,
        edges,
      };
      
      const response = await workflowApi.createWorkflow(workflow);
      if (response.success && response.data) {
        setCurrentWorkflow(response.data);
        message.success('工作流保存成功');
      } else {
        throw new Error(response.message || '保存失败');
      }
    } catch (error) {
      console.error('保存工作流失败:', error);
      const errorId = errorService.reportWorkflowError(error as Error, {
        workflowId: currentWorkflow?.id,
        action: 'save_workflow',
        data: { name, description }
      });
      errorNotification.showWorkflowError({
        id: errorId,
        level: 'error',
        category: 'workflow',
        title: '工作流保存失败',
        message: (error as Error).message,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        sessionId: errorService.getSessionInfo().sessionId,
      });
    }
  };

  // 加载工作流
  const handleLoadWorkflow = async (workflowId: string) => {
    try {
      const response = await workflowApi.getWorkflow(workflowId);
      if (response.success && response.data) {
        const workflow = response.data;
        setCurrentWorkflow(workflow);
        setNodes(workflow.nodes);
        setEdges(workflow.edges);
        message.success('工作流加载成功');
      } else {
        throw new Error(response.message || '加载失败');
      }
    } catch (error) {
      console.error('加载工作流失败:', error);
      const errorId = errorService.reportWorkflowError(error as Error, {
        workflowId: workflowId,
        action: 'load_workflow'
      });
      errorNotification.showWorkflowError({
        id: errorId,
        level: 'error',
        category: 'workflow',
        title: '工作流加载失败',
        message: (error as Error).message,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        sessionId: errorService.getSessionInfo().sessionId,
      });
    }
  };

  // 执行工作流
  const handleExecuteWorkflow = async () => {
    if (nodes.length === 0) {
      message.warning('请先添加节点');
      return;
    }

    setIsExecuting(true);
    setShowExecutionMonitor(true);
    
    try {
      if (!currentWorkflow) {
        // 如果没有保存的工作流，先创建一个临时的
        const tempWorkflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'> = {
          name: '临时工作流',
          description: '未保存的工作流',
          nodes,
          edges,
        };
        
        const createResponse = await workflowApi.createWorkflow(tempWorkflow);
        if (createResponse.success && createResponse.data) {
          setCurrentWorkflow(createResponse.data);
          const execResponse = await workflowApi.executeWorkflow(createResponse.data.id);
          if (execResponse.success && execResponse.data) {
            setCurrentExecution(execResponse.data);
            message.success('工作流开始执行');
          }
        }
      } else {
        const response = await workflowApi.executeWorkflow(currentWorkflow.id);
        if (response.success && response.data) {
          setCurrentExecution(response.data);
          message.success('工作流开始执行');
        } else {
          throw new Error(response.message || '执行失败');
        }
      }
    } catch (error) {
      console.error('执行工作流失败:', error);
      const errorId = errorService.reportWorkflowError(error as Error, {
        workflowId: currentWorkflow?.id,
        action: 'execute_workflow'
      });
      errorNotification.showWorkflowError({
        id: errorId,
        level: 'error',
        category: 'workflow',
        title: '工作流执行失败',
        message: (error as Error).message,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        sessionId: errorService.getSessionInfo().sessionId,
      });
      setIsExecuting(false);
    }
  };

  // 停止执行
  const handleStopExecution = useCallback(async () => {
    if (currentExecution?.id) {
      try {
        await workflowApi.stopExecution(currentExecution.id);
        setIsExecuting(false);
        setIsPaused(false);
        message.info('工作流执行已停止');
      } catch (error) {
        console.error('停止执行失败:', error);
        const errorId = errorService.reportWorkflowError(error as Error, {
          workflowId: currentWorkflow?.id,
          executionId: currentExecution?.id,
          action: 'stop_execution'
        });
        errorNotification.showWorkflowError({
          id: errorId,
          level: 'error',
          category: 'workflow',
          title: '停止执行失败',
          message: (error as Error).message,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          sessionId: errorService.getSessionInfo().sessionId,
        });
      }
    }
  }, [currentExecution]);

  // 暂停执行
  const handlePauseExecution = useCallback(() => {
    setIsPaused(true);
    message.info('工作流执行已暂停');
  }, []);

  // 恢复执行
  const handleResumeExecution = useCallback(() => {
    setIsPaused(false);
    message.info('工作流执行已恢复');
  }, []);

  // 单步执行
  const handleStepExecution = useCallback(async () => {
    if (currentWorkflow?.id) {
      try {
        await debugApi.stepExecute(currentWorkflow.id, currentExecution?.id);
        message.info('单步执行完成');
      } catch (error) {
        console.error('单步执行失败:', error);
        const errorId = errorService.reportWorkflowError(error as Error, {
          workflowId: currentWorkflow?.id,
          executionId: currentExecution?.id,
          action: 'step_execution'
        });
        errorNotification.showWorkflowError({
          id: errorId,
          level: 'error',
          category: 'workflow',
          title: '单步执行失败',
          message: (error as Error).message,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          sessionId: errorService.getSessionInfo().sessionId,
        });
      }
    }
  }, [currentWorkflow, currentExecution]);

  // 重置工作流
  const handleResetWorkflow = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setCurrentWorkflow(null);
    setCurrentExecution(null);
    setIsExecuting(false);
    setIsPaused(false);
    message.info('工作流已重置');
  };

  // 切换调试模式
  const handleDebugToggle = useCallback(async (enabled: boolean) => {
    setIsDebugging(enabled);
    setShowDebugPanel(enabled);
    
    if (currentWorkflow?.id) {
      try {
        await debugApi.enableDebugMode(currentWorkflow.id, enabled);
        message.info(enabled ? '调试模式已开启' : '调试模式已关闭');
      } catch (error) {
        console.error('切换调试模式失败:', error);
      }
    }
  }, [currentWorkflow]);

  // 工具栏组件
  const toolbar = (
    <Toolbar
      onSave={handleSaveWorkflow}
      onLoad={handleLoadWorkflow}
      onExecute={handleExecuteWorkflow}
      onReset={handleResetWorkflow}
      isExecuting={isExecuting}
      currentWorkflow={currentWorkflow}
      onDebugToggle={() => handleDebugToggle(!isDebugging)}
      isDebugging={isDebugging}
      onShowMonitor={() => setShowExecutionMonitor(!showExecutionMonitor)}
    />
  );

  // 侧边面板组件
  const sidePanel = (
    <div data-tour="node-panel">
      <NodePanel onAddNode={handleAddNode} />
    </div>
  );

  // 属性面板组件
  const propertyPanel = (
    <div data-tour="property-panel">
      <Tabs defaultActiveKey="properties" style={{ height: '100%' }}>
        <Tabs.TabPane tab="属性" key="properties">
          <PropertyPanel
            selectedNode={selectedNode}
            onNodeUpdate={handleUpdateNode}
          />
        </Tabs.TabPane>
        
        {showExecutionMonitor && (
          <Tabs.TabPane tab="执行监控" key="monitor">
            <ExecutionMonitor
              workflowId={currentWorkflow?.id || ''}
              nodes={nodes}
              execution={currentExecution}
              isExecuting={isExecuting}
              onStop={handleStopExecution}
              onPause={handlePauseExecution}
              onResume={handleResumeExecution}
              onStepNext={handleStepExecution}
            />
          </Tabs.TabPane>
        )}
        
        {showDebugPanel && (
          <Tabs.TabPane tab="调试" key="debug">
            <DebugPanel
              workflowId={currentWorkflow?.id || ''}
              nodes={nodes}
              edges={edges}
              selectedNodeId={selectedNode?.id}
              isDebugging={isDebugging}
              isPaused={isPaused}
              onDebugToggle={handleDebugToggle}
              onStepExecute={handleStepExecution}
              onContinue={handleResumeExecution}
              onReset={handleResetWorkflow}
            />
          </Tabs.TabPane>
        )}
      </Tabs>
    </div>
  );

  // 主画布组件
  const workflowCanvas = (
    <div data-tour="workflow-canvas" className="workflow-canvas">
      <WorkflowCanvas
        nodes={nodes}
        edges={edges}
        onNodesChange={setNodes}
        onEdgesChange={setEdges}
        onNodeSelect={setSelectedNode}
        onNodeUpdate={handleUpdateNode}
        onNodeDelete={handleDeleteNode}
        onEdgeAdd={handleAddEdge}
        onEdgeDelete={handleDeleteEdge}
      />
    </div>
  );

  return (
    <ErrorBoundary
      level="critical"
      showDetails={import.meta.env.MODE === 'development'}
      onError={(error, errorInfo) => {
        errorService.reportComponentError(error, errorInfo, 'App');
      }}
    >
      <ThemeProvider>
        <AnimationProvider>
          <div className="app">
            <ErrorBoundary
              level="page"
              showDetails={import.meta.env.MODE === 'development'}
              onError={(error, errorInfo) => {
                errorService.reportComponentError(error, errorInfo, 'ResponsiveLayout');
              }}
            >
              <ResponsiveLayout
                header={toolbar}
                sidePanel={sidePanel}
                propertyPanel={propertyPanel}
              >
                <ErrorBoundary
                  level="component"
                  showDetails={import.meta.env.MODE === 'development'}
                  onError={(error, errorInfo) => {
                    errorService.reportComponentError(error, errorInfo, 'WorkflowCanvas');
                  }}
                >
                  {workflowCanvas}
                </ErrorBoundary>
              </ResponsiveLayout>
            </ErrorBoundary>
            <ErrorBoundary
              level="component"
              showDetails={import.meta.env.MODE === 'development'}
              onError={(error, errorInfo) => {
                errorService.reportComponentError(error, errorInfo, 'UserGuide');
              }}
            >
              <UserGuide />
            </ErrorBoundary>
          </div>
        </AnimationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;