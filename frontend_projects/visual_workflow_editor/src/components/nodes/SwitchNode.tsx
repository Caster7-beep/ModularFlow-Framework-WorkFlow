import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useNodeId } from 'reactflow';

interface SwitchNodeData {
  label: string;
  switch_map: Record<string, string>;
  description?: string;
  ui?: {
    size?: { w?: number; h?: number };
  };
}

const SwitchNode: React.FC<NodeProps<SwitchNodeData>> = ({ id, data, selected }) => {
  const rf = useReactFlow();
  const nodeId = useNodeId();

  const cfgLabel = (data as any)?.config?.label;
  const label = (cfgLabel || data?.label || '开关路由').toString();

  const routes = useMemo(() => Object.entries(data?.switch_map || {}), [data?.switch_map]);

  // 展开编辑模式（双击进入）
  const [expanded, setExpanded] = useState(false);
  const [pairs, setPairs] = useState<{ key: string; value: string }[]>(() =>
    routes.map(([k, v]) => ({ key: String(k), value: String(v) }))
  );

  useEffect(() => {
    (window as any)?.lucide?.createIcons?.();
  }, []);

  // 同步外部数据变化
  useEffect(() => {
    setPairs(routes.map(([k, v]) => ({ key: String(k), value: String(v) })));
  }, [routes]);

  const addPair = () => {
    setPairs((prev) => [...prev, { key: '', value: '' }]);
  };

  const removePair = (index: number) => {
    setPairs((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePair = (index: number, field: 'key' | 'value', value: string) => {
    setPairs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const savePairs = () => {
    // 序列化为 map
    const nextMap: Record<string, string> = {};
    pairs.forEach(({ key, value }) => {
      const k = String(key || '').trim();
      const v = String(value || '').trim();
      if (k.length) nextMap[k] = v;
    });
    // 通过 useReactFlow.setNodes() 原地更新该节点的数据
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                config: {
                  ...(n.data?.config || {}),
                  label,
                  switch_map: nextMap,
                },
                // 兼容 data.switch_map 的读取（不破坏现有结构）
                switch_map: nextMap,
              },
            }
          : n
      )
    );
    setExpanded(false);
  };

  // 调整尺寸模式：按 R 切换（由 WorkflowCanvas 注入 body.dataset.resize）
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
      // 仅在调整尺寸模式且未拖拽时写回，避免拖拽时触发抖动与卡顿
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

  // 1.5 倍放大后的默认卡片尺寸（折叠态/展开态）
  const collapsedSize = 'min-w-[240px] max-w-[420px]';
  const expandedSize = 'min-w-[330px] max-w-[540px]';

  return (
    <div
      tabIndex={0}
      aria-label={`开关 节点: ${label}`}
      className={`relative ${selected ? 'ring-1 ring-black' : ''} focus:outline-none focus-visible:ring-2 focus-visible:ring-black cursor-grab active:cursor-grabbing`}
      style={{ willChange: 'transform' }}
      onDoubleClick={() => setExpanded((v) => !v)}
      title="双击展开/收起编辑"
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

      {/* 极简卡片：图标 + 标题 + 一行徽标（路由数量） */}
      <div
        ref={cardRef}
        className={`group rounded border border-gray-200 bg-white text-black shadow-sm hover:shadow-md transition-all duration-200 focus-within:ring-2 focus-within:ring-black ${expanded ? expandedSize : collapsedSize}`}
        style={{
          // 拖拽中不应用持久化尺寸，避免抖动
          ...(savedWidth && !isThisDragging ? { width: savedWidth } : {}),
          ...(savedHeight && !isThisDragging ? { height: savedHeight } : {}),
          ...(resizeEnabled && !isThisDragging
            ? {
                resize: 'both',
                overflow: 'auto',
                cursor: 'nwse-resize',
                borderStyle: 'dashed',
                borderColor: '#d1d5db',
              }
            : { borderStyle: 'solid', borderColor: '#e5e7eb' }),
        }}
      >
        <div className={`${expanded ? 'p-4 space-y-3' : 'p-4 space-y-2'}`}>
          {/* 顶部标题行 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-gray-100 text-black shrink-0">
                <i data-lucide="shuffle" className="w-4 h-4"></i>
              </span>
              <div className="text-base font-semibold leading-6 min-w-0 truncate-2 break-words whitespace-normal" title={label}>
                <span className="mr-1 text-gray-600 select-none cursor-grab active:cursor-grabbing" aria-label="drag handle" title="拖拽句柄">::</span>
                {label}
              </div>
            </div>
            <div className="px-2 py-0.5 rounded border border-gray-200 text-xs text-black shrink-0" title="路由数量">
              {routes.length} 条
            </div>
          </div>

          {/* 折叠态：仅预览若干路由 */}
          {!expanded && (
            <div className="space-y-1 text-sm text-gray-600">
              {routes.length === 0 ? (
                <div className="italic">未配置路由</div>
              ) : (
                routes.slice(0, 2).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded border border-gray-200 bg-white min-w-[44px] text-center font-medium">
                      {k}
                    </span>
                    <span className="text-gray-600">→</span>
                    <span className="truncate">{v}</span>
                  </div>
                ))
              )}
              {routes.length > 2 && <div className="text-xs text-gray-600">…</div>}
              <div className="text-xs text-gray-600">双击可展开编辑</div>
            </div>
          )}

          {/* 展开态：键值对编辑（保存后收起） */}
          {expanded && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">路由规则（键值对）</div>
                <button
                  onClick={addPair}
                  className="h-8 px-2 rounded border border-gray-300 text-sm hover:bg-gray-50 transition-colors duration-200"
                >
                  添加
                </button>
              </div>
              <div className="space-y-1">
                {pairs.length === 0 && (
                  <div className="text-xs text-gray-600 italic">暂无路由，点击“添加”新建</div>
                )}
                {pairs.map((p, i) => (
                  <div key={`${i}_${p.key}`} className="flex items-center gap-2">
                    <input
                      className="h-9 px-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm w-[120px] font-mono"
                      placeholder="键 (如: 1 或 default)"
                      value={p.key}
                      onChange={(e) => updatePair(i, 'key', e.target.value)}
                    />
                    <span className="text-gray-600">→</span>
                    <input
                      className="h-9 px-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm flex-1"
                      placeholder="输出内容"
                      value={p.value}
                      onChange={(e) => updatePair(i, 'value', e.target.value)}
                    />
                    <button
                      onClick={() => removePair(i)}
                      className="h-9 px-2 rounded bg-black text-white text-sm hover:opacity-90 transition-colors duration-200"
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setExpanded(false)}
                  className="h-9 px-4 rounded border border-gray-300 text-sm hover:bg-gray-50 transition-colors duration-200"
                >
                  取消
                </button>
                <button
                  onClick={savePairs}
                  className="h-9 px-4 rounded bg-black text-white text-sm hover:opacity-90 transition-colors duration-200"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 动态输出句柄（纵向分布） */}
      {routes.map(([key], index) => {
        const topPercent = 30 + index * 15;
        return (
          <div key={key} className="absolute right-[-12px]" style={{ top: `${topPercent}%` }}>
            <Handle
              type="source"
              position={Position.Right}
              id={key}
              style={{
                width: 16,
                height: 16,
                borderWidth: 2,
                borderColor: '#FFFFFF',
                background: '#0B0B0B',
              }}
            />
          </div>
        );
      })}

      {/* 默认输出端口（底部偏右） */}
      <div className="absolute right-[-12px] bottom-[10px]">
        <Handle
          type="source"
          position={Position.Right}
          id="default"
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

export default SwitchNode;