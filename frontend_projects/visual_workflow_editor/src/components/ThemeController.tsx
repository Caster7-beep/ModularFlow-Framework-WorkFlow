import React, { useState } from 'react';
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
  Col 
} from 'antd';
import { 
  SunOutlined, 
  MoonOutlined, 
  BgColorsOutlined,
  SettingOutlined 
} from '@ant-design/icons';
import { useTheme, ThemeMode, ColorScheme } from '../contexts/ThemeContext';

const { Text } = Typography;

interface ThemeControllerProps {
  className?: string;
  type?: 'button' | 'popover' | 'dropdown';
}

const ThemeController: React.FC<ThemeControllerProps> = ({
  className,
  type = 'popover'
}) => {
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

  // 颜色方案选项
  const colorSchemeOptions = [
    { value: 'blue', label: '经典蓝', color: '#1890ff' },
    { value: 'green', label: '自然绿', color: '#52c41a' },
    { value: 'purple', label: '优雅紫', color: '#722ed1' },
    { value: 'orange', label: '活力橙', color: '#fa8c16' },
  ] as const;

  // 主题设置面板内容
  const ThemeSettingsContent = () => (
    <Card 
      style={{ width: 320, border: 'none' }} 
      bodyStyle={{ padding: 16 }}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text strong>主题模式</Text>
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
                    浅色模式
                  </Space>
                </Radio>
                <Radio value="dark">
                  <Space>
                    <MoonOutlined style={{ color: '#1890ff' }} />
                    深色模式
                  </Space>
                </Radio>
              </Space>
            </Radio.Group>
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <div>
          <Text strong>颜色方案</Text>
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
          <Text strong>快速切换</Text>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">深色模式</Text>
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
          <Text strong>预览</Text>
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
                  主色
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
                  表面
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
                  背景
                </div>
              </Col>
            </Row>
          </div>
        </div>
      </Space>
    </Card>
  );

  // 根据类型渲染不同的交互方式
  if (type === 'button') {
    return (
      <Button
        className={className}
        icon={isDark ? <MoonOutlined /> : <SunOutlined />}
        onClick={toggleMode}
        title={`切换到${isDark ? '浅色' : '深色'}模式`}
      >
        {isDark ? '深色' : '浅色'}
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
            浅色模式
          </Space>
        ),
        onClick: () => setMode('light'),
      },
      {
        key: 'dark',
        label: (
          <Space>
            <MoonOutlined />
            深色模式
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
      >
        <Button 
          className={className}
          icon={<BgColorsOutlined />}
          title="主题设置"
        >
          主题
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
          主题设置
        </Space>
      }
      trigger="click"
      placement="bottomRight"
      open={popoverVisible}
      onOpenChange={setPopoverVisible}
      overlayStyle={{ zIndex: 1050 }}
    >
      <Button
        className={className}
        icon={isDark ? <MoonOutlined /> : <SunOutlined />}
        title="主题设置"
      >
        主题
      </Button>
    </Popover>
  );
};

export default ThemeController;