import React, { useEffect, useMemo, useRef } from 'react';
import { Handle, Position, useNodeId, useReactFlow } from 'reactflow';
import type { OutputNodeConfig } from '../../types/workflow';

interface OutputNodeProps {
  data: {
    label: string;
    config: OutputNodeConfig;
    ui?: {
      size?: { w?: number; h?: number };
    };
  };
  selected?: boolean;
}

const OutputNode: React.FC<OutputNodeProps> = ({ data, selected }) => {
  const cfg: any = data?.config || {};
  const nodeId = useNodeId();
  const rf = useReactFlow();

  // 标题与徽标（输出类型），允许换行，避免文字溢出
  const label: string = useMemo(() => (cfg.label || data.label || '输出节点').toString(), [cfg.label, data.label]);
  const outputType: string = useMemo(() => (cfg.outputType || 'text').toString().toUpperCase(), [cfg.outputType]);

  // 初始化 Lucide 图标
  useEffect(() => {
    (window as any)?.lucide?.createIcons?.();
  }, []);

  // 读取“调整尺寸模式”：按 R 切换（WorkflowCanvas.tsx 中注入 body.dataset.resize='1'）
  const resizeEnabled = typeof document !== 'undefined' && document.body?.dataset?.resize === '1';

  // 尺寸持久化（每个实例单独保存）
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!cardRef.current || !nodeId) return;

    const obs = new ResizeObserver((entries) => {
      if (!entries?.length) return;
      const isResize = typeof document !== 'undefined' && document.body?.dataset?.resize === '1';
      const isDragging = typeof document !== 'undefined' && document.body?.dataset?.dragging === '1';
      // 仅在调整尺寸模式且未拖拽时写回，避免拖拽时触发抖动与卡顿
      if (!isResize || isDragging) return;

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

  // 进一步放大节点尺寸，使其在默认缩放下更易操作
  const sizeClass = 'min-w-[280px] max-w-[480px]';

  return (
    <div
      tabIndex={0}
      aria-label={`输出 节点: ${label}`}
      data-qa="node-output"
      data-node-type="output"
      className={`relative inline-block ${selected ? 'ring-1 ring-black' : ''} focus:outline-none focus-visible:ring-2 focus-visible:ring-black cursor-grab active:cursor-grabbing`}
      style={{ willChange: 'transform', height: 'auto', width: 'auto', aspectRatio: 'auto' }}
    >
      {/* 左侧目标句柄（输入） - 确保48x48px触摸区域 */}
      <div className="absolute left-[-24px] top-1/2 -translate-y-1/2">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <Handle
            id="in"
            data-qa="handle-target"
            data-handle-id="in"
            data-handle-type="target"
            data-handle-position="left"
            type="target"
            position={Position.Left}
            className="rf-handle-hit"
            style={{
              width: 24,
              height: 24,
              borderRadius: '2px',
              borderWidth: 2,
              borderColor: '#FFFFFF',
              background: '#0B0B0B',
            }}
          />
        </div>
      </div>

      {/* 极简卡片：图标 + 标题 + 一行徽标（类型）。名称可换行，节点随内容伸缩 */}
      <div
        ref={cardRef}
        className={`group inline-block rounded-sm border border-black bg-white text-black shadow-sm hover:shadow-md transition-shadow duration-150 focus-within:ring-2 focus-within:ring-black ${sizeClass}`}
        style={{
          ...(savedWidth ? { width: savedWidth } : {}),
          // 高度仅在“调整尺寸模式”下固定；常态由内容自适应，避免节点被拉成正方形
          ...(savedHeight && resizeEnabled ? { height: savedHeight } : {}),
          // 明确解除宽高比并由内容决定布局
          aspectRatio: 'auto',
          height: 'auto',
          width: 'auto',
          ...(resizeEnabled ? { resize: 'both', overflow: 'auto', borderStyle: 'dashed' } as React.CSSProperties : { borderStyle: 'solid' } as React.CSSProperties),
        }}
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-gray-100 text-black shrink-0">
                <i data-lucide="log-out" className="w-4 h-4"></i>
              </span>
              {/* 名称两行省略 + 抓手符号 */}
              <div className="text-lg font-semibold leading-7 min-w-0 truncate-2 break-words whitespace-normal" title={label}>
                <span className="mr-1 text-gray-600 select-none cursor-grab active:cursor-grabbing" aria-label="drag handle" title="拖拽句柄">::</span>
                {label}
              </div>
            </div>
            <div className="px-2 py-1 rounded-sm border border-gray-200 text-sm text-black shrink-0">
              {outputType}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OutputNode;