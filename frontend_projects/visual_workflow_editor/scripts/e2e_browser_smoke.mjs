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

import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const UI_URL = process.env.UI_URL || 'http://localhost:3002';
const API_BASE = process.env.API_BASE || 'http://localhost:6502/api/v1';
const WS_URL = process.env.WS_URL || 'ws://localhost:6502/ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'last_e2e.txt');

async function ensureLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch {}
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
      const final = results.find(r => r?.metadata?.final_output === true || r?.final_output === true);
      const first = results.find(r => typeof r?.text === 'string' || typeof r?.content === 'string');
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
    await el.evaluate(node => {
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
      await page.evaluate(s => {
        const n = document.querySelector(s);
        if (!n) return;
        if (typeof n.click === 'function') n.click();
        else n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }, sel);
    }
  }
}

// Utility: click by preferred selectors list (prefers data-qa, then aria-label, then text)
// selectors: array of CSS selectors; the first that exists will be clicked
async function clickPrefer(page, selectors) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (!el) continue;
    try {
      await el.evaluate(node => node?.scrollIntoView?.({ block: 'center', inline: 'center' }));
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
        await page.evaluate(s => {
          const n = document.querySelector(s);
          if (!n) return;
          if (typeof n.click === 'function') n.click();
          else n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }, sel);
      }
    }
    return true;
  }
  return false;
}

// Utility: two-frame stabilization via requestAnimationFrame
async function waitForRAFStabilize(page) {
  await page.evaluate(
    () =>
      new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
}

// Reliable "More" drawer opener (data-qa → aria-label → text; multi-click strategies + stable waits)
async function openMoreDrawerReliably(page) {
  const delays = [120, 240, 480, 960, 1200, 1600];

  function drawerVisiblePredicate() {
    const marker = document.querySelector('[data-qa="drawer-marker"]');
    const markerVisible = !!(marker && marker instanceof HTMLElement && marker.style.display !== 'none');
    const root =
      document.querySelector('.vw-more-drawer') ||
      document.querySelector('#toolbar-more-drawer') ||
      document.querySelector('.ant-drawer') ||
      document.querySelector('[role="dialog"]');
    let rootVisible = false;
    if (root instanceof HTMLElement) {
      const rect = root.getBoundingClientRect();
      const cs = getComputedStyle(root);
      rootVisible = rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    }
    const btn =
      document.querySelector('[data-qa="btn-more"]') ||
      document.querySelector('[aria-label="More"]') ||
      document.querySelector('[aria-label="更多"]');
    const expanded = btn ? btn.getAttribute('aria-expanded') === 'true' : false;
    return { markerVisible, rootVisible, expanded, any: markerVisible || rootVisible || expanded };
  }

  // Pre-check (already open)
  const pre = await page.evaluate(drawerVisiblePredicate).catch(() => ({ any: false }));
  if (pre && pre.any) {
    try {
      console.log('[DRAWER] attempt=0 sel=pre-open clicked=false visible=true ariaExpanded=true');
    } catch {}
    await waitForRAFStabilize(page);
    await waitForRAFStabilize(page);
    return { ok: true, attempts: 0 };
  }

  // Pre-hydration guard: ensure button is present and app is hydrated or document ready
  try {
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-qa="btn-more"], [aria-label="More"], [aria-label="更多"]');
      const h = window.__qaHooks;
      return !!btn && (!!(h && h.hydrated) || document.readyState === 'complete');
    }, { timeout: 3000, polling: 'mutation' });
  } catch {}
  try { await waitForRAFStabilize(page); } catch {}

  const selectors = ['[data-qa="btn-more"]', '[aria-label="More"]', '[aria-label="更多"]'];

  async function checkVisible(delay) {
    try {
      await waitForRAFStabilize(page);
      await waitForRAFStabilize(page);
    } catch {}
    const ok = await page
      .waitForFunction(
        () => {
          const h = window.__qaHooks;
          const marker = document.querySelector('[data-qa="drawer-marker"]');
          const markerVisible = !!(marker && marker instanceof HTMLElement && marker.style.display !== 'none');
          const root =
            document.querySelector('.vw-more-drawer') ||
            document.querySelector('#toolbar-more-drawer') ||
            document.querySelector('.ant-drawer') ||
            document.querySelector('[role="dialog"]');
          let rootVisible = false;
          if (root instanceof HTMLElement) {
            const rect = root.getBoundingClientRect();
            const cs = getComputedStyle(root);
            rootVisible = rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
          }
          const btn =
            document.querySelector('[data-qa="btn-more"]') ||
            document.querySelector('[aria-label="More"]') ||
            document.querySelector('[aria-label="更多"]');
          const expanded = btn ? btn.getAttribute('aria-expanded') === 'true' : false;
          const any = markerVisible || rootVisible || expanded;
          return h && h.hydrated ? any : any;
        },
        { timeout: Math.max(600, delay + 400), polling: 'mutation' },
      )
      .then(() => true)
      .catch(() => false);
    if (!ok) {
      // Fallback: quick aria-expanded probe
      return await page
        .evaluate(() => {
          const btn =
            document.querySelector('[data-qa="btn-more"]') ||
            document.querySelector('[aria-label="More"]') ||
            document.querySelector('[aria-label="更多"]');
          return btn?.getAttribute('aria-expanded') === 'true';
        })
        .catch(() => false);
    }
    return true;
  }

  async function logState(attemptIndex, chosenTag, performed, visible) {
    try {
      const ariaExpanded = await page.evaluate(() => {
        const btn =
          document.querySelector('[data-qa="btn-more"]') ||
          document.querySelector('[aria-label="More"]') ||
          document.querySelector('[aria-label="更多"]');
        return btn?.getAttribute('aria-expanded') === 'true';
      });
      console.log(
        `[DRAWER] attempt=${attemptIndex} sel=${chosenTag} clicked=${performed} visible=${visible} ariaExpanded=${ariaExpanded}`,
      );
    } catch {}
  }

  for (let i = 0; i < delays.length; i++) {
    const delay = delays[i];
    let chosen = 'none';
    let handle = null;
    for (const sel of selectors) {
      handle = await page.$(sel);
      if (handle) {
        chosen = sel;
        break;
      }
    }

    // Strategy 1: ElementHandle.click
    if (handle) {
      try {
        await handle.evaluate(n => n?.scrollIntoView?.({ block: 'center', inline: 'center' }));
      } catch {}
      try {
        await handle.click({ delay: 10 });
      } catch {}
      let visible = await checkVisible(delay);
      await logState(i + 1, `${chosen}::click`, true, visible);
      if (visible) return { ok: true, attempts: i + 1 };

      // Strategy 2: bounding box center click
      try {
        const box = await handle.boundingBox();
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          await page.mouse.move(cx, cy);
          await page.mouse.click(cx, cy);
          visible = await checkVisible(delay);
          await logState(i + 1, `${chosen}::bbox`, true, visible);
          if (visible) return { ok: true, attempts: i + 1 };

          // Strategy 3: double click
          await page.mouse.click(cx, cy, { clickCount: 2 });
          visible = await checkVisible(delay);
          await logState(i + 1, `${chosen}::dbl`, true, visible);
          if (visible) return { ok: true, attempts: i + 1 };
        } else {
          // Strategy 2b: DOM-based bounding box fallback when ElementHandle.boundingBox() returns null
          try {
            const center = await page.evaluate((sel) => {
              const el = document.querySelector(sel);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }, chosen);
            if (center) {
              await page.mouse.move(center.x, center.y);
              await page.mouse.click(center.x, center.y);
              visible = await checkVisible(delay);
              await logState(i + 1, `${chosen}::bboxDOM`, true, visible);
              if (visible) return { ok: true, attempts: i + 1 };
            }
          } catch {}
        }
      } catch {}

      // Strategy 4: keyboard (focus + Enter/Space)
      try {
        await handle.evaluate(n => n?.focus?.());
      } catch {}
      try {
        await page.keyboard.press('Enter');
      } catch {}
      visible = await checkVisible(delay);
      await logState(i + 1, `${chosen}::keyEnter`, true, visible);
      if (visible) return { ok: true, attempts: i + 1 };
      try {
        await page.keyboard.press('Space');
      } catch {}
      visible = await checkVisible(delay);
      await logState(i + 1, `${chosen}::keySpace`, true, visible);
      if (visible) return { ok: true, attempts: i + 1 };

      // Strategy 5: DOM dispatch
      try {
        const ok = await page.evaluate(sel => {
          const n = document.querySelector(sel);
          if (!n) return false;
          if (typeof n.click === 'function') {
            n.click();
            return true;
          }
          n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return true;
        }, chosen);
        visible = await checkVisible(delay);
        await logState(i + 1, `${chosen}::dispatch`, ok, visible);
        if (visible) return { ok: true, attempts: i + 1 };
      } catch {}
    }

    // Strategy 6: text fallback (⋯ / 更多 / More)
    const textOk = await page.evaluate(() => {
      const normalize = s =>
        (s || '')
          .replace(/[\u3000]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const labels = new Set(['⋯', '...', '更多', 'More']);
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const el = buttons.find(
        b => labels.has(normalize(b.textContent || '')) || labels.has(normalize(b.getAttribute('aria-label') || '')),
      );
      if (!el) return false;
      if (typeof el.click === 'function') {
        el.click();
        return true;
      }
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    });
    const visibleText = await checkVisible(delay);
    await logState(i + 1, 'text', textOk, visibleText);
    if (visibleText) return { ok: true, attempts: i + 1 };

    await new Promise(r => setTimeout(r, delay));
  }

  console.warn('[FALLBACK] openMoreDrawerReliably failed after retries');
  // Last-resort fallback: navigate with e2eOpenDrawer=1 (allowed but not default)
  try {
    const joiner = UI_URL.includes('?') ? '&' : '?';
    const url = `${UI_URL}${joiner}e2eOpenDrawer=1`;
    console.warn('[FALLBACK] navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForRAFStabilize(page);
    await waitForRAFStabilize(page);
    const ok2 = await page.waitForFunction(() => {
      const marker = document.querySelector('[data-qa="drawer-marker"]');
      const markerVisible = !!(marker && marker instanceof HTMLElement && marker.style.display !== 'none');
      const root =
        document.querySelector('.vw-more-drawer') ||
        document.querySelector('#toolbar-more-drawer') ||
        document.querySelector('.ant-drawer') ||
        document.querySelector('[role="dialog"]');
      let rootVisible = false;
      if (root instanceof HTMLElement) {
        const rect = root.getBoundingClientRect();
        const cs = getComputedStyle(root);
        rootVisible = rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      }
      return markerVisible || rootVisible;
    }, { timeout: 4000, polling: 'mutation' }).then(() => true).catch(() => false);
    if (ok2) {
      try { console.warn('[FALLBACK] param open succeeded'); } catch {}
      return { ok: true, attempts: delays.length + 1 };
    }
  } catch {}
  return { ok: false, attempts: delays.length };
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
    if (exp) {
      try {
        await exp.click({ delay: 10 });
      } catch {}
    } else if (col) {
      try {
        await col.click({ delay: 10 });
      } catch {}
    }
    await new Promise(r => setTimeout(r, 150));
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
    ping(API_BASE.replace(/\/$/, '') + '/info').then(ok => ok || ping(API_BASE)),
  ]);
  printHintForServices(uiOk, apiOk);

  let browser = null;
  let llmFinal = 'N/A';
  let codeFinal = 'N/A';
  let wsEvents = [];
  let drawerOpenStatus = 'N/A';

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    console.log(`[step] 打开 UI: ${UI_URL}`);
    await page.goto(UI_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Global hydration guard: wait for toolbar to appear to avoid early interactions
    try {
      await page.waitForSelector('.app-toolbar, [data-qa="btn-more"], [aria-label="更多"], [aria-label="More"]', {
        timeout: 20000,
      });
      await new Promise(r => setTimeout(r, 300)); // minor settle (avoid page.waitForTimeout for compatibility)
    } catch (e) {
      console.warn('[HYDRATION] toolbar not detected within 20s:', e?.message || String(e));
    }

    // DEBUG: dump key selectors to understand why Drawer/SelfTest/Creeds cannot be found
    try {
      const diag = await page.evaluate(() => {
        const q = s => !!document.querySelector(s);
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
          .slice(0, 12)
          .map(b => {
            const t = (b.textContent || '').trim();
            const qa = b.getAttribute('data-qa') || '';
            const aria = b.getAttribute('aria-label') || '';
            return { t, qa, aria };
          });
        const drawer =
          document.querySelector('#toolbar-more-drawer') ||
          document.querySelector('.ant-drawer') ||
          document.querySelector('[role="dialog"]');
        const drawerVisible =
          drawer instanceof HTMLElement
            ? (() => {
                const rect = drawer.getBoundingClientRect();
                const style = window.getComputedStyle(drawer);
                return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
              })()
            : false;
        return {
          hasToolbar: !!document.querySelector('.app-toolbar'),
          hasMoreQA: q('[data-qa="btn-more"]'),
          hasMoreAriaCn: q('[aria-label="更多"]'),
          hasMoreAriaEn: q('[aria-label="More"]'),
          hasSelfTestQA: q('[data-qa="btn-selftest"]'),
          hasSelfTestAriaCn: q('[aria-label="快速自检"]'),
          hasSelfTestAriaEn: q('[aria-label="Quick Self-Test"]'),
          hasCredsQA: q('[data-qa="btn-credentials"]'),
          hasCredsAriaCn: q('[aria-label="凭证"]'),
          hasCredsAriaEn: q('[aria-label="Credentials"]'),
          drawerNode: !!drawer,
          drawerVisible,
          sampleButtons: allButtons,
        };
      });
      console.log('[DEBUG] selector snapshot:', JSON.stringify(diag, null, 2));
    } catch (e) {
      console.warn('[DEBUG] selector snapshot failed:', e?.message || String(e));
    }

    // Ensure toolbar is hydrated before interacting with the "More" drawer
    await page.waitForSelector('[data-qa="btn-more"], [aria-label="更多"], [aria-label="More"]', { timeout: 10000 });
    // Quick self-test (via toolbar in "⋯更多" drawer)
    // Robust selector strategy: data-qa first, then aria-label (zh/en), finally visible text
    let selfTestSummary = [];
    let selfTestOk = false;
    let selfTestCount = 0;
    const tsSelfStart = Date.now();
    try {
      // 1) 使用统一的可靠抽屉打开逻辑（不依赖 URL 参数）
      const resDrawer = await openMoreDrawerReliably(page);
      drawerOpenStatus = resDrawer.ok ? 'PASS' : 'FAIL';
      if (!resDrawer.ok) {
        throw new Error('More drawer not opened');
      }

      // 2) Wait self-test button visible (search globally, tolerate portal containers)
      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '[data-qa="btn-selftest"], [aria-label="快速自检"], [aria-label="Quick Self-Test"]',
          );
          if (!btn) return false;
          const el = btn;
          const style = window.getComputedStyle(el);
          const visible =
            (el instanceof HTMLElement ? el.offsetParent !== null : true) &&
            style.visibility !== 'hidden' &&
            style.display !== 'none';
          return visible;
        },
        { timeout: 20000, polling: 'mutation' },
      );
      await waitForRAFStabilize(page);

      // 3) Click "快速自检"
      const selfBtnClicked = await clickPrefer(page, [
        '[data-qa="btn-selftest"]',
        '[aria-label="快速自检"]',
        '[aria-label="Quick Self-Test"]',
      ]);
      if (!selfBtnClicked) {
        throw new Error('SelfTest button not found');
      }

      // 4) Poll window.__qaHooks.lastSelfTest readiness with exponential backoff (8 tries, 200ms -> 1.6s)
      let tries = 0;
      let delay = 200;
      while (tries < 8) {
        const state = await page.evaluate(() => {
          const hooks = window.__qaHooks;
          const items = hooks?.lastSelfTest?.items;
          const okLen = Array.isArray(items) && items.length >= 5;
          if (!okLen) return { ok: false, count: Array.isArray(items) ? items.length : 0, names: [] };
          const names = items.map(it => (it && (it.name || it.id)) || '').filter(Boolean);
          const required = ['Health', 'Docs', 'WS', 'LLM', 'CodeBlock'];
          const hasAll = required.every(r => names.includes(r));
          return { ok: hasAll, count: items.length, names };
        });
        if (state.ok) {
          selfTestOk = true;
          selfTestCount = state.count || 0;
          break;
        }
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 1600);
        tries += 1;
      }

      // Also ensure basic OK through waitForFunction as a final guard
      if (!selfTestOk) {
        await page
          .waitForFunction(
            () => {
              const items = window.__qaHooks?.lastSelfTest?.items;
              return Array.isArray(items) && items.length >= 5;
            },
            { timeout: 2000, polling: 'mutation' },
          )
          .catch(() => {});
      }

      // 5) Collect five-line summary
      selfTestSummary = await page.evaluate(() => {
        const items = (window.__qaHooks?.lastSelfTest?.items || []).slice(0, 5);
        const normalize = v =>
          typeof v === 'boolean' ? (v ? 'PASS' : 'FAIL') : v === 'ok' ? 'PASS' : String(v || 'N/A');
        return items.map((it, i) => {
          const name = it?.name || it?.id || `item${i + 1}`;
          const pass = (it && (it.pass ?? it.passed ?? it.status)) ?? 'N/A';
          const status = normalize(pass);
          return `${name}: ${status}`;
        });
      });
      selfTestCount = selfTestCount || selfTestSummary.length;

      // Console evidence
      console.log(`[SELFTEST] lastSelfTest.items.length=${selfTestCount}`);
    } catch (e) {
      // Non-fatal: keep SMOKE overall state unaffected
      console.warn('[SELFTEST] N/A (error during self-test):', e?.message || String(e));
    }
    const durSelf = Date.now() - tsSelfStart;

    // Credentials button + Modal smoke (non-fatal; evidence only)
    let credentialsOk = false;
    let activeGroupSelOk = false;
    let providerSelOk = false;
    let modeSelOk = false;
    let addGroupOk = false;
    let durCreds = 0;
    const tsCredStart = Date.now();
    try {
      // Ensure drawer open via reliable method
      {
        const resDrawer2 = await openMoreDrawerReliably(page);
        if (!resDrawer2.ok) {
          throw new Error('More drawer not visible');
        }
      }

      // Ensure Drawer really visible before searching inner buttons (portal tolerance)
      const drawerVisible = await page.evaluate(() => {
        const drawer =
          document.querySelector('#toolbar-more-drawer') ||
          document.querySelector('.ant-drawer') ||
          document.querySelector('[role="dialog"]');
        if (!(drawer instanceof HTMLElement)) return false;
        const rect = drawer.getBoundingClientRect();
        const style = window.getComputedStyle(drawer);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      });
      if (!drawerVisible) {
        throw new Error('More drawer not visible');
      }

      // Wait credentials button visible (search globally to tolerate different Drawer portal containers)
      const credsBtnReady = await page
        .waitForFunction(
          () => {
            const btn = document.querySelector(
              '[data-qa="btn-credentials"], [aria-label="凭证"], [aria-label="Credentials"]',
            );
            if (!btn) return false;
            const el = btn;
            const style = window.getComputedStyle(el);
            const visible =
              (el instanceof HTMLElement ? el.offsetParent !== null : true) &&
              style.visibility !== 'hidden' &&
              style.display !== 'none';
            return visible;
          },
          { timeout: 20000, polling: 'mutation' },
        )
        .catch(() => false);
      if (!credsBtnReady) {
        throw new Error('Credentials button not mounted (within drawer)');
      }
      await waitForRAFStabilize(page);
      await waitForRAFStabilize(page);

      // Click "凭证" to open Modal
      const credsBtnClicked = await clickPrefer(page, [
        '[data-qa="btn-credentials"]',
        '[aria-label="凭证"]',
        '[aria-label="Credentials"]',
      ]);
      if (!credsBtnClicked) throw new Error('Credentials button not found');

      // Wait Modal visible (AntD Modal)
      await page.waitForFunction(
        () => {
          const modals = Array.from(document.querySelectorAll('.ant-modal')).filter(m => {
            const el = m;
            return el && (el.offsetParent !== null || el.style?.display !== 'none');
          });
          if (modals.length === 0) return false;
          const text = modals.map(m => (m.textContent || '').trim()).join('\n');
          return /凭证管理|Credential Manager/i.test(text);
        },
        { timeout: 8000, polling: 'mutation' },
      );
      // rAF settle after modal opened (two frames)
      await waitForRAFStabilize(page);
      await waitForRAFStabilize(page);
      // Presence check (minimal) for active-group-select（增加语义等待）
      await page
        .waitForFunction(() => !!document.querySelector('[data-qa="active-group-select"]'), {
          timeout: 8000,
          polling: 'mutation',
        })
        .catch(() => {});
      await page
        .waitForSelector('[data-qa="active-group-select"]', { timeout: 8000 })
        .then(() => {
          activeGroupSelOk = true;
        })
        .catch(() => {});

      // Lightweight asserts for provider/mode selects existence and dropdown expansion
      try {
        // Provider Select presence + dropdown expansion
        await page.waitForSelector('[data-qa="creds-provider-select"]', { timeout: 8000 });
        await waitForRAFStabilize(page);
        await clickPrefer(page, ['[data-qa="creds-provider-select"]', '[aria-label="creds-provider-select"]']);
        // Wait for visible dropdown and assert container + z-index (>2000)
        const provDropInfo = await page.evaluate(() => {
          const dds = Array.from(document.querySelectorAll('.ant-select-dropdown'));
          const isVisible = (el) => {
            const cs = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return cs.visibility !== 'hidden' && cs.display !== 'none' && rect.width > 0 && rect.height > 0;
          };
          const visible = dds.filter(dd => isVisible(dd));
          if (visible.length === 0) return { ok: false, zIndex: 0, inModal: false, attachedToBody: false };
          const dd = visible[visible.length - 1];
          const parent = dd.parentElement;
          const inModal = !!(parent && (parent.closest('.vw-credentials-modal') || parent.closest('.ant-modal') || parent.closest('.ant-modal-root') || parent.closest('.ant-modal-wrap')));
          const zIndex = Number(getComputedStyle(dd).zIndex) || 0;
          const ok = (inModal || parent === document.body) && zIndex > 2000;
          return { ok, zIndex, inModal, attachedToBody: parent === document.body };
        });
        providerSelOk = !!provDropInfo?.ok;
        // Close dropdown via ESC to avoid layer interference
        await page.keyboard.press('Escape').catch(() => {});
        await waitForRAFStabilize(page);
      } catch {}

      try {
        // Mode Select presence + dropdown expansion
        await page.waitForSelector('[data-qa="creds-mode-select"]', { timeout: 8000 });
        await waitForRAFStabilize(page);
        await clickPrefer(page, ['[data-qa="creds-mode-select"]', '[aria-label="creds-mode-select"]']);
        // Wait for visible dropdown and assert container + z-index (>2000)
        const modeDropInfo = await page.evaluate(() => {
          const dds = Array.from(document.querySelectorAll('.ant-select-dropdown'));
          const isVisible = (el) => {
            const cs = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return cs.visibility !== 'hidden' && cs.display !== 'none' && rect.width > 0 && rect.height > 0;
          };
          const visible = dds.filter(dd => isVisible(dd));
          if (visible.length === 0) return { ok: false, zIndex: 0, inModal: false, attachedToBody: false };
          const dd = visible[visible.length - 1];
          const parent = dd.parentElement;
          const inModal = !!(parent && (parent.closest('.vw-credentials-modal') || parent.closest('.ant-modal') || parent.closest('.ant-modal-root') || parent.closest('.ant-modal-wrap')));
          const zIndex = Number(getComputedStyle(dd).zIndex) || 0;
          const ok = (inModal || parent === document.body) && zIndex > 2000;
          return { ok, zIndex, inModal, attachedToBody: parent === document.body };
        });
        modeSelOk = !!modeDropInfo?.ok;
        await page.keyboard.press('Escape').catch(() => {});
        await waitForRAFStabilize(page);
      } catch {}
      // AddGroup lightweight assert: click and verify localStorage store updated and active group switched
      try {
        const prev = await page.evaluate(() => {
          try {
            const raw = localStorage.getItem('vw_api_providers_v1');
            const obj = raw ? JSON.parse(raw) : { version: 'v1', groups: [] };
            const ids = Array.isArray(obj.groups) ? obj.groups.map(g => g && g.groupId).filter(Boolean) : [];
            const active = typeof obj.active_group_id === 'string' ? obj.active_group_id : null;
            return { ids, active, count: ids.length };
          } catch {
            return { ids: [], active: null, count: 0 };
          }
        });
        // Click "新增分组" button (data-qa/aria)
        const clicked = await clickPrefer(page, ['[data-qa="creds-add-group"]', '[aria-label="creds-add-group"]']);
        if (clicked) {
          const ok = await page
            .waitForFunction(
              (prevIds) => {
                try {
                  const raw = localStorage.getItem('vw_api_providers_v1');
                  if (!raw) return false;
                  const obj = JSON.parse(raw);
                  const ids = Array.isArray(obj.groups) ? obj.groups.map(g => g && g.groupId).filter(Boolean) : [];
                  const active = typeof obj.active_group_id === 'string' ? obj.active_group_id : null;
                  const prevSet = new Set(prevIds);
                  const newIds = ids.filter(id => id && !prevSet.has(id));
                  if (newIds.length !== 1) return false;
                  return active === newIds[0];
                } catch {
                  return false;
                }
              },
              { timeout: 10000, polling: 200 },
              prev.ids,
            )
            .then(() => true)
            .catch(() => false);
          addGroupOk = !!ok;
        } else {
          addGroupOk = false;
        }
      } catch {
        addGroupOk = false;
      }

      // Close Modal (click close icon or press ESC)
      const closed = await page.evaluate(() => {
        const closeBtn = document.querySelector('.ant-modal .ant-modal-close');
        if (closeBtn) {
          closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return true;
        }
        return false;
      });
      if (!closed) {
        await page.keyboard.press('Escape').catch(() => {});
      }

      // Verify modal closed (best-effort)
      await new Promise(r => setTimeout(r, 200));
      const modalStillOpen = await page.evaluate(() => {
        const modals = Array.from(document.querySelectorAll('.ant-modal')).filter(m => {
          const el = m;
          return el && (el.offsetParent !== null || el.style?.display !== 'none');
        });
        return modals.length > 0;
      });
      credentialsOk = !modalStillOpen;
    } catch (e) {
      console.warn('[CREDS] N/A (error during credentials check):', e?.message || String(e));
    }
    durCreds = Date.now() - tsCredStart;

    // Clear canvas via toolbar + robust waitForFunction using QA hooks
    const tsClearStart = Date.now();
    try {
      await ensureToolsExpanded(page, 4000);
      await clickByAria(page, '清空画布').catch(() => {});
      await page.waitForFunction(
        () => {
          const h = window.__qaHooks;
          if (h && Array.isArray(h.nodes)) return h.nodes.length === 0;
          const nodes = document.querySelectorAll('.react-flow__node');
          return nodes.length === 0;
        },
        { timeout: 5000, polling: 150 },
      );
    } catch {}
    const durClear = Date.now() - tsClearStart;

    const combo = await page.evaluate(
      async ({ API_BASE, WS_URL }) => {
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
          try {
            payload = await res.json();
          } catch {
            payload = null;
          }
          const data =
            payload && typeof payload === 'object' && 'success' in payload && 'function' in payload && 'data' in payload
              ? payload.data
              : payload;
          return { payload, data };
        }

        async function get(path) {
          const url = `${API_BASE}${path}`;
          const res = await fetch(url, { method: 'GET' });
          if (!res.ok) throw new Error(`GET ${path} - HTTP ${res.status} ${res.statusText}`);
          let payload = null;
          try {
            payload = await res.json();
          } catch {
            payload = null;
          }
          const data =
            payload && typeof payload === 'object' && 'success' in payload && 'function' in payload && 'data' in payload
              ? payload.data
              : payload;
          return { payload, data };
        }

        function ensureWS() {
          return new Promise(resolve => {
            try {
              if (!window.__wsEvents) window.__wsEvents = [];
              if (window.__ws && window.__ws.readyState === 1) {
                return resolve();
              }
              const ws = new WebSocket(WS_URL);
              window.__ws = ws;
              ws.onopen = () => resolve();
              ws.onmessage = ev => {
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

        const wait = ms => new Promise(r => setTimeout(r, ms));

        function extractFinalTextLoose(obj) {
          try {
            if (!obj) return 'N/A';
            const results = obj.results || obj.result || obj.output;
            if (Array.isArray(results)) {
              const final = results.find(r => r?.metadata?.final_output === true || r?.final_output === true);
              const first = results.find(r => typeof r?.text === 'string' || typeof r?.content === 'string');
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
        try {
          window.__ws?.close?.();
        } catch {}

        return { ok: true, llmFinal, codeFinal, wsTail };
      },
      { API_BASE, WS_URL },
    );

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
    // Additional SELFTEST evidence lines (do not affect PASS/FAIL outcome)
    try {
      const approxLLM = (llmFinal || '').toString().trim().slice(0, 32) || 'N/A';
      const approxCode = (codeFinal || '').toString().trim().slice(0, 32) || 'N/A';
      console.log(`[SELFTEST] A: Frontend E2E Smoke (LLM): ${llmPass ? 'PASS' : 'FAIL'}`);
      console.log(`[SELFTEST] B: Final Output (LLM): ${approxLLM}`);
      console.log(`[SELFTEST] C: Frontend E2E Smoke (CodeBlock): ${codePass ? 'PASS' : 'FAIL'}`);
      console.log(`[SELFTEST] D: Final Output (CodeBlock): ${approxCode}`);
      console.log(`[SELFTEST] E: WS Events captured: ${Array.isArray(wsEvents) ? wsEvents.length : 0}`);
    } catch {}
    console.log('============================================');

    // Append standardized log to last_e2e.txt
    try {
      const stamp = new Date().toISOString();
      const lines = [];
      lines.push(`--- ${stamp} [SMOKE] ---`);
      lines.push(
        `A(Input→LLM→Output): ${llmPass ? 'PASS' : 'FAIL'} | out="${(llmFinal || '').toString().slice(0, 120)}"`,
      );
      lines.push(
        `B(Input→CodeBlock→Output): ${codePass ? 'PASS' : 'FAIL'} | out="${(codeFinal || '')
          .toString()
          .slice(0, 120)}"`,
      );
      lines.push(`[DRAWER] Open: ${drawerOpenStatus}`);
      lines.push(`[SELFTEST] lastSelfTest.items.length=${selfTestSummary.length || 0}`);
      // Write five-line summary
      for (const s of selfTestSummary) lines.push(`[SELFTEST] ${s}`);
      // WS and duration notes
      lines.push(`[SELFTEST] E: WS Events captured: ${Array.isArray(wsEvents) ? wsEvents.length : 0}`);
      // Credentials drawer + modal evidence
      lines.push(`[CREDS] Drawer+Modal: ${credentialsOk ? 'PASS' : 'FAIL'}`);
      lines.push(`[CREDS] ActiveGroupSelect: ${activeGroupSelOk ? 'PASS' : 'FAIL'}`);
      lines.push(`[CREDS] ProviderSelectDropdown: ${providerSelOk ? 'PASS' : 'FAIL'}`);
      lines.push(`[CREDS] ModeSelectDropdown: ${modeSelOk ? 'PASS' : 'FAIL'}`);
      lines.push(`[CREDS] AddGroup: ${addGroupOk ? 'PASS' : 'FAIL'}`);
      lines.push(`SelfTest(wait=${durSelf}ms)`);
      lines.push(`Creds(wait=${durCreds}ms)`);
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
    try {
      if (browser) await browser.close();
    } catch {}
  }
}

main().catch(e => {
  console.error('Unexpected Error:', e?.message || e);
  console.error(tailStack(e, 20));
  printHintForServices(false, false);
  process.exitCode = 1;
});
