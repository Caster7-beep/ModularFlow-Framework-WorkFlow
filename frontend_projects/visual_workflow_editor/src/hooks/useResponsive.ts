import { useState, useEffect } from 'react';

// 响应式断点定义
export const BREAKPOINTS = {
  xs: 480,   // 手机
  sm: 768,   // 平板
  md: 1024,  // 小桌面
  lg: 1440,  // 桌面
  xl: 1920,  // 大屏幕
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

// 设备类型
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

// 响应式信息接口
export interface ResponsiveInfo {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  deviceType: DeviceType;
  breakpoint: BreakpointKey;
  orientation: 'portrait' | 'landscape';
}

// 获取当前断点
const getCurrentBreakpoint = (width: number): BreakpointKey => {
  if (width < BREAKPOINTS.xs) return 'xs';
  if (width < BREAKPOINTS.sm) return 'xs';
  if (width < BREAKPOINTS.md) return 'sm';
  if (width < BREAKPOINTS.lg) return 'md';
  if (width < BREAKPOINTS.xl) return 'lg';
  return 'xl';
};

// 获取设备类型
const getDeviceType = (width: number): DeviceType => {
  if (width < BREAKPOINTS.sm) return 'mobile';
  if (width < BREAKPOINTS.md) return 'tablet';
  return 'desktop';
};

// 响应式Hook
export const useResponsive = (): ResponsiveInfo => {
  const [responsiveInfo, setResponsiveInfo] = useState<ResponsiveInfo>(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const deviceType = getDeviceType(width);
    
    return {
      width,
      height,
      isMobile: deviceType === 'mobile',
      isTablet: deviceType === 'tablet',
      isDesktop: deviceType === 'desktop',
      deviceType,
      breakpoint: getCurrentBreakpoint(width),
      orientation: height > width ? 'portrait' : 'landscape',
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const deviceType = getDeviceType(width);
      
      setResponsiveInfo({
        width,
        height,
        isMobile: deviceType === 'mobile',
        isTablet: deviceType === 'tablet',
        isDesktop: deviceType === 'desktop',
        deviceType,
        breakpoint: getCurrentBreakpoint(width),
        orientation: height > width ? 'portrait' : 'landscape',
      });
    };

    // 添加防抖以提高性能
    let timeoutId: number;
    const debouncedResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', debouncedResize);
    window.addEventListener('orientationchange', debouncedResize);

    return () => {
      window.removeEventListener('resize', debouncedResize);
      window.removeEventListener('orientationchange', debouncedResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return responsiveInfo;
};

// 媒体查询Hook
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => {
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
};

// 便捷的断点检查Hook
export const useBreakpoint = (breakpoint: BreakpointKey): boolean => {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[breakpoint]}px)`);
};

// 检查是否为移动设备
export const useIsMobile = (): boolean => {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.sm - 1}px)`);
};

// 检查是否为平板
export const useIsTablet = (): boolean => {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.sm}px) and (max-width: ${BREAKPOINTS.md - 1}px)`);
};

// 检查是否为桌面
export const useIsDesktop = (): boolean => {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.md}px)`);
};

// 响应式样式计算工具
export const getResponsiveValue = <T>(
  values: Partial<Record<BreakpointKey, T>>,
  currentBreakpoint: BreakpointKey,
  fallback: T
): T => {
  // 按优先级查找值
  const priorities: BreakpointKey[] = ['xl', 'lg', 'md', 'sm', 'xs'];
  const currentIndex = priorities.indexOf(currentBreakpoint);
  
  // 从当前断点开始向下查找
  for (let i = currentIndex; i < priorities.length; i++) {
    const bp = priorities[i];
    if (values[bp] !== undefined) {
      return values[bp]!;
    }
  }
  
  // 如果没有找到，向上查找
  for (let i = currentIndex - 1; i >= 0; i--) {
    const bp = priorities[i];
    if (values[bp] !== undefined) {
      return values[bp]!;
    }
  }
  
  return fallback;
};

// 响应式布局配置
export interface ResponsiveLayoutConfig {
  mobile: {
    siderCollapsed: boolean;
    showPropertyPanel: boolean;
    toolbarLayout: 'horizontal' | 'vertical';
  };
  tablet: {
    siderCollapsed: boolean;
    showPropertyPanel: boolean;
    toolbarLayout: 'horizontal' | 'vertical';
  };
  desktop: {
    siderCollapsed: boolean;
    showPropertyPanel: boolean;
    toolbarLayout: 'horizontal' | 'vertical';
  };
}

// 默认响应式布局配置
export const DEFAULT_RESPONSIVE_CONFIG: ResponsiveLayoutConfig = {
  mobile: {
    siderCollapsed: true,
    showPropertyPanel: false,
    toolbarLayout: 'vertical',
  },
  tablet: {
    siderCollapsed: false,
    showPropertyPanel: true,
    toolbarLayout: 'horizontal',
  },
  desktop: {
    siderCollapsed: false,
    showPropertyPanel: true,
    toolbarLayout: 'horizontal',
  },
};

// 获取当前设备的布局配置
export const getLayoutConfig = (
  deviceType: DeviceType,
  config: ResponsiveLayoutConfig = DEFAULT_RESPONSIVE_CONFIG
) => {
  return config[deviceType];
};