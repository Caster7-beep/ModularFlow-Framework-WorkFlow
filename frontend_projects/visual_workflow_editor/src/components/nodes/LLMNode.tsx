import React from 'react';
import { Handle, Position } from 'reactflow';
import { Card, Typography, Tag, Space } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import type { LLMNodeConfig } from '../../types/workflow';

const { Text } = Typography;

interface LLMNodeProps {
  data: {
    label: string;
    config: LLMNodeConfig;
  };
  selected?: boolean;
}

const LLMNode: React.FC<LLMNodeProps> = ({ data, selected }) => {
  const { config } = data;

  return (
    <div className={`node-llm ${selected ? 'selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#52c41a' }}
      />
      
      <Card 
        size="small" 
        style={{ 
          minWidth: 200,
          border: selected ? '2px solid #1890ff' : '2px solid #52c41a',
          borderRadius: '8px'
        }}
        bodyStyle={{ padding: '12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <RobotOutlined style={{ color: '#52c41a', fontSize: '16px', marginRight: '8px' }} />
          <Text strong style={{ color: '#52c41a' }}>
            {config.label || 'LLM节点'}
          </Text>
        </div>
        
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>提供商:</Text>
            <Tag color="green" style={{ fontSize: '12px' }}>
              {config.provider?.toUpperCase() || 'OPENAI'}
            </Tag>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>模型:</Text>
            <Text style={{ fontSize: '12px' }}>
              {config.model || 'gpt-3.5-turbo'}
            </Text>
          </div>
          
          {config.prompt && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>提示词:</Text>
              <div 
                style={{ 
                  fontSize: '11px', 
                  color: '#666',
                  maxHeight: '40px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: '1.3',
                  marginTop: '2px'
                }}
              >
                {config.prompt.length > 50 
                  ? `${config.prompt.substring(0, 50)}...` 
                  : config.prompt
                }
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999' }}>
            <span>温度: {config.temperature || 0.7}</span>
            <span>令牌: {config.maxTokens || 1000}</span>
          </div>
        </Space>
      </Card>
      
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#52c41a' }}
      />
    </div>
  );
};

export default LLMNode;