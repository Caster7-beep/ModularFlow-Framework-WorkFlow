// 文件说明：
// - 将原 REST 风格路径改为“函数自动发现路由”：/api/v1/{func_name} → /api/v1/visual_workflow/{function}
// - baseURL 优先读取 import.meta.env.VITE_API_BASE，否则默认 http://localhost:6502/api/v1
// - 适配 API Gateway 响应包装：若返回 { success, data, function } 则在拦截器中解包为 data
// - WebSocket 端口/协议由 baseURL 推导：示例 http://host:6502/api/v1 → ws://host:6502/ws
// - 保持对外导出方法签名不变，并在内部完成入参与返回值的整形

import axios from 'axios';
import type { Workflow, WorkflowExecution, ApiResponse, WorkflowNode, WorkflowEdge } from '../types/workflow';

// ========= 基础配置 =========
const DEFAULT_BASE_URL = 'http://localhost:6502/api/v1';
const BASE_URL: string = (import.meta as any)?.env?.VITE_API_BASE || DEFAULT_BASE_URL;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：保持原有请求方法与 URL 打印
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：适配 API Gateway 包装
api.interceptors.response.use(
  (response) => {
    const data = response?.data;
    if (data && typeof data === 'object' && 'success' in data && 'function' in data && 'data' in data) {
      // API Gateway 包装：仅返回内部 data
      return (data as any).data;
    }
    return data;
  },
  (error) => {
    console.error('API Error:', error);
    const status = error?.response?.status;
    const errData = error?.response?.data;
    const message = errData?.message || errData?.error || error.message || '请求失败';
    const e: any = new Error(message);
    if (typeof status !== 'undefined') {
      (e as any).status = status;
    }
    return Promise.reject(e);
  }
);

// ========= 通用请求辅助（新→旧路由一次性回退） =========
async function requestWithFallback<T>(
  primary: { method: 'GET' | 'POST'; url: string; data?: any; params?: any },
  fallbacks: Array<{ url: string }>
): Promise<T> {
  try {
    // 首次按原接口实例与拦截器发送
    const res = await api.request({
      method: primary.method,
      url: primary.url,
      data: primary.data,
      params: primary.params,
    });
    return res as T;
  } catch (err: any) {
    // 优先使用状态码判断；若无状态码则回退到 message 正则识别
    const msg = String(err?.message || '');
    const statusCode = (err as any)?.status ?? (err?.response?.status);
    const is404 = (statusCode === 404) || /(^|[^0-9])404([^0-9]|$)|not\s*found/i.test(msg);
    const is405 = (statusCode === 405) || /(^|[^0-9])405([^0-9]|$)|method\s*not\s*allowed/i.test(msg);

    if ((is404 || is405) && fallbacks && fallbacks.length > 0) {
      const fb = fallbacks[0];
      console.warn(`Fallback route engaged: primary ${primary.url} → fallback ${fb.url}`);
      // 仅一次回退重试，方法与 data/params 沿用 primary
      return (await api.request({
        method: primary.method,
        url: fb.url,
        data: primary.data,
        params: primary.params,
      })) as T;
    }

    // 非 404/405 或无可用回退：直接抛出
    throw err;
  }
}
// ========= 工具函数：统一整形为 ApiResponse<T> =========
function toApiResponse<T>(payload: any, mapper?: (raw: any) => T): ApiResponse<T> {
  try {
    // 若 payload 已是 ApiResponse 结构，尽量透传
    if (payload && typeof payload === 'object' && 'success' in payload && ('data' in payload || 'error' in payload)) {
      return payload as ApiResponse<T>;
    }
    const data = mapper ? mapper(payload) : (payload as T);
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e?.message || '数据整形失败' };
  }
}

function ensureArray<T>(arr: any): T[] {
  if (Array.isArray(arr)) return arr as T[];
  return [];
}

// 构造绝对回退路径（绕过 baseURL 前缀 /api/v1）
function buildAbsoluteFallback(path: string): string {
  try {
    const u = new URL(BASE_URL);
    const origin = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
    return `${origin}${path}`;
  } catch {
    const origin = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
    return `${origin}${path}`;
  }
}

// 将后端执行状态映射为前端 WorkflowExecution 类型的尽量兼容结构
function mapToWorkflowExecution(workflowIdHint: string | undefined, raw: any): WorkflowExecution {
  // 运行时轻量容错
  const safeObj = (v: any) => (v && typeof v === 'object' ? v : {});
  const id = raw?.execution_id || raw?.id || '';
  const workflowId = raw?.workflow_id || workflowIdHint || '';
  const status = raw?.state || raw?.status || 'running';
  const startTime = raw?.start_time || new Date().toISOString();
  const endTime = raw?.end_time;

  // 优先 results/outputs；若缺失或为空，则镜像 raw.result → results
  let results: any = raw?.results ?? raw?.outputs;
  const isEmptyObj = (o: any) => o && typeof o === 'object' && Object.keys(o).length === 0;
  if (
    results === undefined ||
    results === null ||
    (Array.isArray(results) && results.length === 0) ||
    isEmptyObj(results)
  ) {
    if (raw?.result !== undefined) {
      results = raw.result;
      if (import.meta && (import.meta as any).env && (import.meta as any).env.DEV) {
        console.warn('[mapToWorkflowExecution] results/outputs 缺失，已用 raw.result 兜底镜像');
      }
    } else {
      results = {};
    }
  }

  const errors = raw?.errors;

  return {
    id,
    workflowId,
    status,
    startTime,
    endTime,
    results,
    errors,
  };
}

// ========= 服务层轻量 normalize 兼容 =========
export function normalizeNodeConfig(nodeType: string, config: any): any {
 const t = String(nodeType || '').toLowerCase();
 const isLLM = t === 'llm_call' || t === 'llm';
 const isCode = t === 'code_block' || t === 'code';

 // 小工具
 const trim = (v: any) => (typeof v === 'string' ? v.trim() : v);
 const toNumber = (v: any): number | undefined => {
   if (v === '' || v === null || v === undefined) return undefined;
   if (typeof v === 'number') return v;
   if (typeof v === 'string') {
     const n = v.trim() === '' ? NaN : Number(v);
     return isNaN(n) ? undefined : n;
   }
   return undefined;
 };
 const clamp01 = (n: number | undefined) =>
   typeof n === 'number' ? Math.max(0, Math.min(1, n)) : undefined;

 if (isLLM) {
   const provider = trim(config?.provider ?? config?.llmProvider) || 'gemini';
   const model = trim(config?.model ?? config?.modelName) || 'gemini-2.5-flash';
   const prompt = trim(config?.prompt ?? config?.promptText) || 'Return a single word: ping';
   const system_prompt = trim(config?.system_prompt ?? config?.systemPrompt);
   const temperature = clamp01(toNumber(config?.temperature));
   const max_tokens = toNumber(config?.max_tokens ?? config?.maxTokens);

   const out: any = { provider, model, prompt };
   if (system_prompt) out.system_prompt = system_prompt;
   if (temperature !== undefined) out.temperature = temperature;
   if (max_tokens !== undefined) out.max_tokens = max_tokens;
   return out;
 }

 if (isCode) {
   const template =
     "text = inputs.get('text') or inputs.get('input') or 'hello'\noutput = {'text': f'len={len(str(text))}', 'signal': 1}";
   const code = typeof config?.code === 'string' && config.code.trim().length > 0 ? config.code : template;
   return {
     code_type: 'python',
     code,
   };
 }

 // 其他类型：原样返回
 return config || {};
}

// ========= 工作流API =========
export const workflowApi = {
  // 列出工作流 → 首选 GET /api/v1/visual_workflow/list；回退 GET /visual_workflow/list
  listWorkflows: async (): Promise<ApiResponse<Workflow[]>> => {
    const payload = await requestWithFallback<any>(
      { method: 'GET', url: '/visual_workflow/list' },
      [{ url: buildAbsoluteFallback('/visual_workflow/list') }]
    );
    return toApiResponse<Workflow[]>(payload, (raw) => {
      const arr = Array.isArray(raw) ? raw : (raw?.workflows ?? raw?.data ?? []);
      const list = ensureArray<any>(arr).map((item) => {
        const id = item?.id || item?.workflow_id || '';
        const name = item?.name || '';
        const description = item?.description || '';
        const nodes = ensureArray<WorkflowNode>(item?.nodes ?? []);
        const edges = ensureArray<WorkflowEdge>(item?.edges ?? []);
        const updatedAt =
          item?.updatedAt ||
          item?.updated_at ||
          item?.update_time ||
          new Date().toISOString();
        const createdAt =
          item?.createdAt ||
          item?.created_at ||
          item?.create_time ||
          updatedAt;
        return {
          id,
          name,
          description,
          nodes,
          edges,
          createdAt,
          updatedAt,
        } as Workflow;
      });
      return list;
    });
  },

  // 兼容旧方法名：getWorkflows → listWorkflows
  getWorkflows: async (): Promise<ApiResponse<Workflow[]>> => {
    return workflowApi.listWorkflows();
  },

  // 获取单个工作流 → 首选 GET /api/v1/visual_workflow/get；回退 GET /visual_workflow/get?id={id}
  getWorkflow: async (id: string): Promise<ApiResponse<Workflow>> => {
    const payload = await requestWithFallback<any>(
      { method: 'GET', url: '/visual_workflow/get', params: { id } },
      [{ url: buildAbsoluteFallback(`/visual_workflow/get?id=${encodeURIComponent(id)}`) }]
    );
    return toApiResponse<Workflow>(payload, (raw) => {
      const wfRaw = raw?.workflow ?? raw?.workflow_data ?? raw?.data ?? raw;
      const resultRaw = raw?.result;
      const idVal = wfRaw?.id || wfRaw?.workflow_id || id || '';
      const name = wfRaw?.name || '';
      const description = wfRaw?.description || '';
      let nodes: WorkflowNode[] = ensureArray<WorkflowNode>(wfRaw?.nodes ?? []);
      let edges: WorkflowEdge[] = ensureArray<WorkflowEdge>(wfRaw?.edges ?? []);

      // 若后端返回 raw.result，仅镜像至 data.nodes/edges 并 DEV 警告
      if ((nodes.length === 0 && edges.length === 0) && resultRaw) {
        if ((import.meta as any)?.env?.DEV) {
          console.warn('[getWorkflow] nodes/edges 缺失，已从 raw.result 兜底镜像');
        }
        nodes = ensureArray<WorkflowNode>(resultRaw?.nodes ?? []);
        edges = ensureArray<WorkflowEdge>(resultRaw?.edges ?? []);
      }

      const updatedAt =
        wfRaw?.updatedAt || wfRaw?.updated_at || wfRaw?.update_time || new Date().toISOString();
      const createdAt =
        wfRaw?.createdAt || wfRaw?.created_at || wfRaw?.create_time || updatedAt;

      const wf: Workflow = {
        id: idVal,
        name,
        description,
        nodes,
        edges,
        createdAt,
        updatedAt,
      };
      return wf;
    });
  },

  // 创建工作流 → 首选 POST /api/v1/visual_workflow/create；回退 /visual_workflow/create
  createWorkflow: async (
    name: string,
    description?: string,
    payload?: { nodes?: WorkflowNode[]; edges?: WorkflowEdge[] }
  ): Promise<ApiResponse<Workflow>> => {
    const body: any = {
      name,
      description,
      nodes: ensureArray<WorkflowNode>(payload?.nodes ?? []),
      edges: ensureArray<WorkflowEdge>(payload?.edges ?? []),
    };
    const payloadRes = await requestWithFallback<any>(
      { method: 'POST', url: '/visual_workflow/create', data: body },
      [{ url: buildAbsoluteFallback('/visual_workflow/create') }]
    );
    return toApiResponse<Workflow>(payloadRes, (raw) => {
      const id = raw?.id || raw?.workflow_id || raw?.data?.id || '';
      const now = new Date().toISOString();
      const createdAt = raw?.createdAt || raw?.created_at || now;
      const updatedAt = raw?.updatedAt || raw?.updated_at || now;
      const wf: Workflow = {
        id,
        name: body.name || '',
        description: body.description || '',
        nodes: body.nodes,
        edges: body.edges,
        createdAt,
        updatedAt,
      };
      if (!id && (import.meta as any)?.env?.DEV) {
        console.warn('[createWorkflow] 未从响应中解析到工作流ID，使用空字符串占位');
      }
      return wf;
    });
  },

  // 更新工作流 → 首选 POST /api/v1/visual_workflow/update；回退 /visual_workflow/update
  updateWorkflow: async (
    id: string,
    name?: string,
    description?: string,
    payload?: { nodes?: WorkflowNode[]; edges?: WorkflowEdge[] }
  ): Promise<ApiResponse<Workflow>> => {
    const body: any = {
      id,
      workflow_id: id, // 兼容旧字段
      name,
      description,
      nodes: ensureArray<WorkflowNode>(payload?.nodes ?? []),
      edges: ensureArray<WorkflowEdge>(payload?.edges ?? []),
    };
    const res = await requestWithFallback<any>(
      { method: 'POST', url: '/visual_workflow/update', data: body },
      [{ url: buildAbsoluteFallback('/visual_workflow/update') }]
    );
    const ok = (res?.success === true) || (res === true);
    return { success: ok };
  },

  // 删除工作流 → POST /visual_workflow/delete_workflow
  deleteWorkflow: async (id: string): Promise<ApiResponse<void>> => {
    await requestWithFallback<void>(
      { method: 'POST', url: '/visual_workflow/delete_workflow', data: { workflow_id: id } },
      [{ url: '/visual_workflow/delete' }]
    );
    return { success: true };
  },

  // 执行工作流 → POST /visual_workflow/execute_workflow
  executeWorkflow: async (id: string, inputs?: Record<string, any>): Promise<ApiResponse<WorkflowExecution>> => {
    const payload = await requestWithFallback<any>(
      {
        method: 'POST',
        url: '/visual_workflow/execute_workflow',
        data: { workflow_id: id, input_data: inputs || {} }
      },
      [{ url: '/visual_workflow/execute' }]
    );
    return toApiResponse<WorkflowExecution>(payload, (raw) => mapToWorkflowExecution(id, raw));
  },

   // 获取执行状态 → 首选 POST /api/v1/visual_workflow/get_execution_state；404/405 一次性回退至短路由
   // 兼容提交参数：execution_id 与 workflow_id 均填充为 executionId
   getExecutionStatus: async (executionId: string): Promise<ApiResponse<WorkflowExecution>> => {
     const body = { execution_id: executionId, workflow_id: executionId };
     const fbUrl = buildAbsoluteFallback('/visual_workflow/get_execution_state');
     const payload = await requestWithFallback<any>(
       { method: 'POST', url: '/visual_workflow/get_execution_state', data: body },
       [{ url: fbUrl }]
     );
     return toApiResponse<WorkflowExecution>(payload, (raw) => {
       const state = raw?.state ?? raw;
       if (!state && (import.meta as any)?.env?.DEV) {
         console.warn('[getExecutionStatus] raw.state 缺失，直接使用原始 payload');
       }
       // 将 state 展开映射到 WorkflowExecution
       const hydrated = { ...(state || {}), execution_id: state?.execution_id || executionId };
       return mapToWorkflowExecution(undefined, hydrated);
     });
   },

  // 停止执行 → 后端暂无对应函数；前端占位返回
  stopExecution: async (_executionId: string): Promise<ApiResponse<void>> => {
    // 注意：后端未提供停止接口，若需要请新增函数 visual_workflow.stop_execution
    return Promise.resolve({ success: true });
  },

  // 新增：添加节点 → POST /visual_workflow/add_node
  addNode: async (
    workflowId: string,
    nodeType: string,
    position: { x: number; y: number },
    config: any
  ): Promise<ApiResponse<any>> => {
    // 统一标准化配置，保证与后端期望字段对齐
    const normalizedConfig = normalizeNodeConfig(nodeType, config);
    const body: any = {
      workflow_id: workflowId,
      node_type: nodeType,
      position,
      config: normalizedConfig
    };
    const payload = await api.post('/visual_workflow/add_node', body);
    // 返回 node 或更新后的 workflow，尽量解包 node
    return toApiResponse<any>(payload, (raw) => raw?.node ?? raw?.workflow ?? raw);
  },

  // 新增：连接节点 → 循环调用 POST /visual_workflow/create_connection（无回退，避免“假成功”）
  connectNodes: async (
    workflowId: string,
    connections: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string; dataType?: string; condition?: any }>
  ): Promise<ApiResponse<any>> => {
    for (const c of connections) {
      const body = {
        workflow_id: workflowId,
        source_node_id: c.source,
        target_node_id: c.target,
        source_handle: c.sourceHandle,
        target_handle: c.targetHandle,
        data_type: (c as any).dataType,
        condition: (c as any).condition,
      };
      await api.post('/visual_workflow/create_connection', body);
    }
    return { success: true };
  },
};

// ========= 节点模板API =========
export const nodeTemplateApi = {
  // 获取节点模板 → GET /visual_workflow/get_workflow_templates
  getNodeTemplates: async (): Promise<ApiResponse<any[]>> => {
    const payload = await requestWithFallback<any>(
      { method: 'GET', url: '/visual_workflow/get_workflow_templates' },
      [{ url: '/visual_workflow/get_templates' }]
    );
    return toApiResponse<any[]>(payload, (raw) => {
      const arr = raw?.templates ?? raw;
      if (!Array.isArray(arr) && (import.meta as any)?.env?.DEV) {
        console.warn('[getNodeTemplates] raw.templates 缺失，已容错为空数组');
      }
      return ensureArray<any>(arr);
    });
  },

  // 验证节点配置 → 后端暂未提供
  validateNodeConfig: async (_nodeType: string, _config: any): Promise<ApiResponse<boolean>> => {
    // TODO：若需要严格校验，可新增后端函数 visual_workflow.validate_node_config
    return Promise.resolve({ success: true, data: true });
  },
};

// ========= LLM 提供商 API（保持原实现；如需对接 api.get_models / api.call，可后续扩展） =========
export const llmApi = {
  getProviders: (): Promise<ApiResponse<any[]>> => {
    return api.get('/llm/providers');
  },
  getModels: (provider: string): Promise<ApiResponse<string[]>> => {
    return api.get(`/llm/providers/${provider}/models`);
  },
  testConnection: (provider: string, config: any): Promise<ApiResponse<boolean>> => {
    return api.post(`/llm/providers/${provider}/test`, config);
  },
};
// ========= 凭证统一API（连接/测试，带一次性路由回退） =========
export const credsApi = {
  // 获取模型列表：首选 /api/v1/visual_workflow/get_models，404/405 一次回退到旧短路由（相同段名以便兼容）
  getModels: async (
    provider: string,
    baseUrl?: string,
    apiKey?: string
  ): Promise<{ success: boolean; models: string[]; detail?: string }> => {
    try {
      const body = { provider, base_url: baseUrl, api_key: apiKey };
      const fbUrl_models = (() => {
        try {
          const u = new URL(BASE_URL);
          const origin = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
          return `${origin}/visual_workflow/get_models`;
        } catch {
          const origin = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
          return `${origin}/visual_workflow/get_models`;
        }
      })();
      const payload = await requestWithFallback<any>(
        { method: 'POST', url: '/visual_workflow/get_models', data: body },
        [{ url: fbUrl_models }]
      );

      // 健壮解析：data.models -> models -> result.models；否则 []
      const raw = payload as any;
      const modelsRaw =
        (raw?.data && raw.data?.models) ??
        raw?.models ??
        (raw?.result && raw.result?.models);

      const models =
        Array.isArray(modelsRaw)
          ? (modelsRaw as any[]).filter((m) => typeof m === 'string')
          : [];

      if (Array.isArray(modelsRaw)) {
        return { success: true, models };
      }

      // 200 但返回体不可识别，视为失败
      const detail =
        typeof raw?.detail === 'string'
          ? raw.detail
          : typeof raw?.message === 'string'
          ? raw.message
          : '未识别的响应结构';
      return { success: false, models: [], detail };
    } catch (err: any) {
      return {
        success: false,
        models: [],
        detail: err?.message || '请求失败',
      };
    }
  },

  // 最小连通性测试：首选 /api/v1/visual_workflow/test_provider，404/405 一次回退旧短路由
  testProvider: async (
    provider: string,
    baseUrl?: string,
    apiKey?: string
  ): Promise<{ success: boolean; detail?: string }> => {
    try {
      const body = { provider, base_url: baseUrl, api_key: apiKey };
      const fbUrl_test = (() => {
        try {
          const u = new URL(BASE_URL);
          const origin = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
          return `${origin}/visual_workflow/test_provider`;
        } catch {
          const origin = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
          return `${origin}/visual_workflow/test_provider`;
        }
      })();
      const payload = await requestWithFallback<any>(
        { method: 'POST', url: '/visual_workflow/test_provider', data: body },
        [{ url: fbUrl_test }]
      );

      const raw = payload as any;
      const success =
        raw?.success === true ||
        raw?.ok === true ||
        raw === true ||
        String(raw?.result || '').toLowerCase() === 'ok';

      const detail =
        typeof raw?.detail === 'string'
          ? raw.detail
          : typeof raw?.message === 'string'
          ? raw.message
          : undefined;

      return { success, detail };
    } catch (err: any) {
      return { success: false, detail: err?.message || '请求失败' };
    }
  },
};

// ========== WebSocket 实时通信 ==========
export interface WebSocketMessage {
  type: 'execution_start' | 'node_state_change' | 'data_flow' | 'execution_complete' | 'execution_failed' | 'breakpoint_hit' | string;
  // 兼容 SSoT：run_id|execution_id、ts|timestamp
  run_id?: string;
  execution_id?: string;
  workflow_id?: string;
  node_id?: string;
  status?: string;
  result?: any;
  error?: string;
  seq?: number | string;
  ts?: number | string;
  flow?: {
    from_node: string;
    to_node: string;
    data: any;
    timestamp: number;
  } | any;
  state?: any;
  timestamp?: number;
}

export type WebSocketEventHandler = (message: WebSocketMessage) => void;

export interface WebSocketSubscription {
  id: string;
  handler: WebSocketEventHandler;
  topics?: string[];
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, WebSocketSubscription> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private shouldReconnect = true;
  private currentUrl = '';

  // 连接到WebSocket
  connect(workflowId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        reject(new Error('WebSocket连接正在进行中'));
        return;
      }

      // 计算WebSocket地址：优先 VITE_WS_URL，其次从 BASE_URL 推导 ws(s)://host:port/ws
      let url = '';
      const WS_ENV: string | undefined = (import.meta as any)?.env?.VITE_WS_URL;
      if (WS_ENV) {
        url = WS_ENV;
      } else {
        let wsOrigin = '';
        try {
          const u = new URL(BASE_URL);
          const protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
          wsOrigin = `${protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
        } catch {
          // 若 BASE_URL 不是绝对地址，退化到 window.location
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsOrigin = `${protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
        }
        url = `${wsOrigin}/ws`;
      }

      this.currentUrl = url;
      this.isConnecting = true;

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('✓ WebSocket连接已建立:', url);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const dataRaw: any = event.data;

            // 屏蔽 ping/pong：纯文本 "ping"/"pong"
            if (typeof dataRaw === 'string') {
              const s = dataRaw.trim();
              if (s === 'ping') {
                try { this.ws?.send('pong'); } catch {}
                return;
              }
              if (s === 'pong') {
                // 不上抛
                return;
              }
            }

            // 解析 JSON；若为 {"type":"ping"} 或 {"type":"pong"} 则拦截（ping 需回 pong）
            if (typeof dataRaw === 'string') {
              try {
                const parsed = JSON.parse(dataRaw);
                if (parsed && typeof parsed === 'object' && (parsed.type === 'ping' || parsed.type === 'pong')) {
                  if (parsed.type === 'ping') {
                    try { this.ws?.send(JSON.stringify({ type: 'pong' })); } catch {}
                  }
                  return;
                }
                const message: WebSocketMessage = parsed;
                this.handleMessage(message);
                return;
              } catch (e) {
                // 非 JSON 文本，忽略
                console.error('WebSocket消息解析失败:', e, dataRaw);
                return;
              }
            }

            // 其他类型（ArrayBuffer/Blob）不处理
          } catch (error) {
            console.error('WebSocket消息处理异常:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket连接已关闭:', event.code, event.reason);
          this.isConnecting = false;
          this.ws = null;

          if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket连接错误:', error);
          this.isConnecting = false;
          reject(error);
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  // 断开连接
  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // 重连尝试
  private attemptReconnect() {
    if (!this.shouldReconnect || this.isConnecting) return;

    this.reconnectAttempts++;
    const uncapped = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    const delay = Math.min(uncapped, 10000); // 上限 10s

    console.log(`WebSocket重连尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts}，${delay}ms后重试...`);

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect().catch(error => {
          console.error('WebSocket重连失败:', error);
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('WebSocket重连次数已达上限，停止重连');
            this.notifySubscribers({
              type: 'execution_failed',
              error: 'WebSocket连接失败',
              timestamp: Date.now()
            });
          }
        });
      }
    }, delay);
  }

  // 处理收到的消息
  private handleMessage(message: WebSocketMessage) {
    console.log('WebSocket收到消息:', message);
    this.notifySubscribers(message);
  }

  // 通知所有订阅者
  private notifySubscribers(message: WebSocketMessage) {
    this.subscriptions.forEach(subscription => {
      try {
        // 检查主题过滤
        if (subscription.topics && subscription.topics.length > 0) {
          const messageTopics = this.getMessageTopics(message);
          const hasMatchingTopic = subscription.topics.some(topic =>
            messageTopics.includes(topic)
          );
          if (!hasMatchingTopic) return;
        }

        subscription.handler(message);
      } catch (error) {
        console.error('WebSocket事件处理器执行失败:', error, subscription.id);
      }
    });
  }

  // 获取消息相关的主题
  private getMessageTopics(message: WebSocketMessage): string[] {
    const topics: string[] = [message.type];
    const runId = (message as any).run_id || message.execution_id;
    if (message.workflow_id) topics.push(`workflow:${message.workflow_id}`);
    if (message.node_id) topics.push(`node:${message.node_id}`);
    if (message.execution_id) topics.push(`execution:${message.execution_id}`);
    if (runId) topics.push(`run:${runId}`);
    return topics;
  }

  // 订阅WebSocket事件
  subscribe(handler: WebSocketEventHandler, topics?: string[]): string {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      handler,
      topics
    });
    return subscriptionId;
  }

  // 取消订阅
  unsubscribe(subscriptionId: string) {
    this.subscriptions.delete(subscriptionId);
  }

  // 发送消息到服务器
  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket未连接，无法发送消息:', message);
    }
  }

  // 获取连接状态
  getConnectionState(): 'connecting' | 'open' | 'closing' | 'closed' {
    if (this.isConnecting) return 'connecting';
    if (!this.ws) return 'closed';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'open';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'closed';
      default: return 'closed';
    }
  }

  // 检查是否已连接
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// 全局WebSocket管理器实例
const webSocketManager = new WebSocketManager();


// WebSocket API接口
export const websocketApi = {
  // 连接到工作流WebSocket
  connectToWorkflow: (workflowId: string): Promise<void> => {
    return webSocketManager.connect(workflowId);
  },

  // 连接到监控WebSocket
  connectToMonitor: (): Promise<void> => {
    return webSocketManager.connect();
  },

  // 断开WebSocket连接
  disconnect: () => {
    webSocketManager.disconnect();
  },

  // 订阅WebSocket事件
  subscribe: (handler: WebSocketEventHandler, topics?: string[]): string => {
    return webSocketManager.subscribe(handler, topics);
  },

  // 取消订阅事件
  unsubscribe: (subscriptionId: string) => {
    webSocketManager.unsubscribe(subscriptionId);
  },

  // 发送消息
  send: (message: any) => {
    webSocketManager.send(message);
  },

  // 获取连接状态
  getConnectionState: () => {
    return webSocketManager.getConnectionState();
  },

  // 检查连接状态
  isConnected: () => {
    return webSocketManager.isConnected();
  }
};

// 系统与便捷API
export const systemApi = {
  // 健康检查：优先 /health，回退 /visual_workflow/health
  health: async (): Promise<boolean> => {
    try {
      const res = await api.get('/health');
      return !!res;
    } catch {
      try {
        const res2 = await api.get('/visual_workflow/health');
        return !!res2;
      } catch {
        return false;
      }
    }
  },

  // 便捷WS连接：可选传 workflowId
  connectWS: (workflowId?: string) => {
    if (workflowId) {
      return websocketApi.connectToWorkflow(workflowId);
    }
    return websocketApi.connectToMonitor();
  }
};
// 调试和监控API扩展（这些路由已符合函数式风格）
export const debugApi = {
  // 设置断点
  setBreakpoint: (workflowId: string, nodeId: string, enabled: boolean): Promise<ApiResponse<void>> => {
    return api.post('/visual_workflow/set_breakpoint', {
      workflow_id: workflowId,
      node_id: nodeId,
      enabled
    });
  },

  // 单步执行
  stepExecute: (workflowId: string, executionId?: string): Promise<ApiResponse<any>> => {
    return api.post('/visual_workflow/step_execute', {
      workflow_id: workflowId,
      execution_id: executionId
    });
  },

  // 获取节点数据
  getNodeData: (workflowId: string, nodeId: string, executionId?: string): Promise<ApiResponse<any>> => {
    return api.post('/visual_workflow/get_node_data', {
      workflow_id: workflowId,
      node_id: nodeId,
      execution_id: executionId
    });
  },

  // 获取执行日志
  getExecutionLog: (workflowId: string, executionId?: string): Promise<ApiResponse<any[]>> => {
    return api.post('/visual_workflow/get_execution_log', {
      workflow_id: workflowId,
      execution_id: executionId
    });
  },

  // 启用/禁用调试模式
  enableDebugMode: (workflowId: string, enabled: boolean): Promise<ApiResponse<void>> => {
    return api.post('/visual_workflow/enable_debug_mode', {
      workflow_id: workflowId,
      enabled
    });
  }
};

// 实时监控Hooks工厂函数
export const createMonitoringHooks = () => {
  let subscriptionId: string | null = null;

  return {
    // 开始监控
    startMonitoring: (workflowId: string, onMessage: WebSocketEventHandler) => {
      return websocketApi.connectToWorkflow(workflowId).then(() => {
        subscriptionId = websocketApi.subscribe(onMessage, [`workflow:${workflowId}`]);
      });
    },

    // 停止监控
    stopMonitoring: () => {
      if (subscriptionId) {
        websocketApi.unsubscribe(subscriptionId);
        subscriptionId = null;
      }
      websocketApi.disconnect();
    },

    // 监控特定节点
    monitorNode: (nodeId: string, onMessage: WebSocketEventHandler) => {
      const nodeSubscriptionId = websocketApi.subscribe(onMessage, [`node:${nodeId}`]);
      return () => websocketApi.unsubscribe(nodeSubscriptionId);
    }
  };
};

export default api;