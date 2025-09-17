import React, { createContext, useContext, useState, ReactNode } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';

// 动画配置类型
export interface AnimationConfig {
  enabled: boolean;
  reducedMotion: boolean;
  duration: {
    fast: number;
    normal: number;
    slow: number;
  };
  easing: {
    linear: string | number[];
    ease: string | number[];
    easeIn: string | number[];
    easeOut: string | number[];
    easeInOut: string | number[];
    bounce: string | number[];
    elastic: string | number[];
  };
}

// 默认动画配置
const DEFAULT_CONFIG: AnimationConfig = {
  enabled: true,
  reducedMotion: false,
  duration: {
    fast: 0.15,
    normal: 0.3,
    slow: 0.5,
  },
  easing: {
    linear: 'linear',
    ease: 'easeInOut',
    easeIn: 'easeIn',
    easeOut: 'easeOut',
    easeInOut: 'easeInOut',
    bounce: [0.68, -0.55, 0.265, 1.55],
    elastic: [0.175, 0.885, 0.32, 1.275],
  },
};

// 动画预设
export const ANIMATION_PRESETS = {
  // 节点动画
  nodeEntry: {
    initial: { opacity: 0, scale: 0.8, y: -10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.6, y: 10 },
  },
  
  // 模态框动画
  modal: {
    initial: { opacity: 0, scale: 0.9, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.9, y: 20 },
  },
  
  // 抽屉动画
  drawer: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
  },
  
  // 淡入淡出
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  
  // 滑入效果
  slideUp: {
    initial: { opacity: 0, y: 50 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -50 },
  },
  
  // 缩放效果
  scale: {
    initial: { opacity: 0, scale: 0 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0 },
  },
  
  // 旋转效果
  rotate: {
    initial: { opacity: 0, rotate: -180 },
    animate: { opacity: 1, rotate: 0 },
    exit: { opacity: 0, rotate: 180 },
  },
  
  // 弹跳效果
  bounce: {
    initial: { opacity: 0, y: -100 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: { type: 'spring', bounce: 0.5 }
    },
    exit: { opacity: 0, y: -100 },
  },
  
  // 连接线绘制动画
  pathDraw: {
    initial: { pathLength: 0, opacity: 0 },
    animate: { 
      pathLength: 1, 
      opacity: 1,
      transition: { duration: 0.8, ease: 'easeInOut' }
    },
    exit: { pathLength: 0, opacity: 0 },
  },
  
  // 执行状态动画
  pulse: {
    animate: {
      scale: [1, 1.2, 1],
      opacity: [1, 0.8, 1],
      transition: { 
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  },
  
  // 成功动画
  success: {
    initial: { scale: 0, rotate: -180 },
    animate: { 
      scale: 1, 
      rotate: 0,
      transition: { 
        type: 'spring',
        stiffness: 500,
        damping: 30
      }
    }
  },
  
  // 错误动画
  error: {
    animate: {
      x: [0, -10, 10, -10, 10, 0],
      transition: { duration: 0.5 }
    }
  },
  
  // 加载动画
  loading: {
    animate: {
      rotate: 360,
      transition: { 
        duration: 1,
        repeat: Infinity,
        ease: 'linear'
      }
    }
  }
};

// 动画上下文
interface AnimationContextType {
  config: AnimationConfig;
  updateConfig: (updates: Partial<AnimationConfig>) => void;
  getTransition: (duration?: keyof AnimationConfig['duration'], easing?: keyof AnimationConfig['easing']) => any;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

// 动画提供者组件
interface AnimationProviderProps {
  children: ReactNode;
  initialConfig?: Partial<AnimationConfig>;
}

export const AnimationProvider: React.FC<AnimationProviderProps> = ({
  children,
  initialConfig = {}
}) => {
  const [config, setConfig] = useState<AnimationConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig
  });

  // 检查用户是否偏好减少动画
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      setConfig(prev => ({ ...prev, reducedMotion: e.matches }));
    };

    setConfig(prev => ({ ...prev, reducedMotion: mediaQuery.matches }));
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const updateConfig = React.useCallback((updates: Partial<AnimationConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const getTransition = React.useCallback((
    duration: keyof AnimationConfig['duration'] = 'normal',
    easing: keyof AnimationConfig['easing'] = 'ease'
  ) => {
    if (!config.enabled || config.reducedMotion) {
      return { duration: 0 };
    }

    return {
      duration: config.duration[duration],
      ease: config.easing[easing],
    };
  }, [config]);

  const contextValue: AnimationContextType = {
    config,
    updateConfig,
    getTransition,
  };

  return (
    <AnimationContext.Provider value={contextValue}>
      <MotionConfig
        reducedMotion={config.reducedMotion ? 'always' : 'never'}
      >
        {children}
      </MotionConfig>
    </AnimationContext.Provider>
  );
};

// 动画Hook
export const useAnimation = (): AnimationContextType => {
  const context = useContext(AnimationContext);
  if (!context) {
    throw new Error('useAnimation must be used within an AnimationProvider');
  }
  return context;
};

// 动画组件包装器
interface AnimatedComponentProps {
  children: ReactNode;
  preset?: keyof typeof ANIMATION_PRESETS;
  custom?: any;
  duration?: keyof AnimationConfig['duration'];
  easing?: keyof AnimationConfig['easing'];
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
  layout?: boolean;
  layoutId?: string;
  [key: string]: any;
}

export const Animated: React.FC<AnimatedComponentProps> = ({
  children,
  preset = 'fade',
  custom,
  duration = 'normal',
  easing = 'ease',
  delay = 0,
  className,
  style,
  layout = false,
  layoutId,
  ...props
}) => {
  const { getTransition, config } = useAnimation();

  const animationProps = custom || ANIMATION_PRESETS[preset];
  
  const transition = {
    ...getTransition(duration, easing),
    delay,
  };

  return (
    <motion.div
      className={className}
      style={style}
      layout={layout}
      layoutId={layoutId}
      transition={transition}
      {...animationProps}
      {...props}
    >
      {children}
    </motion.div>
  );
};

// 列表动画组件
interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
}

export const AnimatedList: React.FC<AnimatedListProps> = ({
  children,
  className,
  stagger = 0.1
}) => {
  return (
    <motion.div
      className={className}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={{
        initial: {},
        animate: {
          transition: {
            staggerChildren: stagger,
          },
        },
        exit: {
          transition: {
            staggerChildren: stagger,
            staggerDirection: -1,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
};

// 页面过渡组件
interface PageTransitionProps {
  children: ReactNode;
  mode?: 'wait' | 'sync' | 'popLayout';
}

export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  mode = 'wait'
}) => {
  return (
    <AnimatePresence mode={mode}>
      {children}
    </AnimatePresence>
  );
};

// 导出motion组件供直接使用
export { motion, AnimatePresence };