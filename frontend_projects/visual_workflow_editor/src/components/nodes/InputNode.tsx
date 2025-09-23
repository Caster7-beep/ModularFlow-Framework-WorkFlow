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

  // 进一步放大节点尺寸，使其在默认缩放下更易操作
  const sizeClass = 'min-w-[280px] max-w-[480px]';

  return (
    <div
      tabIndex={0}
      aria-label={`输入 节点: ${label}`}
      data-qa="node-input"
      data-node-type="input"
      className={`relative inline-block ${selected ? 'ring-1 ring-black' : ''} focus:outline-none focus-visible:ring-2 focus-visible:ring-black cursor-grab active:cursor-grabbing`}
      style={{ willChange: 'transform', height: 'auto', width: 'auto', aspectRatio: 'auto' }}
    >
      {/* 极简卡片：图标 + 标题 + 一行徽标（类型）。名称会自动换行，不会溢出 */}
      <div
        ref={cardRef}
        className={`group inline-block rounded-sm border border-black bg-white text-black shadow-sm hover:shadow-md transition-shadow duration-150 focus-within:ring-2 focus-within:ring-black ${sizeClass}`}
        style={{
          // 实例化尺寸优先（每个节点独立保存；拖拽中禁用以避免抖动）
          ...(savedWidth && !isThisDragging ? { width: savedWidth } : {}),
          // 高度仅在调整尺寸模式下固定，常态下由内容自适应，避免节点变成正方形
          ...(savedHeight && resizeEnabled && !isThisDragging ? { height: savedHeight } : {}),
          // 解除任何外部 aspect-ratio 影响，避免被拉成正方形
          aspectRatio: 'auto',
          // 启用"调整尺寸模式"后可从右下角拖拽，并给出视觉提示（拖拽中禁用）
          ...(resizeEnabled && !isThisDragging
            ? { resize: 'both', cursor: 'nwse-resize', borderStyle: 'dashed', borderColor: '#000000' } as React.CSSProperties
            : { borderStyle: 'solid', borderColor: '#000000' } as React.CSSProperties),
          // 确保内容不会溢出并保持形状完整
          overflow: 'visible',
        }}
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* 48x48px 触摸区域的图标容器 */}
              <span className="inline-flex h-12 w-12 items-center justify-center rounded bg-white border border-black shrink-0">
                <i data-lucide="log-in" className="w-6 h-6"></i>
              </span>
              {/* 名称两行省略 + 抓手符号 */}
              <div className="text-lg font-semibold leading-7 min-w-0 truncate-2 break-words whitespace-normal" title={label}>
                <span className="mr-1 text-black select-none cursor-grab active:cursor-grabbing" aria-label="drag handle" title="拖拽句柄">::</span>
                {label}
              </div>
            </div>
            <div className="px-4 py-2 rounded border border-black text-sm text-black shrink-0">
              {inputType}
            </div>
          </div>
        </div>
      </div>

      {/* 右侧源句柄（输出） - 确保48x48px触摸区域 */}
      <div className="absolute right-[-24px] top-1/2 -translate-y-1/2">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <Handle
            id="out"
            data-qa="handle-source"
            data-handle-id="out"
            data-handle-type="source"
            data-handle-position="right"
            type="source"
            position={Position.Right}
            className="rf-handle-hit"
            style={{
              width: 24,
              height: 24,
              borderRadius: '2px',
              borderWidth: 2,
              borderColor: '#FFFFFF',
              background: '#000000',
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default InputNode;