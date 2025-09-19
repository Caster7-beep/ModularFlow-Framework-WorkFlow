import React from 'react';

interface NodePanelProps {
  onAddNode: (nodeType: string, position: { x: number; y: number }) => void;
}

interface NodeTypeConfig {
  type: string;
  label: string;
  description: string;
  emoji: string;
}

const nodeTypes: NodeTypeConfig[] = [
  { type: 'input', label: '输入节点', description: '接收用户输入或外部数据', emoji: '⬅️' },
  { type: 'llm', label: 'LLM节点', description: '调用大语言模型进行文本生成', emoji: '🤖' },
  { type: 'code', label: '代码块节点', description: '执行自定义代码逻辑', emoji: '⌨️' },
  { type: 'condition', label: '条件判断', description: '根据条件进行分支', emoji: '⚖️' },
  { type: 'switch', label: '开关路由', description: '按信号值进行路由', emoji: '🔀' },
  { type: 'merger', label: '结果聚合', description: '聚合多个输入结果', emoji: '🔗' },
  { type: 'output', label: '输出节点', description: '输出处理结果', emoji: '➡️' },
];

const NodePanel: React.FC<NodePanelProps> = ({ onAddNode }) => {
  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleAddNode = (nodeType: string) => {
    const position = { x: Math.random() * 300 + 120, y: Math.random() * 300 + 120 };
    onAddNode(nodeType, position);
  };

  return (
    <div className="node-panel h-[calc(100vh-56px)] overflow-auto rounded border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-black text-xl font-semibold leading-7">节点面板</h2>
      </div>

      <div className="space-y-2">
        {nodeTypes.map((n) => (
          <div
            key={n.type}
            role="button"
            tabIndex={0}
            aria-label={`添加节点：${n.label}`}
            title={`${n.label}：${n.description}`}
            className="rounded border border-gray-200 p-3 h-12 hover:shadow-sm hover:bg-gray-50 cursor-pointer select-none transition-all duration-200 active:opacity-80 group focus:outline-none focus:ring-2 ring-black overflow-hidden"
            draggable
            onDragStart={(e) => handleDragStart(e, n.type)}
            onClick={() => handleAddNode(n.type)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAddNode(n.type);
              }
            }}
          >
            <div className="flex items-center justify-between gap-2 h-full">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-black text-sm shrink-0">
                  {n.emoji}
                </span>
                <div className="text-base font-semibold leading-6 text-black min-w-0 truncate">{n.label}</div>
              </div>
              <div className="text-gray-600 text-sm cursor-grab active:cursor-grabbing shrink-0" title="拖拽到画布" aria-label="拖拽句柄">
                ::
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="text-sm text-gray-600">
          提示：可以将节点拖拽到画布中，或点击条目直接添加到画布中心。
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="text-base font-semibold leading-6 text-black">使用说明</h3>
        <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
          <li><strong className="text-black">LLM节点</strong>：配置模型与提示词</li>
          <li><strong className="text-black">输入节点</strong>：设置工作流输入参数</li>
          <li><strong className="text-black">输出节点</strong>：定义输出格式</li>
          <li><strong className="text-black">代码块</strong>：编写自定义逻辑</li>
        </ul>
      </div>
    </div>
  );
};

export default NodePanel;