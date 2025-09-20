import React, { useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Connection,
  ConnectionMode,
  ReactFlowProvider,
  ReactFlowInstance,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  ConnectionLineType,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';

import LLMNode from './nodes/LLMNode';
import InputNode from './nodes/InputNode';
import OutputNode from './nodes/OutputNode';
import CodeBlockNode from './nodes/CodeBlockNode';
import ConditionNode from './nodes/ConditionNode';
import SwitchNode from './nodes/SwitchNode';
import MergerNode from './nodes/MergerNode';
import type { WorkflowNode, WorkflowEdge } from '../types/workflow';
import ContextMenu, { MenuItem } from './ContextMenu';
import { showToast } from './Toast';

// 自定义节点类型注册
const nodeTypes = {
  llm: LLMNode,
  input: InputNode,
  output: OutputNode,
  code: CodeBlockNode,
  condition: ConditionNode,
  switch: SwitchNode,
  merger: MergerNode,
} as any;

interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onNodesChange: (nodes: WorkflowNode[]) => void;
  onEdgesChange: (edges: WorkflowEdge[]) => void;
  onNodeSelect: (node: WorkflowNode | null) => void;
  onNodeUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  onNodeDelete: (nodeId: string) => void;
  onEdgeAdd: (edge: WorkflowEdge) => void;
  onEdgeDelete: (edgeId: string) => void;

  // Polish v3: canvas controls
  snapEnabled: boolean;
  gridSize: number; // 8 | 16 | 24
  fitViewTick?: number; // increase to trigger fitView()

  // v4: selection sync to Toolbar/App
  onSelectionChange?: (ids: string[]) => void;

  // v5: 画布 Background 显隐 & 边样式切换
  showGrid?: boolean;
  edgeStyle?: 'smooth' | 'orthogonal';

  // v6: 自动对齐参考线（关闭后完全跳过 rAF/centers 计算）
  autoAlign?: boolean;
}

// v4: 暴露对齐/分布 API 供 Toolbar 调用
export type WorkflowCanvasHandle = {
  // Generalized APIs
  alignSelected: (dir: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => boolean;
  distributeSelected: (mode: 'horizontal' | 'vertical') => boolean;
  fitView: () => boolean;

  // Backward-compatible granular APIs
  alignLeft: () => boolean;
  alignCenterX: () => boolean;
  alignRight: () => boolean;
  alignTop: () => boolean;
  alignCenterY: () => boolean;
  alignBottom: () => boolean;
  distributeH: () => boolean;
  distributeV: () => boolean;

  getSelectedIds: () => string[];

  // v5: 基本时光旅行与剪贴板
  undo: () => boolean;
  redo: () => boolean;
  copy: () => number;
  cut: () => number;
  paste: () => number;

  // v5: 组合/解组/锁定
  groupSelected: () => boolean;
  ungroupSelected: () => boolean;
  toggleLockSelected: () => boolean;

  // v5: 导入/导出布局
  exportLayout: () => any;
  importLayout: (data: any) => boolean;

  // v6: 规范化清空画布
  clearCanvas: () => boolean;
};

const DEFAULT_W = 240;
const DEFAULTH = 120;

const WorkflowCanvas = forwardRef<WorkflowCanvasHandle, WorkflowCanvasProps>(({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeSelect,
  onNodeUpdate,
  onNodeDelete,
  onEdgeAdd,
  onEdgeDelete,
  // Polish v3: canvas controls from Toolbar/App
  snapEnabled,
  gridSize,
  fitViewTick,
  onSelectionChange,
  // v5
  showGrid = true,
  edgeStyle = 'smooth',
  // v6
  autoAlign = true,
}, ref) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance | null>(null);
  // 初始视野标记（仅首次设定默认缩放/视野）
  const didInitRef = useRef(false);

  // 对齐参考线（屏幕坐标，单位 px，相对于 canvas-wrap 内部）
  const [guideX, setGuideX] = React.useState<number | null>(null);
  const [guideY, setGuideY] = React.useState<number | null>(null);
  // 性能优化：缓存其它节点中心点 + rAF 节流，避免每帧 DOM 扫描
  const centersRef = React.useRef<{ id: string; cx: number; cy: number }[]>([]);
  const rafPendingRef = React.useRef<boolean>(false);
  const rafIdRef = React.useRef<number | null>(null);
  const lastDragPosRef = React.useRef<{ x: number; y: number } | null>(null);

  // v5: Context Menu state
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [menuX, setMenuX] = React.useState(0);
  const [menuY, setMenuY] = React.useState(0);
  const [menuItems, setMenuItems] = React.useState<MenuItem[]>([]);
  // 粘贴锚点（世界坐标，优先将粘贴内容放到此位置附近）
  const pasteAnchorRef = React.useRef<{ x: number; y: number } | null>(null);

  // 处理节点变化（占位：此处保留日志便于调试）
  const handleNodesChange = useCallback((changes: any) => {
    const updated = applyNodeChanges(changes, nodes as unknown as Node[]);
    onNodesChange(updated as unknown as WorkflowNode[]);
  }, [nodes, onNodesChange]);

  // 处理边变化（占位）
  const handleEdgesChange = useCallback((changes: any) => {
    const updated = applyEdgeChanges(changes, edges as unknown as Edge[]);
    onEdgesChange(updated as unknown as WorkflowEdge[]);
  }, [edges, onEdgesChange]);

  // 处理连接创建
  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const newEdge: WorkflowEdge = {
      id: `edge_${Date.now()}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
      edgeType: edgeStyle,
    };
    onEdgeAdd(newEdge);
    // 连接创建后记录快照
    try { (window as any).__vw_snapshot?.('add-edge'); } catch {}
    try {
      if (typeof document !== 'undefined') {
        document.body.dataset.connecting = '0';
        const live = document.getElementById('live-region-connection');
        if (live) live.textContent = '连接状态：已完成';
      }
    } catch {}
  }, [onEdgeAdd, edgeStyle]);

  // 连接开始/结束（用于高亮潜在目标）
  const handleConnectStart = useCallback(() => {
    try {
      if (typeof document !== 'undefined') {
        document.body.dataset.connecting = '1';
        const live = document.getElementById('live-region-connection');
        if (live) live.textContent = '连接状态：进行中';
      }
    } catch {}
  }, []);

  const handleConnectEnd = useCallback(() => {
    try {
      if (typeof document !== 'undefined') {
        document.body.dataset.connecting = '0';
        const live = document.getElementById('live-region-connection');
        if (live) live.textContent = '连接状态：已取消';
      }
    } catch {}
  }, []);

  // 宽松连接判定：禁止自连 + 锁定节点不可连接
  const isValidConnection = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return false;
    const src = nodes.find(n => n.id === c.source);
    const tgt = nodes.find(n => n.id === c.target);
    if (src?.locked || tgt?.locked) return false;
    return true;
  }, [nodes]);

  // 处理节点点击
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    onNodeSelect(node as WorkflowNode);
  }, [onNodeSelect]);

  // 处理画布点击
  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  // v5: 右键菜单生成（根据选择态）
  const openContextMenuAt = useCallback((px: number, py: number, items: MenuItem[]) => {
    setMenuX(px);
    setMenuY(py);
    setMenuItems(items);
    setMenuOpen(true);
  }, []);




  // 处理拖拽放置（从侧栏拖入）
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
    const type = event.dataTransfer.getData('application/reactflow');

    if (typeof type === 'undefined' || !type || !reactFlowInstance || !reactFlowBounds) {
      return;
    }

    const position = reactFlowInstance.project({
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    });

    const newNode: WorkflowNode = {
      id: `node_${Date.now()}`,
      type: type as any,
      position,
      data: {
        label: `${type}节点`,
        config: getDefaultNodeConfig(type) as any,
      },
    };

    onNodesChange([...nodes, newNode]);
  }, [reactFlowInstance, nodes, onNodesChange]);

  // 获取默认节点配置
  const getDefaultNodeConfig = (nodeType: string) => {
    switch (nodeType) {
      case 'llm':
        return {
          label: 'LLM节点',
          provider: 'openai' as const,
          model: 'gpt-3.5-turbo',
          prompt: '',
          temperature: 0.7,
          maxTokens: 1000,
        };
      case 'input':
        return {
          label: '输入节点',
          inputType: 'text' as const,
          defaultValue: '',
          placeholder: '请输入内容',
        };
      case 'output':
        return {
          label: '输出节点',
          outputType: 'text' as const,
          format: 'plain',
        };
      case 'code':
        return {
          label: '代码块节点',
          language: 'python' as const,
          code: '# 在这里编写代码\nprint("Hello, World!")',
          dependencies: [],
        };
      case 'condition':
        return {
          label: '条件判断节点',
          condition: 'length > 10',
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
          merge_strategy: 'concat' as const,
          separator: '\n',
        };
      default:
        return { label: '未知节点' };
    }
  };

  // 拖拽悬停
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // 节点拖拽开始：缓存所有节点中心，标记 dragging，避免观察器造成抖动
  const handleNodeDragStart = useCallback((event: React.MouseEvent, node: Node) => {
    try {
      if (typeof document !== 'undefined') {
        document.body.dataset.dragging = '1';
        document.body.dataset.dragNodeId = String(node.id || '');
      }
      if (!autoAlign) {
        return;
      }
      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return;
      const nodeEls = Array.from(document.querySelectorAll('.react-flow__node')) as HTMLElement[];
      const centers = nodeEls.map((el) => {
        const r = el.getBoundingClientRect();
        const id = el.dataset.id || '';
        return { id, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      });
      centersRef.current = centers;

      // 记录起始中心点用于Δ阈值判定
      const draggedEl = document.querySelector(`.react-flow__node[data-id="${node.id}"]`) as HTMLElement | null;
      if (draggedEl) {
        const r = draggedEl.getBoundingClientRect();
        lastDragPosRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    } catch {}
  }, [autoAlign]);

  // 节点拖拽中：对齐参考线（±4px 容差）+ 吸附 ring 提示（近似判断）
  const ringTimerRef = React.useRef<any>(null);
  const handleNodeDrag = useCallback((event: React.MouseEvent, node: Node) => {
    if (!autoAlign) return;
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;

    // 预先测量中心点，并进行Δ阈值（≥2px）判定
    const draggedEl0 = document.querySelector(`.react-flow__node[data-id="${node.id}"]`) as HTMLElement | null;
    if (!draggedEl0) {
      setGuideX(null);
      setGuideY(null);
      return;
    }
    const rect0 = draggedEl0.getBoundingClientRect();
    const currCx = rect0.left + rect0.width / 2;
    const currCy = rect0.top + rect0.height / 2;
    const last = lastDragPosRef.current;
    if (last && Math.abs(currCx - last.x) < 2 && Math.abs(currCy - last.y) < 2) {
      // 小于阈值则跳过参考线计算
      return;
    }
    lastDragPosRef.current = { x: currCx, y: currCy };

    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    rafIdRef.current = requestAnimationFrame(() => {
      try {
        const wrapRect = wrapper.getBoundingClientRect();
        // 当前被拖拽节点中心（再次测量确保与绘制时一致）
        const draggedEl = document.querySelector(`.react-flow__node[data-id="${node.id}"]`) as HTMLElement | null;
        if (!draggedEl) {
          setGuideX(null);
          setGuideY(null);
          return;
        }
        const innerDiv = draggedEl.firstElementChild as HTMLElement | null;
        const draggedRect = draggedEl.getBoundingClientRect();
        const draggedCx = draggedRect.left + draggedRect.width / 2;
        const draggedCy = draggedRect.top + draggedRect.height / 2;

        const TOL = 4;
        let gx: number | null = null;
        let gy: number | null = null;

        for (const c of centersRef.current) {
          if (c.id === node.id) continue;
          if (gx === null && Math.abs(draggedCx - c.cx) <= TOL) {
            gx = c.cx - wrapRect.left;
          }
        if (gy === null && Math.abs(draggedCy - c.cy) <= TOL) {
            gy = c.cy - wrapRect.top;
          }
          if (gx !== null && gy !== null) break;
        }

        setGuideX((prev) => (prev === gx ? prev : gx));
        setGuideY((prev) => (prev === gy ? prev : gy));

        // 吸附提示：依据当前缩放计算像素网格步长，接近网格交点时闪烁 ring
        try {
          const zoom = (reactFlowInstance as any)?.getZoom?.() ?? 1;
          const stepPx = Math.max(4, gridSize * zoom);
          const localX = draggedCx - wrapRect.left;
          const localY = draggedCy - wrapRect.top;
          const nearGridX = (Math.abs(localX % stepPx) <= 1) || (Math.abs(stepPx - (localX % stepPx)) <= 1);
          const nearGridY = (Math.abs(localY % stepPx) <= 1) || (Math.abs(stepPx - (localY % stepPx)) <= 1);
          if ((nearGridX || nearGridY) && innerDiv) {
            innerDiv.classList.add('snap-ring');
            if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
            ringTimerRef.current = setTimeout(() => innerDiv.classList.remove('snap-ring'), 120);
          }
        } catch {}
      } finally {
        rafPendingRef.current = false;
        if (rafIdRef.current !== null) rafIdRef.current = null;
      }
    });
  }, [gridSize, reactFlowInstance, autoAlign]);

  const handleNodeDragStop = useCallback(() => {
    // 取消未结算的 rAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setGuideX(null);
    setGuideY(null);
    centersRef.current = [];
    lastDragPosRef.current = null;
    rafPendingRef.current = false;
    try {
      if (typeof document !== 'undefined') {
        delete document.body.dataset.dragging;
        // @ts-ignore
        delete document.body.dataset.dragNodeId;
      }
    } catch {}
    // 拖拽结束记录快照
    try { (window as any).__vw_snapshot?.('move'); } catch {}
  }, []);

  // 键盘删除
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selectedNodes = nodes.filter(node => (node as any).selected);
      const selectedEdges = edges.filter(edge => (edge as any).selected);

      selectedNodes.forEach(node => onNodeDelete(node.id));
      selectedEdges.forEach(edge => onEdgeDelete(edge.id));

      // 删除后记录快照
      try { (window as any).__vw_snapshot?.('delete'); } catch {}
    }
  }, [nodes, edges, onNodeDelete, onEdgeDelete]);

  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // 默认视野与缩放：让新节点在初始缩放下更小（避免占据屏幕过大）
  React.useEffect(() => {
    if (reactFlowInstance && !didInitRef.current) {
      try {
        // 更小的初始缩放
        reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 0.6 });
        // 适度贴合画布内容，保留留白
        reactFlowInstance.fitView({ padding: 0.15 });
      } catch (e) {
        // 忽略初始化异常
      }
      didInitRef.current = true;
    }
  }, [reactFlowInstance, didInitRef]);

  // 外部触发 fitView（来自 Toolbar）
  React.useEffect(() => {
    if (!reactFlowInstance) return;
    if (typeof fitViewTick === 'number' && fitViewTick > 0) {
      try {
        reactFlowInstance.fitView({ padding: 0.15 });
      } catch {}
    }
    // 仅在 fitViewTick 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitViewTick, reactFlowInstance]);

  // v5: 统一边样式（平滑/直角）
  const defaultEdgeOptions = React.useMemo(() => {
    const t: 'step' | 'smoothstep' = edgeStyle === 'orthogonal' ? 'step' : 'smoothstep';
    return {
      type: t as any,
      // 极简黑白样式；移除 linecap/linejoin 以规避 TS 类型差异
      style: { stroke: '#0B0B0B', strokeWidth: 2 },
    } as any;
  }, [edgeStyle]);

  // v4: Selection 监听（同步 App/Toolbar）
  const handleSelectionChange = useCallback((sel: { nodes: Node[]; edges: Edge[] }) => {
    const ids = (sel.nodes || []).map(n => n.id);
    onSelectionChange?.(ids);
    // 同步单选的语义：若多选，保留最后一个；若为空则 null
    const last = sel.nodes && sel.nodes.length > 0 ? sel.nodes[sel.nodes.length - 1] : null;
    onNodeSelect(last as any || null);
  }, [onSelectionChange, onNodeSelect]);

  // v4: 选中节点（含尺寸）获取
  const getSelectedWithSize = useCallback(() => {
    const rfNodes = (reactFlowInstance?.getNodes?.() || []) as Node[];
    const selected = rfNodes.filter(n => n.selected);
    const result = selected.map(n => {
      const w = (n as any).width ?? (n as any)?.measured?.width ?? (n as any)?.data?.ui?.size?.width ?? DEFAULT_W;
      const h = (n as any).height ?? (n as any)?.measured?.height ?? (n as any)?.data?.ui?.size?.height ?? DEFAULTH;
      const x = (n.position?.x ?? 0);
      const y = (n.position?.y ?? 0);
      return { id: n.id, x, y, w: Number(w) || DEFAULT_W, h: Number(h) || DEFAULTH };
    });
    return result;
  }, [reactFlowInstance]);

  const applyPositionUpdates = useCallback((updates: Record<string, { x?: number; y?: number }>) => {
    const updatedNodes = nodes.map(n => {
      const u = updates[n.id];
      if (!u) return n;
      return {
        ...n,
        position: {
          x: u.x !== undefined ? u.x : n.position.x,
          y: u.y !== undefined ? u.y : n.position.y,
        }
      };
    });
    onNodesChange(updatedNodes);
  }, [nodes, onNodesChange]);

  // v4: 对齐算法
  const alignLeft = useCallback((): boolean => {
    const sel = getSelectedWithSize();
    if (sel.length < 2) return false;
    const minX = Math.min(...sel.map(s => s.x));
    const updates: Record<string, { x: number }> = {};
    sel.forEach(s => updates[s.id] = { x: minX });
    applyPositionUpdates(updates);
    try { (window as any).__vw_snapshot?.('align-left'); } catch {}
    return true;
  }, [getSelectedWithSize, applyPositionUpdates]);

  const alignRight = useCallback((): boolean => {
    const sel = getSelectedWithSize();
    if (sel.length < 2) return false;
    const maxRight = Math.max(...sel.map(s => s.x + s.w));
    const updates: Record<string, { x: number }> = {};
    sel.forEach(s => updates[s.id] = { x: maxRight - s.w });
    applyPositionUpdates(updates);
    try { (window as any).__vw_snapshot?.('align-right'); } catch {}
    return true;
  }, [getSelectedWithSize, applyPositionUpdates]);

  const alignCenterX = useCallback((): boolean => {
    const sel = getSelectedWithSize();
    if (sel.length < 2) return false;
    const minX = Math.min(...sel.map(s => s.x));
    const maxRight = Math.max(...sel.map(s => s.x + s.w));
    const mid = (minX + maxRight) / 2;
    const updates: Record<string, { x: number }> = {};
    sel.forEach(s => {
      const cx = s.x + s.w / 2;
      const dx = mid - cx;
      updates[s.id] = { x: s.x + dx };
    });
    applyPositionUpdates(updates);
    try { (window as any).__vw_snapshot?.('align-center-x'); } catch {}
    return true;
  }, [getSelectedWithSize, applyPositionUpdates]);

  const alignTop = useCallback((): boolean => {
    const sel = getSelectedWithSize();
    if (sel.length < 2) return false;
    const minY = Math.min(...sel.map(s => s.y));
    const updates: Record<string, { y: number }> = {};
    sel.forEach(s => updates[s.id] = { y: minY });
    applyPositionUpdates(updates);
    try { (window as any).__vw_snapshot?.('align-top'); } catch {}
    return true;
  }, [getSelectedWithSize, applyPositionUpdates]);

  const alignBottom = useCallback((): boolean => {
    const sel = getSelectedWithSize();
    if (sel.length < 2) return false;
    const maxBottom = Math.max(...sel.map(s => s.y + s.h));
    const updates: Record<string, { y: number }> = {};
    sel.forEach(s => updates[s.id] = { y: maxBottom - s.h });
    applyPositionUpdates(updates);
    try { (window as any).__vw_snapshot?.('align-bottom'); } catch {}
    return true;
  }, [getSelectedWithSize, applyPositionUpdates]);

  const alignCenterY = useCallback((): boolean => {
    const sel = getSelectedWithSize();
    if (sel.length < 2) return false;
    const minY = Math.min(...sel.map(s => s.y));
    const maxBottom = Math.max(...sel.map(s => s.y + s.h));
    const mid = (minY + maxBottom) / 2;
    const updates: Record<string, { y: number }> = {};
    sel.forEach(s => {
      const cy = s.y + s.h / 2;
      const dy = mid - cy;
      updates[s.id] = { y: s.y + dy };
    });
    applyPositionUpdates(updates);
    try { (window as any).__vw_snapshot?.('align-center-y'); } catch {}
    return true;
  }, [getSelectedWithSize, applyPositionUpdates]);

  // v4: 分布算法（两端固定，按间隔均分，基于左/顶边）
  const distributeH = useCallback((): boolean => {
    const sel = getSelectedWithSize();
    if (sel.length < 3) return false;
    const sorted = [...sel].sort((a, b) => a.x - b.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const span = (last.x + last.w) - first.x; // 左到最右边界
    const inner = sorted.slice(1, -1);
    const totalInnerWidth = inner.reduce((sum, n) => sum + n.w, 0);
    const gaps = inner.length + 1;
    const gapSize = (span - first.w - totalInnerWidth - (last.w)) / gaps;

    let cursor = first.x + first.w + gapSize;
    const updates: Record<string, { x: number }> = {};
    for (const n of inner) {
      updates[n.id] = { x: cursor };
      cursor += n.w + gapSize;
    }
    // 两端不动
    applyPositionUpdates(updates);
    try { (window as any).__vw_snapshot?.('distribute-h'); } catch {}
    return true;
  }, [getSelectedWithSize, applyPositionUpdates]);

  const distributeV = useCallback((): boolean => {
    const sel = getSelectedWithSize();
    if (sel.length < 3) return false;
    const sorted = [...sel].sort((a, b) => a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const span = (last.y + last.h) - first.y;
    const inner = sorted.slice(1, -1);
    const totalInnerHeight = inner.reduce((sum, n) => sum + n.h, 0);
    const gaps = inner.length + 1;
    const gapSize = (span - first.h - totalInnerHeight - (last.h)) / gaps;

    let cursor = first.y + first.h + gapSize;
    const updates: Record<string, { y: number }> = {};
    for (const n of inner) {
      updates[n.id] = { y: cursor };
      cursor += n.h + gapSize;
    }
    applyPositionUpdates(updates);
    try { (window as any).__vw_snapshot?.('distribute-v'); } catch {}
    return true;
  }, [getSelectedWithSize, applyPositionUpdates]);

  // v4: 通用 API 封装（对齐/分布 + fitView）
  const alignSelected = useCallback((dir: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    switch (dir) {
      case 'left':
        return alignLeft();
      case 'hcenter':
        return alignCenterX();
      case 'right':
        return alignRight();
      case 'top':
        return alignTop();
      case 'vcenter':
        return alignCenterY();
      case 'bottom':
        return alignBottom();
      default:
        return false;
    }
  }, [alignLeft, alignCenterX, alignRight, alignTop, alignCenterY, alignBottom]);

  const distributeSelected = useCallback((mode: 'horizontal' | 'vertical') => {
    return mode === 'horizontal' ? distributeH() : distributeV();
  }, [distributeH, distributeV]);

  const fitViewApi = useCallback(() => {
    if (!reactFlowInstance) return false;
    try {
      reactFlowInstance.fitView({ padding: 0.15 });
      return true;
    } catch {
      return false;
    }
  }, [reactFlowInstance]);

  // v5: 简易时光旅行与剪贴板
  type Snapshot = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
  const MAX_DEPTH = 50;
  const historyRef = React.useRef<{ past: Snapshot[]; future: Snapshot[] }>({
    past: [],
    future: []
  });
  const takeSnapshot = useCallback((label?: string) => {
    // 深拷贝当前
    const snap: Snapshot = JSON.parse(JSON.stringify({ nodes, edges }));
    historyRef.current.past.push(snap);
    if (historyRef.current.past.length > MAX_DEPTH) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
    // 暴露给 window 便于在其他回调中无耦合调用
    (window as any).__vw_snapshot = (l?: string) => takeSnapshot(l);
  }, [nodes, edges]);

  const undo = useCallback(() => {
    const past = historyRef.current.past;
    if (past.length === 0) return false;
    const current: Snapshot = JSON.parse(JSON.stringify({ nodes, edges }));
    historyRef.current.future.push(current);
    const prev = past.pop() as Snapshot;
    onNodesChange(prev.nodes);
    onEdgesChange(prev.edges);
    return true;
  }, [nodes, edges, onNodesChange, onEdgesChange]);

  const redo = useCallback(() => {
    const fut = historyRef.current.future;
    if (fut.length === 0) return false;
    const current: Snapshot = JSON.parse(JSON.stringify({ nodes, edges }));
    historyRef.current.past.push(current);
    const next = fut.pop() as Snapshot;
    onNodesChange(next.nodes);
    onEdgesChange(next.edges);
    return true;
  }, [nodes, edges, onNodesChange, onEdgesChange]);

  const clipboardRef = React.useRef<Snapshot | null>(null);

  const copy = useCallback(() => {
    const ids = getSelectedWithSize().map(s => s.id);
    if (ids.length === 0) return 0;
    const nodeSet = new Set(ids);
    const copyNodes = nodes.filter(n => nodeSet.has(n.id));
    const copyEdges = edges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target));
    clipboardRef.current = JSON.parse(JSON.stringify({ nodes: copyNodes, edges: copyEdges }));
    return copyNodes.length;
  }, [nodes, edges, getSelectedWithSize]);

  const cut = useCallback(() => {
    const count = copy();
    if (count === 0) return 0;
    const ids = new Set(clipboardRef.current!.nodes.map(n => n.id));
    const nextNodes = nodes.filter(n => !ids.has(n.id));
    const nextEdges = edges.filter(e => !ids.has(e.source) && !ids.has(e.target));
    onNodesChange(nextNodes);
    onEdgesChange(nextEdges);
    takeSnapshot('cut');
    return count;
  }, [nodes, edges, onNodesChange, onEdgesChange, copy, takeSnapshot]);

  const paste = useCallback(() => {
    const data = clipboardRef.current;
    if (!data || data.nodes.length === 0) return 0;
    const idMap = new Map<string, string>();
    const now = Date.now();
 
    // 计算锚点粘贴偏移：优先使用右键时记录的锚点；否则使用画布中心；最后退化为 +16 偏移
    let anchor = pasteAnchorRef.current;
    if (!anchor && reactFlowInstance && reactFlowWrapper.current) {
      try {
        const r = reactFlowWrapper.current.getBoundingClientRect();
        const centerScreen = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        anchor = reactFlowInstance.project({ x: centerScreen.x - r.left, y: centerScreen.y - r.top });
      } catch {}
    }
    const minX = Math.min(...data.nodes.map(n => n.position.x));
    const minY = Math.min(...data.nodes.map(n => n.position.y));
    let baseDx = 16;
    let baseDy = 16;
    if (anchor) {
      baseDx = (anchor.x - minX) + 16;
      baseDy = (anchor.y - minY) + 16;
    }
 
    const newNodes: WorkflowNode[] = data.nodes.map((n, idx) => {
      const nid = `${n.id}_p${now}_${idx}`;
      idMap.set(n.id, nid);
      return {
        ...n,
        id: nid,
        position: { x: n.position.x + baseDx, y: n.position.y + baseDy },
      };
    });
    const newEdges: WorkflowEdge[] = data.edges.map((e, idx) => ({
      ...e,
      id: `${e.id}_p${now}_${idx}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
      edgeType: edgeStyle,
    }));
    onNodesChange([...nodes, ...newNodes]);
    onEdgesChange([...edges, ...newEdges]);
    takeSnapshot('paste');
    // 使用后清空锚点，避免下次粘贴还使用旧位置
    pasteAnchorRef.current = null;
    return newNodes.length;
  }, [nodes, edges, onNodesChange, onEdgesChange, edgeStyle, takeSnapshot, reactFlowInstance]);

  const groupSelected = useCallback(() => {
    const sel = getSelectedWithSize().map(s => s.id);
    if (sel.length < 2) return false;
    const gid = `grp_${Date.now()}`;
    const next = nodes.map(n => sel.includes(n.id) ? { ...n, groupId: gid } : n);
    onNodesChange(next);
    takeSnapshot('group');
    return true;
  }, [nodes, onNodesChange, getSelectedWithSize, takeSnapshot]);

  const ungroupSelected = useCallback(() => {
    const sel = getSelectedWithSize().map(s => s.id);
    if (sel.length === 0) return false;
    const next = nodes.map(n => sel.includes(n.id) ? { ...n, groupId: undefined } : n);
    onNodesChange(next);
    takeSnapshot('ungroup');
    return true;
  }, [nodes, onNodesChange, getSelectedWithSize, takeSnapshot]);

  const toggleLockSelected = useCallback(() => {
    const sel = getSelectedWithSize().map(s => s.id);
    if (sel.length === 0) return false;
    const next = nodes.map(n => sel.includes(n.id) ? { ...n, locked: !n.locked } : n);
    onNodesChange(next);
    takeSnapshot('toggle-lock');
    return true;
  }, [nodes, onNodesChange, getSelectedWithSize, takeSnapshot]);

  const exportLayout = useCallback(() => {
    // 最小可行导出
    const payload = {
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          ui: { size: (n as any)?.data?.ui?.size },
        },
        groupId: n.groupId,
        locked: n.locked,
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        edgeType: (e as any).edgeType ?? edgeStyle,
      })),
    };
    return payload;
  }, [nodes, edges, edgeStyle]);

  const importLayout = useCallback((data: any) => {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return false;
    try {
      const n = data.nodes as WorkflowNode[];
      const e = data.edges as WorkflowEdge[];
      onNodesChange(n);
      onEdgesChange(e);
      takeSnapshot('import');
      return true;
    } catch {
      return false;
    }
  }, [onNodesChange, onEdgesChange, takeSnapshot]);

  // v6: 清空画布（规范化：快照 + 状态复位 + Toast）
  const clearCanvas = useCallback(() => {
    try { takeSnapshot('clear'); } catch {}
    onNodesChange([]);
    onEdgesChange([]);
    try { showToast('画布已清空'); } catch {}
    return true;
  }, [onNodesChange, onEdgesChange, takeSnapshot]);

  // 初始注入 snapshot 函数
  React.useEffect(() => {
    (window as any).__vw_snapshot = (l?: string) => takeSnapshot(l);
  }, [takeSnapshot]);

  useImperativeHandle(ref, () => ({
    alignSelected,
    distributeSelected,
    fitView: fitViewApi,
    alignLeft,
    alignCenterX,
    alignRight,
    alignTop,
    alignCenterY,
    alignBottom,
    distributeH,
    distributeV,
    getSelectedIds: () => getSelectedWithSize().map(s => s.id),

    undo,
    redo,
    copy,
    cut,
    paste,
    groupSelected,
    ungroupSelected,
    toggleLockSelected,
    exportLayout,
    importLayout,

    // v6
    clearCanvas,
  }), [
    alignSelected, distributeSelected, fitViewApi,
    alignLeft, alignCenterX, alignRight, alignTop, alignCenterY, alignBottom,
    distributeH, distributeV, getSelectedWithSize,
    undo, redo, copy, cut, paste, groupSelected, ungroupSelected, toggleLockSelected,
    exportLayout, importLayout,
    clearCanvas
  ]);

  // v5: 右键菜单构建函数（在使用前声明，避免 TS 提示“在赋值前使用变量”）
  const buildPaneMenu = useCallback((px: number, py: number) => {
    try {
      if (reactFlowInstance && reactFlowWrapper.current) {
        const r = reactFlowWrapper.current.getBoundingClientRect();
        const world = reactFlowInstance.project({ x: px - r.left, y: py - r.top });
        pasteAnchorRef.current = world;
      }
    } catch {}
    const hasClipboard = !!(clipboardRef.current && clipboardRef.current.nodes?.length);
    const items: MenuItem[] = [
      {
        key: 'new_input',
        label: '新建：输入节点',
        onSelect: () => {
          if (!reactFlowInstance || !reactFlowWrapper.current) return;
          const r = reactFlowWrapper.current.getBoundingClientRect();
          const world = reactFlowInstance.project({ x: px - r.left, y: py - r.top });
          const newNode: WorkflowNode = {
            id: `node_${Date.now()}`,
            type: 'input' as any,
            position: world,
            data: { label: '输入节点', config: getDefaultNodeConfig('input') as any }
          };
          onNodesChange([...nodes, newNode]);
          try { (window as any).__vw_snapshot?.('add-node'); } catch {}
        }
      },
      {
        key: 'new_llm',
        label: '新建：LLM 节点',
        onSelect: () => {
          if (!reactFlowInstance || !reactFlowWrapper.current) return;
          const r = reactFlowWrapper.current.getBoundingClientRect();
          const world = reactFlowInstance.project({ x: px - r.left, y: py - r.top });
          const newNode: WorkflowNode = {
            id: `node_${Date.now()}`,
            type: 'llm' as any,
            position: world,
            data: { label: 'LLM节点', config: getDefaultNodeConfig('llm') as any }
          };
          onNodesChange([...nodes, newNode]);
          try { (window as any).__vw_snapshot?.('add-node'); } catch {}
        }
      },
      {
        key: 'new_output',
        label: '新建：输出节点',
        onSelect: () => {
          if (!reactFlowInstance || !reactFlowWrapper.current) return;
          const r = reactFlowWrapper.current.getBoundingClientRect();
          const world = reactFlowInstance.project({ x: px - r.left, y: py - r.top });
          const newNode: WorkflowNode = {
            id: `node_${Date.now()}`,
            type: 'output' as any,
            position: world,
            data: { label: '输出节点', config: getDefaultNodeConfig('output') as any }
          };
          onNodesChange([...nodes, newNode]);
          try { (window as any).__vw_snapshot?.('add-node'); } catch {}
        }
      },
      { key: 'paste', label: '粘贴', disabled: !hasClipboard, title: hasClipboard ? undefined : '剪贴板为空', onSelect: () => { paste(); } },
      { key: 'align_hint', label: '对齐参考设置', onSelect: () => { try { (window as any).scrollTo?.({ top: 0, behavior: 'smooth' }); } catch {} } },
    ];
    openContextMenuAt(px, py, items);
  }, [nodes, onNodesChange, reactFlowInstance, paste]);

  const buildSingleMenu = useCallback((px: number, py: number, node: Node) => {
    const items: MenuItem[] = [
      {
        key: 'rename',
        label: '重命名',
        onSelect: () => {
          const name = window.prompt('新名称', String((node as any)?.data?.label || ''));
          if (typeof name === 'string') {
            onNodeUpdate(node.id, { data: { ...(node as any).data, label: name } as any });
            try { (window as any).__vw_snapshot?.('rename'); } catch {}
          }
        }
      },
      { key: 'copy', label: '复制', onSelect: () => { copy(); } },
      { key: 'cut', label: '剪切', onSelect: () => { cut(); } },
      { key: 'delete', label: '删除', onSelect: () => { onNodeDelete(node.id); try { (window as any).__vw_snapshot?.('delete'); } catch {} } },
      { key: 'lock', label: (nodes.find(n => n.id === node.id)?.locked ? '解锁' : '锁定'), onSelect: () => { toggleLockSelected(); } },
    ];
    try {
      if (reactFlowInstance && reactFlowWrapper.current) {
        const r = reactFlowWrapper.current.getBoundingClientRect();
        const world = reactFlowInstance.project({ x: px - r.left, y: py - r.top });
        pasteAnchorRef.current = world;
      }
    } catch {}
    openContextMenuAt(px, py, items);
  }, [nodes, onNodeUpdate, onNodeDelete, copy, cut, toggleLockSelected, reactFlowInstance]);

  const buildMultiMenu = useCallback((px: number, py: number) => {
    const items: MenuItem[] = [
      { key: 'group', label: '组合', onSelect: () => { groupSelected(); } },
      { key: 'ungroup', label: '解组', onSelect: () => { ungroupSelected(); } },
      { key: 'align', label: '对齐（左/中/右/顶/中/底）', onSelect: () => { /* 引导使用工具栏/快捷键 */ } },
      { key: 'distribute', label: '等分（水平/垂直）', onSelect: () => { /* 引导 */ } },
      { key: 'copy', label: '复制', onSelect: () => { copy(); } },
      {
        key: 'delete',
        label: '删除',
        onSelect: () => {
          const ids = getSelectedWithSize().map(s => s.id);
          ids.forEach(id => onNodeDelete(id));
          try { (window as any).__vw_snapshot?.('delete'); } catch {}
        }
      },
      { key: 'lock', label: '锁定/解锁', onSelect: () => { toggleLockSelected(); } },
    ];
    const hasClipboard = !!(clipboardRef.current && clipboardRef.current.nodes?.length);
    items.splice(1, 0, { key: 'paste', label: '粘贴', disabled: !hasClipboard, onSelect: () => paste() });
    try {
      if (reactFlowInstance && reactFlowWrapper.current) {
        const r = reactFlowWrapper.current.getBoundingClientRect();
        const world = reactFlowInstance.project({ x: px - r.left, y: py - r.top });
        pasteAnchorRef.current = world;
      }
    } catch {}
    openContextMenuAt(px, py, items);
  }, [copy, paste, groupSelected, ungroupSelected, toggleLockSelected, getSelectedWithSize, onNodeDelete, reactFlowInstance]);

  return (
    <div className="canvas-wrap relative w-full bg-white rounded shadow-sm">
      <div
        ref={reactFlowWrapper}
        className="w-full h-full"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <ReactFlowProvider>
          <ReactFlow
            className="canvas-root"
            nodes={(nodes as unknown as Node[]).map((n: any) => ({
              ...n,
              draggable: n?.locked ? false : true,
              className: n?.locked ? 'locked' : undefined,
            }))}
            edges={edges as unknown as Edge[]}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onConnectStart={handleConnectStart}
            onConnectEnd={handleConnectEnd}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            isValidConnection={isValidConnection}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineStyle={{ stroke: '#0B0B0B', strokeWidth: 2 }}
            connectionLineType={edgeStyle === 'orthogonal' ? ConnectionLineType.Step : ConnectionLineType.SmoothStep}
            snapToGrid={snapEnabled}
            snapGrid={[gridSize, gridSize]}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
            minZoom={0.4}
            maxZoom={1.6}
            nodeDragThreshold={0}
            onlyRenderVisibleElements={true}
            panOnDrag={true}
            zoomOnScroll={true}
            attributionPosition="bottom-left"
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            // v4: 多选开关/框选
            selectionOnDrag={true}
            multiSelectionKeyCode="Shift"
            onSelectionChange={handleSelectionChange}
            // v5: 右键菜单
            onPaneContextMenu={(e) => { e.preventDefault(); buildPaneMenu(e.clientX, e.clientY); }}
            onNodeContextMenu={(e, node) => {
              e.preventDefault();
              // 判断当前是否多选
              const selIds = getSelectedWithSize().map(s => s.id);
              if (selIds.length > 1) {
                buildMultiMenu(e.clientX, e.clientY);
              } else {
                buildSingleMenu(e.clientX, e.clientY, node);
              }
            }}
          >
            <Controls position="bottom-left" />
            <MiniMap
              nodeColor={() => '#e5e7eb'}
              nodeStrokeColor={() => '#0B0B0B'}
              maskColor="rgba(0,0,0,0.04)"
              pannable
              zoomable
            />
            {showGrid && <Background variant={BackgroundVariant.Dots} gap={16} size={1.25} color="#d1d5db" />}
          </ReactFlow>
        </ReactFlowProvider>
        <ContextMenu
          open={menuOpen}
          x={menuX}
          y={menuY}
          items={menuItems}
          onClose={() => setMenuOpen(false)}
          ariaLabel="上下文菜单"
        />
        {autoAlign && guideX !== null && <div className="align-guide-v" style={{ left: guideX }} />}
        {autoAlign && guideY !== null && <div className="align-guide-h" style={{ top: guideY }} />}
      </div>
    </div>
  );
});

export default WorkflowCanvas;