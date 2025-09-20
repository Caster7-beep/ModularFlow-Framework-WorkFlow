import React, { useEffect, useMemo, useRef, useState } from 'react';

export type MenuItem = {
  key: string;
  label: string;
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
};

export interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  ariaLabel?: string;
}

/**
 * ContextMenu
 * - 黑白极简：bg-white text-black rounded border-gray-200 shadow-md
 * - 菜单项 h-12，焦点环 focus:ring-2 ring-black
 * - 键盘可达：上下箭头移动，回车确认，ESC 关闭
 * - 点击外部关闭
 */
const ContextMenu: React.FC<ContextMenuProps> = ({ open, x, y, items, onClose, ariaLabel = '上下文菜单' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const focusables = useRef<HTMLButtonElement[]>([]);
  focusables.current = [];
  // 记录菜单打开时间，避免打开触发的右键/按下事件被“外部点击关闭”处理掉
  const openedAtRef = useRef<number>(0);

  const enabledItems = useMemo(() => items, [items]);

  // 视口内位置修正，避免超出屏幕
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    if (!open) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuW = 240;
    const menuH = Math.max(48, enabledItems.length * 48);
    let left = x;
    let top = y;
    if (left + menuW > vw - 8) left = Math.max(8, vw - menuW - 8);
    if (top + menuH > vh - 8) top = Math.max(8, vh - menuH - 8);
    setPos({ left, top });
  }, [open, x, y, enabledItems.length]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(() => {
      const firstEnabled = enabledItems.findIndex(i => !i.disabled);
      return firstEnabled >= 0 ? firstEnabled : 0;
    });
    // 记录打开时刻，防止打开触发的事件立刻被外点关闭逻辑捕获
    openedAtRef.current = Date.now();

    const onDocMouseDown = (e: MouseEvent) => {
      // 忽略打开后的短时间窗口与右键（button===2）
      const sinceOpen = Date.now() - (openedAtRef.current || 0);
      // 某些环境下右键顺序: mousedown(button=2) -> contextmenu -> ...
      // 这里忽略右键与打开后极短时间内的按下事件
      // @ts-ignore
      const btn = (e as any).button;
      if (btn === 2) return;
      if (sinceOpen < 120) return;

      const t = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(t)) {
        onClose();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        let next = activeIndex;
        for (let i = 0; i < enabledItems.length; i++) {
          next = (next + 1) % enabledItems.length;
          if (!enabledItems[next]?.disabled) break;
        }
        setActiveIndex(next);
        focusables.current[next]?.focus();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        let prev = activeIndex;
        for (let i = 0; i < enabledItems.length; i++) {
          prev = (prev - 1 + enabledItems.length) % enabledItems.length;
          if (!enabledItems[prev]?.disabled) break;
        }
        setActiveIndex(prev);
        focusables.current[prev]?.focus();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = enabledItems[activeIndex];
        if (it && !it.disabled) {
          try { it.onSelect(); } finally { onClose(); }
        }
      }
    };

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, activeIndex, enabledItems, onClose]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="menu"
      aria-label={ariaLabel}
      aria-modal="true"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="fixed z-[1300] bg-white text-black rounded border border-gray-200 shadow-md min-w-[200px] max-w-[280px] focus:outline-none"
      style={{ left: pos.left, top: pos.top }}
    >
      <ul className="py-1">
        {enabledItems.map((item, idx) => (
          <li key={item.key}>
            <button
              ref={(el) => { if (el) focusables.current[idx] = el; }}
              role="menuitem"
              aria-disabled={item.disabled || false}
              disabled={item.disabled}
              title={item.title}
              onClick={() => { if (!item.disabled) { try { item.onSelect(); } finally { onClose(); } } }}
              className={[
                'w-full text-left px-3 h-12 leading-[48px] hover:bg-gray-100 focus:bg-gray-100',
                'focus:outline-none focus:ring-2 focus:ring-black',
                item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              ].join(' ')}
              tabIndex={idx === activeIndex ? 0 : -1}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ContextMenu;