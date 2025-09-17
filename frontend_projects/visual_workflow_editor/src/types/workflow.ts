// 工作流节点类型定义
export interface WorkflowNode {
  id: string;
  type: 'llm' | 'input' | 'output' | 'code' | 'condition' | 'switch' | 'merger' | 'loop';
  position: { x: number; y: number };
  data: {
    label: string;
    config: NodeConfig;
  };
}

// 工作流连接定义
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

// 节点配置基类
export interface BaseNodeConfig {
  label: string;
  description?: string;
}

// LLM节点配置
export interface LLMNodeConfig extends BaseNodeConfig {
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

// 输入节点配置
export interface InputNodeConfig extends BaseNodeConfig {
  inputType: 'text' | 'file' | 'json';
  defaultValue?: string;
  placeholder?: string;
}

// 输出节点配置
export interface OutputNodeConfig extends BaseNodeConfig {
  outputType: 'text' | 'json' | 'file';
  format?: string;
}

// 代码块节点配置
export interface CodeNodeConfig extends BaseNodeConfig {
  language: 'python' | 'javascript';
  code: string;
  dependencies?: string[];
}

// 条件节点配置
export interface ConditionNodeConfig extends BaseNodeConfig {
  condition: string;
  true_output: string;
  false_output: string;
}

// 开关节点配置
export interface SwitchNodeConfig extends BaseNodeConfig {
  switch_map: Record<string, string>;
}

// 聚合节点配置
export interface MergerNodeConfig extends BaseNodeConfig {
  merge_strategy: 'concat' | 'first' | 'last' | 'weighted';
  separator?: string;
}

// 循环节点配置
export interface LoopNodeConfig extends BaseNodeConfig {
  loop_type: 'count' | 'condition' | 'foreach';
  count?: number;
  max_iterations?: number;
  loop_condition?: string;
}

// 节点配置联合类型
export type NodeConfig = LLMNodeConfig | InputNodeConfig | OutputNodeConfig | CodeNodeConfig |
                        ConditionNodeConfig | SwitchNodeConfig | MergerNodeConfig | LoopNodeConfig;

// 工作流定义
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

// 工作流执行状态
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  results: Record<string, any>;
  errors?: string[];
}

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// 节点执行结果
export interface NodeExecutionResult {
  nodeId: string;
  status: 'success' | 'error';
  output?: any;
  error?: string;
  executionTime: number;
}