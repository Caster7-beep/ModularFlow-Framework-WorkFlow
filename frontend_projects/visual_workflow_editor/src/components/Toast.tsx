import React, { useEffect, useRef, useState } from 'react';

export type ToastOptions = {
  duration?: number; // default 1500ms
};

// Simple singleton subscriber for toast events
type Subscriber = (msg: string, opts?: ToastOptions) => void;
let subscriber: Subscriber | null = null;
let hideTimer: any = null;

/**
 * showToast(message, opts?)
 * Usage: showToast('已保存'); showToast('网格=16', { duration: 2000 })
 */
export function showToast(message: string, opts?: ToastOptions) {
  if (subscriber) {
    subscriber(message, opts);
  } else {
    // If host not mounted yet, try shortly later
    setTimeout(() => subscriber?.(message, opts), 0);
  }
}

/**
 * ToastHost()
 * Mount this near the root once. It listens to showToast() calls and renders a minimal black/white toast.
 */
const ToastHost: React.FC = () => {
  const [msg, setMsg] = useState<string>('');
  const [visible, setVisible] = useState<boolean>(false);
  const localRef = useRef<Subscriber | null>(null);

  useEffect(() => {
    const sub: Subscriber = (m, options) => {
      const duration = Math.max(300, options?.duration ?? 1500);
      setMsg(m);
      setVisible(true);
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
      hideTimer = setTimeout(() => setVisible(false), duration);
    };
    subscriber = sub;
    localRef.current = sub;
    return () => {
      if (subscriber === localRef.current) {
        subscriber = null;
      }
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed top-4 right-4 z-[1500]"
    >
      <div
        role="status"
        className={
          'transition-opacity duration-200 ' +
          (visible ? 'opacity-100' : 'opacity-0')
        }
      >
        <div className="pointer-events-auto bg-black text-white rounded px-3 py-2 shadow-sm max-w-xs">
          <span className="text-sm leading-5">{msg}</span>
        </div>
      </div>
    </div>
  );
};

export default ToastHost;