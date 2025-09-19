import React, { useEffect, useMemo, useRef } from 'react';
import { Handle, Position, useNodeId, useReactFlow } from 'reactflow';
import type { InputNodeConfig } from '../../types/workflow';

interface InputNodeProps {
  data: {
    label: string;
    config: InputNodeConfig;
    // 可选的 UI 扩展数据（每个节点实例保存自己的尺寸）
    ui?: {
      size?: { w?: number; h?: number };
    };
  };
  selected?: boolean;
}

const InputNode: React.FC<InputNodeProps> = ({ data, selected }) => {
  const cfg: any = data?.config || {};
  const nodeId = useNodeId();
  const rf = useReactFlow();

  // 统一节点名称反映在节点本体；允许自动换行，避免文字溢出
  const label: string = useMemo(() => (cfg.label || data.label || '输入节点').toString(), [cfg.label, data.label]);

  // 类型徽标
  const inputType: string = useMemo(() => (cfg.inputType || 'text').toString().toUpperCase(), [cfg.inputType]);

  // Lucide 图标初始化
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

  // 容器 ref + ResizeObserver：仅在“调整尺寸模式”下写回尺寸到该节点实例
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!cardRef.current || !nodeId) return;

    const obs = new ResizeObserver((entries) => {
      if (!entries?.length) return;
      const isResize = typeof document !== 'undefined' && document.body?.dataset?.resize === '1';
      const isDragging = typeof document !== 'undefined' && document.body?.dataset?.dragging === '1';
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

  // 从实例数据中读取已保存的尺寸（如存在）
  const savedSize = (data as any)?.ui?.size || {};
  const savedWidth = typeof savedSize.w === 'number' ? savedSize.w : undefined;
  const savedHeight = typeof savedSize.h === 'number' ? savedSize.h : undefined;

  // 1.5 倍放大：将默认卡片尺寸按新需求放大
  // 原：min-w-[150px] max-w-[260px] p-3 → 放大为 min-w 240 / max-w 420，并维持 p-3（高度也将随内容自动扩展）
  const sizeClass = 'min-w-[240px] max-w-[420px]';

  return (
    <div
      tabIndex={0}
      aria-label={`输入 节点: ${label}`}
      className={`relative ${selected ? 'ring-1 ring-black' : ''} focus:outline-none focus-visible:ring-2 focus-visible:ring-black cursor-grab active:cursor-grabbing`}
      style={{ willChange: 'transform' }}
    >
      {/* 极简卡片：图标 + 标题 + 一行徽标（类型）。名称会自动换行，不会溢出 */}
      <div
        ref={cardRef}
        className={`group rounded border border-gray-200 bg-white text-black shadow-sm hover:shadow-md transition-shadow duration-200 focus-within:ring-2 focus-within:ring-black overflow-hidden ${sizeClass}`}
        style={{
          // 实例化尺寸优先（每个节点独立保存；拖拽中禁用以避免抖动）
          ...(savedWidth && !isThisDragging ? { width: savedWidth } : {}),
          ...(savedHeight && !isThisDragging ? { height: savedHeight } : {}),
          // 启用“调整尺寸模式”后可从右下角拖拽，并给出视觉提示（拖拽中禁用）
          ...(resizeEnabled && !isThisDragging
            ? { resize: 'both', overflow: 'auto', cursor: 'nwse-resize', borderStyle: 'dashed', borderColor: '#d1d5db' } as React.CSSProperties
            : { borderStyle: 'solid', borderColor: '#e5e7eb' } as React.CSSProperties),
        }}
      >
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-gray-100 text-black shrink-0">
                <i data-lucide="log-in" className="w-4 h-4"></i>
              </span>
              {/* 名称两行省略 + 抓手符号 */}
              <div className="text-base font-semibold leading-6 min-w-0 truncate-2 break-words whitespace-normal" title={label}>
                <span className="mr-1 text-gray-600 select-none cursor-grab active:cursor-grabbing" aria-label="drag handle" title="拖拽句柄">::</span>
                {label}
              </div>
            </div>
            <div className="px-2 py-0.5 rounded border border-gray-200 text-xs text-black shrink-0">
              {inputType}
            </div>
          </div>
        </div>
      </div>

      {/* 右侧源句柄（输出） */}
      <div className="absolute right-[-12px] top-1/2 -translate-y-1/2">
        <Handle
          type="source"
          position={Position.Right}
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

export default InputNode;