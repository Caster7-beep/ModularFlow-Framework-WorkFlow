import React from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Select, 
  Slider, 
  InputNumber, 
  Typography, 
  Space,
  Button,
  Divider
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import type { WorkflowNode, LLMNodeConfig, InputNodeConfig, OutputNodeConfig, CodeNodeConfig } from '../types/workflow';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface PropertyPanelProps {
  selectedNode: WorkflowNode | null;
  onNodeUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
}

const PropertyPanel: React.FC<PropertyPanelProps> = ({ selectedNode, onNodeUpdate }) => {
  const [form] = Form.useForm();

  // 当选中节点变化时，更新表单
  React.useEffect(() => {
    if (selectedNode) {
      form.setFieldsValue(selectedNode.data.config);
    } else {
      form.resetFields();
    }
  }, [selectedNode, form]);

  // 处理表单值变化
  const handleFormChange = (changedValues: any, allValues: any) => {
    if (!selectedNode) return;
    
    onNodeUpdate(selectedNode.id, {
      data: {
        ...selectedNode.data,
        config: allValues
      }
    });
  };

  // 删除节点
  const handleDeleteNode = () => {
    if (selectedNode) {
      // TODO: 调用删除节点的方法
      console.log('删除节点:', selectedNode.id);
    }
  };

  // 渲染LLM节点配置
  const renderLLMConfig = (config: LLMNodeConfig) => (
    <>
      <Form.Item name="label" label="节点名称" rules={[{ required: true }]}>
        <Input placeholder="请输入节点名称" />
      </Form.Item>
      
      <Form.Item name="provider" label="AI提供商" rules={[{ required: true }]}>
        <Select placeholder="选择AI提供商">
          <Option value="openai">OpenAI</Option>
          <Option value="anthropic">Anthropic</Option>
          <Option value="local">本地模型</Option>
        </Select>
      </Form.Item>
      
      <Form.Item name="model" label="模型" rules={[{ required: true }]}>
        <Select placeholder="选择模型">
          <Option value="gpt-3.5-turbo">GPT-3.5 Turbo</Option>
          <Option value="gpt-4">GPT-4</Option>
          <Option value="claude-3-sonnet">Claude 3 Sonnet</Option>
          <Option value="claude-3-opus">Claude 3 Opus</Option>
        </Select>
      </Form.Item>
      
      <Form.Item name="systemPrompt" label="系统提示词">
        <TextArea 
          placeholder="请输入系统提示词（可选）" 
          rows={3}
          showCount
          maxLength={1000}
        />
      </Form.Item>
      
      <Form.Item name="prompt" label="用户提示词" rules={[{ required: true }]}>
        <TextArea 
          placeholder="请输入提示词模板，使用 {{变量名}} 引用输入" 
          rows={4}
          showCount
          maxLength={2000}
        />
      </Form.Item>
      
      <Form.Item name="temperature" label="温度">
        <Slider 
          min={0} 
          max={2} 
          step={0.1} 
          marks={{ 0: '0', 1: '1', 2: '2' }}
          tooltip={{ formatter: (value) => `${value}` }}
        />
      </Form.Item>
      
      <Form.Item name="maxTokens" label="最大令牌数">
        <InputNumber 
          min={1} 
          max={4000} 
          style={{ width: '100%' }}
          placeholder="最大生成令牌数"
        />
      </Form.Item>
    </>
  );

  // 渲染输入节点配置
  const renderInputConfig = (config: InputNodeConfig) => (
    <>
      <Form.Item name="label" label="节点名称" rules={[{ required: true }]}>
        <Input placeholder="请输入节点名称" />
      </Form.Item>
      
      <Form.Item name="inputType" label="输入类型" rules={[{ required: true }]}>
        <Select placeholder="选择输入类型">
          <Option value="text">文本</Option>
          <Option value="file">文件</Option>
          <Option value="json">JSON</Option>
        </Select>
      </Form.Item>
      
      <Form.Item name="placeholder" label="占位符">
        <Input placeholder="请输入占位符文本" />
      </Form.Item>
      
      <Form.Item name="defaultValue" label="默认值">
        <TextArea 
          placeholder="请输入默认值（可选）" 
          rows={3}
        />
      </Form.Item>
    </>
  );

  // 渲染输出节点配置
  const renderOutputConfig = (config: OutputNodeConfig) => (
    <>
      <Form.Item name="label" label="节点名称" rules={[{ required: true }]}>
        <Input placeholder="请输入节点名称" />
      </Form.Item>
      
      <Form.Item name="outputType" label="输出类型" rules={[{ required: true }]}>
        <Select placeholder="选择输出类型">
          <Option value="text">文本</Option>
          <Option value="json">JSON</Option>
          <Option value="file">文件</Option>
        </Select>
      </Form.Item>
      
      <Form.Item name="format" label="输出格式">
        <Input placeholder="请输入输出格式（可选）" />
      </Form.Item>
    </>
  );

  // 渲染代码块节点配置
  const renderCodeConfig = (config: CodeNodeConfig) => (
    <>
      <Form.Item name="label" label="节点名称" rules={[{ required: true }]}>
        <Input placeholder="请输入节点名称" />
      </Form.Item>
      
      <Form.Item name="language" label="编程语言" rules={[{ required: true }]}>
        <Select placeholder="选择编程语言">
          <Option value="python">Python</Option>
          <Option value="javascript">JavaScript</Option>
        </Select>
      </Form.Item>
      
      <Form.Item name="code" label="代码" rules={[{ required: true }]}>
        <div style={{ border: '1px solid #d9d9d9', borderRadius: '6px' }}>
          <Editor
            height="200px"
            language={config.language || 'python'}
            value={config.code || ''}
            onChange={(value) => {
              form.setFieldsValue({ code: value });
              handleFormChange({ code: value }, { ...form.getFieldsValue(), code: value });
            }}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 14,
              lineNumbers: 'on',
              roundedSelection: false,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto'
              }
            }}
          />
        </div>
      </Form.Item>
      
      <Form.Item name="dependencies" label="依赖包">
        <Select
          mode="tags"
          placeholder="请输入依赖包名称"
          style={{ width: '100%' }}
        />
      </Form.Item>
    </>
  );

  if (!selectedNode) {
    return (
      <div style={{ padding: '16px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#999' }}>
          <Text type="secondary">请选择一个节点来编辑属性</Text>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <Title level={4} style={{ margin: 0 }}>
          节点属性
        </Title>
        <Button 
          type="text" 
          danger 
          icon={<DeleteOutlined />}
          onClick={handleDeleteNode}
          size="small"
        >
          删除
        </Button>
      </div>
      
      <Card size="small" style={{ marginBottom: '16px' }}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Text strong>节点ID:</Text>
          <Text code copyable>{selectedNode.id}</Text>
          <Text strong>节点类型:</Text>
          <Text>{selectedNode.type}</Text>
        </Space>
      </Card>
      
      <Divider />
      
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleFormChange}
        size="small"
      >
        {selectedNode.type === 'llm' && renderLLMConfig(selectedNode.data.config as LLMNodeConfig)}
        {selectedNode.type === 'input' && renderInputConfig(selectedNode.data.config as InputNodeConfig)}
        {selectedNode.type === 'output' && renderOutputConfig(selectedNode.data.config as OutputNodeConfig)}
        {selectedNode.type === 'code' && renderCodeConfig(selectedNode.data.config as CodeNodeConfig)}
      </Form>
      
      <div style={{ marginTop: '24px', padding: '12px', background: '#f5f5f5', borderRadius: '6px' }}>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          💡 提示：修改配置后会自动保存到节点
        </Text>
      </div>
    </div>
  );
};

export default PropertyPanel;