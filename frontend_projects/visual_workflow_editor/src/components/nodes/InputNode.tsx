import React from 'react';
import { Handle, Position } from 'reactflow';
import { Card, Typography, Tag, Space } from 'antd';
import { ImportOutlined } from '@ant-design/icons';
import type { InputNodeConfig } from '../../types/workflow';

const { Text } = Typography;

interface InputNodeProps {
  data: {
    label: string;
    config: InputNodeConfig;
  };
  selected?: boolean;
}

const InputNode: React.FC<InputNodeProps> = ({ data, selected }) => {
  const { config } = data;

  return (
    <div className={`node-input ${selected ? 'selected' : ''}`}>
      <Card 
        size="small" 
        style={{ 
          minWidth: 180,
          border: selected ? '2px solid #1890ff' : '2px solid #1890ff',
          borderRadius: '8px'
        }}
        bodyStyle={{ padding: '12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <ImportOutlined style={{ color: '#1890ff', fontSize: '16px', marginRight: '8px' }} />
          <Text strong style={{ color: '#1890ff' }}>
            {config.label || '输入节点'}
          </Text>
        </div>
        
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>类型:</Text>
            <Tag color="blue" style={{ fontSize: '12px' }}>
              {config.inputType?.toUpperCase() || 'TEXT'}
            </Tag>
          </div>
          
          {config.placeholder && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>占位符:</Text>
              <div 
                style={{ 
                  fontSize: '11px', 
                  color: '#666',
                  marginTop: '2px'
                }}
              >
                {config.placeholder.length > 30 
                  ? `${config.placeholder.substring(0, 30)}...` 
                  : config.placeholder
                }
              </div>
            </div>
          )}
          
          {config.defaultValue && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>默认值:</Text>
              <div 
                style={{ 
                  fontSize: '11px', 
                  color: '#666',
                  maxHeight: '30px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: '2px'
                }}
              >
                {config.defaultValue.length > 40 
                  ? `${config.defaultValue.substring(0, 40)}...` 
                  : config.defaultValue
                }
              </div>
            </div>
          )}
        </Space>
      </Card>
      
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#1890ff' }}
      />
    </div>
  );
};

export default InputNode;