import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { debounce, throttle } from 'lodash';

// 节流Hook
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const throttledCallback = useMemo(
    () => throttle(callback, delay, { leading: true, trailing: false }),
    [callback, delay]
  );

  useEffect(() => {
    return () => {
      throttledCallback.cancel();
    };
  }, [throttledCallback]);

  return throttledCallback as unknown as T;
}

// 防抖Hook
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const debouncedCallback = useMemo(
    () => debounce(callback, delay),
    [callback, delay]
  );

  useEffect(() => {
    return () => {
      debouncedCallback.cancel();
    };
  }, [debouncedCallback]);

  return debouncedCallback as unknown as T;
}

// 性能监控Hook
export function usePerformanceMonitor(componentName: string) {
  const renderStartTime = useRef<number>();
  const renderCount = useRef(0);

  useEffect(() => {
    renderStartTime.current = performance.now();
    renderCount.current += 1;
  });

  useEffect(() => {
    if (renderStartTime.current) {
      const renderTime = performance.now() - renderStartTime.current;
      if (renderTime > 16) { // 超过16ms警告
        console.warn(`${componentName} render took ${renderTime.toFixed(2)}ms (render #${renderCount.current})`);
      }
    }
  });

  const logPerformance = useCallback((operationName: string, operation: () => void) => {
    const startTime = performance.now();
    operation();
    const endTime = performance.now();
    console.log(`${componentName} - ${operationName}: ${(endTime - startTime).toFixed(2)}ms`);
  }, [componentName]);

  return { logPerformance };
}

// 内存清理Hook
export function useCleanup(cleanup: () => void) {
  useEffect(() => {
    return cleanup;
  }, [cleanup]);
}

// 虚拟化列表Hook
export function useVirtualization(
  items: any[],
  itemHeight: number,
  containerHeight: number,
  buffer: number = 5
) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
    const visibleItemCount = Math.ceil(containerHeight / itemHeight);
    const endIndex = Math.min(items.length - 1, startIndex + visibleItemCount + buffer * 2);

    return { startIndex, endIndex, visibleItemCount };
  }, [scrollTop, itemHeight, containerHeight, buffer, items.length]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [items, visibleRange.startIndex, visibleRange.endIndex]);

  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.startIndex * itemHeight;

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight,
    offsetY,
    handleScroll,
    visibleRange,
  };
}

// 懒加载Hook
export function useLazyLoad<T>(
  loadFunction: () => Promise<T>,
  dependencies: any[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const result = await loadFunction();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [loadFunction, loading]);

  useEffect(() => {
    load();
  }, dependencies);

  return { data, loading, error, reload: load };
}

// 内存使用监控Hook
export function useMemoryMonitor(componentName: string, interval: number = 5000) {
  const intervalRef = useRef<number>();

  useEffect(() => {
    if ('memory' in performance && (performance as any).memory) {
      intervalRef.current = window.setInterval(() => {
        const memory = (performance as any).memory;
        const used = Math.round(memory.usedJSHeapSize / 1048576);
        const total = Math.round(memory.totalJSHeapSize / 1048576);
        const limit = Math.round(memory.jsHeapSizeLimit / 1048576);

        if (used > limit * 0.8) {
          console.warn(`${componentName} - High memory usage: ${used}MB / ${limit}MB`);
        }

        // 每分钟记录一次内存使用情况
        if (Date.now() % 60000 < interval) {
          console.log(`${componentName} - Memory: ${used}MB / ${total}MB (limit: ${limit}MB)`);
        }
      }, interval);
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [componentName, interval]);
}

// 渲染优化Hook
export function useRenderOptimization() {
  const renderTimeRef = useRef<number>(0);
  const frameRef = useRef<number>();

  const scheduleUpdate = useCallback((callback: () => void) => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      const start = performance.now();
      callback();
      renderTimeRef.current = performance.now() - start;
    });
  }, []);

  const getRenderTime = useCallback(() => renderTimeRef.current, []);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return { scheduleUpdate, getRenderTime };
}

// 批量状态更新Hook
export function useBatchedUpdates<T>() {
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, T>>(new Map());
  const timeoutRef = useRef<number>();

  const batchUpdate = useCallback((key: string, value: T, delay: number = 100) => {
    setPendingUpdates((prev: Map<string, T>) => {
      const newMap = new Map(prev);
      newMap.set(key, value);
      return newMap;
    });

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setPendingUpdates(new Map()); // 清空待更新的状态
    }, delay);
  }, []);

  const flushUpdates = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      setPendingUpdates(new Map());
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { pendingUpdates, batchUpdate, flushUpdates };
}