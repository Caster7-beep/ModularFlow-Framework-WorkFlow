/**
E2E 浏览器烟测脚本（Puppeteer 无头浏览器直连 UI + 后端 API + WS 事件收集）

使用方法（先决条件）：
- 后端：python backend_projects/visual_work_flow/startserver.py
- 前端：cd frontend_projects/visual_workflow_editor && npm i && npm run dev
- 依赖：npm i -D puppeteer
- 运行：node ./scripts/e2e_browser_smoke.mjs 或 npm run e2e:browser

本脚本零侵入，仅在浏览器上下文通过 fetch/WS 访问后端：
1) 流程一：输入→LLM→输出（保持现有逻辑）
2) 流程二：输入→代码块→输出（新增）
两个流程依次执行，最后在 Node 控制台统一输出两段结果与 WS 事件摘要。

环境变量（可选）：
- UI_URL   默认 http://localhost:3002
- API_BASE 默认 http://localhost:6502/api/v1
- WS_URL   默认 ws://localhost:6502/ws
*/

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const UI_URL = process.env.UI_URL || 'http://localhost:3002';
const API_BASE = process.env.API_BASE || 'http://localhost:6502/api/v1';
const WS_URL = process.env.WS_URL || 'ws://localhost:6502/ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'last_e2e.txt');

async function ensureLogDir() {
  try { await fs.mkdir(LOG_DIR, { recursive: true }); } catch {}
}
async function appendLog(text) {
  await ensureLogDir();
  await fs.appendFile(LOG_FILE, text, 'utf8');
}

function printHintForServices(uiOk, apiOk) {
  if (!apiOk) {
    console.error('[hint] 后端 API 未就绪，请先启动：python backend_projects/visual_work_flow/startserver.py');
  }
  if (!uiOk) {
    console.error('[hint] 前端 UI 未就绪，请先启动：cd frontend_projects/visual_workflow_editor && npm run dev');
  }
}

async function ping(url, timeoutMs = 5000) {
  if (typeof fetch !== 'function') return true;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: c.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    clearTimeout(t);
    return false;
  }
}

function tailStack(error, lines = 20) {
  const s = (error?.stack || String(error)).split(/\r?\n/);
  const tail = s.slice(-lines);
  return tail.join('\n');
}

function extractFinalTextLoose(resultObj) {
  try {
    if (!resultObj) return 'N/A';
    const results = resultObj.results || resultObj.result || resultObj.output;
    if (Array.isArray(results)) {
      const final = results.find((r) => r?.metadata?.final_output === true || r?.final_output === true);
      const first = results.find((r) => typeof r?.text === 'string' || typeof r?.content === 'string');
      if (final) return final.text || final.content || 'N/A';
      if (first) return first.text || first.content || 'N/A';
    }
    if (typeof resultObj.text === 'string') return resultObj.text;
    if (typeof resultObj.content === 'string') return resultObj.content;
    const stack = [resultObj];
    while (stack.length) {
      const it = stack.pop();
      if (!it || typeof it !== 'object') continue;
      if (typeof it.text === 'string') return it.text;
      if (typeof it.content === 'string') return it.content;
      for (const k of Object.keys(it)) {
        const v = it[k];
        if (v && typeof v === 'object') stack.push(v);
      }
    }
  } catch {}
  return 'N/A';
}

// Utility: semantic toolbar click by aria-label (robust)
async function clickByAria(page, label) {
  const sel = `[aria-label="${label}"]`;
  const el = await page.$(sel);
  if (!el) throw new Error(`aria "${label}" not found`);
  try {
    await el.evaluate((node) => {
      node?.scrollIntoView?.({ block: 'center', inline: 'center' });
    });
  } catch {}
  try {
    await el.click({ delay: 10 });
  } catch {
    const box = await el.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.click(cx, cy);
    } else {
      await page.evaluate((s) => {
        const n = document.querySelector(s);
        if (!n) return;
        if (typeof n.click === 'function') n.click();
        else n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }, sel);
    }
  }
}

// Utility: ensure tools row expanded to reveal second-row actions (like 清空画布)
async function ensureToolsExpanded(page, timeout = 3000) {
  const btnSel = 'button[aria-label="清空画布"]';
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = await page.$(btnSel);
    if (el) return true;
    // toggle
    const exp = await page.$('button[aria-label="展开工具"]');
    const col = await page.$('button[aria-label="收起工具"]');
    if (exp) { try { await exp.click({ delay: 10 }); } catch {} }
    else if (col) { try { await col.click({ delay: 10 }); } catch {} }
    await page.waitForTimeout(150);
  }
  return false;
}

async function main() {
  console.log('--- Frontend E2E Browser Smoke (Puppeteer) ---');
  console.log(`[conf] UI_URL=${UI_URL}`);
  console.log(`[conf] API_BASE=${API_BASE}`);
  console.log(`[conf] WS_URL=${WS_URL}`);

  const [uiOk, apiOk] = await Promise.all([
    ping(UI_URL),
    ping(API_BASE.replace(/\/$/, '') + '/info').then((ok) => ok || ping(API_BASE)),
  ]);
  printHintForServices(uiOk, apiOk);

  let browser = null;
  let llmFinal = 'N/A';
  let codeFinal = 'N/A';
  let wsEvents = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    console.log(`[step] 打开 UI: ${UI_URL}`);
    await page.goto(UI_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Quick self-test (via toolbar), then wait using QA hooks
    let selfTestSummary = [];
    const tsSelfStart = Date.now();
    try {
      await clickByAria(page, '快速自检').catch(() => {});
      await page.waitForFunction(() => {
        const h = window.__qaHooks;
        return !!(h && h.lastSelfTest && Array.isArray(h.lastSelfTest.items));
      }, { timeout: 5000, polling: 'mutation' });
      selfTestSummary = await page.evaluate(() => {
        const items = (window.__qaHooks?.lastSelfTest?.items || []).slice(0, 5);
        return items.map((it, i) => {
          const name = it?.name || it?.id || `item${i+1}`;
          const status = (typeof it?.passed === 'boolean') ? (it.passed ? 'PASS' : 'FAIL') : (it?.status || 'N/A');
          return `${name}: ${status}`;
        });
      });
    } catch {}
    const durSelf = Date.now() - tsSelfStart;

    // Clear canvas via toolbar + robust waitForFunction using QA hooks
    const tsClearStart = Date.now();
    try {
      await ensureToolsExpanded(page, 4000);
      await clickByAria(page, '清空画布').catch(() => {});
      await page.waitForFunction(() => {
        const h = window.__qaHooks;
        if (h && Array.isArray(h.nodes)) return h.nodes.length === 0;
        const nodes = document.querySelectorAll('.react-flow__node');
        return nodes.length === 0;
      }, { timeout: 5000, polling: 150 });
    } catch {}
    const durClear = Date.now() - tsClearStart;

    const combo = await page.evaluate(async ({ API_BASE, WS_URL }) => {
      // API helpers with API Gateway unwrap
      async function post(path, body) {
        const url = `${API_BASE}${path}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
        });
        if (!res.ok) throw new Error(`POST ${path} - HTTP ${res.status} ${res.statusText}`);
        let payload = null;
        try { payload = await res.json(); } catch { payload = null; }
        const data = payload && typeof payload === 'object' && 'success' in payload && 'function' in payload && 'data' in payload
          ? payload.data : payload;
        return { payload, data };
      }

      async function get(path) {
        const url = `${API_BASE}${path}`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) throw new Error(`GET ${path} - HTTP ${res.status} ${res.statusText}`);
        let payload = null;
        try { payload = await res.json(); } catch { payload = null; }
        const data = payload && typeof payload === 'object' && 'success' in payload && 'function' in payload && 'data' in payload
          ? payload.data : payload;
        return { payload, data };
      }

      function ensureWS() {
        return new Promise((resolve) => {
          try {
            if (!window.__wsEvents) window.__wsEvents = [];
            if (window.__ws && window.__ws.readyState === 1) {
              return resolve();
            }
            const ws = new WebSocket(WS_URL);
            window.__ws = ws;
            ws.onopen = () => resolve();
            ws.onmessage = (ev) => {
              try {
                const msg = JSON.parse(ev.data);
                const normalized = { ...msg, timestamp: msg?.timestamp || Date.now() };
                window.__wsEvents.push(normalized);
              } catch {}
            };
            ws.onerror = () => {};
            ws.onclose = () => {};
          } catch {
            resolve();
          }
        });
      }

      const wait = (ms) => new Promise((r) => setTimeout(r, ms));

      function extractFinalTextLoose(obj) {
        try {
          if (!obj) return 'N/A';
          const results = obj.results || obj.result || obj.output;
          if (Array.isArray(results)) {
            const final = results.find((r) => r?.metadata?.final_output === true || r?.final_output === true);
            const first = results.find((r) => typeof r?.text === 'string' || typeof r?.content === 'string');
            if (final) return final.text || final.content || 'N/A';
            if (first) return first.text || first.content || 'N/A';
          }
          if (typeof obj.text === 'string') return obj.text;
          if (typeof obj.content === 'string') return obj.content;
          const stack = [obj];
          while (stack.length) {
            const it = stack.pop();
            if (!it || typeof it !== 'object') continue;
            if (typeof it.text === 'string') return it.text;
            if (typeof it.content === 'string') return it.content;
            for (const k of Object.keys(it)) {
              const v = it[k];
              if (v && typeof v === 'object') stack.push(v);
            }
          }
        } catch {}
        return 'N/A';
      }

      await ensureWS();

      // 1) 输入→LLM→输出
      let llmFinal = 'N/A';
      {
        const name = 'E2E UI Smoke';
        const desc = 'via browser';
        const { data: c1 } = await post('/visual_workflow/create', { name, description: desc });
        const workflowId = c1?.workflow_id || c1?.id || c1?.workflow?.id;
        if (!workflowId) throw new Error('创建工作流失败：未获得 workflow_id');

        // input
        const { data: n1 } = await post('/visual_workflow/add_node', {
          workflow_id: workflowId,
          node_type: 'input',
          position: { x: 100, y: 100 },
          config: { default_value: '' },
        });
        const nodeInput = n1?.node_id || n1?.id;
        if (!nodeInput) throw new Error('添加 input 节点失败');

        // llm_call
        const { data: n2 } = await post('/visual_workflow/add_node', {
          workflow_id: workflowId,
          node_type: 'llm_call',
          position: { x: 300, y: 100 },
          config: {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            prompt: 'Return a single word: ping',
            temperature: 0.2,
            max_tokens: 256,
          },
        });
        const nodeLLM = n2?.node_id || n2?.id;
        if (!nodeLLM) throw new Error('添加 llm_call 节点失败');

        // output
        const { data: n3 } = await post('/visual_workflow/add_node', {
          workflow_id: workflowId,
          node_type: 'output',
          position: { x: 500, y: 100 },
          config: { format: 'text' },
        });
        const nodeOutput = n3?.node_id || n3?.id;
        if (!nodeOutput) throw new Error('添加 output 节点失败');

        const edgeCfg = { source_handle: 'output', target_handle: 'input' };
        await post('/visual_workflow/create_connection', {
          workflow_id: workflowId,
          source_node_id: nodeInput,
          target_node_id: nodeLLM,
          config: edgeCfg,
        });
        await post('/visual_workflow/create_connection', {
          workflow_id: workflowId,
          source_node_id: nodeLLM,
          target_node_id: nodeOutput,
          config: edgeCfg,
        });

        const { data: exec } = await post('/visual_workflow/execute', {
          workflow_id: workflowId,
          input_data: { input: '用一句话介绍你自己' },
        });
        const execResult = exec?.result || exec?.results || exec?.output || exec;
        llmFinal = extractFinalTextLoose(execResult);
        await wait(600); // 给WS一点时间刷新事件
      }

      // 2) 输入→代码块→输出
      let codeFinal = 'N/A';
      {
        const name = 'E2E CodeBlock Smoke';
        const desc = 'via browser';
        const { data: c1 } = await post('/visual_workflow/create', { name, description: desc });
        const workflowId = c1?.workflow_id || c1?.id || c1?.workflow?.id;
        if (!workflowId) throw new Error('创建工作流失败：未获得 workflow_id');

        // input (default abcde)
        const { data: n1 } = await post('/visual_workflow/add_node', {
          workflow_id: workflowId,
          node_type: 'input',
          position: { x: 100, y: 250 },
          config: { default_value: 'abcde' },
        });
        const nodeInput = n1?.node_id || n1?.id;
        if (!nodeInput) throw new Error('添加 input 节点失败');

        // code_block
        const code = "text_in = str(inputs.get('input',''))\noutput = {'text': f'len={len(text_in)}', 'signal': 1}\n";
        const { data: n2 } = await post('/visual_workflow/add_node', {
          workflow_id: workflowId,
          node_type: 'code_block',
          position: { x: 300, y: 250 },
          config: {
            name: 'CodeBlock',
            code_type: 'python',
            code,
          },
        });
        const nodeCode = n2?.node_id || n2?.id;
        if (!nodeCode) throw new Error('添加 code_block 节点失败');

        // output
        const { data: n3 } = await post('/visual_workflow/add_node', {
          workflow_id: workflowId,
          node_type: 'output',
          position: { x: 500, y: 250 },
          config: { format: 'text' },
        });
        const nodeOutput = n3?.node_id || n3?.id;
        if (!nodeOutput) throw new Error('添加 output 节点失败');

        const edgeCfg = { source_handle: 'output', target_handle: 'input' };
        await post('/visual_workflow/create_connection', {
          workflow_id: workflowId,
          source_node_id: nodeInput,
          target_node_id: nodeCode,
          config: edgeCfg,
        });
        await post('/visual_workflow/create_connection', {
          workflow_id: workflowId,
          source_node_id: nodeCode,
          target_node_id: nodeOutput,
          config: edgeCfg,
        });

        const { data: exec } = await post('/visual_workflow/execute', {
          workflow_id: workflowId,
          input_data: {},
        });
        const execResult = exec?.result || exec?.results || exec?.output || exec;
        codeFinal = extractFinalTextLoose(execResult);
        await wait(600);
      }

      const wsTail = Array.isArray(window.__wsEvents) ? window.__wsEvents.slice(-20) : [];
      try { window.__ws?.close?.(); } catch {}

      return { ok: true, llmFinal, codeFinal, wsTail };
    }, { API_BASE, WS_URL });

    llmFinal = combo?.llmFinal ?? 'N/A';
    codeFinal = combo?.codeFinal ?? 'N/A';
    wsEvents = Array.isArray(combo?.wsTail) ? combo.wsTail : [];

    const llmPass = !!llmFinal && llmFinal !== 'N/A' && !/^ERROR:/i.test(llmFinal);
    const codePass = typeof codeFinal === 'string' && codeFinal.startsWith('len=');

    console.log('============================================');
    console.log(`Frontend E2E Smoke (LLM): ${llmPass ? 'PASS' : 'FAIL'}`);
    console.log('Final Output (LLM):');
    console.log(llmFinal);
    console.log('--------------------------------------------');
    console.log(`Frontend E2E Smoke (CodeBlock): ${codePass ? 'PASS' : 'FAIL'}`);
    console.log('Final Output (CodeBlock):');
    console.log(codeFinal);
    console.log('--------------------------------------------');
    console.log('WS Events (last 20):');
    for (const ev of wsEvents) {
      const ts = typeof ev?.timestamp === 'number' ? new Date(ev.timestamp).toISOString() : '';
      console.log(`- ${ts} | ${ev?.type || 'unknown'}`);
    }
    console.log('============================================');

    // Append standardized log to last_e2e.txt
    try {
      const stamp = new Date().toISOString();
      const lines = [];
      lines.push(`--- ${stamp} [SMOKE] ---`);
      lines.push(`A(Input→LLM→Output): ${llmPass ? 'PASS' : 'FAIL'} | out="${(llmFinal || '').toString().slice(0,120)}"`);
      lines.push(`B(Input→CodeBlock→Output): ${codePass ? 'PASS' : 'FAIL'} | out="${(codeFinal || '').toString().slice(0,120)}"`);
      lines.push(`SelfTest(wait=${durSelf}ms) top5:`);
      for (const s of selfTestSummary) lines.push(`  - ${s}`);
      lines.push(`ClearCanvas(wait=${durClear}ms): DONE`);
      lines.push('');
      await appendLog(lines.join('\n'));
    } catch {}

    const overallOk = llmPass && codePass;
    process.exitCode = overallOk ? 0 : 1;
  } catch (err) {
    console.error('============================================');
    console.error('Frontend E2E Smoke: FAIL');
    console.error('Error Summary:');
    console.error(String(err?.message || err));
    console.error('--- Stack (tail) ---');
    console.error(tailStack(err, 20));
    console.error('============================================');
    printHintForServices(false, false);
    process.exitCode = 1;
    return;
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}

main().catch((e) => {
  console.error('Unexpected Error:', e?.message || e);
  console.error(tailStack(e, 20));
  printHintForServices(false, false);
  process.exitCode = 1;
});