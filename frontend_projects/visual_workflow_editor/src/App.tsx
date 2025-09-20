import React, { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { ThemeProvider } from './contexts/ThemeContext';
import { AnimationProvider } from './components/animations/AnimationProvider';
import WorkflowCanvas, { WorkflowCanvasHandle } from './components/WorkflowCanvas';
import NodePanel from './components/NodePanel';
import PropertyPanel from './components/PropertyPanel';
import Toolbar from './components/Toolbar';
import ExecutionMonitor from './components/ExecutionMonitor';
import DebugPanel from './components/DebugPanel';
import UserGuide from './components/UserGuide';
import ErrorBoundary from './components/error/ErrorBoundary';
import { useErrorNotification } from './components/error/ErrorNotification';
import { workflowApi, debugApi, createMonitoringHooks } from './services/api';
import { errorService } from './services/errorService';
import type { WorkflowNode, WorkflowEdge, Workflow, WorkflowExecution } from './types/workflow';
import ShortcutsModal from './components/ShortcutsModal';
import ToastHost, { showToast } from './components/Toast';
import './App.css';
import './styles/theme.css';
import './styles/responsive.css';

const LS_PREFIX = 'vw_';
const LS_KEYS = {
  snapToGrid: `${LS_PREFIX}snapToGrid`,
  gridSize: `${LS_PREFIX}gridSize`,
  reducedMotion: `${LS_PREFIX}reducedMotion`,
  sizeMode: `${LS_PREFIX}sizeMode`,
  lastFitViewAt: `${LS_PREFIX}lastFitViewAt`,
  showGrid: `${LS_PREFIX}showGrid`,
  edgeStyle: `${LS_PREFIX}edgeStyle`, // 'smooth' | 'orthogonal'
  autoAlign: `${LS_PREFIX}autoAlign`,
};

const App: React.FC = () => {
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const [isDebugging, setIsDebugging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<WorkflowExecution | null>(null);
  const [showExecutionMonitor, setShowExecutionMonitor] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  // 移动端侧栏浮层开关（md 以下显示）
  const [showLeftOverlay, setShowLeftOverlay] = useState(false);
  const [showRightOverlay, setShowRightOverlay] = useState(false);

  // Polish v3/v4: 画布控制（网格吸附/尺寸/fitView）与持久化
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [gridSize, setGridSize] = useState<number>(8);
  // v5: 网格显隐与边样式
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [edgeStyle, setEdgeStyle] = useState<'smooth' | 'orthogonal'>('smooth');
  // v6: 自动对齐参考线
  const [autoAlign, setAutoAlign] = useState<boolean>(true);

  // v4: Reduced Motion + SizeMode（R 模式）
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [sizeMode, setSizeMode] = useState<boolean>(false);

  // v4: 多选（供 Toolbar 启用/禁用对齐/分布）
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 快捷键帮助
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // E2E 只读 QA Hooks（不改变状态，仅暴露只读信息）
  useEffect(() => {
    const hooks = {
      get version() { return 'v6'; },
      get selectedCount() { return selectedIds.length; },
      get selectedIds() { return [...selectedIds]; },
      get gridSize() { return gridSize; },
      get snapEnabled() { return snapEnabled; },
      get showGrid() { return showGrid; },
      get edgeStyle() { return edgeStyle; },
      get reducedMotion() { return reducedMotion; },
      get sizeMode() { return sizeMode; },
      get autoAlign() { return autoAlign; },
      get nodes() {
        return nodes.map(n => ({
          id: n.id,
          position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
          groupId: (n as any).groupId,
          locked: !!(n as any).locked,
        }));
      },
      get edges() {
        return edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          edgeType: (e as any).edgeType || edgeStyle,
        }));
      },
    };
    (window as any).__qaHooks = hooks;
    return () => {
      if ((window as any).__qaHooks === hooks) {
        try { delete (window as any).__qaHooks; } catch {}
      }
    };
  }, [selectedIds, gridSize, snapEnabled, showGrid, edgeStyle, reducedMotion, sizeMode, autoAlign, nodes, edges]);

  // Canvas ref（对齐/分布 API）
  const canvasRef = useRef<WorkflowCanvasHandle | null>(null);

  // Overlay 焦点管理
  const leftOverlayRef = useRef<HTMLDivElement>(null);
  const rightOverlayRef = useRef<HTMLDivElement>(null);

  const monitoringHooks = createMonitoringHooks();
  const errorNotification = useErrorNotification();

  useEffect(() => {
    if (currentWorkflow?.id && (showExecutionMonitor || isDebugging)) {
      monitoringHooks.startMonitoring(currentWorkflow.id, (messageEvent) => {
        console.log('WebSocket消息:', messageEvent);
      });
      return () => {
        monitoringHooks.stopMonitoring();
      };
    }
  }, [currentWorkflow?.id, showExecutionMonitor, isDebugging]);

  // 初始读取持久化设置
  useEffect(() => {
    try {
      const snap = localStorage.getItem(LS_KEYS.snapToGrid);
      if (snap !== null) {
        setSnapEnabled(snap === 'true');
      }
      const gs = localStorage.getItem(LS_KEYS.gridSize);
      if (gs !== null) {
        const n = Number(gs);
        setGridSize(n === 8 || n === 16 || n === 24 ? n : 8);
      }
      // Reduced Motion: 默认遵从系统；如有用户偏好则覆盖
      const sysRM = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const rm = localStorage.getItem(LS_KEYS.reducedMotion);
      const rmVal = rm === null ? !!sysRM : rm === 'true';
      setReducedMotion(rmVal);
      if (typeof document !== 'undefined') {
        document.body.dataset.reducedMotion = rmVal ? '1' : '0';
      }
      // SizeMode（R）
      const sm = localStorage.getItem(LS_KEYS.sizeMode);
      const smVal = sm === 'true';
      setSizeMode(smVal);
      if (typeof document !== 'undefined') {
        document.body.dataset.resize = smVal ? '1' : '0';
      }
      // v5: 网格显隐
      const sg = localStorage.getItem(LS_KEYS.showGrid);
      setShowGrid(sg === null ? true : sg === 'true');
      // v5: 边样式
      const es = localStorage.getItem(LS_KEYS.edgeStyle);
      setEdgeStyle(es === 'orthogonal' ? 'orthogonal' : 'smooth');
      // v6: 自动对齐（默认 true）
      const aa = localStorage.getItem(LS_KEYS.autoAlign);
      setAutoAlign(aa === null ? true : aa === 'true');
    } catch {}
  }, []);

  // 初始化设置 CSS 变量 --toolbar-height（默认 56px）
  useEffect(() => {
    try {
      document.documentElement.style.setProperty('--toolbar-height', '56px');
    } catch {}
  }, []);

  // ESC 关闭 overlay，打开时聚焦容器
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLeftOverlay) setShowLeftOverlay(false);
        if (showRightOverlay) setShowRightOverlay(false);
        if (shortcutsOpen) setShortcutsOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showLeftOverlay, showRightOverlay, shortcutsOpen]);

  useEffect(() => {
    if (showLeftOverlay) {
      leftOverlayRef.current?.focus();
    }
  }, [showLeftOverlay]);
  useEffect(() => {
    if (showRightOverlay) {
      rightOverlayRef.current?.focus();
    }
  }, [showRightOverlay]);

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

  const handleUpdateNode = (nodeId: string, updates: Partial<WorkflowNode>) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node
    ));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(node => node.id !== nodeId));
    setEdges(prev => prev.filter(edge =>
      edge.source !== nodeId && edge.target !== nodeId
    ));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  };

  const handleAddEdge = (edge: WorkflowEdge) => {
    setEdges(prev => [...prev, edge]);
  };

  const handleDeleteEdge = (edgeId: string) => {
    setEdges(prev => prev.filter(edge => edge.id !== edgeId));
  };

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

  const handleExecuteWorkflow = async () => {
    if (nodes.length === 0) {
      message.warning('请先添加节点');
      return;
    }
    setIsExecuting(true);
    setShowExecutionMonitor(true);
    try {
      if (!currentWorkflow) {
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
  }, [currentExecution, currentWorkflow, errorNotification]);

  const handlePauseExecution = useCallback(() => {
    setIsPaused(true);
    message.info('工作流执行已暂停');
  }, []);

  const handleResumeExecution = useCallback(() => {
    setIsPaused(false);
    message.info('工作流执行已恢复');
  }, []);

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
  }, [currentWorkflow, currentExecution, errorNotification]);

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

  // 工具栏回调：持久化 + Toast
  const toggleSnap = useCallback(() => {
    setSnapEnabled((v) => {
      const nv = !v;
      try { localStorage.setItem(LS_KEYS.snapToGrid, String(nv)); } catch {}
      showToast(nv ? '吸附：开' : '吸附：关');
      return nv;
    });
  }, []);

  const cycleGridSize = useCallback(() => {
    setGridSize((g) => {
      const ng = g === 8 ? 16 : g === 16 ? 24 : 8;
      try { localStorage.setItem(LS_KEYS.gridSize, String(ng)); } catch {}
      showToast(`网格=${ng}`);
      return ng;
    });
  }, []);

  const fitViewNow = useCallback(() => {
    try { canvasRef.current?.fitView?.(); } catch {}
    try { localStorage.setItem(LS_KEYS.lastFitViewAt, String(Date.now())); } catch {}
    showToast('视图已重置');
  }, []);

  const toggleReducedMotion = useCallback(() => {
    setReducedMotion((rm) => {
      const nrm = !rm;
      try { localStorage.setItem(LS_KEYS.reducedMotion, String(nrm)); } catch {}
      if (typeof document !== 'undefined') {
        document.body.dataset.reducedMotion = nrm ? '1' : '0';
      }
      showToast(nrm ? '降低动画：开' : '降低动画：关');
      return nrm;
    });
  }, []);

  // v5: 网格显隐切换
  const toggleShowGrid = useCallback(() => {
    setShowGrid((v) => {
      const nv = !v;
      try { localStorage.setItem(LS_KEYS.showGrid, String(nv)); } catch {}
      showToast(nv ? '显示网格：开' : '显示网格：关');
      return nv;
    });
  }, []);

  // v5: 边样式切换 Smooth/Orthogonal
  const toggleEdgeStyle = useCallback(() => {
    setEdgeStyle((s) => {
      const ns: 'smooth' | 'orthogonal' = s === 'smooth' ? 'orthogonal' : 'smooth';
      try { localStorage.setItem(LS_KEYS.edgeStyle, ns); } catch {}
      showToast(ns === 'smooth' ? '边样式：平滑' : '边样式：直角');
      return ns;
    });
  }, []);

  // v5: 显式设置边样式（供 Toolbar 按钮组调用）
  const setEdgeStyleExplicit = useCallback((style: 'smooth' | 'orthogonal') => {
    setEdgeStyle((s) => {
      if (s === style) return s;
      try { localStorage.setItem(LS_KEYS.edgeStyle, style); } catch {}
      showToast(style === 'smooth' ? '边样式：平滑' : '边样式：直角');
      return style;
    });
  }, []);

  // 对齐/分布回调（按钮用）
  const alignLeft = useCallback(() => {
    if (selectedIds.length < 2) return;
    canvasRef.current?.alignLeft();
    showToast('左对齐完成');
  }, [selectedIds]);
  const alignCenterX = useCallback(() => {
    if (selectedIds.length < 2) return;
    canvasRef.current?.alignCenterX();
    showToast('水平居中对齐完成');
  }, [selectedIds]);
  const alignRight = useCallback(() => {
    if (selectedIds.length < 2) return;
    canvasRef.current?.alignRight();
    showToast('右对齐完成');
  }, [selectedIds]);
  const alignTop = useCallback(() => {
    if (selectedIds.length < 2) return;
    canvasRef.current?.alignTop();
    showToast('顶对齐完成');
  }, [selectedIds]);
  const alignCenterY = useCallback(() => {
    if (selectedIds.length < 2) return;
    canvasRef.current?.alignCenterY();
    showToast('垂直居中对齐完成');
  }, [selectedIds]);
  const alignBottom = useCallback(() => {
    if (selectedIds.length < 2) return;
    canvasRef.current?.alignBottom();
    showToast('底对齐完成');
  }, [selectedIds]);
  const distributeH = useCallback(() => {
    if (selectedIds.length < 3) return;
    canvasRef.current?.distributeH();
    showToast('水平等间距完成');
  }, [selectedIds]);
  const distributeV = useCallback(() => {
    if (selectedIds.length < 3) return;
    canvasRef.current?.distributeV();
    showToast('垂直等间距完成');
  }, [selectedIds]);

  // 全局快捷键（避免输入框时触发）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (t as any)?.isContentEditable) return;

      // v5: Undo/Redo & 复制剪切粘贴 / 组合 / 解组 / 锁定
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          canvasRef.current?.undo?.();
          showToast('撤销 1 步');
          return;
        }
        if ((k === 'z' && e.shiftKey) || k === 'y') {
          e.preventDefault();
          canvasRef.current?.redo?.();
          showToast('重做 1 步');
          return;
        }
        if (k === 'c') {
          e.preventDefault();
          const count = canvasRef.current?.copy?.() || 0;
          showToast(count > 0 ? `已复制 ${count} 个节点` : '无可复制的节点');
          return;
        }
        if (k === 'x') {
          e.preventDefault();
          const count = canvasRef.current?.cut?.() || 0;
          if (count > 0) showToast(`已剪切 ${count} 个节点`);
          return;
        }
        if (k === 'v') {
          e.preventDefault();
          const count = canvasRef.current?.paste?.() || 0;
          if (count > 0) showToast(`已粘贴 ${count} 个节点`);
          return;
        }
        if (k === 'g' && !e.shiftKey) {
          e.preventDefault();
          const ok = canvasRef.current?.groupSelected?.();
          if (ok) showToast('已组合');
          return;
        }
        if ((k === 'g' && e.shiftKey)) {
          e.preventDefault();
          const ok = canvasRef.current?.ungroupSelected?.();
          if (ok) showToast('已解组');
          return;
        }
        if (k === 'l') {
          e.preventDefault();
          const ok = canvasRef.current?.toggleLockSelected?.();
          if (ok) showToast('锁定状态已切换');
          return;
        }
      }

      // 帮助：?（Shift+/ 或 直接 ?）
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      // 尺寸模式：R
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        const nv = !(document.body.dataset.resize === '1');
        document.body.dataset.resize = nv ? '1' : '0';
        setSizeMode(nv);
        try { localStorage.setItem(LS_KEYS.sizeMode, String(nv)); } catch {}
        showToast(nv ? '尺寸模式：开' : '尺寸模式：关');
        return;
      }

      // 网格吸附：G
      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        toggleSnap();
        return;
      }

      // 网格尺寸：[ / ]
      if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        cycleGridSize();
        return;
      }

      // fitView：F
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        fitViewNow();
        return;
      }

      // 对齐/分布（Alt + Arrow / Alt+Shift+H/V）
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        // 分布
        if (e.shiftKey && (e.key.toLowerCase() === 'h' || e.key.toLowerCase() === 'v')) {
          e.preventDefault();
          if (e.key.toLowerCase() === 'h') {
            if (selectedIds.length >= 3) {
              canvasRef.current?.distributeH();
              showToast('水平等间距完成');
            }
          } else {
            if (selectedIds.length >= 3) {
              canvasRef.current?.distributeV();
              showToast('垂直等间距完成');
            }
          }
          return;
        }
        // 对齐（最近方向）
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          if (selectedIds.length >= 2) {
            if (e.key === 'ArrowLeft') {
              canvasRef.current?.alignLeft();
              showToast('左对齐完成');
            } else if (e.key === 'ArrowRight') {
              canvasRef.current?.alignRight();
              showToast('右对齐完成');
            } else if (e.key === 'ArrowUp') {
              canvasRef.current?.alignTop();
              showToast('顶对齐完成');
            } else if (e.key === 'ArrowDown') {
              canvasRef.current?.alignBottom();
              showToast('底对齐完成');
            }
          }
          return;
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedIds, toggleSnap, cycleGridSize, fitViewNow]);

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
      // 移动端按钮控制浮层
      onToggleLeftPanel={() => setShowLeftOverlay(true)}
      onToggleRightPanel={() => setShowRightOverlay(true)}
      // Polish v3: 画布控制
      snapEnabled={snapEnabled}
      gridSize={gridSize}
      onToggleSnap={toggleSnap}
      onGridSizeCycle={cycleGridSize}
      onFitView={fitViewNow}
      // v4: 对齐/分布 + 辅助
      selectedCount={selectedIds.length}
      onAlignLeft={alignLeft}
      onAlignCenterX={alignCenterX}
      onAlignRight={alignRight}
      onAlignTop={alignTop}
      onAlignCenterY={alignCenterY}
      onAlignBottom={alignBottom}
      onDistributeH={distributeH}
      onDistributeV={distributeV}
      reducedMotion={reducedMotion}
      onToggleReducedMotion={toggleReducedMotion}
      onToggleHelp={() => setShortcutsOpen(true)}
      // v5: 网格显隐 & 边样式 & 布局导入导出
      showGrid={showGrid}
      onToggleShowGrid={toggleShowGrid}
      edgeStyle={edgeStyle}
      onToggleEdgeStyle={toggleEdgeStyle}
      onEdgeStyleChange={setEdgeStyleExplicit}
      onExportLayout={() => {
        try {
          const json = canvasRef.current?.exportLayout?.();
          if (!json) return;
          const dataStr = JSON.stringify(json, null, 2);
          const blob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `layout_${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('布局已导出');
        } catch {}
      }}
      onImportLayout={(obj) => {
        try {
          const ok = canvasRef.current?.importLayout?.(obj);
          if (ok) showToast('布局已导入');
        } catch {}
      }}
      // v6: 清空画布（通过 Canvas ref）
      onClearCanvas={() => {
        try { canvasRef.current?.clearCanvas?.(); } catch {}
      }}
      // v6: Toolbar 展开高度同步 + 自动对齐（AA）
      onToolsExpandedChange={(expanded) => {
        try {
          document.documentElement.style.setProperty('--toolbar-height', expanded ? '112px' : '56px');
        } catch {}
      }}
      autoAlign={autoAlign}
      onToggleAutoAlign={() => {
        setAutoAlign((v) => {
          const nv = !v;
          try { localStorage.setItem(LS_KEYS.autoAlign, String(nv)); } catch {}
          showToast(nv ? '自动对齐：开' : '自动对齐：关');
          return nv;
        });
      }}
    />
  );

  const workflowCanvas = (
    <div data-tour="workflow-canvas" className="workflow-canvas h-full">
      <WorkflowCanvas
        ref={canvasRef}
        nodes={nodes}
        edges={edges}
        onNodesChange={setNodes}
        onEdgesChange={setEdges}
        onNodeSelect={setSelectedNode}
        onNodeUpdate={handleUpdateNode}
        onNodeDelete={handleDeleteNode}
        onEdgeAdd={handleAddEdge}
        onEdgeDelete={handleDeleteEdge}
        snapEnabled={snapEnabled}
        gridSize={gridSize}
        onSelectionChange={setSelectedIds}
        showGrid={showGrid}
        edgeStyle={edgeStyle}
        autoAlign={autoAlign}
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
          <div className="app min-h-screen" data-reduced-motion={reducedMotion ? '1' : '0'}>
            {/* Toast 容器（右上角） */}
            <ToastHost />

            <header className="flex items-center bg-white px-4">
              {toolbar}
            </header>

            {/* 移动端浮层（md 以下显示）：节点面板 */}
            {showLeftOverlay && (
              <div className="fixed inset-0 z-50 md:hidden">
                <div
                  className="absolute inset-0 bg-black/40"
                  aria-label="关闭节点面板浮层"
                  onClick={() => setShowLeftOverlay(false)}
                />
                <div
                  ref={leftOverlayRef}
                  tabIndex={-1}
                  role="dialog"
                  aria-modal="true"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[88vw] w-[88vw] h-[82vh] rounded border border-gray-200 bg-white shadow-md overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
                >
                  <div className="h-full overflow-auto p-4">
                    <NodePanel onAddNode={handleAddNode} />
                  </div>
                </div>
              </div>
            )}

            {/* 移动端浮层（md 以下显示）：属性面板 */}
            {showRightOverlay && (
              <div className="fixed inset-0 z-50 md:hidden">
                <div
                  className="absolute inset-0 bg-black/40"
                  aria-label="关闭属性面板浮层"
                  onClick={() => setShowRightOverlay(false)}
                />
                <div
                  ref={rightOverlayRef}
                  tabIndex={-1}
                  role="dialog"
                  aria-modal="true"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[88vw] w-[88vw] h-[82vh] rounded border border-gray-200 bg-white shadow-md overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
                >
                  <div className="h-full overflow-auto p-4">
                    <PropertyPanel
                      selectedNode={selectedNode}
                      onNodeUpdate={handleUpdateNode}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4 p-4 overflow-hidden">
              <aside className="hidden md:flex shrink-0 w-[280px] lg:w-[320px]">
                <div className="node-panel w-full">
                  <NodePanel onAddNode={handleAddNode} />
                </div>
              </aside>
              <main className="flex-1 min-w-0">
                <ErrorBoundary
                  level="component"
                  showDetails={import.meta.env.MODE === 'development'}
                  onError={(error, errorInfo) => {
                    errorService.reportComponentError(error, errorInfo, 'WorkflowCanvas');
                  }}
                >
                  {workflowCanvas}
                </ErrorBoundary>
              </main>
              <aside className="hidden md:flex shrink-0 w-[320px] lg:w_[360px]">
                <div className="w-full h-full flex flex-col gap-4">
                  <div className="property-panel overflow-auto rounded border border-gray-200 bg-white p-4 space-y-4">
                    <PropertyPanel
                      selectedNode={selectedNode}
                      onNodeUpdate={handleUpdateNode}
                    />
                  </div>
                  {showExecutionMonitor && (
                    <div className="rounded border border-gray-200 bg-white p-4">
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
                    </div>
                  )}
                  {showDebugPanel && (
                    <div className="rounded border border-gray-200 bg-white p-4">
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
                    </div>
                  )}
                </div>
              </aside>
            </div>
            <ErrorBoundary
              level="component"
              showDetails={import.meta.env.MODE === 'development'}
              onError={(error, errorInfo) => {
                errorService.reportComponentError(error, errorInfo, 'UserGuide');
              }}
            >
              <UserGuide />
            </ErrorBoundary>

            {/* 快捷键帮助 Modal */}
            <ShortcutsModal
              open={shortcutsOpen}
              onClose={() => setShortcutsOpen(false)}
            />
          </div>
        </AnimationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;