// 工作流节点类型定义
export interface WorkflowNode {
  id: string;
  type: 'llm' | 'input' | 'output' | 'code' | 'condition' | 'switch' | 'merger' | 'loop';
  position: { x: number; y: number };
  /**
   * 逻辑分组与锁定（Polish v5）
   * - groupId: 仅逻辑分组，便于整体移动/对齐/复制/删除
   * - locked: 锁定后不可拖动/连接，视觉改为浅灰轮廓
   */
  groupId?: string;
  locked?: boolean;
  data: {
    label: string;
    config: NodeConfig;
    /**
     * UI 元信息（尺寸等），用于导出/导入布局与对齐/分布计算
     */
    ui?: {
      size?: { width: number; height: number };
    };
  };
}

// 工作流连接定义
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  /**
   * 边路由样式（Polish v5）
   * - 'smooth': 平滑曲线（默认）
   * - 'orthogonal': 直角折线（最小可行避让）
   */
  edgeType?: 'smooth' | 'orthogonal';
}

// 节点配置基类
export interface BaseNodeConfig {
  label: string;
  description?: string;
}

// LLM节点配置
export interface LLMNodeConfig extends BaseNodeConfig {
  // standard keys expected by backend
  provider: string;
  model: string;
  prompt: string;
  system_prompt?: string;
  temperature?: number; // 0-1
  max_tokens?: number;

  // legacy compatibility (UI may read; service will normalize before sending)
  systemPrompt?: string;
  maxTokens?: number;
  llmProvider?: string;
  modelName?: string;
  promptText?: string;
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
  // standard keys expected by backend
  code_type: 'python';
  code: string;

  // legacy compatibility
  language?: 'python' | 'javascript';
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