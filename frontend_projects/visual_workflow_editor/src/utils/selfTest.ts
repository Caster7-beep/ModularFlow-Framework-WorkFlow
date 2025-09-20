/**
 * 快速自检（五项）：Health / Docs / WS / LLM / CodeBlock
 * - 不新增 ws.ts，WS 检测使用原生 WebSocket 即时连接 /ws
 * - 不修改 ExecutionMonitor 与 api.ts 的 WS 逻辑（M2-2 再做）
 * - 结果写入 window.__qaHooks.lastSelfTest
 */
import { workflowApi, websocketApi } from '../services/api';

// ====== 类型定义 ======
export interface SelfTestItem {
  name: 'Health' | 'Docs' | 'WS' | 'LLM' | 'CodeBlock';
  pass: boolean;
  detail: string;
}
export interface SelfTestSummary {
  items: SelfTestItem[];
  timestamp: string; // ISO8601
}

export interface SelfTestSegmentResult {
  pass: boolean;
  output: string;
  error?: string;
}

// ====== URL 推导 ======
function getApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
  return envBase || 'http://localhost:6502/api/v1';
}
function getHttpOriginFromBase(apiBase: string): string {
  try {
    const u = new URL(apiBase);
    return `${u.protocol}//${u.host}`;
  } catch {
    return `${window.location.protocol}//${window.location.host}`;
  }
}
function getWsUrl(): string {
  const envWs = (import.meta as any)?.env?.VITE_WS_URL as string | undefined;
  if (envWs) return envWs;
  try {
    const base = getApiBase();
    const u = new URL(base);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${u.host}/ws`;
  } catch {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
}

// ====== 通用工具 ======
function withTimeout<T>(p: Promise<T>, ms: number, timeoutMsg = 'timeout'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
    p.then(v => {
      clearTimeout(timer);
      resolve(v);
    }).catch(err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// 从执行结果中提取文本
function extractFinalText(result: any): string {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result.text === 'string') return result.text;
  if (typeof result.output === 'string') return result.output;
  if (result.output && typeof result.output.text === 'string') return result.output.text;
  if (result.final && typeof result.final.text === 'string') return result.final.text;
  if (result.results && typeof result.results.text === 'string') return result.results.text;

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

// 保障已有 WS 连接以便后续 LLM/Code 测试采样事件（不影响本任务 WS 自检）
async function ensureWS(): Promise<void> {
  try {
    if (!websocketApi.isConnected()) {
      await websocketApi.connectToMonitor();
    }
  } catch {
    // 忽略连接失败，不影响自检流程
  }
}

// ====== 五项测试实现 ======
async function testHealth(): Promise<SelfTestItem> {
  const base = getApiBase();
  const origin = getHttpOriginFromBase(base);
  const url = `${origin}/api/v1/health`;
  try {
    const res = await withTimeout(fetch(url, { method: 'GET' }), 2500, 'health timeout');
    if (!res.ok) {
      return { name: 'Health', pass: false, detail: `HTTP ${res.status}` };
    }
    const j = await res.json().catch(() => ({}));
    const statusOk = j?.status === 'ok';
    const svcOk = j?.service === 'visual_work_flow';
    const pass = !!statusOk && !!svcOk;
    return {
      name: 'Health',
      pass,
      detail: `status=${String(j?.status)} service=${String(j?.service)}`
    };
  } catch (e: any) {
    return { name: 'Health', pass: false, detail: e?.message || 'health error' };
  }
}

async function testDocs(): Promise<SelfTestItem> {
  const base = getApiBase();
  const origin = getHttpOriginFromBase(base);
  // 首选 /docs（一般为 Swagger/文档页），回退 /api/v1/visual_workflow/list
  try {
    const res = await withTimeout(fetch(`${origin}/docs`, { method: 'GET' }), 2500, 'docs timeout');
    if (res.ok) {
      const text = await res.text().catch(() => '');
      const hasKey = /visual[_-]?work\s*flow|visual[_-]?workflow/i.test(text);
      return {
        name: 'Docs',
        pass: hasKey,
        detail: hasKey ? '/docs ok' : '/docs ok but keyword missing'
      };
    }
  } catch {
    // ignore and try fallback
  }

  try {
    const res2 = await withTimeout(fetch(`${origin}/api/v1/visual_workflow/list`, { method: 'GET' }), 2500, 'list timeout');
    if (!res2.ok) {
      return { name: 'Docs', pass: false, detail: `Fallback HTTP ${res2.status}` };
    }
    const j = await res2.json().catch(() => ({}));
    const hasKey = j && (j.workflows !== undefined || j.visual_workflow !== undefined || j.visualWorkflow !== undefined);
    return {
      name: 'Docs',
      pass: !!hasKey,
      detail: hasKey ? '/visual_workflow/list ok' : 'list ok but field missing'
    };
  } catch (e: any) {
    return { name: 'Docs', pass: false, detail: e?.message || 'docs error' };
  }
}

async function testWS(): Promise<SelfTestItem> {
  const wsURL = getWsUrl();
  // 使用 any 以避免在某些严格 DOM 类型环境下的窄化问题
  let ws: any = null;
  let gotTextPong = false;
  let gotJsonPong = false;
 
  const detailFail = (msg: string) => ({ name: 'WS' as const, pass: false, detail: msg });
 
  try {
    const result = await withTimeout(new Promise<boolean>((resolve, reject) => {
      try {
        ws = new WebSocket(wsURL);
      } catch (e: any) {
        reject(e);
        return;
      }
 
      const closeSafely = () => {
        try { if (ws && typeof ws.close === 'function') ws.close(); } catch {}
        ws = null;
      };
 
      let opened = false;
 
      const finish = () => {
        closeSafely();
        resolve(gotTextPong && gotJsonPong);
      };
 
      const onOpen = () => {
        opened = true;
        // 发送文本 "ping"
        try { ws?.send('ping'); } catch {}
        // 发送 JSON {"type":"ping"}
        try { ws?.send(JSON.stringify({ type: 'ping' })); } catch {}
      };
 
      const onMessage = (ev: any) => {
        try {
          const data = ev?.data;
          if (typeof data === 'string') {
            // 文本通道
            if (data.trim().toLowerCase() === 'pong') {
              gotTextPong = true;
            } else {
              // 尝试解析 JSON
              try {
                const j = JSON.parse(data);
                if (j && j.type === 'pong') {
                  gotJsonPong = true;
                }
              } catch {
                // 非 JSON，忽略
              }
            }
          } else {
            // 二进制忽略
          }
          if (gotTextPong && gotJsonPong) {
            finish();
          }
        } catch {
          // ignore
        }
      };
 
      const onError = (_e: any) => {
        // 连接错误时，若尚未打开，直接失败；若已打开则等待超时/现状
        if (!opened) {
          try { if (ws && typeof ws.close === 'function') ws.close(); } catch {}
          reject(new Error('ws error'));
        }
      };
 
      const onClose = () => {
        // 若在未满足条件时被动关闭，则按当前标志返回
        resolve(gotTextPong && gotJsonPong);
      };
 
      if (!ws) {
        reject(new Error('ws init failed'));
        return;
      }
      ws.onopen = onOpen;
      ws.onmessage = onMessage;
      ws.onerror = onError;
      ws.onclose = onClose;
    }), 3000, 'ws timeout');
 
    if (result) {
      return { name: 'WS', pass: true, detail: 'ping/pong ok' };
    }
    // 优先以文本通路为断言，但若 JSON 未达也算失败
    const d = gotTextPong ? 'text ok, json fail' : (gotJsonPong ? 'json ok, text fail' : 'no pong');
    return detailFail(d);
  } catch (e: any) {
    try { if (ws && typeof ws.close === 'function') ws.close(); } catch {}
    return detailFail(e?.message || 'ws error');
  }
}

// ====== LLM / CodeBlock 段（沿用现有最小工作流构造） ======
async function createWorkflowQuick(name: string, description?: string): Promise<string> {
  const res = await workflowApi.createWorkflow(name, description);
  if (!res.success || !res.data?.id) {
    throw new Error('创建工作流失败');
  }
  return res.data.id;
}

async function getNodeIdByLabel(workflowId: string, label: string): Promise<string> {
  const wf = await workflowApi.getWorkflow(workflowId);
  if (!wf.success || !wf.data) throw new Error('获取工作流失败');
  const node = wf.data.nodes.find((n: any) => n.data?.label === label);
  if (!node) throw new Error(`未找到节点: ${label}`);
  return node.id;
}

async function runSegmentLLM(): Promise<SelfTestSegmentResult> {
  try {
    await ensureWS();

    const wfId = await createWorkflowQuick('SelfTest-LLM', 'Quick smoke for LLM node');
    const labelInput = 'SelfTest_Input_A';
    const labelLLM = 'SelfTest_LLM_A';
    const labelOutput = 'SelfTest_Output_A';

    await workflowApi.addNode(wfId, 'input', { x: 50, y: 100 }, { label: labelInput });
    await workflowApi.addNode(wfId, 'llm', { x: 250, y: 100 }, {
      label: labelLLM,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      prompt: 'Return a single word: ping'
    });
    await workflowApi.addNode(wfId, 'output', { x: 450, y: 100 }, { label: labelOutput });

    const inputId = await getNodeIdByLabel(wfId, labelInput);
    const llmId = await getNodeIdByLabel(wfId, labelLLM);
    const outputId = await getNodeIdByLabel(wfId, labelOutput);

    await workflowApi.connectNodes(wfId, [
      { source: inputId, target: llmId, sourceHandle: 'output', targetHandle: 'input' },
      { source: llmId, target: outputId, sourceHandle: 'output', targetHandle: 'input' }
    ]);

    const exec = await workflowApi.executeWorkflow(wfId, {});
    if (!exec.success || !exec.data) {
      return { pass: false, output: '', error: '执行失败' };
    }

    const out = extractFinalText((exec.data as any).results || exec.data);
    const normalized = (out || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
    const pass = normalized.toLowerCase() === 'ping';
    return { pass, output: out || '' };
  } catch (e: any) {
    return { pass: false, output: '', error: e?.message || 'LLM 段异常' };
  }
}

async function runSegmentCode(): Promise<SelfTestSegmentResult> {
  try {
    await ensureWS();

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

    const exec = await workflowApi.executeWorkflow(wfId, { text: 'hello' });
    if (!exec.success || !exec.data) {
      return { pass: false, output: '', error: '执行失败' };
    }

    const out = extractFinalText((exec.data as any).results || exec.data);
    const normalized = (out || '').trim();
    const pass = normalized === 'len=5';
    return { pass, output: out || '' };
  } catch (e: any) {
    return { pass: false, output: '', error: e?.message || 'Code 段异常' };
  }
}

async function testLLM(): Promise<SelfTestItem> {
  const r = await runSegmentLLM();
  return {
    name: 'LLM',
    pass: r.pass,
    detail: r.pass ? 'Final=ping' : `error=${r.error || ''} output=${r.output || ''}`.trim()
  };
}
async function testCodeBlock(): Promise<SelfTestItem> {
  const r = await runSegmentCode();
  return {
    name: 'CodeBlock',
    pass: r.pass,
    detail: r.pass ? 'Final=len=5' : `error=${r.error || ''} output=${r.output || ''}`.trim()
  };
}

// ====== 统一入口 ======
export async function runQuickSelfTest(): Promise<SelfTestSummary> {
  const items: SelfTestItem[] = [];

  // 各项互不阻塞，失败不影响后续执行（顺序执行以降低后端压力）
  try { items.push(await testHealth()); } catch (e: any) { items.push({ name: 'Health', pass: false, detail: e?.message || 'health failed' }); }
  try { items.push(await testDocs()); } catch (e: any) { items.push({ name: 'Docs', pass: false, detail: e?.message || 'docs failed' }); }
  try { items.push(await testWS()); } catch (e: any) { items.push({ name: 'WS', pass: false, detail: e?.message || 'ws failed' }); }
  try { items.push(await testLLM()); } catch (e: any) { items.push({ name: 'LLM', pass: false, detail: e?.message || 'llm failed' }); }
  try { items.push(await testCodeBlock()); } catch (e: any) { items.push({ name: 'CodeBlock', pass: false, detail: e?.message || 'code failed' }); }

  const summary: SelfTestSummary = {
    items,
    timestamp: new Date().toISOString()
  };

  // 将结果写入 window.__qaHooks.lastSelfTest
  try {
    const w = window as any;
    if (!w.__qaHooks) w.__qaHooks = {};
    w.__qaHooks.lastSelfTest = summary;
  } catch {
    // ignore
  }

  return summary;
}