import React, { useMemo, useRef, useState } from 'react';
import { Select, Button, Dropdown, Space, Typography, Tooltip } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  supportedLanguages,
  changeLanguage,
  getCurrentLanguage,
  type SupportedLanguage
} from '../i18n';

const { Text } = Typography;

interface LanguageSwitcherProps {
  mode?: 'select' | 'dropdown' | 'button';
  size?: 'small' | 'middle' | 'large';
  showFlag?: boolean;
  showText?: boolean;
  placement?: 'topLeft' | 'topCenter' | 'topRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight';
  // 新增：工具栏抽屉内的统一触发样式
  variant?: 'toolbarItem';
  // 选择器与可达性
  'data-qa'?: string;
  'aria-label'?: string;
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  mode = 'dropdown',
  size = 'middle',
  showFlag = true,
  showText = true,
  placement = 'bottomLeft',
  variant,
  'data-qa': dataQa,
  'aria-label': ariaLabel,
  className
}) => {
  const { t } = useTranslation();
  const currentLanguage = getCurrentLanguage();

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const popupContainer = useMemo(() => {
    return () => {
      if (typeof document !== 'undefined') {
        const el = document.getElementById('toolbar-more-drawer');
        if (el) return el;
      }
      return document.body;
    };
  }, []);

  const overlayStyle = { zIndex: 1499, pointerEvents: 'auto' as const };

  // 处理语言切换
  const handleLanguageChange = async (language: SupportedLanguage) => {
    try {
      await changeLanguage(language);
      // 语言切换后保持弹层开/关逻辑由 antd 控制，关闭后恢复焦点
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  // 安全获取语言信息的函数
  const getSafeLanguageInfo = (lang: SupportedLanguage) => {
    return supportedLanguages[lang] || supportedLanguages['zh-CN'];
  };

  // 构建语言选项
  const languageOptions = Object.entries(supportedLanguages).map(([key, value]) => ({
    key,
    value: key as SupportedLanguage,
    label: (
      <Space size="small">
        {showFlag && <span>{value.flag}</span>}
        <span>{value.nativeName}</span>
        {key !== currentLanguage && (
          <Text type="secondary" style={{ fontSize: '12px' }}>
            ({value.name})
          </Text>
        )}
      </Space>
    ),
    flag: value.flag,
    nativeName: value.nativeName,
    name: value.name
  }));

  // toolbarItem 变体：渲染统一的“图标+短字”按钮触发 + Dropdown 菜单
  if (variant === 'toolbarItem') {
    const currentLangInfo = getSafeLanguageInfo(currentLanguage);
    return (
      <Dropdown
        menu={{
          items: languageOptions.map(option => ({
            key: option.key,
            label: option.label,
            onClick: () => handleLanguageChange(option.value)
          })),
          selectedKeys: [currentLanguage]
        }}
        placement="bottomRight"
        trigger={['click']}
        getPopupContainer={popupContainer}
        overlayStyle={overlayStyle}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            // 关闭后恢复焦点到触发按钮
            setTimeout(() => triggerRef.current?.focus(), 0);
          }
        }}
      >
        <Tooltip title={t('toolbar.language')}>
          <Button
            ref={triggerRef}
            aria-label={ariaLabel || t('toolbar.language')}
            data-qa={dataQa}
            className={`flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black ${className || ''}`}
            style={{
              height: 48,
              minWidth: 48,
              padding: '0 16px',
              backgroundColor: '#FFFFFF',
              color: '#0B0B0B',
              borderColor: '#0B0B0B',
              borderRadius: '2px'
            }}
          >
            <Space size="small">
              <GlobalOutlined />
              <span>{t('toolbar.language')}</span>
            </Space>
          </Button>
        </Tooltip>
      </Dropdown>
    );
  }

  // Select 模式
  if (mode === 'select') {
    return (
      <Select
        size={size}
        value={currentLanguage}
        onChange={handleLanguageChange}
        style={{ minWidth: '120px' }}
        options={languageOptions.map(option => ({
          value: option.value,
          label: option.label
        }))}
        suffixIcon={<GlobalOutlined />}
        getPopupContainer={popupContainer}
        dropdownStyle={overlayStyle}
      />
    );
  }

  // Button 模式
  if (mode === 'button') {
    const currentLangInfo = getSafeLanguageInfo(currentLanguage);

    return (
      <Dropdown
        menu={{
          items: languageOptions.map(option => ({
            key: option.key,
            label: option.label,
            onClick: () => handleLanguageChange(option.value)
          })),
          selectedKeys: [currentLanguage]
        }}
        placement={placement}
        trigger={['click']}
        getPopupContainer={popupContainer}
        overlayStyle={overlayStyle}
      >
        <Button size={size}>
          <Space size="small">
            <GlobalOutlined />
            {showFlag && <span>{currentLangInfo.flag}</span>}
            {showText && <span>{currentLangInfo.nativeName}</span>}
          </Space>
        </Button>
      </Dropdown>
    );
  }

  // Dropdown 模式（默认）
  const currentLangInfo = getSafeLanguageInfo(currentLanguage);

  return (
    <Dropdown
      menu={{
        items: languageOptions.map(option => ({
          key: option.key,
          label: option.label,
          onClick: () => handleLanguageChange(option.value)
        })),
        selectedKeys: [currentLanguage]
      }}
      placement={placement}
      trigger={['click']}
      getPopupContainer={popupContainer}
      overlayStyle={overlayStyle}
    >
      <Button type="text" size={size}>
        <Space size="small">
          <GlobalOutlined />
          {showFlag && <span>{currentLangInfo.flag}</span>}
          {showText && <span>{currentLangInfo.nativeName}</span>}
        </Space>
      </Button>
    </Dropdown>
  );
};

// 简化版语言切换器（只显示图标）
export const LanguageIcon: React.FC<{
  size?: number;
  onClick?: () => void;
}> = ({
  size = 16,
  onClick
}) => {
  const currentLanguage = getCurrentLanguage();
  const getSafeLanguageInfo = (lang: SupportedLanguage) => {
    return supportedLanguages[lang] || supportedLanguages['zh-CN'];
  };
  const currentLangInfo = getSafeLanguageInfo(currentLanguage);

  return (
    <span 
      onClick={onClick}
      style={{ 
        fontSize: size,
        cursor: onClick ? 'pointer' : 'default',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }}
      title={currentLangInfo.nativeName}
    >
      <GlobalOutlined style={{ fontSize: size }} />
      <span>{currentLangInfo.flag}</span>
    </span>
  );
};

// 语言列表组件（用于设置页面）
export const LanguageList: React.FC<{
  onLanguageChange?: (language: SupportedLanguage) => void;
}> = ({ onLanguageChange }) => {
  const { t } = useTranslation();
  const currentLanguage = getCurrentLanguage();

  // 构建语言选项
  const languageOptions = Object.entries(supportedLanguages).map(([key, value]) => ({
    key,
    value: key as SupportedLanguage,
    flag: value.flag,
    nativeName: value.nativeName,
    name: value.name
  }));

  const handleChange = async (language: SupportedLanguage) => {
    await handleLanguageChange(language);
    onLanguageChange?.(language);
  };

  const handleLanguageChange = async (language: SupportedLanguage) => {
    try {
      await changeLanguage(language);
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  return (
    <div className="language-list">
      <Typography.Title level={4}>
        {t('language.title')}
      </Typography.Title>
      
      <div style={{ marginBottom: '16px' }}>
        <Text type="secondary">
          {t('language.current')}: {supportedLanguages[currentLanguage].nativeName}
        </Text>
      </div>

      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {languageOptions.map(option => (
          <Button
            key={option.key}
            type={option.value === currentLanguage ? 'primary' : 'default'}
            block
            size="large"
            onClick={() => handleChange(option.value)}
            style={{
              textAlign: 'left',
              height: 'auto',
              padding: '12px 16px'
            }}
          >
            <Space>
              <span style={{ fontSize: '18px' }}>{option.flag}</span>
              <div>
                <div style={{ fontWeight: 'bold' }}>
                  {option.nativeName}
                </div>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {option.name}
                </Text>
              </div>
              {option.value === currentLanguage && (
                <Text type="success" style={{ marginLeft: 'auto' }}>
                  ✓
                </Text>
              )}
            </Space>
          </Button>
        ))}
      </Space>
    </div>
  );
};

export default LanguageSwitcher;