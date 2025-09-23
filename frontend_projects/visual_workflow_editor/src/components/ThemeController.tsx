import React, { useMemo, useRef, useState } from 'react';
import {
  Button,
  Dropdown,
  Space,
  Popover,
  Radio,
  Switch,
  Divider,
  Typography,
  Card,
  Row,
  Col,
  Tooltip
} from 'antd';
import {
  SunOutlined,
  MoonOutlined,
  BgColorsOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface ThemeControllerProps {
  className?: string;
  type?: 'button' | 'popover' | 'dropdown';
  // 新增：抽屉工具栏触发样式
  variant?: 'toolbarItem';
  // 可达性/稳定选择器
  'data-qa'?: string;
  'aria-label'?: string;
}

const ThemeController: React.FC<ThemeControllerProps> = ({
  className,
  type = 'popover',
  variant,
  'data-qa': dataQa,
  'aria-label': ariaLabel
}) => {
  const { t } = useTranslation();
  const {
    mode,
    colorScheme,
    toggleMode,
    setMode,
    setColorScheme,
    isDark,
    theme: customTheme
  } = useTheme();

  const [popoverVisible, setPopoverVisible] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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

  // 颜色方案选项
  const colorSchemeOptions = [
    { value: 'blue', label: t('theme.colorScheme.blue', '蓝色'), color: '#1890ff' },
    { value: 'green', label: t('theme.colorScheme.green', '绿色'), color: '#52c41a' },
    { value: 'purple', label: t('theme.colorScheme.purple', '紫色'), color: '#722ed1' },
    { value: 'orange', label: t('theme.colorScheme.orange', '橙色'), color: '#fa8c16' },
  ] as const;

  // 主题设置面板内容
  const ThemeSettingsContent = () => (
    <Card
      style={{ width: 320, border: 'none' }}
      bodyStyle={{ padding: 16 }}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text strong>{t('theme.title', '主题设置')}</Text>
          <div style={{ marginTop: 8 }}>
            <Radio.Group
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio value="light">
                  <Space>
                    <SunOutlined style={{ color: '#fadb14' }} />
                    {t('theme.mode.light', '浅色模式')}
                  </Space>
                </Radio>
                <Radio value="dark">
                  <Space>
                    <MoonOutlined style={{ color: '#1890ff' }} />
                    {t('theme.mode.dark', '深色模式')}
                  </Space>
                </Radio>
              </Space>
            </Radio.Group>
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <div>
          <Text strong>{t('theme.title', '主题设置')}</Text>
          <div style={{ marginTop: 8 }}>
            <Radio.Group
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value)}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {colorSchemeOptions.map(option => (
                  <Radio key={option.value} value={option.value}>
                    <Space>
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          backgroundColor: option.color,
                          border: `2px solid ${isDark ? '#434343' : '#d9d9d9'}`
                        }}
                      />
                      {option.label}
                    </Space>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <div>
          <Text strong>{t('toolbar.theme', '主题')}</Text>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">{t('theme.mode.dark', '深色模式')}</Text>
            <Switch
              checked={isDark}
              onChange={toggleMode}
              checkedChildren={<MoonOutlined />}
              unCheckedChildren={<SunOutlined />}
            />
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <div>
          <Text strong>{t('common.preview', '预览')}</Text>
          <div style={{ marginTop: 8 }}>
            <Row gutter={[8, 8]}>
              <Col span={8}>
                <div
                  style={{
                    width: '100%',
                    height: 40,
                    backgroundColor: customTheme.colors.primary,
                    borderRadius: customTheme.borderRadius.md,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {t('common.primary', '主色')}
                </div>
              </Col>
              <Col span={8}>
                <div
                  style={{
                    width: '100%',
                    height: 40,
                    backgroundColor: customTheme.colors.surface,
                    borderRadius: customTheme.borderRadius.md,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: customTheme.colors.text,
                    fontSize: 12,
                    fontWeight: 500,
                    border: `1px solid ${customTheme.colors.border}`,
                  }}
                >
                  {t('common.surface', '表面')}
                </div>
              </Col>
              <Col span={8}>
                <div
                  style={{
                    width: '100%',
                    height: 40,
                    backgroundColor: customTheme.colors.background,
                    borderRadius: customTheme.borderRadius.md,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: customTheme.colors.text,
                    fontSize: 12,
                    fontWeight: 500,
                    border: `1px solid ${customTheme.colors.border}`,
                  }}
                >
                  {t('common.background', '背景')}
                </div>
              </Col>
            </Row>
          </div>
        </div>
      </Space>
    </Card>
  );

  // 变体：toolbarItem，渲染为“按钮触发 + 弹层”
  if (variant === 'toolbarItem') {
    return (
      <Popover
        content={<ThemeSettingsContent />}
        title={
          <Space>
            <SettingOutlined />
            {t('toolbar.theme', '主题')}
          </Space>
        }
        trigger="click"
        placement="bottomRight"
        open={popoverVisible}
        onOpenChange={(v) => {
          setPopoverVisible(v);
          if (!v) {
            setTimeout(() => triggerRef.current?.focus(), 0);
          }
        }}
        getPopupContainer={popupContainer}
        overlayStyle={overlayStyle}
      >
        <Tooltip title={t('toolbar.theme', '主题')}>
          <Button
            ref={triggerRef}
            aria-label={ariaLabel || t('toolbar.theme', '主题')}
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
            icon={isDark ? <MoonOutlined /> : <SunOutlined />}
          >
            {t('toolbar.theme', '主题')}
          </Button>
        </Tooltip>
      </Popover>
    );
  }

  // 根据类型渲染不同的交互方式
  if (type === 'button') {
    return (
      <Button
        className={className}
        icon={isDark ? <MoonOutlined /> : <SunOutlined />}
        onClick={toggleMode}
        title={`${t('common.switch', '切换到')}${isDark ? t('theme.mode.light', '浅色') : t('theme.mode.dark', '深色')}${t('common.mode', '模式')}`}
      >
        {isDark ? t('theme.mode.dark', '深色') : t('theme.mode.light', '浅色')}
      </Button>
    );
  }

  if (type === 'dropdown') {
    const dropdownItems = [
      {
        key: 'light',
        label: (
          <Space>
            <SunOutlined />
            {t('theme.mode.light', '浅色模式')}
          </Space>
        ),
        onClick: () => setMode('light'),
      },
      {
        key: 'dark',
        label: (
          <Space>
            <MoonOutlined />
            {t('theme.mode.dark', '深色模式')}
          </Space>
        ),
        onClick: () => setMode('dark'),
      },
      {
        type: 'divider' as const,
      },
      ...colorSchemeOptions.map(option => ({
        key: option.value,
        label: (
          <Space>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: option.color
              }}
            />
            {option.label}
          </Space>
        ),
        onClick: () => setColorScheme(option.value),
      })),
    ];

    return (
      <Dropdown
        menu={{ items: dropdownItems }}
        trigger={['click']}
        placement="bottomRight"
        getPopupContainer={popupContainer}
        overlayStyle={overlayStyle}
      >
        <Button
          className={className}
          icon={<BgColorsOutlined />}
          title={t('toolbar.theme', '主题设置')}
        >
          {t('toolbar.theme', '主题')}
        </Button>
      </Dropdown>
    );
  }

  // 默认使用 Popover 类型
  return (
    <Popover
      content={<ThemeSettingsContent />}
      title={
        <Space>
          <SettingOutlined />
          {t('theme.title', '主题设置')}
        </Space>
      }
      trigger="click"
      placement="bottomRight"
      open={popoverVisible}
      onOpenChange={setPopoverVisible}
      getPopupContainer={popupContainer}
      overlayStyle={overlayStyle}
    >
      <Button
        className={className}
        icon={isDark ? <MoonOutlined /> : <SunOutlined />}
        title={t('toolbar.theme', '主题设置')}
      >
        {t('toolbar.theme', '主题')}
      </Button>
    </Popover>
  );
};

export default ThemeController;