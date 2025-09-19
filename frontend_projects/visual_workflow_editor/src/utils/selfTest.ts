// 自检逻辑封装：最小工作流（LLM 与 CodeBlock）构建、执行与 WS 事件采集
// 仅用于“快速自检”，不影响正常编辑器逻辑
import { workflowApi, websocketApi } from '../services/api';
import type { ApiResponse, Workflow } from '../types/workflow';

export interface SelfTestSegmentResult {
  pass: boolean;
  output: string;
  error?: string;
}

export interface SelfTestResult {
  llm: SelfTestSegmentResult;
  code: SelfTestSegmentResult;
  events: string[]; // 采集到的 WS 事件类型（最后 20 条）
}

// 保障 WS 连接；若已连接则复用
async function ensureWS(): Promise<void> {
  try {
    if (!websocketApi.isConnected()) {
      await websocketApi.connectToMonitor();
    }
  } catch {
    // 忽略 WS 连接错误，不阻塞自检流程
  }
}

function trimTo20<T>(arr: T[]): T[] {
  const max = 20;
  if (arr.length <= max) return arr.slice();
  return arr.slice(arr.length - max);
}

// 粗略从执行结果中抽取最终文本
function extractFinalText(result: any): string {
  if (!result) return '';
  // 常见字段
  if (typeof result === 'string') return result;
  if (typeof result.text === 'string') return result.text;
  if (typeof result.output === 'string') return result.output;
  if (result.output && typeof result.output.text === 'string') return result.output.text;
  if (result.final && typeof result.final.text === 'string') return result.final.text;
  if (result.results && typeof result.results.text === 'string') return result.results.text;

  // 遍历尝试获取一个字符串字段
  try {
    const flat: string[] = [];
    const dfs = (v: any) => {
      if (!v) return;
      if (typeof v === 'string') {
        flat.push(v);
      } else if (Array.isArray(v)) {
        v.forEach(dfs);
      } else if (typeof v === 'object') {
        Object.values(v).forEach(dfs);
      }
    };
    dfs(result);
    const candidate = flat.find((s) => s && s.trim().length > 0);
    return candidate || '';
  } catch {
    return '';
  }
}

// 创建工作流（使用字符串签名）
async function createWorkflowQuick(name: string, description?: string): Promise<string> {
  const res = await workflowApi.createWorkflow(name, description);
  if (!res.success || !res.data?.id) {
    throw new Error('创建工作流失败');
  }
  return res.data.id;
}

// 为了稳妥获取节点ID：添加节点后统一 getWorkflow，根据 label 精确匹配
async function getNodeIdByLabel(workflowId: string, label: string): Promise<string> {
  const wf = await workflowApi.getWorkflow(workflowId);
  if (!wf.success || !wf.data) throw new Error('获取工作流失败');
  const node = wf.data.nodes.find((n) => n.data?.label === label);
  if (!node) throw new Error(`未找到节点: ${label}`);
  return node.id;
}

// 运行 LLM 段：输入 → LLM → 输出（prompt 固定 "Return a single word: ping"）
async function runSegmentLLM(eventsBuffer: string[]): Promise<SelfTestSegmentResult> {
  try {
    await ensureWS();

    // 订阅 WS 事件
    const subId = websocketApi.subscribe((msg) => {
      if (msg?.type) {
        eventsBuffer.push(msg.type);
        // 控制数量
        if (eventsBuffer.length > 40) {
          eventsBuffer.splice(0, eventsBuffer.length - 40);
        }
      }
    });

    const wfId = await createWorkflowQuick('SelfTest-LLM', 'Quick smoke for LLM node');
    // 三个节点：Input, LLM, Output —— 使用独特 label 便于定位
    const labelInput = 'SelfTest_Input_A';
    const labelLLM = 'SelfTest_LLM_A';
    const labelOutput = 'SelfTest_Output_A';

    // addNode: input
    await workflowApi.addNode(wfId, 'input', { x: 50, y: 100 }, { label: labelInput });
    // addNode: llm
    await workflowApi.addNode(wfId, 'llm', { x: 250, y: 100 }, {
      label: labelLLM,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      prompt: 'Return a single word: ping'
    });
    // addNode: output
    await workflowApi.addNode(wfId, 'output', { x: 450, y: 100 }, { label: labelOutput });

    // 获取节点ID
    const inputId = await getNodeIdByLabel(wfId, labelInput);
    const llmId = await getNodeIdByLabel(wfId, labelLLM);
    const outputId = await getNodeIdByLabel(wfId, labelOutput);

    // 连接：input -> llm -> output
    await workflowApi.connectNodes(wfId, [
      { source: inputId, target: llmId, sourceHandle: 'output', targetHandle: 'input' },
      { source: llmId, target: outputId, sourceHandle: 'output', targetHandle: 'input' }
    ]);

    const exec = await workflowApi.executeWorkflow(wfId, {}); // A 段不依赖输入
    if (!exec.success || !exec.data) {
      websocketApi.unsubscribe(subId);
      return { pass: false, output: '', error: '执行失败' };
    }

    // 解包结果
    const out = extractFinalText(exec.data.results || exec.data);
    const normalized = (out || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
    const pass = normalized.toLowerCase() === 'ping';

    websocketApi.unsubscribe(subId);
    return { pass, output: out || '' };
  } catch (e: any) {
    return { pass: false, output: '', error: e?.message || 'LLM 段异常' };
  }
}

// 运行 Code 段：输入 → 代码块 → 输出（python 计算文本长度，期望 len=5）
async function runSegmentCode(eventsBuffer: string[]): Promise<SelfTestSegmentResult> {
  try {
    await ensureWS();

    // 订阅 WS 事件
    const subId = websocketApi.subscribe((msg) => {
      if (msg?.type) {
        eventsBuffer.push(msg.type);
        if (eventsBuffer.length > 40) {
          eventsBuffer.splice(0, eventsBuffer.length - 40);
        }
      }
    });

    const wfId = await createWorkflowQuick('SelfTest-Code', 'Quick smoke for Code node');
    const labelInput = 'SelfTest_Input_B';
    const labelCode = 'SelfTest_Code_B';
    const labelOutput = 'SelfTest_Output_B';

    await workflowApi.addNode(wfId, 'input', { x: 50, y: 220 }, { label: labelInput });
    await workflowApi.addNode(wfId, 'code', { x: 250, y: 220 }, {
      label: labelCode,
      language: 'python',
      code: [
        "text = inputs.get('text') or inputs.get('input') or 'hello'",
        "output = {'text': f'len={len(str(text))}', 'signal': 1}",
      ].join('\n'),
    });
    await workflowApi.addNode(wfId, 'output', { x: 450, y: 220 }, { label: labelOutput });

    const inputId = await getNodeIdByLabel(wfId, labelInput);
    const codeId = await getNodeIdByLabel(wfId, labelCode);
    const outputId = await getNodeIdByLabel(wfId, labelOutput);

    await workflowApi.connectNodes(wfId, [
      { source: inputId, target: codeId, sourceHandle: 'output', targetHandle: 'input' },
      { source: codeId, target: outputId, sourceHandle: 'output', targetHandle: 'input' }
    ]);

    // 传入 text='hello' 期望 len=5
    const exec = await workflowApi.executeWorkflow(wfId, { text: 'hello' });
    if (!exec.success || !exec.data) {
      websocketApi.unsubscribe(subId);
      return { pass: false, output: '', error: '执行失败' };
    }

    const out = extractFinalText(exec.data.results || exec.data);
    const normalized = (out || '').trim();
    const pass = normalized === 'len=5';

    websocketApi.unsubscribe(subId);
    return { pass, output: out || '' };
  } catch (e: any) {
    return { pass: false, output: '', error: e?.message || 'Code 段异常' };
  }
}

export async function runQuickSelfTest(): Promise<SelfTestResult> {
  const events: string[] = [];

  const llm = await runSegmentLLM(events);
  const code = await runSegmentCode(events);

  // 统一返回最后 20 条事件类型（不暴露敏感信息）
  return {
    llm,
    code,
    events: trimTo20(events),
  };
}