import React from 'react';
import { Handle, Position } from 'reactflow';
import { Card, Typography, Tag, Space } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import type { OutputNodeConfig } from '../../types/workflow';

const { Text } = Typography;

interface OutputNodeProps {
  data: {
    label: string;
    config: OutputNodeConfig;
  };
  selected?: boolean;
}

const OutputNode: React.FC<OutputNodeProps> = ({ data, selected }) => {
  const { config } = data;

  return (
    <div className={`node-output ${selected ? 'selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#fa541c' }}
      />
      
      <Card 
        size="small" 
        style={{ 
          minWidth: 180,
          border: selected ? '2px solid #1890ff' : '2px solid #fa541c',
          borderRadius: '8px'
        }}
        bodyStyle={{ padding: '12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <ExportOutlined style={{ color: '#fa541c', fontSize: '16px', marginRight: '8px' }} />
          <Text strong style={{ color: '#fa541c' }}>
            {config.label || '输出节点'}
          </Text>
        </div>
        
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>类型:</Text>
            <Tag color="orange" style={{ fontSize: '12px' }}>
              {config.outputType?.toUpperCase() || 'TEXT'}
            </Tag>
          </div>
          
          {config.format && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>格式:</Text>
              <Text style={{ fontSize: '12px' }}>
                {config.format}
              </Text>
            </div>
          )}
          
          <div style={{ fontSize: '11px', color: '#999', textAlign: 'center', marginTop: '4px' }}>
            工作流输出端点
          </div>
        </Space>
      </Card>
    </div>
  );
};

export default OutputNode;