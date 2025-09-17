import React, { memo, useMemo, useCallback, useRef, useEffect } from 'react';
import { 
  usePerformanceMonitor, 
  useThrottle, 
  useRenderOptimization,
  useMemoryMonitor 
} from '../../hooks/usePerformance';
import type { WorkflowNode, WorkflowEdge } from '../../types/workflow';

interface OptimizedWorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onNodesChange: (nodes: WorkflowNode[]) => void;
  onEdgesChange: (edges: WorkflowEdge[]) => void;
  onNodeSelect: (node: WorkflowNode | null) => void;
  onNodeUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  onNodeDelete: (nodeId: string) => void;
  onEdgeAdd: (edge: WorkflowEdge) => void;
  onEdgeDelete: (edgeId: string) => void;
  className?: string;
}

// 单个节点组件，使用React.memo优化
const WorkflowNodeComponent = memo<{
  node: WorkflowNode;
  isSelected: boolean;
  onSelect: (node: WorkflowNode) => void;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  onDelete: (nodeId: string) => void;
}>(({ node, isSelected, onSelect, onUpdate, onDelete }) => {
  const { logPerformance } = usePerformanceMonitor(`WorkflowNode-${node.id}`);

  // 节点样式缓存
  const nodeStyle = useMemo(() => ({
    position: 'absolute' as const,
    left: node.position.x,
    top: node.position.y,
    transform: isSelected ? 'scale(1.05)' : 'scale(1)',
    transition: 'transform 0.2s ease',
    zIndex: isSelected ? 10 : 1,
  }), [node.position.x, node.position.y, isSelected]);

  // 节点类名缓存
  const nodeClassName = useMemo(() => {
    return [
      'workflow-node',
      `node-${node.type}`,
      isSelected ? 'selected' : '',
    ].filter(Boolean).join(' ');
  }, [node.type, isSelected]);

  // 优化的点击处理
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    logPerformance('node-select', () => {
      onSelect(node);
    });
  }, [node, onSelect, logPerformance]);

  // 优化的双击处理
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    logPerformance('node-edit', () => {
      // 触发编辑模式 - 这里可以实现节点编辑逻辑
      console.log('Double clicked node:', node.id);
    });
  }, [node, onUpdate, logPerformance]);

  return (
    <div
      className={nodeClassName}
      style={nodeStyle}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      data-node-id={node.id}
      data-node-type={node.type}
    >
      <div className="node-header">
        <span className="node-title">{node.data.label}</span>
        {isSelected && (
          <button 
            className="node-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            aria-label="删除节点"
          >
            ×
          </button>
        )}
      </div>
      <div className="node-content">
        <div className="node-inputs">
          {/* 输入连接点 */}
          <div className="connection-point input" data-direction="input" />
        </div>
        <div className="node-outputs">
          {/* 输出连接点 */}
          <div className="connection-point output" data-direction="output" />
        </div>
      </div>
    </div>
  );
});

WorkflowNodeComponent.displayName = 'WorkflowNodeComponent';

// 连接线组件，使用React.memo优化
const WorkflowEdgeComponent = memo<{
  edge: WorkflowEdge;
  sourceNode: WorkflowNode | undefined;
  targetNode: WorkflowNode | undefined;
  onDelete: (edgeId: string) => void;
}>(({ edge, sourceNode, targetNode, onDelete }) => {
  // 连接线路径计算
  const pathData = useMemo(() => {
    if (!sourceNode || !targetNode) return '';

    const startX = sourceNode.position.x + 200; // 节点宽度
    const startY = sourceNode.position.y + 30;  // 节点高度的一半
    const endX = targetNode.position.x;
    const endY = targetNode.position.y + 30;

    const midX = (startX + endX) / 2;

    return `M ${startX} ${startY} C ${midX} ${startY} ${midX} ${endY} ${endX} ${endY}`;
  }, [sourceNode, targetNode]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(edge.id);
  }, [edge.id, onDelete]);

  if (!sourceNode || !targetNode) return null;

  return (
    <g className="workflow-edge" onClick={handleClick}>
      <path
        d={pathData}
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        className="edge-path"
      />
    </g>
  );
});

WorkflowEdgeComponent.displayName = 'WorkflowEdgeComponent';

// 主画布组件
const OptimizedWorkflowCanvas: React.FC<OptimizedWorkflowCanvasProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeSelect,
  onNodeUpdate,
  onNodeDelete,
  onEdgeAdd,
  onEdgeDelete,
  className = '',
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);

  // 性能监控
  const { logPerformance } = usePerformanceMonitor('OptimizedWorkflowCanvas');
  useMemoryMonitor('OptimizedWorkflowCanvas');
  
  // 渲染优化
  const { scheduleUpdate } = useRenderOptimization();

  // 视口状态管理
  const [viewport, setViewport] = React.useState({
    x: 0,
    y: 0,
    zoom: 1,
  });

  // 节点映射缓存
  const nodeMap = useMemo(() => {
    const map = new Map<string, WorkflowNode>();
    nodes.forEach(node => map.set(node.id, node));
    return map;
  }, [nodes]);

  // 可见节点计算（基于视口）
  const visibleNodes = useMemo(() => {
    // 简单的视口裁剪
    const viewportBounds = {
      left: -viewport.x / viewport.zoom,
      top: -viewport.y / viewport.zoom,
      right: (-viewport.x + (canvasRef.current?.clientWidth || 0)) / viewport.zoom,
      bottom: (-viewport.y + (canvasRef.current?.clientHeight || 0)) / viewport.zoom,
    };

    return nodes.filter(node => {
      const nodeRight = node.position.x + 200; // 节点宽度
      const nodeBottom = node.position.y + 60;  // 节点高度

      return !(
        node.position.x > viewportBounds.right ||
        nodeRight < viewportBounds.left ||
        node.position.y > viewportBounds.bottom ||
        nodeBottom < viewportBounds.top
      );
    });
  }, [nodes, viewport]);

  // 可见连接线计算
  const visibleEdges = useMemo(() => {
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    return edges.filter(edge => 
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );
  }, [edges, visibleNodes]);

  // 优化的节点选择处理
  const handleNodeSelect = useCallback((node: WorkflowNode) => {
    scheduleUpdate(() => {
      setSelectedNodeId(node.id);
      onNodeSelect(node);
    });
  }, [onNodeSelect, scheduleUpdate]);

  // 优化的画布点击处理
  const handleCanvasClick = useThrottle(useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      logPerformance('canvas-deselect', () => {
        setSelectedNodeId(null);
        onNodeSelect(null);
      });
    }
  }, [onNodeSelect, logPerformance]), 100);

  // 节点拖拽处理
  const handleNodeDrag = useThrottle(useCallback((nodeId: string, newPosition: { x: number; y: number }) => {
    onNodeUpdate(nodeId, { position: newPosition });
  }, [onNodeUpdate]), 16); // 约60fps

  // 缩放处理
  const handleWheel = useThrottle(useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(3, viewport.zoom * zoomFactor));
    
    if (newZoom !== viewport.zoom) {
      setViewport(prev => ({ ...prev, zoom: newZoom }));
    }
  }, [viewport.zoom]), 50);

  // SVG尺寸计算
  const svgBounds = useMemo(() => {
    if (nodes.length === 0) return { width: 800, height: 600 };

    const bounds = nodes.reduce((acc, node) => {
      return {
        minX: Math.min(acc.minX, node.position.x),
        minY: Math.min(acc.minY, node.position.y),
        maxX: Math.max(acc.maxX, node.position.x + 200),
        maxY: Math.max(acc.maxY, node.position.y + 60),
      };
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

    const padding = 100;
    return {
      width: Math.max(800, bounds.maxX - bounds.minX + padding * 2),
      height: Math.max(600, bounds.maxY - bounds.minY + padding * 2),
    };
  }, [nodes]);

  return (
    <div
      ref={canvasRef}
      className={`workflow-canvas-optimized ${className}`}
      onClick={handleCanvasClick}
      onWheel={handleWheel}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: 'grab',
      }}
    >
      {/* SVG 连接线层 */}
      <svg
        ref={svgRef}
        className="edges-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: svgBounds.width,
          height: svgBounds.height,
          pointerEvents: 'auto',
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {visibleEdges.map(edge => (
          <WorkflowEdgeComponent
            key={edge.id}
            edge={edge}
            sourceNode={nodeMap.get(edge.source)}
            targetNode={nodeMap.get(edge.target)}
            onDelete={onEdgeDelete}
          />
        ))}
      </svg>

      {/* 节点层 */}
      <div
        className="nodes-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: svgBounds.width,
          height: svgBounds.height,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {visibleNodes.map(node => (
          <WorkflowNodeComponent
            key={node.id}
            node={node}
            isSelected={selectedNodeId === node.id}
            onSelect={handleNodeSelect}
            onUpdate={onNodeUpdate}
            onDelete={onNodeDelete}
          />
        ))}
      </div>

      {/* 性能指示器（开发模式） */}
      {import.meta.env.DEV && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        >
          <div>节点: {visibleNodes.length}/{nodes.length}</div>
          <div>连接: {visibleEdges.length}/{edges.length}</div>
          <div>缩放: {(viewport.zoom * 100).toFixed(0)}%</div>
        </div>
      )}
    </div>
  );
};

export default memo(OptimizedWorkflowCanvas);