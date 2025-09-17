import React, { useState, useEffect, useCallback } from 'react';
import Joyride, { 
  CallBackProps, 
  STATUS, 
  EVENTS, 
  ACTIONS,
  Step,
  Styles 
} from 'react-joyride';
import { Button, Space } from 'antd';
import { 
  QuestionCircleOutlined, 
  PlayCircleOutlined, 
  CloseOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined 
} from '@ant-design/icons';
import { useTheme } from '../contexts/ThemeContext';

interface UserGuideProps {
  className?: string;
}

// 引导步骤定义
const GUIDE_STEPS: Step[] = [
  {
    target: '.toolbar-title',
    content: '欢迎使用可视化工作流编辑器！这是一个强大的工具，可以帮助您创建和管理复杂的工作流程。',
    title: '欢迎！',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="node-panel"]',
    content: '这是节点面板。您可以从这里拖拽不同类型的节点到画布上，包括输入节点、LLM节点、代码块节点等。',
    title: '节点面板',
    placement: 'right',
  },
  {
    target: '[data-tour="workflow-canvas"]',
    content: '这是工作流画布。您可以在这里放置节点，连接它们，并设计您的工作流程。',
    title: '工作流画布',
    placement: 'top',
  },
  {
    target: '[data-tour="property-panel"]',
    content: '这是属性面板。选择任何节点后，您可以在这里编辑节点的配置和参数。',
    title: '属性面板',
    placement: 'left',
  },
  {
    target: '[data-tour="save-button"]',
    content: '使用保存按钮来保存您的工作流，这样您就不会丢失辛苦创建的内容。',
    title: '保存工作流',
    placement: 'bottom',
  },
  {
    target: '[data-tour="execute-button"]',
    content: '当您完成工作流设计后，点击执行按钮来运行您的工作流程。',
    title: '执行工作流',
    placement: 'bottom',
  },
  {
    target: '[data-tour="theme-button"]',
    content: '您可以在这里切换主题，选择您喜欢的颜色方案和深色/浅色模式。',
    title: '主题设置',
    placement: 'bottom',
  },
];

// 快速入门教程步骤
const TUTORIAL_STEPS: Step[] = [
  {
    target: 'body',
    content: '让我们一起创建您的第一个工作流！这个教程将指导您完成整个过程。',
    title: '快速入门教程',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="node-panel"] .node-item[data-type="input"]',
    content: '首先，让我们添加一个输入节点。点击这个输入节点将其添加到画布上。',
    title: '步骤 1: 添加输入节点',
    placement: 'right',
  },
  {
    target: '[data-tour="node-panel"] .node-item[data-type="llm"]',
    content: '接下来，添加一个LLM节点来处理文本。点击LLM节点添加它。',
    title: '步骤 2: 添加LLM节点',
    placement: 'right',
  },
  {
    target: '[data-tour="node-panel"] .node-item[data-type="output"]',
    content: '最后，添加一个输出节点来显示结果。点击输出节点添加它。',
    title: '步骤 3: 添加输出节点',
    placement: 'right',
  },
  {
    target: '[data-tour="workflow-canvas"]',
    content: '现在连接这些节点！将鼠标悬停在节点的右侧，您会看到连接点。拖拽连接点到下一个节点的左侧来创建连接。',
    title: '步骤 4: 连接节点',
    placement: 'top',
  },
  {
    target: '[data-tour="execute-button"]',
    content: '太好了！现在您可以执行这个简单的工作流了。点击执行按钮试试看！',
    title: '步骤 5: 执行工作流',
    placement: 'bottom',
  },
];

const UserGuide: React.FC<UserGuideProps> = ({ className }) => {
  const [runTour, setRunTour] = useState(false);
  const [runTutorial, setRunTutorial] = useState(false);
  const [tourType, setTourType] = useState<'guide' | 'tutorial'>('guide');
  const [stepIndex, setStepIndex] = useState(0);
  const { theme, isDark } = useTheme();

  // 检查是否是首次访问
  useEffect(() => {
    const hasSeenGuide = localStorage.getItem('visual-workflow-seen-guide');
    if (!hasSeenGuide) {
      setTimeout(() => {
        handleStartGuide();
      }, 1000); // 延迟1秒启动引导
    }
  }, []);

  // Joyride 样式配置
  const joyrideStyles: Partial<Styles> = {
    options: {
      primaryColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
      textColor: theme.colors.text,
      overlayColor: theme.colors.overlay,
      arrowColor: theme.colors.surface,
      beaconSize: 36,
      zIndex: 1000,
    },
    tooltip: {
      backgroundColor: theme.colors.surface,
      color: theme.colors.text,
      fontSize: 14,
      borderRadius: theme.borderRadius.md,
      padding: 20,
      boxShadow: `0 8px 24px ${theme.colors.shadow}`,
    },
    tooltipContainer: {
      textAlign: 'left' as const,
    },
    tooltipTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: 600,
      marginBottom: 10,
    },
    tooltipContent: {
      color: theme.colors.textSecondary,
      lineHeight: 1.5,
    },
    buttonNext: {
      backgroundColor: theme.colors.primary,
      color: '#fff',
      fontSize: 14,
      fontWeight: 500,
      padding: '8px 16px',
      borderRadius: theme.borderRadius.sm,
      border: 'none',
      cursor: 'pointer',
    },
    buttonBack: {
      backgroundColor: 'transparent',
      color: theme.colors.textSecondary,
      fontSize: 14,
      padding: '8px 16px',
      borderRadius: theme.borderRadius.sm,
      border: `1px solid ${theme.colors.border}`,
      cursor: 'pointer',
    },
    buttonSkip: {
      backgroundColor: 'transparent',
      color: theme.colors.textSecondary,
      fontSize: 14,
      padding: '8px 16px',
      borderRadius: theme.borderRadius.sm,
      border: 'none',
      cursor: 'pointer',
    },
    buttonClose: {
      backgroundColor: 'transparent',
      color: theme.colors.textSecondary,
      fontSize: 16,
      position: 'absolute' as const,
      top: 10,
      right: 10,
      border: 'none',
      cursor: 'pointer',
    },
    beacon: {
      backgroundColor: theme.colors.primary,
    },
    beaconInner: {
      backgroundColor: theme.colors.primary,
    },
    spotlight: {
      backgroundColor: 'transparent',
      border: `2px solid ${theme.colors.primary}`,
    },
    overlay: {
      backgroundColor: theme.colors.overlay,
    },
  };

  // 处理引导回调
  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { status, type, index, action } = data;

    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      setRunTour(false);
      setRunTutorial(false);
      setStepIndex(0);
      
      if (tourType === 'guide') {
        localStorage.setItem('visual-workflow-seen-guide', 'true');
      }
    } else if (([EVENTS.STEP_AFTER, EVENTS.TARGET_NOT_FOUND] as string[]).includes(type)) {
      const nextStepIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      setStepIndex(nextStepIndex);
    }
  }, [tourType]);

  // 开始引导
  const handleStartGuide = () => {
    setTourType('guide');
    setStepIndex(0);
    setRunTour(true);
    setRunTutorial(false);
  };

  // 开始教程
  const handleStartTutorial = () => {
    setTourType('tutorial');
    setStepIndex(0);
    setRunTour(false);
    setRunTutorial(true);
  };

  // 停止引导
  const handleStopTour = () => {
    setRunTour(false);
    setRunTutorial(false);
    setStepIndex(0);
  };

  const currentSteps = tourType === 'guide' ? GUIDE_STEPS : TUTORIAL_STEPS;
  const isRunning = runTour || runTutorial;

  return (
    <>
      <Joyride
        callback={handleJoyrideCallback}
        continuous={true}
        hideCloseButton={false}
        run={isRunning}
        scrollToFirstStep={true}
        showProgress={true}
        showSkipButton={true}
        stepIndex={stepIndex}
        steps={currentSteps}
        styles={joyrideStyles}
        locale={{
          back: '上一步',
          close: '关闭',
          last: '完成',
          next: '下一步',
          open: '打开对话框',
          skip: '跳过',
        }}
      />
      
      {/* 引导控制按钮 */}
      {!isRunning && (
        <div 
          className={`user-guide-controls ${className || ''}`}
          style={{ 
            position: 'fixed', 
            bottom: 20, 
            right: 20, 
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <Button
            type="primary"
            icon={<QuestionCircleOutlined />}
            onClick={handleStartGuide}
            style={{
              backgroundColor: theme.colors.primary,
              borderColor: theme.colors.primary,
              borderRadius: theme.borderRadius.md,
              boxShadow: `0 4px 12px ${theme.colors.shadow}`,
            }}
          >
            功能导览
          </Button>
          
          <Button
            icon={<PlayCircleOutlined />}
            onClick={handleStartTutorial}
            style={{
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.text,
              borderRadius: theme.borderRadius.md,
              boxShadow: `0 4px 12px ${theme.colors.shadow}`,
            }}
          >
            快速入门
          </Button>
        </div>
      )}
      
      {/* 进行中的引导控制 */}
      {isRunning && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1001,
            backgroundColor: theme.colors.surface,
            padding: '12px 20px',
            borderRadius: theme.borderRadius.lg,
            boxShadow: `0 8px 24px ${theme.colors.shadow}`,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <Space size="middle">
            <span style={{ color: theme.colors.text, fontSize: 14 }}>
              {tourType === 'guide' ? '功能导览' : '快速入门'} 
              ({stepIndex + 1}/{currentSteps.length})
            </span>
            
            <Button
              size="small"
              icon={<CloseOutlined />}
              onClick={handleStopTour}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: theme.colors.textSecondary,
              }}
              title="退出引导"
            />
          </Space>
        </div>
      )}
    </>
  );
};

export default UserGuide;