import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ConfigProvider, theme, App } from 'antd';
import type { ThemeConfig } from 'antd';

// 主题类型定义
export type ThemeMode = 'light' | 'dark';
export type ColorScheme = 'blue' | 'green' | 'purple' | 'orange';

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  hover: string;
  active: string;
  disabled: string;
  shadow: string;
  overlay: string;
}

export interface CustomTheme {
  mode: ThemeMode;
  colorScheme: ColorScheme;
  colors: ThemeColors;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
  };
  animation: {
    duration: {
      fast: string;
      normal: string;
      slow: string;
    };
    easing: {
      linear: string;
      ease: string;
      easeIn: string;
      easeOut: string;
      easeInOut: string;
    };
  };
}

// 颜色方案定义
const COLOR_SCHEMES = {
  blue: {
    primary: '#1890ff',
    secondary: '#69b1ff',
    success: '#52c41a',
    warning: '#fadb14',
    error: '#ff4d4f',
    info: '#1890ff',
  },
  green: {
    primary: '#52c41a',
    secondary: '#95de64',
    success: '#73d13d',
    warning: '#fadb14',
    error: '#ff4d4f',
    info: '#1890ff',
  },
  purple: {
    primary: '#722ed1',
    secondary: '#b37feb',
    success: '#52c41a',
    warning: '#fadb14',
    error: '#ff4d4f',
    info: '#1890ff',
  },
  orange: {
    primary: '#fa8c16',
    secondary: '#ffa940',
    success: '#52c41a',
    warning: '#fadb14',
    error: '#ff4d4f',
    info: '#1890ff',
  }
};

// 浅色主题颜色
const LIGHT_COLORS = {
  background: '#ffffff',
  surface: '#fafafa',
  text: '#262626',
  textSecondary: '#8c8c8c',
  border: '#d9d9d9',
  hover: '#f5f5f5',
  active: '#e6f7ff',
  disabled: '#f5f5f5',
  shadow: 'rgba(0, 0, 0, 0.15)',
  overlay: 'rgba(0, 0, 0, 0.45)',
};

// 深色主题颜色
const DARK_COLORS = {
  background: '#141414',
  surface: '#1f1f1f',
  text: '#ffffff',
  textSecondary: '#8c8c8c',
  border: '#434343',
  hover: '#262626',
  active: '#003a8c',
  disabled: '#262626',
  shadow: 'rgba(0, 0, 0, 0.45)',
  overlay: 'rgba(0, 0, 0, 0.65)',
};

// 创建完整主题
const createTheme = (mode: ThemeMode, colorScheme: ColorScheme): CustomTheme => {
  const baseColors = mode === 'light' ? LIGHT_COLORS : DARK_COLORS;
  const schemeColors = COLOR_SCHEMES[colorScheme];

  return {
    mode,
    colorScheme,
    colors: {
      ...baseColors,
      ...schemeColors,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
    },
    borderRadius: {
      sm: 4,
      md: 6,
      lg: 8,
    },
    animation: {
      duration: {
        fast: '0.15s',
        normal: '0.3s',
        slow: '0.5s',
      },
      easing: {
        linear: 'linear',
        ease: 'ease',
        easeIn: 'ease-in',
        easeOut: 'ease-out',
        easeInOut: 'ease-in-out',
      },
    },
  };
};

// 主题上下文接口
interface ThemeContextValue {
  theme: CustomTheme;
  mode: ThemeMode;
  colorScheme: ColorScheme;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
  setColorScheme: (scheme: ColorScheme) => void;
  isDark: boolean;
}

// 创建上下文
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// 主题提供者组件
interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    // 从localStorage读取保存的主题
    const saved = localStorage.getItem('visual-workflow-theme-mode');
    return (saved as ThemeMode) || 'light';
  });

  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() => {
    // 从localStorage读取保存的颜色方案
    const saved = localStorage.getItem('visual-workflow-color-scheme');
    return (saved as ColorScheme) || 'blue';
  });

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const savedMode = localStorage.getItem('visual-workflow-theme-mode');
      if (!savedMode) {
        setModeState(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    
    // 如果没有保存的主题设置，使用系统主题
    const savedMode = localStorage.getItem('visual-workflow-theme-mode');
    if (!savedMode) {
      setModeState(mediaQuery.matches ? 'dark' : 'light');
    }

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // 保存主题设置到localStorage
  useEffect(() => {
    localStorage.setItem('visual-workflow-theme-mode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('visual-workflow-color-scheme', colorScheme);
  }, [colorScheme]);

  const customTheme = createTheme(mode, colorScheme);

  const toggleMode = () => {
    setModeState(prev => prev === 'light' ? 'dark' : 'light');
  };

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
  };

  const setColorScheme = (scheme: ColorScheme) => {
    setColorSchemeState(scheme);
  };

  // Ant Design主题配置
  const antdThemeConfig: ThemeConfig = {
    algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: customTheme.colors.primary,
      colorSuccess: customTheme.colors.success,
      colorWarning: customTheme.colors.warning,
      colorError: customTheme.colors.error,
      colorInfo: customTheme.colors.info,
      colorBgBase: customTheme.colors.background,
      colorBgContainer: customTheme.colors.surface,
      colorText: customTheme.colors.text,
      colorTextSecondary: customTheme.colors.textSecondary,
      colorBorder: customTheme.colors.border,
      borderRadius: customTheme.borderRadius.md,
      boxShadow: `0 2px 8px ${customTheme.colors.shadow}`,
      controlHeight: 32,
      fontSize: 14,
    },
    components: {
      Layout: {
        bodyBg: customTheme.colors.background,
        headerBg: customTheme.colors.surface,
        siderBg: customTheme.colors.surface,
        headerHeight: 64,
      },
      Menu: {
        itemBg: 'transparent',
        itemSelectedBg: customTheme.colors.active,
        itemHoverBg: customTheme.colors.hover,
      },
      Card: {
        colorBgContainer: customTheme.colors.surface,
      },
      Modal: {
        contentBg: customTheme.colors.surface,
      },
      Drawer: {
        colorBgElevated: customTheme.colors.surface,
      },
      Table: {
        headerBg: customTheme.colors.surface,
        rowHoverBg: customTheme.colors.hover,
      },
    },
  };

  const contextValue: ThemeContextValue = {
    theme: customTheme,
    mode,
    colorScheme,
    toggleMode,
    setMode,
    setColorScheme,
    isDark: mode === 'dark',
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <ConfigProvider theme={antdThemeConfig}>
        <App>
          <div 
            className="theme-root" 
            data-theme={mode}
            data-color-scheme={colorScheme}
            style={{
              '--color-primary': customTheme.colors.primary,
              '--color-secondary': customTheme.colors.secondary,
              '--color-success': customTheme.colors.success,
              '--color-warning': customTheme.colors.warning,
              '--color-error': customTheme.colors.error,
              '--color-info': customTheme.colors.info,
              '--color-background': customTheme.colors.background,
              '--color-surface': customTheme.colors.surface,
              '--color-text': customTheme.colors.text,
              '--color-text-secondary': customTheme.colors.textSecondary,
              '--color-border': customTheme.colors.border,
              '--color-hover': customTheme.colors.hover,
              '--color-active': customTheme.colors.active,
              '--color-disabled': customTheme.colors.disabled,
              '--color-shadow': customTheme.colors.shadow,
              '--color-overlay': customTheme.colors.overlay,
              '--spacing-xs': `${customTheme.spacing.xs}px`,
              '--spacing-sm': `${customTheme.spacing.sm}px`,
              '--spacing-md': `${customTheme.spacing.md}px`,
              '--spacing-lg': `${customTheme.spacing.lg}px`,
              '--spacing-xl': `${customTheme.spacing.xl}px`,
              '--border-radius-sm': `${customTheme.borderRadius.sm}px`,
              '--border-radius-md': `${customTheme.borderRadius.md}px`,
              '--border-radius-lg': `${customTheme.borderRadius.lg}px`,
              '--duration-fast': customTheme.animation.duration.fast,
              '--duration-normal': customTheme.animation.duration.normal,
              '--duration-slow': customTheme.animation.duration.slow,
            } as React.CSSProperties}
          >
            {children}
          </div>
        </App>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

// 自定义Hook
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// 导出主题相关类型和常量
export { COLOR_SCHEMES, LIGHT_COLORS, DARK_COLORS };