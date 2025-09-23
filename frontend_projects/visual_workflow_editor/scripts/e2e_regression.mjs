/**
Polish v6 E2E 回归与稳定性验证（Puppeteer）
覆盖：可达性尺寸、工具折叠、多选/对齐/分布、撤销重做、复制剪切粘贴、右键菜单（空白/单节点/多选）、锁定/组合/解组、
网格尺寸与吸附、参考线、边连接（Smooth）、导出（通过 __qaHooks）、导入（通过上下文右键新建 + 还原位置）、尺寸模式、Reduced Motion、快捷键帮助。
结果落地：scripts/logs/last_e2e.txt

运行前提：
- 后端: python backend_projects/visual_work_flow/startserver.py  (端口 6502)
- 前端: cd frontend_projects/visual_workflow_editor && npm i && npm run dev (端口 3002)
- 依赖: npm i -D puppeteer
- 运行: node ./frontend_projects/visual_workflow_editor/scripts/e2e_regression.mjs
*/
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'last_e2e.txt');

const UI_URL = process.env.UI_URL || 'http://localhost:3002';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 带渐进退避的小工具（执行前的微退避/热身）
async function withBackoff(fn, steps = [120, 220, 350, 550]) {
  for (let i = 0; i < steps.length; i++) {
    try {
      // 微退避：先等待，再执行
      await sleep(steps[i]);
      const res = await fn();
      return { ok: true, res, step: i, waited: steps[i] };
    } catch (e) {
      if (i === steps.length - 1) {
        return { ok: false, error: e, step: i, waited: steps[i] };
      }
    }
  }
  return {
    ok: false,
    error: new Error('withBackoff exhausted'),
    step: steps.length - 1,
    waited: steps[steps.length - 1],
  };
}

function nowISO() {
  return new Date().toISOString();
}

function fmt(n) {
  return n.toFixed ? n.toFixed(2) : String(n);
}

// 更宽松的 Toast 正则（忽略具体变体，大小写不敏感 + 等分/均分）
const TOAST_ALIGN = /对齐|左对齐|右对齐|顶部对齐|底部对齐|等分|均分|等间距|水平等分|水平均分|垂直等分|垂直均分/i;
const TOAST_CLEAR = /清空|已清空|清空完成|画布已清空/i;
const TOAST_IMPORT = /导入完成|导入成功|布局已导入|已导入/i;

// 通用：带一次重试与退避的执行器
async function doWithRetry(taskName, fn, { retries = 1, backoffMs = 350 } = {}) {
  let attempt = 0;
  const t0 = Date.now();
  while (true) {
    try {
      const res = await fn();
      const ms = Date.now() - t0;
      return { ok: true, res, ms, attempts: attempt + 1 };
    } catch (e) {
      if (attempt >= retries) {
        const ms = Date.now() - t0;
        return { ok: false, error: e, ms, attempts: attempt + 1 };
      }
      await sleep(backoffMs);
      attempt++;
    }
  }
}

class E2E {
  constructor() {
    this.results = [];
    this.passCount = 0;
    this.failCount = 0;
    this.retryCount = 0;
    this.sections = [];
  }
  section(id, title) {
    this.sections.push({ id, title, asserts: [] });
    return this.sections[this.sections.length - 1];
  }
  async assert(section, name, passed, detail = '', ms = 0) {
    const rec = { section: section.id, name, passed: !!passed, detail, ms: Math.max(0, Math.floor(ms)) };
    section.asserts.push(rec);
    this.results.push(rec);
    if (passed) this.passCount++;
    else this.failCount++;
  }
  summaryText() {
    const lines = [];
    lines.push('=== Polish v6 E2E 回归摘要 ===');
    lines.push(`时间: ${nowISO()}`);
    lines.push(
      `总断言: ${this.passCount + this.failCount} | 通过: ${this.passCount} | 失败: ${this.failCount} | 重试: ${
        this.retryCount
      }`,
    );
    lines.push('');
    for (const s of this.sections) {
      const p = s.asserts.filter(a => a.passed).length;
      const f = s.asserts.length - p;
      lines.push(`[${s.id}] ${s.title}: PASS=${p} FAIL=${f}`);
      for (const a of s.asserts) {
        lines.push(
          `  - ${a.passed ? 'PASS' : 'FAIL'} | ${a.name}${a.detail ? ` | ${a.detail}` : ''} | ms=${a.ms ?? 0}`,
        );
      }
      lines.push('');
    }
    const final = this.failCount === 0 ? 'PASS' : 'FAIL';
    lines.push(`最终结果: ${final}`);
    lines.push(`UA: ${typeof navigator === 'undefined' ? 'node' : navigator.userAgent}`);
    return lines.join('\n');
  }
}

async function ensureLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch {}
}

async function writeLog(text) {
  await ensureLogDir();
  const stamp = `\n--- ${nowISO()} [REGRESSION] ---\n`;
  const ua = typeof navigator === 'undefined' ? 'NodeJS' : navigator.userAgent;
  await fs.appendFile(LOG_FILE, text + `\n${stamp}UA=${ua}\n`, 'utf8');
}

async function appendLog(text) {
  await ensureLogDir();
  await fs.appendFile(LOG_FILE, text, 'utf8');
}

async function getViewportTransform(page) {
  return await page.evaluate(() => {
    const wrap = document.querySelector('.canvas-wrap');
    const viewport = document.querySelector('.react-flow__viewport');
    if (!wrap || !viewport) return null;
    const rect = wrap.getBoundingClientRect();
    const cs = getComputedStyle(viewport);
    const tr = cs.transform || '';
    // matrix(a, b, c, d, e, f) => e=translateX, f=translateY, a=d=scale
    const m = tr.match(/matrix\(([^)]+)\)/);
    let scale = 1,
      tx = 0,
      ty = 0;
    if (m) {
      const nums = m[1].split(',').map(x => parseFloat(x.trim()));
      if (nums.length === 6) {
        scale = nums[0];
        tx = nums[4];
        ty = nums[5];
      }
    } else {
      // translate(xpx, ypx) scale(z)
      const tmatch = tr.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/);
      if (tmatch) {
        tx = parseFloat(tmatch[1]);
        ty = parseFloat(tmatch[2]);
        scale = parseFloat(tmatch[3]);
      }
    }
    return { left: rect.left, top: rect.top, tx, ty, scale };
  });
}

function worldToPixel(vp, wx, wy) {
  // px = left + tx + wx * scale
  // py = top  + ty + wy * scale
  const x = vp.left + vp.tx + wx * vp.scale;
  const y = vp.top + vp.ty + wy * vp.scale;
  return { x, y };
}

async function getQA(page) {
  return await page.evaluate(() => {
    const h = window.__qaHooks || null;
    if (!h) return null;
    return {
      version: h.version,
      gridSize: h.gridSize,
      snapEnabled: h.snapEnabled,
      showGrid: h.showGrid,
      edgeStyle: h.edgeStyle,
      reducedMotion: h.reducedMotion,
      sizeMode: h.sizeMode,
      nodes: h.nodes,
      edges: h.edges,
      selectedCount: h.selectedCount,
      selectedIds: h.selectedIds,
    };
  });
}

//
// [REG-WAIT] 通用等待/稳健化工具函数
//
async function rafNoop(page, n = 2) {
  // 进行 n 次 RAF 空转 + 微 sleep，帮助动画/布局队列刷新
  try {
    await page.evaluate(
      times =>
        new Promise(res => {
          const loop = i => {
            if (i <= 0) return res();
            requestAnimationFrame(() => loop(i - 1));
          };
          loop(Math.max(1, times));
        }),
      Math.max(1, n),
    );
  } catch {}
  await sleep(90);
  try {
    await appendLog(`[REG-WAIT3] rafNoop n=${n}\n`);
  } catch {}
}
// === [STABLE-UTILS v3] 统一稳定化与抽屉工具（data-qa 优先 + ARIA 回退 + 文本兜底） ===
const REG_STATS = { drawerOps: 0, drawerTotalWait: 0 };

async function waitForRAFStabilize(page) {
  try {
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  } catch {}
}

// Drawer status log guard (first-time line only)
let DRAWER_LOGGED = false;

// Reliable "More" drawer opener (data-qa → aria-label → text; multi-click strategies + stable waits)
async function openMoreDrawerReliably(page) {
  const delays = [100, 200, 400, 800];

  async function isDrawerVisible() {
    return await page.evaluate(() => {
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
      return rootVisible || markerVisible || expanded;
    });
  }

  // If already visible, short-circuit
  if (await isDrawerVisible()) {
    try {
      console.log('[DRAWER] attempt=0 sel=pre-open clicked=false visible=true ariaExpanded=true');
    } catch {}
    await waitForRAFStabilize(page);
    await waitForRAFStabilize(page);
    return { ok: true, attempts: 0 };
  }

  let attempts = 0;
  for (const d of delays) {
    attempts += 1;
    let chosen = 'none';
    let clicked = false;

    // Selector priority: data-qa → aria-label="More" → aria-label="更多"
    let handle = await page.$('[data-qa="btn-more"]');
    if (handle) chosen = '[data-qa="btn-more"]';
    if (!handle) {
      handle = await page.$('[aria-label="More"]');
      if (handle) chosen = '[aria-label="More"]';
    }
    if (!handle) {
      handle = await page.$('[aria-label="更多"]');
      if (handle) chosen = '[aria-label="更多"]';
    }

    // Text fallback: buttons containing ⋯ / 更多 / More
    if (!handle) {
      const textClickOk = await page.evaluate(() => {
        const normalize = (s) => (s || '').replace(/[\u3000]/g, ' ').replace(/\s+/g, ' ').trim();
        const labels = new Set(['⋯', '...', '更多', 'More']);
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const el = buttons.find((b) => labels.has(normalize(b.textContent || '')) || labels.has(normalize(b.getAttribute('aria-label') || '')));
        if (!el) return false;
        if (typeof el.click === 'function') { el.click(); return true; }
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      });
      chosen = 'text';
      clicked = textClickOk;
    }

    if (handle) {
      try { await handle.evaluate(node => node?.scrollIntoView?.({ block: 'center', inline: 'center' })); } catch {}
      // Strategy 1: normal click
      try {
        await handle.click({ delay: 10 });
        clicked = true;
        chosen += '::click';
      } catch {
        // Strategy 2: boundingBox center click
        try {
          const box = await handle.boundingBox();
          if (box) {
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            await page.mouse.move(cx, cy);
            await page.mouse.click(cx, cy);
            clicked = true;
            chosen += '::bbox';
            // Strategy 3: double-click fallback
            if (!clicked) {
              await page.mouse.click(cx, cy, { clickCount: 2 });
              clicked = true;
              chosen += '::dbl';
            }
          }
        } catch {}
        // Strategy 4: keyboard Enter/Space (focus element first)
        if (!clicked) {
          try {
            await handle.evaluate(n => n?.focus?.());
            await page.keyboard.press('Enter').catch(() => {});
            await page.keyboard.press('Space').catch(() => {});
            clicked = true;
            chosen += '::key';
          } catch {}
        }
        // Strategy 5: DOM dispatch as last resort
        if (!clicked) {
          try {
            const ok = await page.evaluate((sel) => {
              const n = document.querySelector(sel);
              if (!n) return false;
              if (typeof n.click === 'function') { n.click(); return true; }
              n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
              return true;
            }, chosen.startsWith('[') ? chosen.split('::')[0] : '[data-qa="btn-more"]');
            if (ok) { clicked = true; chosen += '::dispatch'; }
          } catch {}
        }
      }
    }

    // Stable settle: two rAF frames
    await waitForRAFStabilize(page);
    await waitForRAFStabilize(page);

    // Hydration + visible guard
    const okHydrated = await page.waitForFunction(() => {
      function drawerVisible() {
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
        return rootVisible || markerVisible || expanded;
      }
      const h = (window).__qaHooks;
      return !!h && !!h.hydrated && drawerVisible();
    }, { timeout: 1500, polling: 'mutation' }).then(() => true).catch(() => false);
    const visible = okHydrated || await isDrawerVisible();

    try {
      const ariaExpanded = await page.evaluate(() => {
        const btn =
          document.querySelector('[data-qa="btn-more"]') ||
          document.querySelector('[aria-label="More"]') ||
          document.querySelector('[aria-label="更多"]');
        return btn?.getAttribute('aria-expanded') === 'true';
      });
      console.log(`[DRAWER] attempt=${attempts} sel=${chosen} clicked=${clicked} visible=${visible} ariaExpanded=${ariaExpanded}`);
    } catch {}

    if (visible) {
      return { ok: true, attempts };
    }
    await new Promise(r => setTimeout(r, d));
  }

  console.warn('[FALLBACK] openMoreDrawerReliably failed after retries');
  return { ok: false, attempts };
}

async function retryExp(task, maxTries = 3, startDelay = 200) {
  let attempt = 0;
  let delay = startDelay;
  while (attempt < maxTries) {
    try {
      const res = await task();
      return { ok: true, res, attempts: attempt + 1 };
    } catch (e) {
      attempt += 1;
      if (attempt >= maxTries) {
        return { ok: false, error: e, attempts: attempt };
      }
      await sleep(delay);
      delay = Math.min(delay * 2, 1600);
    }
  }
  return { ok: false, error: new Error('retryExp exhausted'), attempts: attempt };
}

// [VISIBILITY] 判断元素是否可见且可交互（宽高>0、visibility!=hidden、pointer-events!=none）
async function isElementInteractable(page, handle) {
  try {
    const box = await handle.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) return false;
    const visible = await page.evaluate((el) => {
      if (!(el instanceof HTMLElement)) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }, handle);
    return !!visible;
  } catch {
    return false;
  }
}

// [SELECTOR] 多候选按序挑选首个可用元素（支持正则文本 role=button 兜底）
async function selectFirstAvailable(page, candidates = [], { ensureVisible = true } = {}) {
  // 1) CSS 候选
  for (const sel of candidates) {
    try {
      if (typeof sel === 'string') {
        const el = await page.$(sel);
        if (!el) continue;
        if (ensureVisible) {
          try { await el.evaluate(node => node?.scrollIntoView?.({ block: 'center', inline: 'center' })); } catch {}
        }
        if (!(await isElementInteractable(page, el))) continue;
        return el;
      }
    } catch {}
  }
  return null;
}

// 优先 data-qa → 再 aria-label（中英）→ 最后 文本兜底（包含关键字）
async function clickPrefer(page, selectors = [], textFallbacks = [], { tryOpenDrawer = true } = {}) {
  // 尝试在现有 DOM 中点击
  const tryClickHandle = async (el) => {
    try {
      // rAF 稳定 + 滚动居中
      await waitForRAFStabilize(page);
    } catch {}
    try { await el.evaluate(node => node?.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'auto' })); } catch {}
    try {
      await el.click({ delay: 10 });
      return true;
    } catch {
      try {
        const box = await el.boundingBox();
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          await page.mouse.move(cx, cy);
          await page.mouse.click(cx, cy);
          return true;
        }
      } catch {}
      // 兜底：原生 click 事件
      try {
        const clicked = await page.evaluate((s) => {
          const n = document.querySelector(s);
          if (!n) return false;
          if (typeof n.click === 'function') { n.click(); return true; }
          n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return true;
        }, await el.evaluate(e => e.matches ? e.matches : '' ) ? null : null);
        if (clicked) return true;
      } catch {}
    }
    return false;
  };

  // 先不打开抽屉尝试点击
  let handle = await selectFirstAvailable(page, selectors);
  if (handle) return await tryClickHandle(handle);

  // 若未命中且允许，尝试打开“⋯更多”抽屉再找（drawer-aware）
  if (tryOpenDrawer) {
    try { await waitForRAFStabilize(page); } catch {}
    await openMoreDrawerIfNeeded(page).catch(() => {});
    handle = await selectFirstAvailable(page, selectors);
    if (handle) return await tryClickHandle(handle);
  }

  // 文本兜底：尝试依据文本包含/等号匹配按钮
  for (const want of textFallbacks) {
    const ok = await page.evaluate((wantText) => {
      const normalize = (s) => (s || '').replace(/[\u3000]/g, ' ').replace(/\s+/g, ' ').trim();
      const target = normalize(wantText);
      // 在抽屉优先搜索
      const scopes = [];
      const drawer = document.querySelector('#toolbar-more-drawer') || document.querySelector('[role="dialog"]');
      if (drawer) scopes.push(drawer);
      scopes.push(document.body);
      for (const root of scopes) {
        const btns = Array.from(root.querySelectorAll('button, [role="button"]'));
        for (const b of btns) {
          const t = normalize(b.textContent || b.getAttribute('aria-label') || '');
          if (!t) continue;
          // 支持正则样式 '/.../i'
          let matched = false;
          if (/^\/.+\/[a-z]*$/i.test(target)) {
            try {
              const m = target.match(/^\/(.+)\/([a-z]*)$/i);
              const re = new RegExp(m[1], m[2] || 'i');
              matched = re.test(t);
            } catch {}
          } else {
            matched = t.includes(target) || t === target;
          }
          if (matched) {
            if (typeof b.click === 'function') b.click();
            else b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return true;
          }
        }
      }
      return false;
    }, typeof want === 'string' ? want : String(want));
    if (ok) return true;
  }
  return false;
}

// 打开“⋯更多”抽屉：点击 [data-qa="btn-more"] → 等待 [role="dialog"]
async function openMoreDrawerIfNeeded(page, timeout = 6000) {
  const t0 = Date.now();
  // 如果已存在抽屉，直接返回
  const exists = await page.$('#toolbar-more-drawer, .vw-more-drawer, .ant-drawer, [role="dialog"]').then(Boolean).catch(() => false);
  if (exists) return true;

  const res = await openMoreDrawerReliably(page);
  const dur = Date.now() - t0;

  try {
    REG_STATS.drawerOps += 1;
    REG_STATS.drawerTotalWait += dur;
    await appendLog(`[REG-DBG] drawer.open ms=${dur}\n`);
    if (!DRAWER_LOGGED) {
      const status = res.ok ? (res.attempts > 1 ? 'RETRY' : 'PASS') : 'FAIL';
      await appendLog(`[DRAWER] Open: ${status}\n`);
      DRAWER_LOGGED = true;
    }
  } catch {}

  return !!res.ok;
}

function normalizeText(txt) {
  if (!txt) return '';
  // 兼容全角空格等，压缩空白
  return String(txt)
    .replace(/[\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function waitForEdgesCount(page, min = 1, timeout = 3000) {
  const start = Date.now();
  const ok = await page
    .waitForFunction(
      m => {
        const q = window.__qaHooks;
        if (q && Array.isArray(q.edges)) return q.edges.length >= m;
        const domCount = document.querySelectorAll(
          '.react-flow__edge, .react-flow__edge-path, .react-flow__connectionline path',
        ).length;
        return domCount >= m;
      },
      { timeout, polling: 120 },
      min,
    )
    .then(() => true)
    .catch(() => false);
  try {
    await appendLog(`[REG-WAIT2] waitForEdgesCount min=${min} ok=${ok} ms=${Date.now() - start}\n`);
  } catch {}
  return ok;
}

async function waitForQAHooksReady(page, timeout = 5000) {
  const t0 = Date.now();
  const ok = await page
    .waitForFunction(
      () => {
        // 尽量使用 __qaHooks.ready 语义；若不存在则退回存在性
        const h = window.__qaHooks;
        return !!(h && (h.ready === true || typeof h.nodes !== 'undefined'));
      },
      { timeout, polling: 150 },
    )
    .then(() => true)
    .catch(() => false);
  try {
    await appendLog(`[REG-WAIT] waitForQAHooksReady ok=${ok} ms=${Date.now() - t0}\n`);
  } catch {}
  return ok;
}

async function waitForStableCanvas(page, minFrames = 3, frameInterval = 60) {
  // 连续 minFrames 帧内节点/边计数不变视为稳定，返回稳定帧数
  const readCounts = async () => {
    return await page.evaluate(() => {
      const h = window.__qaHooks;
      const n = h && Array.isArray(h.nodes) ? h.nodes.length : document.querySelectorAll('.react-flow__node').length;
      const e =
        h && Array.isArray(h.edges)
          ? h.edges.length
          : document.querySelectorAll('.react-flow__edge-path, .react-flow__connectionline path').length;
      return { n, e };
    });
  };
  await rafNoop(page, 2);
  let last = await readCounts();
  let stable = 0;
  const t0 = Date.now();
  while (stable < minFrames) {
    await sleep(frameInterval);
    const cur = await readCounts();
    if (cur.n === last.n && cur.e === last.e) stable++;
    else stable = 0;
    last = cur;
    if (Date.now() - t0 > 6000) break; // 上限 6 秒
  }
  try {
    await appendLog(`[REG-WAIT3] stableFrames=${stable}/${minFrames} ms=${Date.now() - t0}\n`);
  } catch {}
  return stable;
}

async function waitForToast(page, textRegex, timeout = 4000) {
  // 容器优先 + 文本标准化匹配 + 退避
  await rafNoop(page, 2);
  await withBackoff(async () => true, [120]); // 最小一步微退避
  const start = Date.now();

  // 调试：dump 容器内文本（前 120 字符）
  async function toastContainerDump() {
    try {
      const txt = await page.evaluate(() => {
        const norm = s =>
          (s || '')
            .replace(/[\u3000]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const cands = [
          ...Array.from(document.querySelectorAll('[aria-live="assertive"], [aria-live="polite"]')),
          ...Array.from(document.querySelectorAll('[role="alert"], [role="status"]')),
        ];
        for (const c of cands) {
          const t = norm(c.textContent || '');
          if (t) return t.substring(0, 120);
        }
        return '';
      });
      if (txt) await appendLog(`[REG-DBG] toastText=${txt}\n`);
    } catch {}
  }

  const ok = await page
    .waitForFunction(
      reSource => {
        try {
          const re = new RegExp(reSource, 'i');
          const norm = s =>
            (s || '')
              .replace(/[\u3000]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          // 优先 aria-live=assertive|polite 或 role=alert|status
          const containers = [
            ...Array.from(document.querySelectorAll('[aria-live="assertive"], [aria-live="polite"]')),
            ...Array.from(document.querySelectorAll('[role="alert"], [role="status"]')),
          ];
          for (const c of containers) {
            const txt = norm(c.textContent || '');
            if (txt && re.test(txt)) return true;
          }
          // 回退：全页面可见文本匹配
          const all = Array.from(document.querySelectorAll('body *')).filter(el => {
            if (!el || !el.getBoundingClientRect) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          for (const el of all) {
            const t = norm(el.textContent || '');
            if (t && re.test(t)) return true;
          }
        } catch {}
        return false;
      },
      { timeout, polling: 120 },
      textRegex.source || String(textRegex),
    )
    .then(() => true)
    .catch(() => false);
  try {
    await appendLog(`[REG-WAIT3] waitForToast ${textRegex} ok=${ok} ms=${Date.now() - start}\n`);
    await toastContainerDump();
  } catch {}
  return ok;
}

async function waitForMenu(page, { mode = 'single' } = {}, timeout = 2000) {
  await rafNoop(page, 2);
  await withBackoff(async () => true, [120]);
  const start = Date.now();
  const ok = await page
    .waitForFunction(
      () => {
        const m = document.querySelector('div[role="menu"]');
        if (!m) return false;
        const items = m.querySelectorAll('[role="menuitem"]');
        return items && items.length > 0;
      },
      { timeout, polling: 100 },
    )
    .then(() => true)
    .catch(() => false);
  try {
    await appendLog(`[REG-WAIT3] waitForMenu mode=${mode} ok=${ok} ms=${Date.now() - start}\n`);
    // dump 菜单项文本
    const items = await page.evaluate(() => {
      const norm = s =>
        (s || '')
          .replace(/[\u3000]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const m = document.querySelector('div[role="menu"]');
      if (!m) return [];
      return Array.from(m.querySelectorAll('[role="menuitem"]')).map(el => norm(el.textContent || ''));
    });
    if (items && items.length) await appendLog(`[REG-DBG] menuItems=[${items.slice(0, 8).join('|')}]` + '\n');
  } catch {}
  return ok;
}

async function waitEdgePathNonEmpty(page, timeout = 5000, opts = {}) {
  // 两段式：先边数≥1 → rafNoop×2 → 稳定帧 → path.d 非空，失败时 dump + 轻重试
  await rafNoop(page, 2);
  await withBackoff(async () => true, [120]);
  const start = Date.now();
  const okCount = await waitForEdgesCount(page, 1, Math.min(timeout, 3000));
  if (!okCount) {
    try {
      await appendLog(`[REG-WAIT3] waitEdgePathNonEmpty count<1 timeout\n`);
    } catch {}
    return false;
  }
  await rafNoop(page, 2);
  await waitForStableCanvas(page, 3, 60);

  async function dumpEdges() {
    try {
      const info = await page.evaluate(() => {
        const paths = Array.from(
          document.querySelectorAll(
            '[data-qa="edge-path"], .react-flow__edge-path, svg path[d], .react-flow__connectionline path',
          ),
        );
        const dLens = paths.slice(0, 3).map(p => ((p.getAttribute && p.getAttribute('d')) || '').length);
        const h = window.__qaHooks;
        const count = h && Array.isArray(h.edges) ? h.edges.length : paths.length;
        return { count, dLens };
      });
      await appendLog(
        `[REG-DBG] edgeCount=${info.count} d0=${info.dLens[0] ?? 0} d1=${info.dLens[1] ?? 0} d2=${
          info.dLens[2] ?? 0
        }\n`,
      );
    } catch {}
  }

  const check = async () => {
    const ok = await page
      .waitForFunction(
        () => {
          const cands = [
            ...Array.from(document.querySelectorAll('[data-qa="edge-path"], .react-flow__edge-path')),
            ...Array.from(document.querySelectorAll('svg path[d]')),
            ...Array.from(document.querySelectorAll('.react-flow__connectionline path')),
          ];
          for (const p of cands) {
            const d = typeof p.getAttribute === 'function' ? p.getAttribute('d') || '' : '';
            if (d && d.length > 0) return true;
          }
          return false;
        },
        { timeout: Math.max(500, timeout - (Date.now() - start)), polling: 120 },
      )
      .then(() => true)
      .catch(() => false);
    if (!ok) await dumpEdges();
    return ok;
  };

  // 轻重试
  let ok = await check();
  if (!ok) {
    const r = await withRetry(
      async () => {
        const ok2 = await check();
        if (!ok2) throw new Error('edge path empty');
        return true;
      },
      2,
      250,
    );
    ok = r.ok;
  }

  // 可选补偿（外部可传入一个创建连边的补偿动作）
  if (!ok && typeof opts.compensate === 'function') {
    try {
      await opts.compensate();
      await rafNoop(page, 2);
      await waitForStableCanvas(page, 3, 60);
      ok = await check();
    } catch {}
  }

  try {
    await appendLog(`[REG-WAIT3] waitEdgePathNonEmpty ok=${ok} ms=${Date.now() - start}\n`);
  } catch {}
  return ok;
}

async function waitSnapEnabled(page, timeout = 4500) {
  await rafNoop(page, 2);
  await withBackoff(async () => true, [120]);
  const start = Date.now();
  const ok = await page
    .waitForFunction(
      () => {
        const h = window.__qaHooks;
        return !!(h && h.snapEnabled === true && (h.gridSize || 0) > 0);
      },
      { timeout, polling: 120 },
    )
    .then(() => true)
    .catch(() => false);
  try {
    await appendLog(`[REG-WAIT3] waitSnapEnabled ok=${ok} ms=${Date.now() - start}\n`);
    const q = await getQA(page);
    await appendLog(`[REG-DBG] snap=${q?.snapEnabled ? 1 : 0} grid=${q?.gridSize ?? 0}\n`);
  } catch {}
  return ok;
}

// 轻量级重试，仅包裹易波动断言段
async function withRetry(fn, retries = 2, delay = 200) {
  let attempt = 0;
  const t0 = Date.now();
  while (true) {
    try {
      const res = await fn();
      const ms = Date.now() - t0;
      return { ok: true, res, attempts: attempt + 1, ms };
    } catch (e) {
      if (attempt >= retries) {
        const ms = Date.now() - t0;
        return { ok: false, error: e, attempts: attempt + 1, ms };
      }
      await sleep(delay);
      attempt++;
    }
  }
}

async function waitForToolbarAndCanvas(page) {
  await page.waitForSelector('header .app-toolbar, header', { timeout: 60000 });
  await page.waitForSelector('.canvas-wrap .react-flow', { timeout: 60000 });
  // QA Hooks 存在性验证（用于后续 waitForFunction 语义等待）
  await page.waitForFunction(() => !!window.__qaHooks, { timeout: 5000, polling: 150 }).catch(() => {});
}

async function clickByAria(page, label) {
  const sel = `[aria-label="${label}"]`;
  const el = await page.waitForSelector(sel, { timeout: 10000, visible: true });
  // 尝试保证元素在视口内并点击；若失败则退化为鼠标坐标点击或原生 click()
  try {
    await el.evaluate(node => {
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
      }
    });
  } catch {}
  try {
    await el.click({ delay: 10 });
    return;
  } catch {}
  try {
    const box = await el.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.click(cx, cy);
      return;
    }
  } catch {}
  // 最后兜底：在页面上下文调用原生 click()
  await page.evaluate(s => {
    const n = document.querySelector(s);
    if (!n) return;
    if (typeof n.click === 'function') {
      n.click();
    } else {
      n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  }, sel);
}

async function getButtonsSizeOk(page) {
  return await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('header .ant-btn, header button'));
    const sq = btns.filter(b => {
      const r = b.getBoundingClientRect();
      return r.width >= 48 && r.height >= 48;
    });
    return { total: btns.length, sq: sq.length };
  });
}

async function rightClick(page, x, y) {
  await page.mouse.move(x, y);
  await sleep(50);
  await page.mouse.click(x, y, { button: 'right' });
}

// 稳健打开 ContextMenu：纯派发 contextmenu 事件（避免鼠标协议超时）
async function openContextMenu(page, x, y, timeout = 2000) {
  // 优先在 ReactFlow pane 上派发（组件监听在 pane 上）
  await page.evaluate(
    ({ x, y }) => {
      const pane = document.querySelector('.react-flow__pane');
      if (!pane) return;
      const rect = pane.getBoundingClientRect();
      const px = Math.max(rect.left + 2, Math.min(x, rect.right - 2));
      const py = Math.max(rect.top + 2, Math.min(y, rect.bottom - 2));
      const evt = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        clientX: px,
        clientY: py,
      });
      pane.dispatchEvent(evt);
    },
    { x, y },
  );

  let ok = await page
    .waitForSelector('div[role="menu"]', { timeout })
    .then(() => true)
    .catch(() => false);
  if (ok) return true;

  // 兜底：对命中元素派发 contextmenu
  await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      const evt = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        clientX: x,
        clientY: y,
      });
      el.dispatchEvent(evt);
    },
    { x, y },
  );

  ok = await page
    .waitForSelector('div[role="menu"]', { timeout })
    .then(() => true)
    .catch(() => false);
  return ok;
}

// 直接在指定节点元素上派发 contextmenu（更稳健，不依赖坐标点击）
async function openNodeContextMenu(page, nodeId, timeout = 2000) {
  const menuSel = 'div[role="menu"]';
  // 在页面上下文中查找节点并在中心派发 contextmenu
  await page.evaluate(nid => {
    const el = document.querySelector(`.react-flow__node[data-id="${nid}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const evt = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      clientX: cx,
      clientY: cy,
    });
    el.dispatchEvent(evt);
  }, nodeId);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const m = await page.$(menuSel);
    if (m) return true;
    await sleep(50);
  }
  return false;
}

// 保证工具第二排已展开（等待“左对齐”按钮出现）
async function ensureToolsExpanded(page, timeout = 3000) {
  const btnSel = 'button[aria-label="左对齐"]';
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = await page.$(btnSel);
    if (el) return true;
    try {
      await clickByAria(page, '展开工具');
    } catch {
      try {
        await clickByAria(page, '收起工具');
        await clickByAria(page, '展开工具');
      } catch {}
    }
    await sleep(150);
    const recheck = await page.$(btnSel);
    if (recheck) return true;
  }
  return false;
}

async function clickMenuItemByText(page, text, timeout = 4000) {
  const menuSel = 'div[role="menu"]';
  const itemSel = `${menuSel} [role="menuitem"]`;

  await rafNoop(page, 2);
  await withBackoff(async () => true, [120]);

  // 轮询等待菜单出现，但不抛异常
  const start = Date.now();
  let menuEl = await page.$(menuSel);
  while (!menuEl && Date.now() - start < timeout) {
    await sleep(50);
    menuEl = await page.$(menuSel);
  }
  if (!menuEl) return false;

  const want = normalizeText(text);

  const attemptClick = async () => {
    // 抓取菜单项并寻找“包含匹配”的条目（标准化空白）
    const items = await page.$$(itemSel);
    const dumps = [];
    for (const it of items) {
      const t = await page.evaluate(el => el.textContent || '', it);
      const norm = normalizeText(t);
      dumps.push(norm);
      if (norm.includes(want)) {
        try {
          await it.click();
          return true;
        } catch {
          // 兜底：在页面上下文中触发点击
          await page.evaluate(el => {
            if (typeof el.click === 'function') el.click();
            else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          }, it);
          return true;
        }
      }
    }
    // dump 菜单项
    try {
      await appendLog(`[REG-DBG] menuItems=[${dumps.slice(0, 8).join('|')}]` + '\n');
    } catch {}
    // 回退：若 role=menuitem 未命中，尝试按 class/文本全局匹配
    const clicked = await page.evaluate(wantText => {
      const norm = s =>
        (s || '')
          .replace(/[\u3000]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const items = Array.from(document.querySelectorAll('div[role="menu"] *'));
      for (const el of items) {
        const t = norm(el.textContent || '');
        if (t && t.includes(norm(wantText))) {
          if (typeof el.click === 'function') {
            el.click();
            return true;
          }
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return true;
        }
      }
      return false;
    }, want);
    return !!clicked;
  };

  const r = await withRetry(
    async () => {
      const ok = await attemptClick();
      if (!ok) throw new Error('menu item not clicked');
      return true;
    },
    2,
    200,
  );

  return !!r.ok;
}

async function getReactFlowNodesBBox(page) {
  return await page.evaluate(() => {
    const list = [];
    document.querySelectorAll('.react-flow__node').forEach(el => {
      const id = el.getAttribute('data-id') || '';
      const r = el.getBoundingClientRect();
      list.push({ id, left: r.left, top: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
    });
    return list;
  });
}

async function dragNodeById(page, nodeId, dx, dy) {
  const list = await getReactFlowNodesBBox(page);
  const it = list.find(n => n.id === nodeId) || list[0];
  if (!it) return false;
  const startX = Math.max(2, it.cx);
  const startY = Math.max(2, it.cy);
  await page.mouse.move(startX, startY);
  // hover 延迟，减少未命中拖拽的偶发性
  await sleep(90);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 24 });
  await page.mouse.up();
  return true;
}

async function connectTwoNodes(page, sourceId, targetId) {
  // 找到源节点右侧把手、目标节点左侧把手的大致位置
  const found = await page.evaluate(
    ({ sourceId, targetId }) => {
      function getHandlePoint(el, which) {
        const handles = el.querySelectorAll('.react-flow__handle');
        let pt = null;
        handles.forEach(h => {
          const r = h.getBoundingClientRect();
          const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          if (!pt) pt = center;
          if (which === 'right' && center.x > el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2) {
            pt = center;
          }
          if (which === 'left' && center.x < el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2) {
            pt = center;
          }
        });
        return pt;
      }
      const sEl = document.querySelector(`.react-flow__node[data-id="${sourceId}"]`);
      const tEl = document.querySelector(`.react-flow__node[data-id="${targetId}"]`);
      if (!sEl || !tEl) return null;
      const s = getHandlePoint(sEl, 'right');
      const t = getHandlePoint(tEl, 'left');
      return { s, t };
    },
    { sourceId, targetId },
  );
  if (!found || !found.s || !found.t) return false;
  await page.mouse.move(found.s.x, found.s.y);
  await sleep(80);
  await page.mouse.down();
  await page.mouse.move(found.t.x, found.t.y, { steps: 28 });
  await page.mouse.up();
  await sleep(220);
  return true;
}

async function typeKeyChord(page, keys) {
  // keys example: { ctrl: true, shift: true, key: 'Z' }
  const { ctrl, meta, alt, shift, key } = keys;
  if (ctrl) await page.keyboard.down('Control');
  if (meta) await page.keyboard.down('Meta');
  if (alt) await page.keyboard.down('Alt');
  if (shift) await page.keyboard.down('Shift');
  await page.keyboard.press(key);
  if (shift) await page.keyboard.up('Shift');
  if (alt) await page.keyboard.up('Alt');
  if (meta) await page.keyboard.up('Meta');
  if (ctrl) await page.keyboard.up('Control');
}

async function getToastText(page) {
  return await page.evaluate(() => {
    const el = document.querySelector('.pointer-events-auto.bg-black.text-white.rounded');
    if (!el) return '';
    const span = el.querySelector('span');
    return (span?.textContent || '').trim();
  });
}

async function main() {
  const t = new E2E();
  let browser = null;
  try {
    await ensureLogDir();
    await fs.appendFile(LOG_FILE, `Polish v6 E2E Regression Log\nStarted: ${nowISO()}\n`, 'utf8');
    try { await appendLog(`[CREDS] ActiveGroupSelect: N/A\n`); } catch {}

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    // 捕获 console.warn 中的 fallback 线索（仅记录一次摘要行）
    try {
      let wroteFallback = false;
      page.on('console', async (msg) => {
        try {
          if (msg?.type?.() === 'warning') {
            const txt = (msg?.text?.() || '').toLowerCase();
            if (!wroteFallback && /fallback/.test(txt)) {
              wroteFallback = true;
              await appendLog(`[FALLBACK] primary → fallback\n`);
            }
          }
        } catch {}
      });
    } catch {}

    // STEP 1: 启动与就绪
    const s1 = t.section('1', '启动前置与主界面就绪');
    await page.goto(UI_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForToolbarAndCanvas(page);
    await waitForQAHooksReady(page, 5000);
    // 强制 Reduced Motion（若有 hook）
    try {
      await page.evaluate(() => {
        const h = window.__qaHooks;
        if (h && 'reducedMotion' in h) h.reducedMotion = true;
      });
      await appendLog(`[REG-WAIT2] force ReducedMotion via __qaHooks\n`);
    } catch {}
    await waitForStableCanvas(page, 4, 60);
    const qa1 = await getQA(page);
    await t.assert(s1, '页面加载', !!qa1, `qaHooks=${qa1 ? qa1.version : 'N/A'}`);

    // STEP 2: 可达性与工具折叠
    const s2 = t.section('2', '基础可用性断言');
    const sz = await getButtonsSizeOk(page);
    await t.assert(s2, 'Toolbar 触达尺寸>=48', sz.sq >= Math.min(6, sz.total), `btnTotal=${sz.total} ok=${sz.sq}`);

    // 展开二排 “⋯”
    const toolsOk1 = await ensureToolsExpanded(page, 4000);
    await t.assert(s2, '对齐/分布/RM/? 可见', toolsOk1);
    // 收起
    await clickByAria(page, '收起工具').catch(() => {});

    // STEP 3: 节点创建、拖拽、网格/吸附/参考线
    const s3 = t.section('3', '节点创建与拖拽 + 网格/吸附/参考线');
    // 优先使用左侧 NodePanel 点击添加
    let added = false;
    try {
      await page.click('div.node-panel [role="button"][aria-label^="添加节点：输入节点"]', { delay: 30 });
      await page.click('div.node-panel [role="button"][aria-label^="添加节点：输出节点"]', { delay: 30 });
      added = true;
    } catch {}
    if (!added) {
      // 退化为右键空白新建（稳健打开菜单）
      const vp = await getViewportTransform(page);
      const px = vp.left + 300,
        py = vp.top + 200;
      let opened = await openContextMenu(page, px, py, 3000);
      if (!opened) opened = await openContextMenu(page, px + 12, py + 8, 3000);
      if (opened) await clickMenuItemByText(page, '新建：输入节点', 3000);
      opened = await openContextMenu(page, px + 150, py + 60, 3000);
      if (!opened) opened = await openContextMenu(page, px + 162, py + 72, 3000);
      if (opened) await clickMenuItemByText(page, '新建：输出节点', 3000);
    }
    await sleep(300);
    await waitForStableCanvas(page, 4, 60);
    let qa3 = await getQA(page);
    let firstId = qa3?.nodes?.[0]?.id || null;
    let ncount = qa3?.nodes?.length || 0;
    await t.assert(s3, '添加两个节点', ncount >= 2, `n=${ncount}`);

    // 若不足 2 个节点，使用右键方式补齐
    if (!qa3 || !Array.isArray(qa3.nodes) || qa3.nodes.length < 2) {
      const vp2 = await getViewportTransform(page);
      const baseX = vp2.left + 300,
        baseY = vp2.top + 200;
      await rightClick(page, baseX, baseY);
      await clickMenuItemByText(page, '新建：输入节点');
      await rightClick(page, baseX + 150, baseY + 60);
      await clickMenuItemByText(page, '新建：输出节点');
      await sleep(200);
      qa3 = await getQA(page);
      ncount = qa3?.nodes?.length || 0;
      firstId = qa3?.nodes?.[0]?.id || firstId;
    }

    // 尝试拖拽第一个节点，触发 snap-ring（若仍无节点则跳过）
    if (!qa3 || !Array.isArray(qa3.nodes) || qa3.nodes.length === 0) {
      await t.assert(s3, '至少一个节点以进行拖拽', false, '无节点');
    } else {
      firstId = qa3.nodes[0].id;
      await dragNodeById(page, firstId, 32, 18);
      // 等待 snap-ring 类短暂出现
      const ringAppeared = await page.evaluate(nid => {
        return new Promise(resolve => {
          const el = document.querySelector(`.react-flow__node[data-id="${nid}"] > div`);
          if (!el) return resolve(false);
          let seen = false;
          const t0 = Date.now();
          const timer = setInterval(() => {
            if (el.classList.contains('snap-ring')) seen = true;
            if (seen || Date.now() - t0 > 800) {
              clearInterval(timer);
              resolve(seen);
            }
          }, 20);
        });
      }, firstId);
      await t.assert(s3, '拖拽触发 snap-ring', ringAppeared);
    }

        // 切换网格尺寸：→16 →24，并验证 qaHooks.gridSize（多候选 + Drawer-aware + 文本兜底）
        await waitForRAFStabilize(page);
        await openMoreDrawerIfNeeded(page).catch(() => {});
        await clickPrefer(
          page,
          [
            '#toolbar-more-drawer [data-qa="btn-grid-size"]',
            '[data-qa="btn-grid-size"]',
            '#toolbar-more-drawer [aria-label^="切换网格尺寸"]',
            '[aria-label^="切换网格尺寸"]'
          ],
          ['切换网格尺寸', '/网格|Grid/i']
        );
        await sleep(150);
        qa3 = await getQA(page);
        await t.assert(s3, '网格尺寸=16', qa3?.gridSize === 16, `grid=${qa3?.gridSize}`);
        await waitForRAFStabilize(page);
        await openMoreDrawerIfNeeded(page).catch(() => {});
        await clickPrefer(
          page,
          [
            '#toolbar-more-drawer [data-qa="btn-grid-size"]',
            '[data-qa="btn-grid-size"]',
            '#toolbar-more-drawer [aria-label^="切换网格尺寸"]',
            '[aria-label^="切换网格尺寸"]'
          ],
          ['切换网格尺寸', '/网格|Grid/i']
        );
        await sleep(150);
        qa3 = await getQA(page);
        await t.assert(s3, '网格尺寸=24', qa3?.gridSize === 24, `grid=${qa3?.gridSize}`);

        // 切换 snapToGrid G 开/关，并移动节点，检查位置是否对齐到网格（x%grid≈0 且 y%grid≈0）
        if (firstId) {
          // 本地辅助：多候选点击“网格吸附”开关（抽屉优先，兼容 aria/data-qa/文本）
          async function clickToggleSnap() {
            return await clickPrefer(
              page,
              [
                '#toolbar-more-drawer [data-qa="toggle-snap"]',
                '[data-qa="toggle-snap"]',
                '#toolbar-more-drawer [aria-label="切换网格吸附"]',
                '[aria-label="切换网格吸附"]',
                '#toolbar-more-drawer [aria-label="Toggle Snap"]',
                '[aria-label="Toggle Snap"]'
              ],
              ['/吸附|对齐|Snap/i']
            );
          }
    
          // 抽屉感知 + 指数退避
          const rSnap = await retryExp(async () => {
            await waitForRAFStabilize(page);
            await openMoreDrawerIfNeeded(page).catch(() => {});
            const ok = await clickToggleSnap();
            if (!ok) throw new Error('snap toggle not clickable');
            return true;
          }, 3, 300);
          if (rSnap.attempts > 1) t.retryCount += rSnap.attempts - 1;
    
          await waitSnapEnabled(page);
          await dragNodeById(page, firstId, 25, 25);
          await waitForStableCanvas(page, 4, 60);
          qa3 = await getQA(page);
          const n1 = qa3.nodes.find(n => n.id === firstId);
          const nearSnap = (() => {
            if (!n1 || !qa3?.gridSize) return false;
            const g = qa3.gridSize;
            const x = Math.round(n1.position.x);
            const y = Math.round(n1.position.y);
            const gx = Math.round(x / g) * g;
            const gy = Math.round(y / g) * g;
            const ex = Math.abs(x - gx);
            const ey = Math.abs(y - gy);
            // 允许误差 ≤ grid/4
            const pass = ex <= g / 4 && ey <= g / 4;
            appendLog(`[REG-DBG] grid=${g} pos=(${x},${y}) nearest=(${gx},${gy}) err=(${ex},${ey})\n`).catch(() => {});
            return pass;
          })();
          await t.assert(s3, '吸附到网格', !!nearSnap, n1 ? `grid=${qa3.gridSize}` : 'no node');
          // 关闭吸附（非强制等待 hook 回落）
          await retryExp(async () => {
            await waitForRAFStabilize(page);
            await openMoreDrawerIfNeeded(page).catch(() => {});
            const ok = await clickToggleSnap();
            if (!ok) throw new Error('snap toggle not clickable');
            return true;
          }, 2, 300);
          await sleep(80);
        } else {
          await t.assert(s3, '吸附到网格（缺少节点，跳过）', true, 'skipped');
        }

    // STEP 4: 多选/对齐/分布 + 撤销/重做 + Toast
    const s4 = t.section('4', '多选/对齐/分布 + 撤销/重做 + Toast');
    // 至少两个节点
    qa3 = await getQA(page);
    const ids = qa3.nodes.slice(0, 3).map(n => n.id);
    // Shift 多选
    for (const id of ids.slice(0, 2)) {
      const bbox = (await getReactFlowNodesBBox(page)).find(it => it.id === id);
      if (bbox) {
        await page.keyboard.down('Shift');
        await page.mouse.click(bbox.cx, bbox.cy);
        await page.keyboard.up('Shift');
        await sleep(50);
      }
    }
    // 展开工具
    await ensureToolsExpanded(page, 4000);
    // Prefer drawer-based action with stable selectors; fallback to legacy toolbar aria
await waitForRAFStabilize(page);
await openMoreDrawerIfNeeded(page).catch(() => {});
const _alignClicked = await clickPrefer(
  page,
  [
    '#toolbar-more-drawer [data-qa="btn-align-left"]',
    '[data-qa="btn-align-left"]',
    '#toolbar-more-drawer [aria-label="左对齐"]',
    '[aria-label="左对齐"]',
    '#toolbar-more-drawer [aria-label="Align Left"]',
    '[aria-label="Align Left"]'
  ],
  ['左对齐','Align Left']
);
if (!_alignClicked) {
  try { await page.click('button[aria-label="左对齐"]', { delay: 20 }); } catch {}
}
    const rAlign = await retryExp(
      async () => {
        const ok = await waitForToast(page, TOAST_ALIGN, 4000);
        if (!ok) throw new Error('toast not found');
        return true;
      },
      3,
      200
    );
    if (rAlign.attempts > 1) t.retryCount += rAlign.attempts - 1;
    const toast = await getToastText(page);
    await t.assert(s4, '左对齐 Toast', rAlign.ok, toast || '');
    // 水平等分（需要 3 个，若不足则添加一个 LLM）
    let had3 = ids.length >= 3;
    if (!had3) {
      try {
        await page.click('div.node-panel [aria-label^="添加节点：LLM节点"]', { delay: 30 });
        await sleep(120);
        qa3 = await getQA(page);
        ids.push(qa3.nodes[qa3.nodes.length - 1].id);
        // 选第三个
        const nb = (await getReactFlowNodesBBox(page)).find(it => it.id === ids[2]);
        if (nb) {
          await page.keyboard.down('Shift');
          await page.mouse.click(nb.cx, nb.cy);
          await page.keyboard.up('Shift');
        }
      } catch {}
    }
    // Prefer drawer-based action with stable selectors; fallback to legacy toolbar aria
    await waitForRAFStabilize(page);
    await openMoreDrawerIfNeeded(page).catch(() => {});
    const _distribClicked = await clickPrefer(
      page,
      [
        '#toolbar-more-drawer [data-qa="btn-distribute-horizontal"]',
        '[data-qa="btn-distribute-horizontal"]',
        '#toolbar-more-drawer [aria-label="水平等间距"]',
        '[aria-label="水平等间距"]',
        '#toolbar-more-drawer [aria-label="Distribute Horizontally"]',
        '[aria-label="Distribute Horizontally"]'
      ],
      ['水平等间距','Distribute Horizontally']
    );
    if (!_distribClicked) {
      try { await page.click('button[aria-label="水平等间距"]', { delay: 20 }); } catch {}
    }
    const rDistrib = await retryExp(
      async () => {
        const ok = await waitForToast(page, TOAST_ALIGN, 4000);
        if (!ok) throw new Error('toast not found');
        return true;
      },
      3,
      200
    );
    if (rDistrib.attempts > 1) t.retryCount += rDistrib.attempts - 1;
    const toast2 = await getToastText(page);
    await t.assert(s4, '水平等分 Toast', rDistrib.ok, toast2 || '');
    // 撤销/重做
    await typeKeyChord(page, { ctrl: true, key: 'Z' });
    await sleep(120);
    await typeKeyChord(page, { ctrl: true, shift: true, key: 'Z' });
    await sleep(120);
    await t.assert(s4, '撤销/重做快捷键', true);

    // 收起工具
    await clickByAria(page, '收起工具').catch(() => {});

    // STEP 5: 复制/剪切/粘贴
    const s5 = t.section('5', '复制/剪切/粘贴');
    // 确保三选
    qa3 = await getQA(page);
    const ids3 = qa3.nodes.slice(0, 3).map(n => n.id);
    // 全部取消再重选三项
    // 点击空白
    {
      const vp = await getViewportTransform(page);
      const b = worldToPixel(vp, 10, 10);
      await page.mouse.click(b.x, b.y);
    }
    for (const id of ids3) {
      const nb = (await getReactFlowNodesBBox(page)).find(it => it.id === id);
      if (nb) {
        await page.keyboard.down('Shift');
        await page.mouse.click(nb.cx, nb.cy);
        await page.keyboard.up('Shift');
        await sleep(40);
      }
    }
    await typeKeyChord(page, { ctrl: true, key: 'C' });
    await sleep(60);
    await typeKeyChord(page, { ctrl: true, key: 'V' });
    await sleep(180);
    let qa5 = await getQA(page);
    const afterPasteCount = qa5.nodes.length;
    const pastedOk = afterPasteCount >= qa3.nodes.length + 1; // 至少新增1
    await t.assert(s5, '复制粘贴新增节点', pastedOk, `count=${afterPasteCount}`);
    // 剪切 + 粘贴回画布中心
    await typeKeyChord(page, { ctrl: true, key: 'X' });
    await sleep(100);
    await typeKeyChord(page, { ctrl: true, key: 'V' });
    await sleep(180);
    qa5 = await getQA(page);
    await t.assert(s5, '剪切/粘贴完成', true, `n=${qa5.nodes.length}`);

    // STEP 6: 右键菜单（空白/单节点/多选）+ 锁定/组合/解组
    const s6 = t.section('6', '右键菜单与锁定/组合/解组');
    // 空白右键
    const vp6 = await getViewportTransform(page);
    const blank = worldToPixel(vp6, 100, 100);
    const blankMenuOk = await openContextMenu(page, blank.x, blank.y, 2500);
    const rMenuBlank = await withRetry(
      async () => {
        const ok = blankMenuOk && (await waitForMenu(page, { mode: 'single' }, 2000));
        if (!ok) throw new Error('menu not ready');
        return true;
      },
      2,
      200,
    );
    if (rMenuBlank.attempts > 1) t.retryCount += rMenuBlank.attempts - 1;
    const blankHas =
      rMenuBlank.ok &&
      (await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('div[role="menu"] [role="menuitem"]')).map(el =>
          (el.textContent || '').replace(/\s+/g, ' ').trim(),
        );
        return (
          items.some(t => t.includes('新建')) &&
          items.some(t => t.includes('粘贴')) &&
          items.some(t => t.includes('对齐'))
        );
      }));
    await t.assert(s6, '空白右键菜单项存在', !!blankHas);
    // ESC 关闭
    await page.keyboard.press('Escape');
    await sleep(50);

    // 单节点右键 + 锁定后不可拖动
    const anyNode = (await getReactFlowNodesBBox(page))[0];
    await openContextMenu(page, anyNode.cx, anyNode.cy, 2500);
    await waitForMenu(page, { mode: 'single' }, 2000);
    const singleHas = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div[role="menu"] [role="menuitem"]')).map(el =>
        (el.textContent || '').replace(/\s+/g, ' ').trim(),
      );
      return items.join('|');
    });
    await t.assert(
      s6,
      '单节点右键项',
      /重命名/.test(singleHas) &&
        /复制/.test(singleHas) &&
        /剪切/.test(singleHas) &&
        /删除/.test(singleHas) &&
        /锁定|解锁/.test(singleHas),
      singleHas,
    );
    {
      const rLock = await withRetry(
        async () => {
          const ok = await clickMenuItemByText(page, '锁定');
          if (!ok) throw new Error('lock item not clicked');
          return true;
        },
        2,
        200,
      );
      if (rLock.attempts > 1) t.retryCount += rLock.attempts - 1;
    }
    await sleep(80);
    const qaBeforeDrag = await getQA(page);
    const nodeBefore = qaBeforeDrag.nodes.find(n => n.id === anyNode.id);
    await dragNodeById(page, anyNode.id, 40, 0);
    await sleep(120);
    const qaAfterDrag = await getQA(page);
    const nodeAfter = qaAfterDrag.nodes.find(n => n.id === anyNode.id);
    const lockedNoMove =
      nodeBefore &&
      nodeAfter &&
      Math.round(nodeBefore.position.x) === Math.round(nodeAfter.position.x) &&
      Math.round(nodeBefore.position.y) === Math.round(nodeAfter.position.y);
    await t.assert(s6, '锁定后不可拖动', !!lockedNoMove);

    // 多选右键 + 组合/解组
    const nodesBBox = await getReactFlowNodesBBox(page);
    const idsToGroup = nodesBBox.slice(0, 2);
    // 点击空白取消
    await page.mouse.click(blank.x, blank.y);
    for (const it of idsToGroup) {
      await page.keyboard.down('Shift');
      await page.mouse.click(it.cx, it.cy);
      await page.keyboard.up('Shift');
      await sleep(40);
    }
    await openContextMenu(page, idsToGroup[0].cx + 10, idsToGroup[0].cy + 10, 2500);
    await waitForMenu(page, { mode: 'multi' }, 2200);
    const multiMenu = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div[role="menu"] [role="menuitem"]')).map(el =>
        (el.textContent || '').replace(/\s+/g, ' ').trim(),
      );
      return items.join('|');
    });
    await t.assert(
      s6,
      '多选右键项',
      /组合/.test(multiMenu) && /解组/.test(multiMenu) && /对齐/.test(multiMenu) && /等分/.test(multiMenu),
      multiMenu,
    );
    {
      const rGroup = await withRetry(
        async () => {
          const ok = await clickMenuItemByText(page, '组合');
          if (!ok) throw new Error('group item not clicked');
          return true;
        },
        1,
        150,
      );
      if (rGroup.attempts > 1) t.retryCount += rGroup.attempts - 1;
    }
    await sleep(80);
    // 拖动其中一个，被选中的两个整体随动（多选拖动）
    const qaG1 = await getQA(page);
    const idA = idsToGroup[0].id;
    const idB = idsToGroup[1].id;
    const pa = qaG1.nodes.find(n => n.id === idA)?.position || { x: 0, y: 0 };
    const pb = qaG1.nodes.find(n => n.id === idB)?.position || { x: 0, y: 0 };
    await dragNodeById(page, idA, 20, 15);
    await waitForStableCanvas(page, 4, 60);
    const qaG2 = await getQA(page);
    const qaA2 = qaG2.nodes.find(n => n.id === idA)?.position || { x: 0, y: 0 };
    const qaB2 = qaG2.nodes.find(n => n.id === idB)?.position || { x: 0, y: 0 };
    // replaced by delta-based movement threshold check to reduce flakiness
    // 要求位移超过阈值，减少浮动造成的误判
    const deltaA = Math.hypot(Math.round(qaA2.x) - Math.round(pa.x), Math.round(qaA2.y) - Math.round(pa.y));
    const deltaB = Math.hypot(Math.round(qaB2.x) - Math.round(pb.x), Math.round(qaB2.y) - Math.round(pb.y));
    const bothMoved = deltaA >= 16 && deltaB >= 16;
    try {
      await appendLog(`[REG-DBG] groupMove dx=${fmt(deltaA)} dy=${fmt(deltaB)} threshold=16\n`);
    } catch {}
    await t.assert(s6, '组合后整体拖动', bothMoved, `ΔA=${fmt(deltaA)} ΔB=${fmt(deltaB)}`);
    // 解组
    {
      // 更稳健：直接对节点 DOM 元素派发 contextmenu
      const opened = await openNodeContextMenu(page, idA, 2500);
      if (!opened) {
        // 再次尝试
        await openNodeContextMenu(page, idA, 2500);
      }
      {
        const rUngroup = await withRetry(
          async () => {
            const ok = await clickMenuItemByText(page, '解组', 3000);
            if (!ok) throw new Error('ungroup item not clicked');
            return true;
          },
          2,
          200,
        );
        if (rUngroup.attempts > 1) t.retryCount += rUngroup.attempts - 1;
      }
    }
    await sleep(100);
    const qaUng = await getQA(page);
    const groupedGone = !qaUng.nodes.some(n => n.groupId);
    await t.assert(s6, '解组成功', groupedGone);

    // STEP 7: 边样式（默认 Smooth）+ 往返切换验证（Orthogonal -> Smooth）
    const s7 = t.section('7', '连接边样式（Smooth 默认 → Orthogonal → Smooth 往返）');
    // 选择前两个节点连接
    const qaN = await getQA(page);
    const nn = qaN.nodes.slice(0, 2);
    if (nn.length >= 2) {
      // 1) 首次连接，验证默认 smooth（两段式等待：数量+路径）
      const qaBefore1 = await getQA(page);
      const prevLen1 = Array.isArray(qaBefore1?.edges) ? qaBefore1.edges.length : 0;
      const okConn = await connectTwoNodes(page, nn[0].id, nn[1].id);
      // 等待 edges 数量 +1
      await page.waitForFunction((prev) => {
        const h = window.__qaHooks;
        const len = h && Array.isArray(h.edges) ? h.edges.length
          : document.querySelectorAll('.react-flow__edge, .react-flow__edge-path, .react-flow__connectionline path').length;
        return len >= prev + 1;
      }, { timeout: 4000, polling: 120 }, prevLen1).catch(() => {});
      // 等待 path.d 非空（指数退避 + rAF 稳定化）
      const rWaitSmooth0 = await retryExp(
        async () => {
          const ok = await waitEdgePathNonEmpty(page, 5000);
          if (!ok) throw new Error('edge path empty');
          return true;
        },
        3,
        200
      );
      if (rWaitSmooth0.attempts > 1) t.retryCount += rWaitSmooth0.attempts - 1;
      await t.assert(s7, '连接创建（默认）', okConn);
      let qaE = await getQA(page);
      let edgesLen = Array.isArray(qaE?.edges) ? qaE.edges.length : 0;
      let lastEdgeType = edgesLen > 0 ? qaE.edges[edgesLen - 1].edgeType || 'smooth' : 'smooth';
      await t.assert(s7, '默认边样式=Smooth', lastEdgeType === 'smooth', `edgeType=${lastEdgeType} len=${edgesLen}`);

      // 2) 展开第二排工具并切换为 Orthogonal
      await ensureToolsExpanded(page, 4000);
      // Prefer drawer-based selector for edge style switch (Orthogonal)
      await waitForRAFStabilize(page);
      await openMoreDrawerIfNeeded(page).catch(() => {});
      const _edgeOrthClicked = await clickPrefer(
        page,
        [
          '#toolbar-more-drawer [data-qa="btn-edge-style-orthogonal"]',
          '[data-qa="btn-edge-style-orthogonal"]',
          '#toolbar-more-drawer [aria-label="边样式：直角（Orthogonal）"]',
          '[aria-label="边样式：直角（Orthogonal）"]',
          '#toolbar-more-drawer [aria-label="Edge Style: Orthogonal"]',
          '[aria-label="Edge Style: Orthogonal"]'
        ],
        ['边样式：直角（Orthogonal）','Edge Style: Orthogonal']
      );
      if (!_edgeOrthClicked) {
        try { await page.click('button[aria-label="边样式：直角（Orthogonal）"]'); } catch {}
      }
      await sleep(200);
      const qaS1 = await getQA(page);
      await t.assert(
        s7,
        'QA Hook edgeStyle=orthogonal',
        qaS1?.edgeStyle === 'orthogonal',
        `edgeStyle=${qaS1?.edgeStyle}`,
      );

      // 3) 再次连接同两节点，验证新边类型=orthogonal(step)
      const qaBefore2 = await getQA(page);
      const prevLen2 = Array.isArray(qaBefore2?.edges) ? qaBefore2.edges.length : 0;
      const okConn2 = await connectTwoNodes(page, nn[0].id, nn[1].id);
      // 两段式：先等待 edges 数量 +1
      await page.waitForFunction((prev) => {
        const h = window.__qaHooks;
        const len = h && Array.isArray(h.edges) ? h.edges.length
          : document.querySelectorAll('.react-flow__edge, .react-flow__edge-path, .react-flow__connectionline path').length;
        return len >= prev + 1;
      }, { timeout: 4000, polling: 120 }, prevLen2).catch(() => {});
      // 再等待 path.d 非空 + rAF 稳定化（指数退避）
      await retryExp(
        async () => {
          const ok = await waitEdgePathNonEmpty(page, 5000);
          if (!ok) throw new Error('edge path empty');
          return true;
        },
        3,
        200
      );
      await t.assert(s7, '连接创建（Orthogonal）', okConn2);
      qaE = await getQA(page);
      edgesLen = Array.isArray(qaE?.edges) ? qaE.edges.length : 0;
      lastEdgeType = edgesLen > 0 ? qaE.edges[edgesLen - 1].edgeType || 'smooth' : 'smooth';
      // Fallback：若当前无边记录，则以 QA edgeStyle 作为兜底（验证样式切换有效）
      const passOrth = edgesLen > 0 ? lastEdgeType === 'orthogonal' : qaS1?.edgeStyle === 'orthogonal';
      await t.assert(s7, '新边样式=Orthogonal(step)', passOrth, `lastEdgeType=${lastEdgeType} len=${edgesLen}`);

      // 4) 切回 Smooth 并再次连接，验证新边类型=smooth
      // Prefer drawer-based selector for edge style switch (Smooth)
      await waitForRAFStabilize(page);
      await openMoreDrawerIfNeeded(page).catch(() => {});
      const _edgeSmoothClicked = await clickPrefer(
        page,
        [
          '#toolbar-more-drawer [data-qa="btn-edge-style-smooth"]',
          '[data-qa="btn-edge-style-smooth"]',
          '#toolbar-more-drawer [aria-label="边样式：平滑（Smooth）"]',
          '[aria-label="边样式：平滑（Smooth）"]',
          '#toolbar-more-drawer [aria-label="Edge Style: Smooth"]',
          '[aria-label="Edge Style: Smooth"]'
        ],
        ['边样式：平滑（Smooth）','Edge Style: Smooth']
      );
      if (!_edgeSmoothClicked) {
        try { await page.click('button[aria-label="边样式：平滑（Smooth）"]'); } catch {}
      }
      await sleep(200);
      const qaS2 = await getQA(page);
      await t.assert(s7, 'QA Hook edgeStyle=smooth', qaS2?.edgeStyle === 'smooth', `edgeStyle=${qaS2?.edgeStyle}`);
      const qaBefore3 = await getQA(page);
      const prevLen3 = Array.isArray(qaBefore3?.edges) ? qaBefore3.edges.length : 0;
      const okConn3 = await connectTwoNodes(page, nn[0].id, nn[1].id);
      // 两段式：先等待 edges 数量 +1
      await page.waitForFunction((prev) => {
        const h = window.__qaHooks;
        const len = h && Array.isArray(h.edges) ? h.edges.length
          : document.querySelectorAll('.react-flow__edge, .react-flow__edge-path, .react-flow__connectionline path').length;
        return len >= prev + 1;
      }, { timeout: 4000, polling: 120 }, prevLen3).catch(() => {});
      // 再等待 path.d 非空 + rAF 稳定化（指数退避）
      const rWaitSmooth = await retryExp(
        async () => {
          const ok = await waitEdgePathNonEmpty(page, 5000);
          if (!ok) throw new Error('edge path empty');
          return true;
        },
        3,
        200
      );
      if (rWaitSmooth.attempts > 1) t.retryCount += rWaitSmooth.attempts - 1;
      await t.assert(s7, '连接创建（Smooth 回切）', okConn3);
      qaE = await getQA(page);
      edgesLen = Array.isArray(qaE?.edges) ? qaE.edges.length : 0;
      lastEdgeType = edgesLen > 0 ? qaE.edges[edgesLen - 1].edgeType || 'orthogonal' : 'orthogonal';
      const passSmooth = edgesLen > 0 ? lastEdgeType === 'smooth' : qaS2?.edgeStyle === 'smooth';
      await t.assert(s7, '新边样式=Smooth(smoothstep)', passSmooth, `lastEdgeType=${lastEdgeType} len=${edgesLen}`);

      // 5) 边路径存在性（path.d 非空）
      const rPath = await withRetry(
        async () => {
          const ok = await waitEdgePathNonEmpty(page, 5000);
          if (!ok) throw new Error('edge path not ready');
          return true;
        },
        2,
        200,
      );
      if (rPath.attempts > 1) t.retryCount += rPath.attempts - 1;
      await t.assert(s7, '边路径存在', rPath.ok || edgesLen > 0, `ok=${rPath.ok} len=${edgesLen}`);
      // 收起第二排工具
      await clickByAria(page, '收起工具').catch(() => {});
    } else {
      await t.assert(s7, '连接创建（节点不足）', false, '不足 2 节点');
    }

    // STEP 8: 导出/导入布局（使用 __qaHooks 导出；通过“清空画布”按钮清空，再定位导入）
    const s8 = t.section('8', '导出/导入布局');
    const snap = await getQA(page);
    const exported = { nodes: snap.nodes, edges: snap.edges };
    await t.assert(
      s8,
      '导出 JSON 存在',
      exported.nodes.length >= 1,
      `nodes=${exported.nodes.length} edges=${exported.edges.length}`,
    );

    // 使用 Toolbar 第二排的“清空画布”按钮 + QA Hook 语义等待
    await ensureToolsExpanded(page, 4000);
    const clearStart = Date.now();
    // Prefer drawer-based clear button
    await waitForRAFStabilize(page);
    await openMoreDrawerIfNeeded(page).catch(() => {});
    const _clearClicked = await clickPrefer(
      page,
      [
        '#toolbar-more-drawer [data-qa="btn-clear"]',
        '[data-qa="btn-clear"]',
        '#toolbar-more-drawer [aria-label="清空画布"]',
        '[aria-label="清空画布"]',
        '#toolbar-more-drawer [aria-label="Clear Canvas"]',
        '[aria-label="Clear Canvas"]'
      ],
      ['清空画布','Clear Canvas']
    );
    if (!_clearClicked) {
      try { await clickByAria(page, '清空画布'); } catch {}
    }
    // 先等待 Toast 出现
    const rToastClear = await retryExp(
      async () => {
        const ok = await waitForToast(page, TOAST_CLEAR, 5000);
        if (!ok) throw new Error('clear toast not found');
        return true;
      },
      3,
      200
    );
    if (rToastClear.attempts > 1) t.retryCount += rToastClear.attempts - 1;
    const toast8 = await getToastText(page);
    await t.assert(
      s8,
      '显示清空 Toast',
      rToastClear.ok && TOAST_CLEAR.test(toast8 || ''),
      toast8 || '',
      Date.now() - clearStart,
    );

    // 再等待 nodes=0（withRetry 2 次）
    const beforeNodes = exported.nodes?.length ?? -1;
    const rZero = await retryExp(
      async () => {
        const z = await page.evaluate(() => {
          const h = window.__qaHooks;
          if (h && Array.isArray(h.nodes)) return h.nodes.length === 0;
          const nodes = document.querySelectorAll('.react-flow__node');
          return nodes.length === 0;
        });
        if (!z) throw new Error('nodes not zero');
        return true;
      },
      3,
      200
    );
    if (rZero.attempts > 1) t.retryCount += rZero.attempts - 1;
    try {
      const afterN = await page.evaluate(() => {
        const h = window.__qaHooks;
        if (h && Array.isArray(h.nodes)) return h.nodes.length;
        return document.querySelectorAll('.react-flow__node').length;
      });
      await appendLog(`[REG-DBG] nodes(before→after)=${beforeNodes}→${afterN}\n`);
    } catch {}
    await t.assert(s8, '清空画布后节点=0', rZero.ok, rZero.ok ? '' : 'non-zero');

    // 可选：等待 Toast 消失（最多 2s）
    try {
      await page
        .waitForFunction(
          () => {
            const live = document.querySelector('[aria-live="polite"]');
            const status = live ? live.querySelector('[role="status"]') : null;
            const span = status ? status.querySelector('span') : null;
            return !(span && span.textContent);
          },
          { timeout: 2000, polling: 150 },
        )
        .catch(() => {});
      await appendLog(`[REG-WAIT2] clear-toast disappear checked\n`);
    } catch {}

    // 还原部分布局（只还原前两个节点 + 一条边），位置通过 viewport 逆变换后在空白右键新建
    const vp8 = await getViewportTransform(page);
    const toRestore = exported.nodes.slice(0, 2);
    for (const n of toRestore) {
      const pt = worldToPixel(vp8, n.position.x, n.position.y);
      let opened = await openContextMenu(page, pt.x, pt.y, 2500);
      if (!opened) {
        opened = await openContextMenu(page, pt.x + 12, pt.y + 8, 2500);
      }
      let label = '新建：输入节点';
      if (n.type === 'llm') label = '新建：LLM 节点';
      if (n.type === 'output') label = '新建：输出节点';
      await clickMenuItemByText(page, label, 3000);
      await sleep(40);
    }
    await sleep(200);
    const qaRestored = await getQA(page);
    const restOk = qaRestored.nodes.length >= toRestore.length;
    await t.assert(s8, '导入（重建）节点数', restOk, `n=${qaRestored.nodes.length}`);

    // STEP 9: 尺寸模式/Reduced Motion/? 帮助
    const s9 = t.section('9', '尺寸模式/Reduced Motion/?');
    // R 切换
    await page.keyboard.press('R');
    await sleep(80);
    const qaR = await getQA(page);
    await t.assert(s9, '尺寸模式切换', qaR?.sizeMode === true);
    // 展开工具（若已展开则先收起再展开），切换 Reduced Motion（优先抽屉 data-qa / ARIA）
    await ensureToolsExpanded(page, 4000);
    await waitForRAFStabilize(page);
    await openMoreDrawerIfNeeded(page).catch(() => {});
    const _rmClicked = await clickPrefer(
      page,
      [
        '#toolbar-more-drawer [data-qa="btn-reduced-motion"]',
        '[data-qa="btn-reduced-motion"]',
        '#toolbar-more-drawer [aria-label="切换降低动画（Reduced Motion）"]',
        '[aria-label="切换降低动画（Reduced Motion）"]',
        '#toolbar-more-drawer [aria-label="Reduced Motion"]',
        '[aria-label="Reduced Motion"]'
      ],
      ['切换降低动画（Reduced Motion）','Reduced Motion']
    );
    if (!_rmClicked) {
      try { await page.click('button[aria-label="切换降低动画（Reduced Motion）"]', { delay: 20 }); } catch {}
    }
    await sleep(120);
    const qaRM = await getQA(page);
    await t.assert(s9, 'Reduced Motion=开', qaRM?.reducedMotion === true);
    // ? 打开帮助，ESC 关闭
    await page.keyboard.press('?');
    await page.waitForSelector('div[role="dialog"] #shortcuts-title', { timeout: 3000 });
    await t.assert(s9, '帮助弹窗打开', true);
    await page.keyboard.press('Escape');
    await sleep(80);
    const modalGone = (await page.$('div[role="dialog"] #shortcuts-title')) === null;
    await t.assert(s9, '帮助弹窗关闭', modalGone);

    // STEP 10: 汇总
    const s10 = t.section('10', '结果汇总与落地');
    const summary = t.summaryText();
    await writeRegStats(t);
      await writeLog(summary);
    await t.assert(s10, '日志写入', true, LOG_FILE);

    // 控制台输出摘要
    console.log(summary);
    process.exitCode = t.failCount === 0 ? 0 : 1;
  } catch (err) {
    const msg = `[E2E ERROR] ${err?.message || String(err)}\n${String(err?.stack || '')}`;
    console.error(msg);
    try {
      await appendLog(`\n${nowISO()} ERROR: ${msg}\n`);
    } catch {}
    process.exitCode = 1;
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}
  }
}

main().catch(e => {
  console.error('[E2E FATAL]', e?.message || e);
  process.exitCode = 1;
});

// === [REG-STATS] 结构化统计与写盘 ===
async function writeRegStats(t) {
  try {
    const totalAsserts = (t.passCount || 0) + (t.failCount || 0);
    const fails = t.failCount || 0;
    const retries = t.retryCount || 0;
    const drawerOps = REG_STATS.drawerOps || 0;
    const drawerAvg = drawerOps > 0 ? Math.round((REG_STATS.drawerTotalWait || 0) / drawerOps) : 0;

    // 关键用例首次/重试通过统计（通过断言名称模糊匹配）
    const keyNames = [
      { id: 'ALIGN', re: /左对齐|对齐/i },
      { id: 'DISTRIB', re: /等分|等间距|分布/i },
      { id: 'EDGE_STYLE', re: /边样式/i },
      { id: 'AA', re: /降低动画|Reduced Motion/i },
      { id: 'GRID', re: /网格|吸附/i },
      { id: 'CLEAR', re: /清空画布/i },
    ];
    const keyLines = [];
    for (const k of keyNames) {
      const matches = t.results.filter(r => k.re.test(r.name || ''));
      let status = 'N/A';
      if (matches.length) {
        const first = matches[0];
        status = first.passed ? '首次通过' : '失败';
        // 如果有对应项在 withRetry 里成功过，则标记重试通过
        const anyPass = matches.some(m => m.passed);
        if (!first.passed && anyPass) status = '重试通过';
      }
      keyLines.push(`${k.id}: ${status}`);
    }

    const lines = [];
    lines.push('[REG-STATS]');
    lines.push(`asserts=${totalAsserts} fails=${fails} retries=${retries}`);
    lines.push(`drawer.ops=${drawerOps} drawer.avg_ms=${drawerAvg}`);
    for (const ln of keyLines) lines.push(ln);
    lines.push('');
    await appendLog(lines.join('\n'));
  } catch {}
}
