import React from 'react';
import { Card, Typography, Space } from 'antd';
import {
  RobotOutlined,
  ImportOutlined,
  ExportOutlined,
  CodeOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface NodePanelProps {
  onAddNode: (nodeType: string, position: { x: number; y: number }) => void;
}

interface NodeTypeConfig {
  type: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}

const nodeTypes: NodeTypeConfig[] = [
  {
    type: 'llm',
    label: 'LLM节点',
    icon: <RobotOutlined />,
    description: '调用大语言模型进行文本生成',
    color: '#52c41a'
  },
  {
    type: 'input',
    label: '输入节点',
    icon: <ImportOutlined />,
    description: '接收用户输入或外部数据',
    color: '#1890ff'
  },
  {
    type: 'output',
    label: '输出节点',
    icon: <ExportOutlined />,
    description: '输出处理结果',
    color: '#fa541c'
  },
  {
    type: 'code',
    label: '代码块节点',
    icon: <CodeOutlined />,
    description: '执行Python或JavaScript代码',
    color: '#722ed1'
  }
];

const NodePanel: React.FC<NodePanelProps> = ({ onAddNode }) => {
  // 处理拖拽开始
  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  // 处理点击添加节点
  const handleAddNode = (nodeType: string) => {
    // 在画布中心位置添加节点
    const position = {
      x: Math.random() * 300 + 100,
      y: Math.random() * 300 + 100
    };
    onAddNode(nodeType, position);
  };

  return (
    <div style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
      <Title level={4} style={{ marginBottom: '16px', textAlign: 'center' }}>
        节点面板
      </Title>
      
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {nodeTypes.map((nodeConfig) => (
          <Card
            key={nodeConfig.type}
            size="small"
            hoverable
            style={{
              cursor: 'grab',
              border: `2px solid ${nodeConfig.color}`,
              borderRadius: '8px',
              transition: 'all 0.2s ease'
            }}
            bodyStyle={{ padding: '12px' }}
            draggable
            onDragStart={(e) => handleDragStart(e, nodeConfig.type)}
            onClick={() => handleAddNode(nodeConfig.type)}
            onMouseDown={(e) => {
              e.currentTarget.style.cursor = 'grabbing';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.cursor = 'grab';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.cursor = 'grab';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <div 
                style={{ 
                  fontSize: '18px', 
                  color: nodeConfig.color, 
                  marginRight: '8px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {nodeConfig.icon}
              </div>
              <Text strong style={{ color: nodeConfig.color }}>
                {nodeConfig.label}
              </Text>
            </div>
            
            <Text 
              type="secondary" 
              style={{ 
                fontSize: '12px',
                lineHeight: '1.4',
                display: 'block'
              }}
            >
              {nodeConfig.description}
            </Text>
          </Card>
        ))}
      </Space>
      
      <div style={{ marginTop: '24px', padding: '12px', background: '#f5f5f5', borderRadius: '6px' }}>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          💡 提示：拖拽节点到画布中或点击节点直接添加
        </Text>
      </div>
      
      <div style={{ marginTop: '16px' }}>
        <Title level={5} style={{ marginBottom: '8px' }}>
          使用说明
        </Title>
        <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.6' }}>
          <div style={{ marginBottom: '4px' }}>
            • <strong>LLM节点</strong>：配置AI模型和提示词
          </div>
          <div style={{ marginBottom: '4px' }}>
            • <strong>输入节点</strong>：设置工作流的输入参数
          </div>
          <div style={{ marginBottom: '4px' }}>
            • <strong>输出节点</strong>：定义工作流的输出格式
          </div>
          <div style={{ marginBottom: '4px' }}>
            • <strong>代码块</strong>：编写自定义处理逻辑
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodePanel;