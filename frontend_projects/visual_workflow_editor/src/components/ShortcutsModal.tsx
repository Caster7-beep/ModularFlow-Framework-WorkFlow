import React, { useEffect, useRef } from 'react';

type ShortcutsModalProps = {
  open: boolean;
  onClose: () => void;
};

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ open, onClose }) => {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // 初始 focus 到关闭按钮，Esc 关闭
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={(e) => {
        // 点击遮罩关闭
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      {/* 内容卡片：黑白极简 */}
      <div className="relative bg-white text-black rounded border border-gray-200 shadow-md w-[92vw] max-w-[640px] max-h-[84vh] overflow-auto p-4 md:p-6">
        <div className="flex items-center justify-between gap-4 mb-2">
          <h2 id="shortcuts-title" className="text-lg font-semibold">快捷键帮助</h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="h-12 min-w-12 px-4 flex items-center justify-center bg-black text-white rounded focus:outline-none focus:ring-2 focus:ring-black"
            aria-label="关闭"
          >
            关闭
          </button>
        </div>

        <div className="text-sm leading-6 space-y-3 mt-2">
          <div className="rounded border border-gray-200 p-3">
            <div className="font-medium mb-1">选择与框选</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Shift + 拖拽：框选</li>
              <li>Shift + 点击：多选/反选</li>
            </ul>
          </div>

          <div className="rounded border border-gray-200 p-3">
            <div className="font-medium mb-1">对齐与分布</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Alt + ↑/↓/←/→：向方向对齐（至少 2 个）</li>
              <li>Alt + Shift + H：水平等分（至少 3 个）</li>
              <li>Alt + Shift + V：垂直等分（至少 3 个）</li>
            </ul>
          </div>

          <div className="rounded border border-gray-200 p-3">
            <div className="font-medium mb-1">画布与网格</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>F：fitView（重置视图）</li>
              <li>G：切换吸附（Snap To Grid）</li>
              <li>[ 或 ]：循环网格尺寸（8 ⇄ 16 ⇄ 24）</li>
            </ul>
          </div>

          <div className="rounded border border-gray-200 p-3">
            <div className="font-medium mb-1">模式与帮助</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>R：尺寸模式（Resize Mode）</li>
              <li>?（或 Shift + /）：打开/关闭本帮助</li>
              <li>Esc：关闭 Overlay / 连接态 / 帮助</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;