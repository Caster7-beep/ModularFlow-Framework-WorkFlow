import React from 'react';
import { Handle, Position } from 'reactflow';
import { Card, Typography, Tag, Space } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import type { CodeNodeConfig } from '../../types/workflow';

const { Text } = Typography;

interface CodeBlockNodeProps {
  data: {
    label: string;
    config: CodeNodeConfig;
  };
  selected?: boolean;
}

const CodeBlockNode: React.FC<CodeBlockNodeProps> = ({ data, selected }) => {
  const { config } = data;

  return (
    <div className={`node-code ${selected ? 'selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#722ed1' }}
      />
      
      <Card 
        size="small" 
        style={{ 
          minWidth: 200,
          border: selected ? '2px solid #1890ff' : '2px solid #722ed1',
          borderRadius: '8px'
        }}
        bodyStyle={{ padding: '12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <CodeOutlined style={{ color: '#722ed1', fontSize: '16px', marginRight: '8px' }} />
          <Text strong style={{ color: '#722ed1' }}>
            {config.label || '代码块节点'}
          </Text>
        </div>
        
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>语言:</Text>
            <Tag color="purple" style={{ fontSize: '12px' }}>
              {config.language?.toUpperCase() || 'PYTHON'}
            </Tag>
          </div>
          
          {config.code && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>代码预览:</Text>
              <div 
                style={{ 
                  fontSize: '10px', 
                  color: '#666',
                  backgroundColor: '#f5f5f5',
                  padding: '6px',
                  borderRadius: '4px',
                  fontFamily: 'Monaco, Consolas, monospace',
                  maxHeight: '60px',
                  overflow: 'hidden',
                  lineHeight: '1.3',
                  marginTop: '2px'
                }}
              >
                {config.code.split('\n').slice(0, 3).map((line, index) => (
                  <div key={index}>
                    {line.length > 25 ? `${line.substring(0, 25)}...` : line}
                  </div>
                ))}
                {config.code.split('\n').length > 3 && (
                  <div style={{ color: '#999' }}>...</div>
                )}
              </div>
            </div>
          )}
          
          {config.dependencies && config.dependencies.length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>依赖:</Text>
              <div style={{ marginTop: '2px' }}>
                {config.dependencies.slice(0, 2).map((dep, index) => (
                  <Tag key={index} style={{ fontSize: '10px', marginBottom: '2px' }}>
                    {dep}
                  </Tag>
                ))}
                {config.dependencies.length > 2 && (
                  <Tag style={{ fontSize: '10px' }}>
                    +{config.dependencies.length - 2}
                  </Tag>
                )}
              </div>
            </div>
          )}
          
          <div style={{ fontSize: '11px', color: '#999', textAlign: 'center', marginTop: '4px' }}>
            {config.language === 'python' ? 'Python 执行环境' : 'JavaScript 执行环境'}
          </div>
        </Space>
      </Card>
      
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#722ed1' }}
      />
    </div>
  );
};

export default CodeBlockNode;