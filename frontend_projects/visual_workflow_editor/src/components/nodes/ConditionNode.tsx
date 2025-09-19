import React, { useEffect, useMemo, useRef } from 'react';
import { Handle, Position, NodeProps, useNodeId, useReactFlow } from 'reactflow';

interface ConditionNodeData {
  label: string;
  condition?: string;
  true_output?: string;
  false_output?: string;
  description?: string;
  ui?: {
    size?: { w?: number; h?: number };
  };
}

const ConditionNode: React.FC<NodeProps<ConditionNodeData>> = ({ data, selected }) => {
  const nodeId = useNodeId();
  const rf = useReactFlow();

  const label: string = useMemo(
    () => (data?.label || (data as any)?.config?.label || '条件判断').toString(),
    [data?.label, (data as any)?.config?.label]
  );

  useEffect(() => {
    (window as any)?.lucide?.createIcons?.();
  }, []);

  // 读取“调整尺寸模式”：按 R 切换（在 WorkflowCanvas.tsx 中已注入 body.dataset.resize）
  const resizeEnabled = typeof document !== 'undefined' && document.body?.dataset?.resize === '1';
  // 拖拽态标记（由 WorkflowCanvas 写入），用于抑制拖拽过程中的尺寸写回与样式强制
  const isDragging = typeof document !== 'undefined' && document.body?.dataset?.dragging === '1';
  const isThisDragging =
    isDragging &&
    typeof document !== 'undefined' &&
    document.body?.dataset?.dragNodeId === nodeId;

  // 尺寸持久化（每个实例单独保存）
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!cardRef.current || !nodeId) return;

    const obs = new ResizeObserver((entries) => {
      if (!entries?.length) return;
      const isResize = typeof document !== 'undefined' && document.body?.dataset?.resize === '1';
      const dragging = typeof document !== 'undefined' && document.body?.dataset?.dragging === '1';
      if (!isResize || dragging) return;

      const rect = entries[0].contentRect;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);

      rf.setNodes((nodes) =>
        nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  ui: {
                    ...(n.data as any)?.ui,
                    size: { w, h },
                  },
                },
              }
            : n
        )
      );
    });

    obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, [rf, nodeId]);

  // 读出保存的实例尺寸
  const savedSize = (data as any)?.ui?.size || {};
  const savedWidth = typeof savedSize.w === 'number' ? savedSize.w : undefined;
  const savedHeight = typeof savedSize.h === 'number' ? savedSize.h : undefined;

  // 1.5 倍放大后的默认卡片尺寸
  const sizeClass = 'min-w-[240px] max-w-[420px]';

  return (
    <div
      tabIndex={0}
      aria-label={`条件 节点: ${label}`}
      className={`relative ${selected ? 'ring-1 ring-black' : ''} focus:outline-none focus-visible:ring-2 focus-visible:ring-black cursor-grab active:cursor-grabbing`}
      style={{ willChange: 'transform' }}
    >
      {/* 左侧目标句柄（输入） */}
      <div className="absolute left-[-12px] top-1/2 -translate-y-1/2">
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          style={{
            width: 16,
            height: 16,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            background: '#0B0B0B',
          }}
        />
      </div>

      {/* 极简卡片：图标 + 标题 + 一行徽标（固定双分支 IF/ELSE）。名称可换行，节点随内容伸缩 */}
      <div
        ref={cardRef}
        className={`group rounded border border-gray-200 bg-white text-black shadow-sm hover:shadow-md transition-shadow duration-200 focus-within:ring-2 focus-within:ring-black ${sizeClass}`}
        style={{
          ...(savedWidth ? { width: savedWidth } : {}),
          ...(savedHeight ? { height: savedHeight } : {}),
          ...(resizeEnabled ? { resize: 'both', overflow: 'auto' } as React.CSSProperties : {}),
        }}
      >
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-gray-100 text-black shrink-0">
                <i data-lucide="git-branch" className="w-4 h-4"></i>
              </span>
              <div className="text-base font-semibold leading-6 min-w-0 truncate-2 break-words whitespace-normal" title={label}>
                <span className="mr-1 text-gray-600 select-none cursor-grab active:cursor-grabbing" aria-label="drag handle" title="拖拽句柄">::</span>
                {label}
              </div>
            </div>
            <div className="px-2 py-0.5 rounded border border-gray-200 text-xs text-black shrink-0" title="固定双分支">
              IF/ELSE
            </div>
          </div>
        </div>
      </div>

      {/* 右侧源句柄（两个输出：true / false） */}
      <div className="absolute right-[-12px] top-[40%]">
        <Handle
          type="source"
          position={Position.Right}
          id="true"
          style={{
            width: 16,
            height: 16,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            background: '#0B0B0B',
          }}
        />
      </div>

      <div className="absolute right-[-12px] top-[60%]">
        <Handle
          type="source"
          position={Position.Right}
          id="false"
          style={{
            width: 16,
            height: 16,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            background: '#0B0B0B',
          }}
        />
      </div>
    </div>
  );
};

export default ConditionNode;