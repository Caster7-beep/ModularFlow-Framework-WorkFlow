import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Button,
  Select,
  Input,
  Space,
  Tag,
  Typography,
  Divider,
  Alert,
  Tooltip,
  Switch,
  Row,
  Col,
  Tree,
  Modal,
  Form,
  InputNumber,
  Radio,
  Collapse,
  Badge,
  message
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CodeOutlined,
  BranchesOutlined,
  FunctionOutlined,
  QuestionCircleOutlined,
  PlayCircleOutlined,
  ClearOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;
const { TextArea } = Input;
const { Option } = Select;

// 条件操作符定义
const COMPARISON_OPERATORS = [
  { value: '==', label: '等于 (==)', description: '值相等' },
  { value: '!=', label: '不等于 (!=)', description: '值不相等' },
  { value: '>', label: '大于 (>)', description: '数值大于' },
  { value: '<', label: '小于 (<)', description: '数值小于' },
  { value: '>=', label: '大于等于 (>=)', description: '数值大于或等于' },
  { value: '<=', label: '小于等于 (<=)', description: '数值小于或等于' },
  { value: 'in', label: '包含于 (in)', description: '值在集合中' },
  { value: 'not in', label: '不包含于 (not in)', description: '值不在集合中' },
  { value: 'contains', label: '包含 (contains)', description: '字符串包含子串' },
  { value: 'startswith', label: '开始于 (startswith)', description: '字符串以指定内容开始' },
  { value: 'endswith', label: '结束于 (endswith)', description: '字符串以指定内容结束' }
];

const LOGICAL_OPERATORS = [
  { value: 'and', label: '并且 (AND)', description: '所有条件都为真' },
  { value: 'or', label: '或者 (OR)', description: '任一条件为真' },
  { value: 'not', label: '非 (NOT)', description: '条件取反' }
];

const BUILTIN_FUNCTIONS = [
  { value: 'len', label: 'len()', description: '获取长度', usage: 'len(text)' },
  { value: 'str', label: 'str()', description: '转换为字符串', usage: 'str(value)' },
  { value: 'int', label: 'int()', description: '转换为整数', usage: 'int(value)' },
  { value: 'float', label: 'float()', description: '转换为浮点数', usage: 'float(value)' },
  { value: 'bool', label: 'bool()', description: '转换为布尔值', usage: 'bool(value)' },
  { value: 'abs', label: 'abs()', description: '绝对值', usage: 'abs(number)' },
  { value: 'min', label: 'min()', description: '最小值', usage: 'min(a, b)' },
  { value: 'max', label: 'max()', description: '最大值', usage: 'max(a, b)' }
];

interface ConditionClause {
  id: string;
  field: string;
  operator: string;
  value: any;
  valueType: 'literal' | 'variable' | 'function';
  group?: string;
}

interface LogicalGroup {
  id: string;
  operator: 'and' | 'or';
  clauses: string[];
  parentGroup?: string;
}

interface Variable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  source: 'input' | 'global' | 'computed';
}

export interface ConditionEditorProps {
  expression?: string;
  variables?: Variable[];
  onChange?: (expression: string, isValid: boolean) => void;
  onValidate?: (expression: string) => Promise<{ isValid: boolean; error?: string; result?: any }>;
  placeholder?: string;
  height?: number;
  showPreview?: boolean;
  allowRawEdit?: boolean;
  className?: string;
}

const ConditionEditor: React.FC<ConditionEditorProps> = ({
  expression = '',
  variables = [],
  onChange,
  onValidate,
  placeholder = '请输入或构建条件表达式',
  height = 400,
  showPreview = true,
  allowRawEdit = true,
  className
}) => {
  const [mode, setMode] = useState<'visual' | 'text'>('visual');
  const [rawExpression, setRawExpression] = useState(expression);
  const [clauses, setClauses] = useState<ConditionClause[]>([]);
  const [groups, setGroups] = useState<LogicalGroup[]>([]);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    error?: string;
    result?: any;
  }>({ isValid: true });
  const [isValidating, setIsValidating] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [testData, setTestData] = useState<Record<string, any>>({});

  // 默认变量（如果没有提供）
  const defaultVariables: Variable[] = [
    { name: 'input', type: 'string', description: '输入文本', source: 'input' },
    { name: 'text', type: 'string', description: '文本内容', source: 'input' },
    { name: 'length', type: 'number', description: '文本长度', source: 'computed' },
    { name: 'words', type: 'number', description: '单词数量', source: 'computed' },
    { name: 'lines', type: 'number', description: '行数', source: 'computed' },
    { name: 'signal', type: 'number', description: '控制信号', source: 'input' }
  ];

  const availableVariables = variables.length > 0 ? variables : defaultVariables;

  // 初始化表达式解析
  useEffect(() => {
    if (expression && expression !== rawExpression) {
      setRawExpression(expression);
      parseExpression(expression);
    }
  }, [expression]);

  // 解析表达式为可视化组件
  const parseExpression = useCallback((expr: string) => {
    try {
      // 简单解析逻辑，实际项目中可能需要更复杂的表达式解析器
      if (expr.trim()) {
        // 创建一个简单的解析结果
        const simpleClause: ConditionClause = {
          id: `clause_${Date.now()}`,
          field: 'input',
          operator: '>',
          value: '0',
          valueType: 'literal'
        };
        setClauses([simpleClause]);
      } else {
        setClauses([]);
      }
    } catch (error) {
      console.error('表达式解析失败:', error);
      setClauses([]);
    }
  }, []);

  // 生成表达式
  const generateExpression = useCallback(() => {
    if (clauses.length === 0) return '';

    try {
      const expressions = clauses.map(clause => {
        let expr = clause.field + ' ' + clause.operator + ' ';
        
        if (clause.valueType === 'literal') {
          if (typeof clause.value === 'string' && !['true', 'false', 'null'].includes(clause.value.toLowerCase())) {
            expr += `"${clause.value}"`;
          } else {
            expr += clause.value;
          }
        } else if (clause.valueType === 'variable') {
          expr += clause.value;
        } else if (clause.valueType === 'function') {
          expr += clause.value;
        }

        return expr;
      });

      // 简单的逻辑连接，实际项目中应该考虑分组
      return expressions.join(' and ');
    } catch (error) {
      console.error('表达式生成失败:', error);
      return '';
    }
  }, [clauses]);

  // 添加条件子句
  const addClause = useCallback(() => {
    const newClause: ConditionClause = {
      id: `clause_${Date.now()}`,
      field: availableVariables[0]?.name || 'input',
      operator: '==',
      value: '',
      valueType: 'literal'
    };
    setClauses(prev => [...prev, newClause]);
  }, [availableVariables]);

  // 删除条件子句
  const removeClause = useCallback((clauseId: string) => {
    setClauses(prev => prev.filter(clause => clause.id !== clauseId));
  }, []);

  // 更新条件子句
  const updateClause = useCallback((clauseId: string, updates: Partial<ConditionClause>) => {
    setClauses(prev =>
      prev.map(clause =>
        clause.id === clauseId ? { ...clause, ...updates } : clause
      )
    );
  }, []);

  // 验证表达式
  const validateExpression = useCallback(async (expr: string) => {
    if (!expr.trim()) {
      setValidationResult({ isValid: true });
      return;
    }

    setIsValidating(true);
    try {
      if (onValidate) {
        const result = await onValidate(expr);
        setValidationResult(result);
      } else {
        // 简单的语法检查
        const isValid = !expr.includes('undefined') && expr.length > 0;
        setValidationResult({ 
          isValid, 
          error: isValid ? undefined : '表达式语法错误' 
        });
      }
    } catch (error) {
      setValidationResult({ 
        isValid: false, 
        error: `验证失败: ${error}` 
      });
    } finally {
      setIsValidating(false);
    }
  }, [onValidate]);

  // 表达式变更处理
  useEffect(() => {
    const expr = mode === 'visual' ? generateExpression() : rawExpression;
    if (expr !== rawExpression && mode === 'visual') {
      setRawExpression(expr);
    }
    onChange?.(expr, validationResult.isValid);
    validateExpression(expr);
  }, [mode, clauses, rawExpression, onChange, generateExpression, validateExpression, validationResult.isValid]);

  // 测试表达式
  const testExpression = useCallback(() => {
    const expr = mode === 'visual' ? generateExpression() : rawExpression;
    if (!expr.trim()) {
      message.warning('请先输入表达式');
      return;
    }

    console.log('测试表达式:', expr);
    console.log('测试数据:', testData);
    message.success('表达式测试完成，请查看控制台');
  }, [mode, generateExpression, rawExpression, testData]);

  // 渲染条件子句编辑器
  const renderClauseEditor = (clause: ConditionClause) => (
    <Card key={clause.id} size="small" style={{ marginBottom: 8 }}>
      <Row gutter={8} align="middle">
        {/* 字段选择 */}
        <Col span={6}>
          <Select
            value={clause.field}
            onChange={(value) => updateClause(clause.id, { field: value })}
            style={{ width: '100%' }}
            placeholder="选择字段"
          >
            {availableVariables.map(variable => (
              <Option key={variable.name} value={variable.name}>
                <Space>
                  <Text>{variable.name}</Text>
                  <Tag color="blue">{variable.type}</Tag>
                </Space>
              </Option>
            ))}
          </Select>
        </Col>

        {/* 操作符选择 */}
        <Col span={6}>
          <Select
            value={clause.operator}
            onChange={(value) => updateClause(clause.id, { operator: value })}
            style={{ width: '100%' }}
            placeholder="选择操作符"
          >
            {COMPARISON_OPERATORS.map(op => (
              <Option key={op.value} value={op.value}>
                <Tooltip title={op.description}>
                  {op.label}
                </Tooltip>
              </Option>
            ))}
          </Select>
        </Col>

        {/* 值类型选择 */}
        <Col span={3}>
          <Select
            value={clause.valueType}
            onChange={(value) => updateClause(clause.id, { valueType: value })}
            style={{ width: '100%' }}
          >
            <Option value="literal">字面值</Option>
            <Option value="variable">变量</Option>
            <Option value="function">函数</Option>
          </Select>
        </Col>

        {/* 值输入 */}
        <Col span={7}>
          {clause.valueType === 'literal' && (
            <Input
              value={clause.value}
              onChange={(e) => updateClause(clause.id, { value: e.target.value })}
              placeholder="输入值"
            />
          )}
          {clause.valueType === 'variable' && (
            <Select
              value={clause.value}
              onChange={(value) => updateClause(clause.id, { value })}
              style={{ width: '100%' }}
              placeholder="选择变量"
            >
              {availableVariables.map(variable => (
                <Option key={variable.name} value={variable.name}>
                  {variable.name} ({variable.type})
                </Option>
              ))}
            </Select>
          )}
          {clause.valueType === 'function' && (
            <Select
              value={clause.value}
              onChange={(value) => updateClause(clause.id, { value })}
              style={{ width: '100%' }}
              placeholder="选择函数"
            >
              {BUILTIN_FUNCTIONS.map(func => (
                <Option key={func.value} value={func.usage}>
                  <Tooltip title={func.description}>
                    {func.label}
                  </Tooltip>
                </Option>
              ))}
            </Select>
          )}
        </Col>

        {/* 删除按钮 */}
        <Col span={2}>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeClause(clause.id)}
          />
        </Col>
      </Row>
    </Card>
  );

  // 渲染可视化编辑器
  const renderVisualEditor = () => (
    <div style={{ padding: '16px 0' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={5}>条件子句</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={addClause}
            size="small"
          >
            添加条件
          </Button>
        </div>

        {clauses.length === 0 ? (
          <Alert
            message="暂无条件"
            description="点击添加条件按钮开始构建条件表达式"
            type="info"
            showIcon
          />
        ) : (
          <div>
            {clauses.map(clause => renderClauseEditor(clause))}
            
            {clauses.length > 1 && (
              <Card size="small" style={{ marginTop: 8, backgroundColor: '#f9f9f9' }}>
                <Text strong>逻辑连接: </Text>
                <Radio.Group defaultValue="and">
                  <Radio value="and">并且 (AND)</Radio>
                  <Radio value="or">或者 (OR)</Radio>
                </Radio.Group>
              </Card>
            )}
          </div>
        )}
      </Space>
    </div>
  );

  // 渲染文本编辑器
  const renderTextEditor = () => (
    <div style={{ padding: '16px 0' }}>
      <TextArea
        value={rawExpression}
        onChange={(e) => setRawExpression(e.target.value)}
        placeholder={placeholder}
        style={{ fontFamily: 'monospace' }}
        rows={8}
      />
      
      <div style={{ marginTop: 8 }}>
        <Space>
          <Text type="secondary">支持的操作符:</Text>
          {COMPARISON_OPERATORS.slice(0, 6).map(op => (
            <Tag key={op.value}>{op.value}</Tag>
          ))}
        </Space>
      </div>
    </div>
  );

  return (
    <div className={className}>
      <Card
        title={
          <Space>
            <BranchesOutlined />
            <span>条件编辑器</span>
            {validationResult.isValid ? (
              <Badge status="success" text="有效" />
            ) : (
              <Badge status="error" text="无效" />
            )}
          </Space>
        }
        extra={
          <Space>
            <Switch
              checked={mode === 'visual'}
              onChange={(checked) => setMode(checked ? 'visual' : 'text')}
              checkedChildren="可视化"
              unCheckedChildren="文本模式"
            />
            <Tooltip title="帮助文档">
              <Button
                type="text"
                icon={<QuestionCircleOutlined />}
                onClick={() => setShowHelp(true)}
              />
            </Tooltip>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={testExpression}
              size="small"
            >
              测试
            </Button>
          </Space>
        }
        size="small"
        style={{ height: height }}
      >
        {/* 验证结果提示 */}
        {!validationResult.isValid && (
          <Alert
            message="表达式错误"
            description={validationResult.error}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 编辑区域 */}
        <div style={{ height: height - 150, overflowY: 'auto' }}>
          {mode === 'visual' ? renderVisualEditor() : renderTextEditor()}
        </div>

        {/* 预览区域 */}
        {showPreview && (
          <>
            <Divider />
            <div>
              <Text strong>生成的表达式: </Text>
              <Text
                code
                copyable
                style={{
                  color: validationResult.isValid ? '#52c41a' : '#ff4d4f',
                  backgroundColor: '#f5f5f5',
                  padding: '2px 6px',
                  borderRadius: 4
                }}
              >
                {mode === 'visual' ? generateExpression() : rawExpression}
              </Text>
            </div>
          </>
        )}
      </Card>

      {/* 帮助模态框 */}
      <Modal
        title="条件编辑器帮助"
        open={showHelp}
        onCancel={() => setShowHelp(false)}
        footer={[
          <Button key="close" onClick={() => setShowHelp(false)}>
            关闭
          </Button>
        ]}
        width={600}
      >
        <Collapse>
          <Panel header="支持的变量" key="variables">
            <div>
              {availableVariables.map(variable => (
                <div key={variable.name} style={{ marginBottom: 8 }}>
                  <Space>
                    <Code>{variable.name}</Code>
                    <Tag>{variable.type}</Tag>
                    <Text type="secondary">{variable.description}</Text>
                  </Space>
                </div>
              ))}
            </div>
          </Panel>
          
          <Panel header="支持的操作符" key="operators">
            <div>
              {COMPARISON_OPERATORS.map(op => (
                <div key={op.value} style={{ marginBottom: 8 }}>
                  <Space>
                    <Code>{op.value}</Code>
                    <Text>{op.description}</Text>
                  </Space>
                </div>
              ))}
            </div>
          </Panel>
          
          <Panel header="支持的函数" key="functions">
            <div>
              {BUILTIN_FUNCTIONS.map(func => (
                <div key={func.value} style={{ marginBottom: 8 }}>
                  <Space direction="vertical" size="small">
                    <Space>
                      <Code>{func.label}</Code>
                      <Text>{func.description}</Text>
                    </Space>
                    <Text type="secondary">用法: {func.usage}</Text>
                  </Space>
                </div>
              ))}
            </div>
          </Panel>
          
          <Panel header="示例" key="examples">
            <div>
              <Paragraph>
                <Text strong>简单比较:</Text>
              </Paragraph>
              <Paragraph code>
                {'length > 10'}
              </Paragraph>
              
              <Paragraph>
                <Text strong>字符串操作:</Text>
              </Paragraph>
              <Paragraph code>
                {'input.startswith("hello")'}
              </Paragraph>
              
              <Paragraph>
                <Text strong>复杂条件:</Text>
              </Paragraph>
              <Paragraph code>
                {'len(input) > 0 and words > 5'}
              </Paragraph>
              
              <Paragraph>
                <Text strong>函数调用:</Text>
              </Paragraph>
              <Paragraph code>
                {'int(signal) in [1, 2, 3]'}
              </Paragraph>
            </div>
          </Panel>
        </Collapse>
      </Modal>
    </div>
  );
};

// 定义Code组件以避免编译错误
const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text code>{children}</Text>
);

export default ConditionEditor;