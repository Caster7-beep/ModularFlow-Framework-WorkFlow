import React, { useState, useEffect } from 'react';
import { Layout, Drawer, Button, FloatButton } from 'antd';
import { MenuOutlined, SettingOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import { useResponsive, getLayoutConfig } from '../../hooks/useResponsive';
import type { ResponsiveLayoutConfig } from '../../hooks/useResponsive';

const { Header, Sider, Content } = Layout;

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  header: React.ReactNode;
  sidePanel: React.ReactNode;
  propertyPanel: React.ReactNode;
  responsiveConfig?: ResponsiveLayoutConfig;
}

export const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({
  children,
  header,
  sidePanel,
  propertyPanel,
  responsiveConfig,
}) => {
  const responsive = useResponsive();
  const layoutConfig = getLayoutConfig(responsive.deviceType, responsiveConfig);
  
  // 移动端抽屉状态
  const [sidePanelVisible, setSidePanelVisible] = useState(false);
  const [propertyPanelVisible, setPropertyPanelVisible] = useState(false);
  
  // 平板和桌面端侧边栏折叠状态
  const [siderCollapsed, setSiderCollapsed] = useState(layoutConfig.siderCollapsed);

  // 根据屏幕尺寸更新状态
  useEffect(() => {
    const config = getLayoutConfig(responsive.deviceType, responsiveConfig);
    
    if (responsive.isMobile) {
      // 移动端自动关闭抽屉
      setSidePanelVisible(false);
      setPropertyPanelVisible(false);
    } else {
      // 桌面和平板端更新折叠状态
      setSiderCollapsed(config.siderCollapsed);
    }
  }, [responsive.deviceType, responsive.isMobile, responsiveConfig]);

  // 移动端渲染
  if (responsive.isMobile) {
    return (
      <Layout style={{ height: '100vh' }}>
        {/* 移动端Header */}
        <Header 
          className="responsive-header mobile-header" 
          style={{ 
            padding: '0 16px', 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '56px',
            backgroundColor: '#fff',
            borderBottom: '1px solid #f0f0f0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setSidePanelVisible(true)}
              style={{ marginRight: 8 }}
            />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
              工作流编辑器
            </h3>
          </div>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => setPropertyPanelVisible(true)}
          />
        </Header>

        {/* 移动端主内容 */}
        <Content style={{ flex: 1, overflow: 'hidden' }}>
          {children}
        </Content>

        {/* 移动端侧边面板抽屉 */}
        <Drawer
          title="节点面板"
          placement="left"
          onClose={() => setSidePanelVisible(false)}
          open={sidePanelVisible}
          width={280}
          styles={{
            body: { padding: 0 }
          }}
        >
          {sidePanel}
        </Drawer>

        {/* 移动端属性面板抽屉 */}
        <Drawer
          title="属性设置"
          placement="right"
          onClose={() => setPropertyPanelVisible(false)}
          open={propertyPanelVisible}
          width="100%"
          styles={{
            body: { padding: 0 }
          }}
        >
          {propertyPanel}
        </Drawer>

        {/* 移动端浮动工具栏 */}
        <div className="mobile-header-tools" style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
          {header}
        </div>
      </Layout>
    );
  }

  // 平板端渲染
  if (responsive.isTablet) {
    return (
      <Layout style={{ height: '100vh' }}>
        <Header 
          className="responsive-header tablet-header" 
          style={{ 
            height: '64px',
            padding: '0 16px',
            backgroundColor: '#fff',
            borderBottom: '1px solid #f0f0f0'
          }}
        >
          {header}
        </Header>
        
        <Layout hasSider>
          <Sider
            width={250}
            collapsible
            collapsed={siderCollapsed}
            onCollapse={setSiderCollapsed}
            collapsedWidth={48}
            className="responsive-sider tablet-sider"
            style={{ 
              backgroundColor: '#fafafa',
              borderRight: '1px solid #f0f0f0'
            }}
          >
            {sidePanel}
          </Sider>
          
          <Layout>
            <Content className="responsive-content tablet-content">
              {children}
            </Content>
          </Layout>
          
          {/* 平板端属性面板抽屉 */}
          <FloatButton.Group
            shape="circle"
            style={{ right: 16, bottom: 80 }}
          >
            <FloatButton
              icon={propertyPanelVisible ? <CloseOutlined /> : <EyeOutlined />}
              onClick={() => setPropertyPanelVisible(!propertyPanelVisible)}
              tooltip="属性面板"
            />
          </FloatButton.Group>
          
          <Drawer
            title="属性面板"
            placement="right"
            onClose={() => setPropertyPanelVisible(false)}
            open={propertyPanelVisible}
            width={350}
            styles={{
              body: { padding: 0 }
            }}
          >
            {propertyPanel}
          </Drawer>
        </Layout>
      </Layout>
    );
  }

  // 桌面端渲染（默认布局）
  return (
    <Layout style={{ height: '100vh' }}>
      <Header 
        className="responsive-header desktop-header"
        style={{ 
          height: '64px',
          padding: '0 24px',
          backgroundColor: '#fff',
          borderBottom: '1px solid #f0f0f0'
        }}
      >
        {header}
      </Header>
      
      <Layout hasSider>
        <Sider
          width={250}
          collapsible
          collapsed={siderCollapsed}
          onCollapse={setSiderCollapsed}
          collapsedWidth={60}
          className="responsive-sider desktop-sider"
          style={{ 
            backgroundColor: '#fafafa',
            borderRight: '1px solid #f0f0f0'
          }}
        >
          {sidePanel}
        </Sider>
        
        <Content className="responsive-content desktop-content">
          {children}
        </Content>
        
        <Sider 
          width={350} 
          className="responsive-property-panel desktop-property-panel"
          style={{ 
            backgroundColor: '#fff',
            borderLeft: '1px solid #f0f0f0'
          }}
        >
          {propertyPanel}
        </Sider>
      </Layout>
    </Layout>
  );
};

export default ResponsiveLayout;