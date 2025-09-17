import React from 'react';
import { Select, Button, Dropdown, Space, Typography } from 'antd';
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
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  mode = 'dropdown',
  size = 'middle',
  showFlag = true,
  showText = true,
  placement = 'bottomLeft'
}) => {
  const { t, i18n } = useTranslation();
  const currentLanguage = getCurrentLanguage();

  // 处理语言切换
  const handleLanguageChange = async (language: SupportedLanguage) => {
    try {
      await changeLanguage(language);
      // 可以在这里添加成功提示
      console.log(`Language switched to ${language}`);
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