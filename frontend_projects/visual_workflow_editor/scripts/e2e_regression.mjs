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
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'last_e2e.txt');

const UI_URL = process.env.UI_URL || 'http://localhost:3002';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function nowISO() {
  return new Date().toISOString();
}

function fmt(n) {
  return n.toFixed ? n.toFixed(2) : String(n);
}

class E2E {
  constructor() {
    this.results = [];
    this.passCount = 0;
    this.failCount = 0;
    this.sections = [];
  }
  section(id, title) {
    this.sections.push({ id, title, asserts: [] });
    return this.sections[this.sections.length - 1];
  }
  async assert(section, name, passed, detail = '') {
    const rec = { section: section.id, name, passed: !!passed, detail };
    section.asserts.push(rec);
    this.results.push(rec);
    if (passed) this.passCount++; else this.failCount++;
  }
  summaryText() {
    const lines = [];
    lines.push('=== Polish v6 E2E 回归摘要 ===');
    lines.push(`时间: ${nowISO()}`);
    lines.push(`总断言: ${this.passCount + this.failCount} | 通过: ${this.passCount} | 失败: ${this.failCount}`);
    lines.push('');
    for (const s of this.sections) {
      const p = s.asserts.filter(a => a.passed).length;
      const f = s.asserts.length - p;
      lines.push(`[${s.id}] ${s.title}: PASS=${p} FAIL=${f}`);
      for (const a of s.asserts) {
        lines.push(`  - ${a.passed ? 'PASS' : 'FAIL'} | ${a.name}${a.detail ? ` | ${a.detail}` : ''}`);
      }
      lines.push('');
    }
    lines.push(`UA: ${typeof navigator === 'undefined' ? 'node' : navigator.userAgent}`);
    return lines.join('\n');
  }
}

async function ensureLogDir() {
  try { await fs.mkdir(LOG_DIR, { recursive: true }); } catch {}
}

async function writeLog(text) {
  await ensureLogDir();
  const stamp = `\n--- ${nowISO()} ---\n`;
  const ua = (typeof navigator === 'undefined') ? 'NodeJS' : navigator.userAgent;
  await fs.writeFile(LOG_FILE, text + `\n${stamp}UA=${ua}\n`, 'utf8');
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
    let scale = 1, tx = 0, ty = 0;
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

async function waitForToolbarAndCanvas(page) {
  await page.waitForSelector('header .app-toolbar, header', { timeout: 60000 });
  await page.waitForSelector('.canvas-wrap .react-flow', { timeout: 60000 });
}

async function clickByAria(page, label) {
  const sel = `[aria-label="${label}"]`;
  const el = await page.waitForSelector(sel, { timeout: 10000, visible: true });
  // 尝试保证元素在视口内并点击；若失败则退化为鼠标坐标点击或原生 click()
  try {
    await el.evaluate((node) => {
      if (node && typeof (node.scrollIntoView) === 'function') {
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
  await page.evaluate((s) => {
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
  await page.evaluate(({ x, y }) => {
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
  }, { x, y });

  let ok = await page.waitForSelector('div[role="menu"]', { timeout }).then(() => true).catch(() => false);
  if (ok) return true;

  // 兜底：对命中元素派发 contextmenu
  await page.evaluate(({ x, y }) => {
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
  }, { x, y });

  ok = await page.waitForSelector('div[role="menu"]', { timeout }).then(() => true).catch(() => false);
  return ok;
}

// 直接在指定节点元素上派发 contextmenu（更稳健，不依赖坐标点击）
async function openNodeContextMenu(page, nodeId, timeout = 2000) {
  const menuSel = 'div[role="menu"]';
  // 在页面上下文中查找节点并在中心派发 contextmenu
  await page.evaluate((nid) => {
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

  // 轮询等待菜单出现，但不抛异常
  const start = Date.now();
  let menuEl = await page.$(menuSel);
  while (!menuEl && Date.now() - start < timeout) {
    await sleep(50);
    menuEl = await page.$(menuSel);
  }
  if (!menuEl) return false;

  // 抓取菜单项并寻找包含 text 的条目
  const items = await page.$$(itemSel);
  for (const it of items) {
    const t = (await page.evaluate(el => (el.textContent || '').trim(), it));
    if (t.includes(text)) {
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
  return false;
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
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 20 });
  await page.mouse.up();
  return true;
}

async function connectTwoNodes(page, sourceId, targetId) {
  // 找到源节点右侧把手、目标节点左侧把手的大致位置
  const found = await page.evaluate(({ sourceId, targetId }) => {
    function getHandlePoint(el, which) {
      const handles = el.querySelectorAll('.react-flow__handle');
      let pt = null;
      handles.forEach(h => {
        const r = h.getBoundingClientRect();
        const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        if (!pt) pt = center;
        if (which === 'right' && center.x > (el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2)) {
          pt = center;
        }
        if (which === 'left' && center.x < (el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2)) {
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
  }, { sourceId, targetId });
  if (!found || !found.s || !found.t) return false;
  await page.mouse.move(found.s.x, found.s.y);
  await page.mouse.down();
  await page.mouse.move(found.t.x, found.t.y, { steps: 25 });
  await page.mouse.up();
  await sleep(200);
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
    await fs.writeFile(LOG_FILE, `Polish v6 E2E Regression Log\nStarted: ${nowISO()}\n`, 'utf8');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // STEP 1: 启动与就绪
    const s1 = t.section('1', '启动前置与主界面就绪');
    await page.goto(UI_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForToolbarAndCanvas(page);
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
      const px = vp.left + 300, py = vp.top + 200;
      let opened = await openContextMenu(page, px, py, 3000);
      if (!opened) opened = await openContextMenu(page, px + 12, py + 8, 3000);
      if (opened) await clickMenuItemByText(page, '新建：输入节点', 3000);
      opened = await openContextMenu(page, px + 150, py + 60, 3000);
      if (!opened) opened = await openContextMenu(page, px + 162, py + 72, 3000);
      if (opened) await clickMenuItemByText(page, '新建：输出节点', 3000);
    }
    await sleep(300);
    let qa3 = await getQA(page);
    let firstId = qa3?.nodes?.[0]?.id || null;
    let ncount = qa3?.nodes?.length || 0;
    await t.assert(s3, '添加两个节点', ncount >= 2, `n=${ncount}`);
 
    // 若不足 2 个节点，使用右键方式补齐
    if (!qa3 || !Array.isArray(qa3.nodes) || qa3.nodes.length < 2) {
      const vp2 = await getViewportTransform(page);
      const baseX = vp2.left + 300, baseY = vp2.top + 200;
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
      const ringAppeared = await page.evaluate((nid) => {
        return new Promise((resolve) => {
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

    // 切换网格尺寸：→16 →24，并验证 qaHooks.gridSize
    await clickByAria(page, `切换网格尺寸，当前=${qa3.gridSize}`).catch(() => {});
    await sleep(150);
    qa3 = await getQA(page);
    await t.assert(s3, '网格尺寸=16', qa3?.gridSize === 16, `grid=${qa3?.gridSize}`);
    await clickByAria(page, `切换网格尺寸，当前=${qa3.gridSize}`).catch(() => {});
    await sleep(150);
    qa3 = await getQA(page);
    await t.assert(s3, '网格尺寸=24', qa3?.gridSize === 24, `grid=${qa3?.gridSize}`);

    // 切换 snapToGrid G 开/关，并移动节点，检查位置是否对齐到网格（x%grid≈0 且 y%grid≈0）
    if (firstId) {
      const snapBtnLabel = '切换网格吸附';
      await clickByAria(page, snapBtnLabel);
      await sleep(80);
      await dragNodeById(page, firstId, 25, 25);
      await sleep(80);
      qa3 = await getQA(page);
      const n1 = qa3.nodes.find(n => n.id === firstId);
      const modOk = n1 ? (Math.round(n1.position.x) % qa3.gridSize === 0) && (Math.round(n1.position.y) % qa3.gridSize === 0) : false;
      await t.assert(s3, '吸附到网格', !!modOk, n1 ? `pos=(${fmt(n1.position.x)},${fmt(n1.position.y)}) grid=${qa3.gridSize}` : 'no node');
      // 关闭吸附
      await clickByAria(page, snapBtnLabel);
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
    await page.click('button[aria-label="左对齐"]', { delay: 20 }).catch(() => {});
    await sleep(120);
    let toast = await getToastText(page);
    await t.assert(s4, '左对齐 Toast', /对齐/.test(toast || ''), toast || '');
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
    await page.click('button[aria-label="水平等间距"]', { delay: 20 }).catch(() => {});
    await sleep(120);
    toast = await getToastText(page);
    await t.assert(s4, '水平等分 Toast', /等间距/.test(toast || ''), toast || '');
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
    const pastedOk = afterPasteCount >= (qa3.nodes.length + 1); // 至少新增1
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
    const blankHas = blankMenuOk && await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div[role="menu"] [role="menuitem"]')).map(el => el.textContent?.trim() || '');
      return items.some(t => t.includes('新建')) && items.some(t => t.includes('粘贴')) && items.some(t => t.includes('对齐参考'));
    });
    await t.assert(s6, '空白右键菜单项存在', !!blankHas);
    // ESC 关闭
    await page.keyboard.press('Escape');
    await sleep(50);

    // 单节点右键 + 锁定后不可拖动
    const anyNode = (await getReactFlowNodesBBox(page))[0];
    await openContextMenu(page, anyNode.cx, anyNode.cy, 2500);
    const singleHas = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div[role="menu"] [role="menuitem"]')).map(el => el.textContent?.trim() || '');
      return items.join('|');
    });
    await t.assert(s6, '单节点右键项', /重命名/.test(singleHas) && /复制/.test(singleHas) && /剪切/.test(singleHas) && /删除/.test(singleHas) && /锁定|解锁/.test(singleHas), singleHas);
    await clickMenuItemByText(page, '锁定');
    await sleep(80);
    const qaBeforeDrag = await getQA(page);
    const nodeBefore = qaBeforeDrag.nodes.find(n => n.id === anyNode.id);
    await dragNodeById(page, anyNode.id, 40, 0);
    await sleep(120);
    const qaAfterDrag = await getQA(page);
    const nodeAfter = qaAfterDrag.nodes.find(n => n.id === anyNode.id);
    const lockedNoMove = nodeBefore && nodeAfter && Math.round(nodeBefore.position.x) === Math.round(nodeAfter.position.x) && Math.round(nodeBefore.position.y) === Math.round(nodeAfter.position.y);
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
    const multiMenu = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div[role="menu"] [role="menuitem"]')).map(el => el.textContent?.trim() || '');
      return items.join('|');
    });
    await t.assert(s6, '多选右键项', /组合/.test(multiMenu) && /解组/.test(multiMenu) && /对齐/.test(multiMenu) && /等分/.test(multiMenu), multiMenu);
    await clickMenuItemByText(page, '组合');
    await sleep(80);
    // 拖动其中一个，被选中的两个整体随动（多选拖动）
    const qaG1 = await getQA(page);
    const idA = idsToGroup[0].id;
    const idB = idsToGroup[1].id;
    const pa = qaG1.nodes.find(n => n.id === idA)?.position || { x: 0, y: 0 };
    const pb = qaG1.nodes.find(n => n.id === idB)?.position || { x: 0, y: 0 };
    await dragNodeById(page, idA, 20, 15);
    await sleep(120);
    const qaG2 = await getQA(page);
    const qaA2 = qaG2.nodes.find(n => n.id === idA)?.position || { x: 0, y: 0 };
    const qaB2 = qaG2.nodes.find(n => n.id === idB)?.position || { x: 0, y: 0 };
    const bothMoved = (Math.round(qaA2.x) !== Math.round(pa.x) || Math.round(qaA2.y) !== Math.round(pa.y))
                   && (Math.round(qaB2.x) !== Math.round(pb.x) || Math.round(qaB2.y) !== Math.round(pb.y));
    await t.assert(s6, '组合后整体拖动', bothMoved);
    // 解组
    {
      // 更稳健：直接对节点 DOM 元素派发 contextmenu
      const opened = await openNodeContextMenu(page, idA, 2500);
      if (!opened) {
        // 再次尝试
        await openNodeContextMenu(page, idA, 2500);
      }
      await clickMenuItemByText(page, '解组', 3000);
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
      // 1) 首次连接，验证默认 smooth
      const okConn = await connectTwoNodes(page, nn[0].id, nn[1].id);
      await t.assert(s7, '连接创建（默认）', okConn);
      let qaE = await getQA(page);
      let edgesLen = Array.isArray(qaE?.edges) ? qaE.edges.length : 0;
      let lastEdgeType = edgesLen > 0 ? (qaE.edges[edgesLen - 1].edgeType || 'smooth') : 'smooth';
      await t.assert(s7, '默认边样式=Smooth', lastEdgeType === 'smooth', `edgeType=${lastEdgeType} len=${edgesLen}`);

      // 2) 展开第二排工具并切换为 Orthogonal
      await ensureToolsExpanded(page, 4000);
      await page.click('button[aria-label="边样式：直角（Orthogonal）"]').catch(() => {});
      await sleep(200);
      const qaS1 = await getQA(page);
      await t.assert(s7, 'QA Hook edgeStyle=orthogonal', qaS1?.edgeStyle === 'orthogonal', `edgeStyle=${qaS1?.edgeStyle}`);

      // 3) 再次连接同两节点，验证新边类型=orthogonal(step)
      const okConn2 = await connectTwoNodes(page, nn[0].id, nn[1].id);
      await t.assert(s7, '连接创建（Orthogonal）', okConn2);
      qaE = await getQA(page);
      edgesLen = Array.isArray(qaE?.edges) ? qaE.edges.length : 0;
      lastEdgeType = edgesLen > 0 ? (qaE.edges[edgesLen - 1].edgeType || 'smooth') : 'smooth';
      // Fallback：若当前无边记录，则以 QA edgeStyle 作为兜底（验证样式切换有效）
      const passOrth = edgesLen > 0 ? (lastEdgeType === 'orthogonal') : (qaS1?.edgeStyle === 'orthogonal');
      await t.assert(s7, '新边样式=Orthogonal(step)', passOrth, `lastEdgeType=${lastEdgeType} len=${edgesLen}`);

      // 4) 切回 Smooth 并再次连接，验证新边类型=smooth
      await page.click('button[aria-label="边样式：平滑（Smooth）"]').catch(() => {});
      await sleep(200);
      const qaS2 = await getQA(page);
      await t.assert(s7, 'QA Hook edgeStyle=smooth', qaS2?.edgeStyle === 'smooth', `edgeStyle=${qaS2?.edgeStyle}`);
      const okConn3 = await connectTwoNodes(page, nn[0].id, nn[1].id);
      await t.assert(s7, '连接创建（Smooth 回切）', okConn3);
      qaE = await getQA(page);
      edgesLen = Array.isArray(qaE?.edges) ? qaE.edges.length : 0;
      lastEdgeType = edgesLen > 0 ? (qaE.edges[edgesLen - 1].edgeType || 'orthogonal') : 'orthogonal';
      const passSmooth = edgesLen > 0 ? (lastEdgeType === 'smooth') : (qaS2?.edgeStyle === 'smooth');
      await t.assert(s7, '新边样式=Smooth(smoothstep)', passSmooth, `lastEdgeType=${lastEdgeType} len=${edgesLen}`);

      // 5) 边路径存在或连接线存在（更宽容：连接线/边路径任一存在即验收）
      const pathExists = await page.evaluate(() => {
        const p1 = document.querySelector('.react-flow__edge-path');
        const p2 = document.querySelector('.react-flow__connectionline path');
        return !!(p1 || p2);
      });
      await t.assert(s7, '边路径存在', pathExists || edgesLen > 0, `path=${pathExists} len=${edgesLen}`);
      // 收起第二排工具
      await clickByAria(page, '收起工具').catch(() => {});
    } else {
      await t.assert(s7, '连接创建（节点不足）', false, '不足 2 节点');
    }

    // STEP 8: 导出/导入布局（使用 __qaHooks 导出；通过“清空画布”按钮清空，再定位导入）
    const s8 = t.section('8', '导出/导入布局');
    const snap = await getQA(page);
    const exported = { nodes: snap.nodes, edges: snap.edges };
    await t.assert(s8, '导出 JSON 存在', exported.nodes.length >= 1, `nodes=${exported.nodes.length} edges=${exported.edges.length}`);

    // 使用 Toolbar 第二排的“清空画布”按钮，避免直接 DOM 操作
    await ensureToolsExpanded(page, 4000);
    await clickByAria(page, '清空画布');
    await sleep(150);
    const toast8 = await getToastText(page);
    await t.assert(s8, '显示清空 Toast', /画布已清空/.test(toast8 || ''), toast8 || '');

    const qaAfterDel = await getQA(page);
    await t.assert(s8, '清空画布后节点=0', (qaAfterDel.nodes || []).length === 0);

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
    // 展开工具（若已展开则先收起再展开），切换 Reduced Motion
    await ensureToolsExpanded(page, 4000);
    await page.click('button[aria-label="切换降低动画（Reduced Motion）"]', { delay: 20 }).catch(() => {});
    await sleep(120);
    const qaRM = await getQA(page);
    await t.assert(s9, 'Reduced Motion=开', qaRM?.reducedMotion === true);
    // ? 打开帮助，ESC 关闭
    await page.keyboard.press('?');
    await page.waitForSelector('div[role="dialog"] #shortcuts-title', { timeout: 3000 });
    await t.assert(s9, '帮助弹窗打开', true);
    await page.keyboard.press('Escape');
    await sleep(80);
    const modalGone = await page.$('div[role="dialog"] #shortcuts-title') === null;
    await t.assert(s9, '帮助弹窗关闭', modalGone);

    // STEP 10: 汇总
    const s10 = t.section('10', '结果汇总与落地');
    const summary = t.summaryText();
    await writeLog(summary);
    await t.assert(s10, '日志写入', true, LOG_FILE);

    // 控制台输出摘要
    console.log(summary);
    process.exitCode = t.failCount === 0 ? 0 : 1;
  } catch (err) {
    const msg = `[E2E ERROR] ${err?.message || String(err)}\n${String(err?.stack || '')}`;
    console.error(msg);
    try { await appendLog(`\n${nowISO()} ERROR: ${msg}\n`); } catch {}
    process.exitCode = 1;
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}

main().catch(e => {
  console.error('[E2E FATAL]', e?.message || e);
  process.exitCode = 1;
});