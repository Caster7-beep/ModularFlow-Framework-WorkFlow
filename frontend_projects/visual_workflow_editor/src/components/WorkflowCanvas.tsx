import React, { useCallback, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  Connection,
  ConnectionMode,
  ReactFlowProvider,
  ReactFlowInstance,
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

// 注册自定义节点类型
const nodeTypes = {
  llm: LLMNode,
  input: InputNode,
  output: OutputNode,
  code: CodeBlockNode,
  condition: ConditionNode,
  switch: SwitchNode,
  merger: MergerNode,
};

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
}

const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeSelect,
  onNodeUpdate,
  onNodeDelete,
  onEdgeAdd,
  onEdgeDelete,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance | null>(null);

  // 处理节点变化
  const handleNodesChange = useCallback((changes: any) => {
    // 这里可以处理节点的位置变化等
    console.log('节点变化:', changes);
  }, []);

  // 处理边变化
  const handleEdgesChange = useCallback((changes: any) => {
    console.log('边变化:', changes);
  }, []);

  // 处理连接创建
  const handleConnect = useCallback((connection: Connection) => {
    const newEdge: WorkflowEdge = {
      id: `edge_${Date.now()}`,
      source: connection.source!,
      target: connection.target!,
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
    };
    onEdgeAdd(newEdge);
  }, [onEdgeAdd]);

  // 处理节点点击
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    onNodeSelect(node as WorkflowNode);
  }, [onNodeSelect]);

  // 处理画布点击
  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  // 处理拖拽放置
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

    // 创建新节点
    const newNode: WorkflowNode = {
      id: `node_${Date.now()}`,
      type: type as any,
      position,
      data: {
        label: `${type}节点`,
        config: getDefaultNodeConfig(type),
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

  // 处理拖拽悬停
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // 处理键盘事件（删除节点）
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // 获取当前选中的节点或边
      const selectedNodes = nodes.filter(node => (node as any).selected);
      const selectedEdges = edges.filter(edge => (edge as any).selected);

      selectedNodes.forEach(node => onNodeDelete(node.id));
      selectedEdges.forEach(edge => onEdgeDelete(edge.id));
    }
  }, [nodes, edges, onNodeDelete, onEdgeDelete]);

  // 监听键盘事件
  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div 
      ref={reactFlowWrapper} 
      style={{ width: '100%', height: '100%' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onInit={setReactFlowInstance}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          fitView
          attributionPosition="bottom-left"
        >
          <Controls />
          <MiniMap 
            nodeStrokeColor={(n) => {
              switch (n.type) {
                case 'llm': return '#52c41a';
                case 'input': return '#1890ff';
                case 'output': return '#fa541c';
                case 'code': return '#722ed1';
                case 'condition': return '#f39c12';
                case 'switch': return '#3498db';
                case 'merger': return '#00bcd4';
                default: return '#999';
              }
            }}
            nodeColor={(n) => {
              switch (n.type) {
                case 'llm': return '#f6ffed';
                case 'input': return '#e6f7ff';
                case 'output': return '#fff2e8';
                case 'code': return '#f9f0ff';
                case 'condition': return '#fff3cd';
                case 'switch': return '#e8f4fd';
                case 'merger': return '#f0f8ff';
                default: return '#f5f5f5';
              }
            }}
            nodeBorderRadius={8}
          />
          <Background color="#aaa" gap={16} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default WorkflowCanvas;