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
import { DeleteOutlined, PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
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

  // 辅助：将 switch_map 转换为可编辑的键值对列表
  const mapToPairs = (m?: Record<string, string>) => {
    if (!m) return [];
    return Object.entries(m).map(([key, value]) => ({ key, value }));
  };
  const pairsToMap = (pairs?: { key?: string; value?: string }[]) => {
    const result: Record<string, string> = {};
    (pairs || []).forEach((p) => {
      const k = String(p.key || '').trim();
      const v = String(p.value || '').trim();
      if (k.length > 0) result[k] = v;
    });
    return result;
  };

  // 当选中节点变化时，更新表单（标准键回填 + 默认值）
  React.useEffect(() => {
    if (selectedNode) {
      const cfg: any = selectedNode.data?.config || {};
      if (selectedNode.type === 'llm') {
        const provider = (cfg.provider || cfg.llmProvider || 'gemini') as string;
        const model = (cfg.model || cfg.modelName || 'gemini-2.5-flash') as string;
        const prompt = (cfg.prompt ?? cfg.promptText ?? 'Return a single word: ping') as string;
        const system_prompt = (cfg.system_prompt ?? cfg.systemPrompt) as string | undefined;
        let temperature: number | undefined = cfg.temperature;
        if (typeof temperature === 'string') {
          const t = parseFloat(temperature);
          temperature = isNaN(t) ? undefined : t;
        }
        if (typeof temperature === 'number') {
          temperature = Math.max(0, Math.min(1, temperature));
        }
        let max_tokens: number | undefined = cfg.max_tokens ?? cfg.maxTokens;
        if (typeof max_tokens === 'string') {
          const m = parseInt(max_tokens, 10);
          max_tokens = isNaN(m) ? undefined : m;
        }
        form.setFieldsValue({
          ...cfg,
          provider,
          model,
          prompt,
          system_prompt,
          temperature,
          max_tokens,
        });
      } else if (selectedNode.type === 'code') {
        const code_type = (cfg.code_type || 'python') as 'python';
        const template = "text = inputs.get('text') or inputs.get('input') or 'hello'\noutput = {'text': f'len={len(str(text))}', 'signal': 1}";
        const code = (cfg.code && String(cfg.code).length > 0) ? cfg.code : template;
        form.setFieldsValue({
          ...cfg,
          code_type,
          code,
        });
      } else if (selectedNode.type === 'condition') {
        form.setFieldsValue({
          ...cfg,
          condition: cfg.condition ?? '',
          true_output: cfg.true_output ?? '',
          false_output: cfg.false_output ?? '',
          description: cfg.description ?? '',
        });
      } else if (selectedNode.type === 'switch') {
        form.setFieldsValue({
          ...cfg,
          switch_map_list: mapToPairs(cfg.switch_map),
        });
      } else if (selectedNode.type === 'merger') {
        form.setFieldsValue({
          ...cfg,
          merge_strategy: cfg.merge_strategy ?? 'concat',
          separator: cfg.separator ?? '\n',
        });
      } else {
        form.setFieldsValue(cfg);
      }
    } else {
      form.resetFields();
    }
  }, [selectedNode, form]);

  // 处理表单值变化（标准键序列化 + sanitize）
  const handleFormChange = (changedValues: any, allValues: any) => {
    if (!selectedNode) return;
  
    let normalizedConfig: any = { ...allValues };
  
    if (selectedNode.type === 'llm') {
      const provider = String(allValues.provider || '').trim() || 'gemini';
      const model = String(allValues.model || '').trim() || 'gemini-2.5-flash';
      const prompt = String(allValues.prompt || '').trim() || 'Return a single word: ping';
      const system_prompt_raw = allValues.system_prompt ?? allValues.systemPrompt;
      const system_prompt = typeof system_prompt_raw === 'string' ? system_prompt_raw.trim() : undefined;
  
      const rawTemp: any = allValues.temperature;
      let temperature: number | undefined;
      if (rawTemp === '' || rawTemp === null || rawTemp === undefined) {
        temperature = undefined;
      } else if (typeof rawTemp === 'string') {
        const t = parseFloat(rawTemp);
        temperature = isNaN(t) ? undefined : t;
      } else if (typeof rawTemp === 'number') {
        temperature = rawTemp;
      }
      if (typeof temperature === 'number') {
        temperature = Math.max(0, Math.min(1, temperature));
      }
  
      const rawMax: any = (allValues as any).max_tokens ?? (allValues as any).maxTokens;
      let max_tokens: number | undefined;
      if (rawMax === '' || rawMax === null || rawMax === undefined) {
        max_tokens = undefined;
      } else if (typeof rawMax === 'string') {
        const m = parseInt(rawMax, 10);
        max_tokens = isNaN(m) ? undefined : m;
      } else if (typeof rawMax === 'number') {
        max_tokens = rawMax;
      }
  
      normalizedConfig = {
        label: allValues.label,
        provider,
        model,
        prompt,
        ...(system_prompt ? { system_prompt } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(max_tokens !== undefined ? { max_tokens } : {}),
      };
    } else if (selectedNode.type === 'code') {
      const template = "text = inputs.get('text') or inputs.get('input') or 'hello'\noutput = {'text': f'len={len(str(text))}', 'signal': 1}";
      const code = (typeof allValues.code === 'string' && allValues.code.trim().length > 0)
        ? allValues.code
        : template;
      normalizedConfig = {
        label: allValues.label,
        code_type: 'python',
        code,
        ...(allValues.dependencies ? { dependencies: allValues.dependencies } : {}),
      };
    } else if (selectedNode.type === 'condition') {
      normalizedConfig = {
        label: allValues.label,
        condition: String(allValues.condition || ''),
        true_output: String(allValues.true_output || ''),
        false_output: String(allValues.false_output || ''),
        ...(allValues.description ? { description: String(allValues.description) } : {}),
      };
    } else if (selectedNode.type === 'switch') {
      const switch_map = pairsToMap(allValues.switch_map_list);
      normalizedConfig = {
        label: allValues.label,
        switch_map,
      };
    } else if (selectedNode.type === 'merger') {
      const merge_strategy = String(allValues.merge_strategy || 'concat') as 'concat' | 'first' | 'last' | 'weighted';
      normalizedConfig = {
        label: allValues.label,
        merge_strategy,
        ...(merge_strategy === 'concat' ? { separator: String(allValues.separator ?? '\n') } : {}),
      };
    }
  
    onNodeUpdate(selectedNode.id, {
      data: {
        ...selectedNode.data,
        config: normalizedConfig,
      }
    });
  };

  // 删除节点（占位：若有真正的删除逻辑，应由上层提供回调）
  const handleDeleteNode = () => {
    if (selectedNode) {
      console.log('删除节点:', selectedNode.id);
    }
  };

  // 渲染LLM节点配置
  const renderLLMConfig = (config: LLMNodeConfig) => (
    <>
      <Form.Item name="label" label="节点名称" rules={[{ required: true }]}>
        <Input placeholder="请输入节点名称" />
      </Form.Item>
      
      <Form.Item name="provider" label="AI提供商" rules={[{ required: true, message: '请选择提供商' }]}>
        <Select placeholder="选择AI提供商">
          <Option value="gemini">Gemini</Option>
          <Option value="openai">OpenAI</Option>
          <Option value="anthropic">Anthropic</Option>
          <Option value="local">本地模型</Option>
        </Select>
      </Form.Item>
      
      <Form.Item name="model" label="模型" rules={[{ required: true, message: '请选择模型' }]}>
        <Select placeholder="选择模型或手动输入" allowClear showSearch>
          <Option value="gemini-2.5-flash">gemini-2.5-flash</Option>
          <Option value="gemini-1.5-pro">gemini-1.5-pro</Option>
          <Option value="gpt-4o-mini">gpt-4o-mini</Option>
          <Option value="claude-3-5-sonnet">claude-3-5-sonnet</Option>
        </Select>
      </Form.Item>
      
      <Form.Item name="system_prompt" label="系统提示词">
        <TextArea
          placeholder="请输入系统提示词（可选）"
          rows={3}
          showCount
          maxLength={1000}
        />
      </Form.Item>
      
      <Form.Item name="prompt" label="用户提示词" rules={[{ required: true, message: '请输入提示词' }]}>
        <TextArea
          placeholder="请输入提示词模板，使用 {{变量名}} 引用输入"
          rows={4}
          showCount
          maxLength={2000}
        />
      </Form.Item>
      
      <Form.Item name="temperature" label="温度（0-1）">
        <Slider
          min={0}
          max={1}
          step={0.1}
          marks={{ 0: '0', 0.5: '0.5', 1: '1' }}
          tooltip={{ formatter: (value) => `${value}` }}
        />
      </Form.Item>
      
      <Form.Item name="max_tokens" label="最大令牌数">
        <InputNumber
          min={1}
          max={400000}
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
      
      <Form.Item name="code_type" hidden initialValue="python">
        <Input />
      </Form.Item>
      
      <Form.Item name="code" label="代码" rules={[{ required: true }]}>
        <div style={{ border: '1px solid #d9d9d9', borderRadius: '6px' }}>
          <Editor
            height="200px"
            language={(config as any).code_type || (config as any).language || 'python'}
            value={(config as any).code || ''}
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

  // 渲染 Condition 节点配置（固定大小，侧栏编辑）
  const renderConditionConfig = () => (
    <>
      <Form.Item name="label" label="节点名称" rules={[{ required: true }]}>
        <Input placeholder="请输入节点名称" />
      </Form.Item>

      <Form.Item name="condition" label="条件表达式">
        <Input placeholder="例如: length > 10" />
      </Form.Item>

      <Form.Item name="true_output" label="True 输出">
        <Input placeholder="条件为真时的输出" />
      </Form.Item>

      <Form.Item name="false_output" label="False 输出">
        <Input placeholder="条件为假时的输出" />
      </Form.Item>

      <Form.Item name="description" label="描述">
        <TextArea rows={3} placeholder="可选描述" />
      </Form.Item>
    </>
  );

  // 渲染 Switch 节点配置（键值对表格编辑）
  const renderSwitchConfig = () => (
    <>
      <Form.Item name="label" label="节点名称" rules={[{ required: true }]}>
        <Input placeholder="请输入节点名称" />
      </Form.Item>

      <Form.List name="switch_map_list">
        {(fields, { add, remove }) => (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text strong>路由规则</Text>
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                添加路由
              </Button>
            </div>
            {fields.map((field) => (
              <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                <Form.Item
                  {...field}
                  name={[field.name, 'key']}
                  fieldKey={[field.fieldKey!, 'key']}
                  rules={[{ required: true, message: '请输入信号值键' }]}
                >
                  <Input placeholder="信号值 (如: 1, default)" style={{ width: 140 }} />
                </Form.Item>
                <span style={{ color: '#666' }}>→</span>
                <Form.Item
                  {...field}
                  name={[field.name, 'value']}
                  fieldKey={[field.fieldKey!, 'value']}
                  rules={[{ required: true, message: '请输入输出内容' }]}
                >
                  <Input placeholder="输出内容" style={{ width: 240 }} />
                </Form.Item>
                <MinusCircleOutlined onClick={() => remove(field.name)} style={{ color: '#ff4d4f' }} />
              </Space>
            ))}
          </div>
        )}
      </Form.List>
    </>
  );

  // 渲染 Merger 节点配置（策略 + 分隔符）
  const renderMergerConfig = () => (
    <>
      <Form.Item name="label" label="节点名称" rules={[{ required: true }]}>
        <Input placeholder="请输入节点名称" />
      </Form.Item>

      <Form.Item name="merge_strategy" label="合并策略" rules={[{ required: true }]}>
        <Select placeholder="选择合并策略">
          <Option value="concat">连接合并</Option>
          <Option value="first">取第一个</Option>
          <Option value="last">取最后一个</Option>
          <Option value="weighted">加权合并</Option>
        </Select>
      </Form.Item>

      {/* 仅 concat 显示分隔符 */}
      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.merge_strategy !== cur.merge_strategy}>
        {({ getFieldValue }) =>
          (getFieldValue('merge_strategy') || 'concat') === 'concat' ? (
            <Form.Item name="separator" label="分隔符">
              <Input placeholder="例如: \\n, , 或自定义" />
            </Form.Item>
          ) : null
        }
      </Form.Item>
    </>
  );

  if (!selectedNode) {
    return (
      <div className="property-panel h-[calc(100vh-56px)] overflow-auto rounded border border-gray-200 bg-white p-4 flex items-center justify-center">
        <div className="text-gray-600 text-sm text-center">
          请选择一个节点来编辑属性
        </div>
      </div>
    );
  }

  return (
    <div className="property-panel h-[calc(100vh-56px)] overflow-auto rounded border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-black text-xl font-semibold leading-7 m-0">
          节点属性
        </h2>
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
      
      <Card size="small" style={{ marginBottom: 0 }}>
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
        size="middle"
      >
        {selectedNode.type === 'llm' && renderLLMConfig(selectedNode.data.config as LLMNodeConfig)}
        {selectedNode.type === 'input' && renderInputConfig(selectedNode.data.config as InputNodeConfig)}
        {selectedNode.type === 'output' && renderOutputConfig(selectedNode.data.config as OutputNodeConfig)}
        {selectedNode.type === 'code' && renderCodeConfig(selectedNode.data.config as CodeNodeConfig)}
        {selectedNode.type === 'condition' && renderConditionConfig()}
        {selectedNode.type === 'switch' && renderSwitchConfig()}
        {selectedNode.type === 'merger' && renderMergerConfig()}
      </Form>
      
      <div className="rounded border border-gray-200 bg-white p-3">
        <span className="text-sm text-gray-600">
          💡 提示：修改配置后会自动保存到节点
        </span>
      </div>
    </div>
  );
};

export default PropertyPanel;