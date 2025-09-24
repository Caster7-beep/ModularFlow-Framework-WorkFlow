/**
 * 快速自检（五项）：Health / Docs / WS / LLM / CodeBlock
 * - 不新增 ws.ts，WS 检测使用原生 WebSocket 即时连接 /ws
 * - 不修改 ExecutionMonitor 与 api.ts 的 WS 逻辑（M2-2 再做）
 * - 结果写入 window.__qaHooks.lastSelfTest
 */
import { workflowApi, websocketApi } from '../services/api';
import { loadCredentials } from './credentials';

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
  provider?: string;
  model?: string;
  polled?: number;
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

// 文本归一化：去掉首尾引号、trim、合并多余空白与换行
function normalizeText(s: string): string {
  try {
    if (s === undefined || s === null) return '';
    let t = String(s);
    t = t.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1);
    }
    t = t.replace(/\r\n/g, '\n');
    // 将换行统一为空格，并压缩连续空白
    t = t.replace(/\n+/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
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

// 轻量轮询执行结果，等待至 completed 或拿到 outputs（<=2s）
async function pollExecutionResult(executionId: string, initial?: any, maxWaitMs = 2000, stepMs = 200): Promise<{ final: any; polled: number }> {
  let last = initial;
  let polled = 0;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const res = await workflowApi.getExecutionStatus(executionId);
      if (res?.success && res.data) {
        last = res.data;
        polled++;
        const st = String((last as any)?.status || '').toLowerCase();
        const hasOutputs = !!(last as any)?.results && Object.keys((last as any).results || {}).length > 0;
        if (st === 'completed' || st === 'failed' || hasOutputs) break;
      } else {
        polled++;
      }
    } catch {
      polled++;
    }
    await new Promise(r => setTimeout(r, stepMs));
  }
  return { final: last, polled };
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

  // 记录探测链路
  const tried: string[] = [];
  const addTried = (p: string) => { tried.push(p); };

  // 统一 detail 构造，附带 tried/hit 与类型
  const makeDetail = (status: 'PASS' | 'FAIL', via?: string, type?: 'html' | 'openapi' | 'list200') => {
    const triedStr = `[${tried.map(s => `'${s}'`).join(',')}]`;
    const hitStr = via ? `, hit='${via}'` : '';
    const typeStr = type ? `, type=${type}` : '';
    return `Docs: ${status}${via ? ` via ${via}` : ''}${typeStr} tried=${triedStr}${hitStr}`.trim();
  };

  // HTML 文档判定：content-type 包含 text/html
  const checkHtml = async (path: string): Promise<SelfTestItem | null> => {
    addTried(path);
    try {
      const res = await withTimeout(fetch(`${origin}${path}`, { method: 'GET', redirect: 'follow' }), 2500, 'docs timeout');
      if (res.ok) {
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) {
          return { name: 'Docs', pass: true, detail: makeDetail('PASS', path, 'html') };
        }
      }
    } catch {
      // 继续下一候选
    }
    return null;
  };

  // OpenAPI 判定：JSON 含 openapi 与 paths 为对象
  const checkOpenapi = async (path: string): Promise<SelfTestItem | null> => {
    addTried(path);
    try {
      const res = await withTimeout(fetch(`${origin}${path}`, { method: 'GET', redirect: 'follow' }), 2500, 'docs timeout');
      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j && j.openapi && j.paths && typeof j.paths === 'object') {
          return { name: 'Docs', pass: true, detail: makeDetail('PASS', path, 'openapi') };
        }
      }
    } catch {
      // 继续下一候选
    }
    return null;
  };

  // 最后兜底：仅需 HTTP 200
  const checkList200 = async (path: string): Promise<SelfTestItem | null> => {
    addTried(path);
    try {
      const res = await withTimeout(fetch(`${origin}${path}`, { method: 'GET', redirect: 'follow' }), 2500, 'docs timeout');
      if (res.ok) {
        return { name: 'Docs', pass: true, detail: makeDetail('PASS', path, 'list200') };
      }
    } catch {
      // 继续下一候选
    }
    return null;
  };

  // 顺序探测（命中任一即 PASS）
  let r = await checkHtml('/docs');
  if (r) return r;

  r = await checkHtml('/redoc');
  if (r) return r;

  r = await checkOpenapi('/openapi.json');
  if (r) return r;

  // 回退新前缀 /api/v1
  r = await checkOpenapi('/api/v1/openapi.json');
  if (r) return r;

  r = await checkList200('/api/v1/visual_workflow/list');
  if (r) return r;

  // 全部未命中则 FAIL，并附探测链路
  return { name: 'Docs', pass: false, detail: makeDetail('FAIL') };
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

    // 与活动凭证对齐：读取本地 store
    const store = loadCredentials();
    const activeId = store.active_group_id;
    const group = activeId ? store.groups.find(g => g.groupId === activeId) : undefined;
    const provider = group?.provider;
    // 模型解析：优先分组 models[0]，否则按 provider 选默认
    const fallbackModels: Record<string, string[]> = {
      openai: ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4o'],
      anthropic: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229'],
      gemini: ['gemini-1.5-flash', 'gemini-1.0-pro', 'gemini-2.0-flash-exp'],
      openai_compatible: ['gpt-4o-mini', 'gpt-3.5-turbo', 'custom-model'],
    };
    const modelCand1 = (group?.models && group.models[0]) || undefined;
    const modelCand2 = provider ? (fallbackModels[provider] || [])[0] : undefined;
    const model = modelCand1 || modelCand2;

    if (!group || !provider || !model) {
      return { pass: false, output: '', error: '凭证未配置', provider: provider || undefined, model: model || undefined };
    }

    const wfId = await createWorkflowQuick('SelfTest-LLM', 'Quick smoke for LLM node');
    const labelInput = 'SelfTest_Input_A';
    const labelLLM = 'SelfTest_LLM_A';
    const labelOutput = 'SelfTest_Output_A';

    await workflowApi.addNode(wfId, 'input', { x: 50, y: 100 }, { label: labelInput });
    await workflowApi.addNode(wfId, 'llm', { x: 250, y: 100 }, {
      label: labelLLM,
      provider,
      model,
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
      return { pass: false, output: '', error: '执行失败', provider, model };
    }

    let finalExec = exec.data as any;
    let polled = 0;
    const st0 = String(finalExec?.status || '').toLowerCase();
    const has0 = !!finalExec?.results && Object.keys(finalExec.results || {}).length > 0;
    const execId = finalExec?.id || finalExec?.execution_id;

    if (st0 !== 'completed' || !has0) {
      const polledRes = await pollExecutionResult(String(execId || ''), finalExec);
      finalExec = polledRes.final || finalExec;
      polled = polledRes.polled || 0;
    }

    const out = extractFinalText(finalExec?.results || finalExec);
    const normalized = normalizeText(out);
    const pass = normalized.toLowerCase() === 'ping';
    const err = Array.isArray(finalExec?.errors) ? finalExec.errors.join('; ') : undefined;

    if ((import.meta as any)?.env?.DEV) {
      console.log(`[SelfTest LLM] provider=${provider}, model=${model}, polled=${polled}x, status=${String(finalExec?.status)}, out="${normalized}"`);
    }

    return { pass, output: out || '', error: err, provider, model, polled };
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

    let finalExec = exec.data as any;
    let polled = 0;
    const st0 = String(finalExec?.status || '').toLowerCase();
    const has0 = !!finalExec?.results && Object.keys(finalExec.results || {}).length > 0;
    const execId = finalExec?.id || finalExec?.execution_id;

    if (st0 !== 'completed' || !has0) {
      const polledRes = await pollExecutionResult(String(execId || ''), finalExec);
      finalExec = polledRes.final || finalExec;
      polled = polledRes.polled || 0;
    }

    const out = extractFinalText(finalExec?.results || finalExec);
    const normalized = normalizeText(out);
    const pass = normalized === 'len=5';
    const err = Array.isArray(finalExec?.errors) ? finalExec.errors.join('; ') : undefined;

    if ((import.meta as any)?.env?.DEV) {
      console.log(`[SelfTest Code] polled=${polled}x, status=${String(finalExec?.status)}, out="${normalized}"`);
    }

    return { pass, output: out || '', error: err, polled };
  } catch (e: any) {
    return { pass: false, output: '', error: e?.message || 'Code 段异常' };
  }
}

async function testLLM(): Promise<SelfTestItem> {
  const r = await runSegmentLLM();
  const provider = r.provider || 'n/a';
  const model = r.model || 'n/a';
  const polledInfo = r.polled && r.polled > 0 ? ` polled=${r.polled}x` : '';
  return {
    name: 'LLM',
    pass: r.pass,
    detail: r.pass
      ? `Final=ping provider=${provider} model=${model}${polledInfo}`
      : `error=${r.error || ''} output=${normalizeText(r.output || '')} provider=${provider} model=${model}${polledInfo}`.trim()
  };
}
async function testCodeBlock(): Promise<SelfTestItem> {
  const r = await runSegmentCode();
  const polledInfo = r.polled && r.polled > 0 ? ` polled=${r.polled}x` : '';
  return {
    name: 'CodeBlock',
    pass: r.pass,
    detail: r.pass ? `Final=len=5${polledInfo}` : `error=${r.error || ''} output=${normalizeText(r.output || '')}${polledInfo}`.trim()
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

  // DEV 诊断日志（一次）
  try {
    if ((import.meta as any)?.env?.DEV) {
      console.log('[SelfTest] items:', summary.items.map(i => `${i.name}:${i.pass ? 'PASS' : 'FAIL'} ${i.detail}`));
    }
  } catch {}

  return summary;
}