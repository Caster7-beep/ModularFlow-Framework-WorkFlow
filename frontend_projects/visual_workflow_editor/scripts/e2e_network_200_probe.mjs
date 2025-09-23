/**
Network 200 Probe (UI-context via Puppeteer + in-page fetch)

- Opens the Visual Workflow Editor UI (http://localhost:3002)
- Triggers all required backend routes via in-page fetch calls (primary → fallback once on 404/405)
- Additionally tries one UI-driven save to let services/requestWithFallback() possibly emit "Fallback route engaged ..." in console.warning
- Writes evidence to scripts/logs/network_200_YYYYMMDD_HHMMSS.json and a UI screenshot
- Does NOT modify frontend/backend business code or add APIs
*/

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'logs');

const UI_URL = process.env.UI_URL || 'http://localhost:3002';
const API_BASE = (process.env.API_BASE || 'http://localhost:6502/api/v1').replace(/\/$/, '');

async function ensureLogDir() {
  try { await fs.mkdir(LOG_DIR, { recursive: true }); } catch {}
}

function nowStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function summarizeBody(body) {
  try {
    if (body == null) return null;
    const json = typeof body === 'string' ? body : JSON.stringify(body);
    return json.length > 300 ? json.slice(0, 300) + ' ...' : json;
  } catch {
    return null;
  }
}

async function main() {
  const stamp = nowStamp();
  await ensureLogDir();
  const outJson = path.join(LOG_DIR, `network_200_${stamp}.json`);
  const outPng = path.join(LOG_DIR, `network_200_${stamp}.png`);

  const result = {
    meta: {
      stamp: new Date().toISOString(),
      UI_URL,
      API_BASE,
      note: 'UI-context in-page fetch; primary→fallback only on 404/405. Console warnings captured for potential "Fallback route engaged ..." emitted by services if UI triggers it.',
    },
    evidence: {
      screenshot: path.relative(path.resolve(__dirname, '..'), outPng).replace(/\\/g, '/'),
      json: path.relative(path.resolve(__dirname, '..'), outJson).replace(/\\/g, '/'),
    },
    consoleWarnings: [],
    apis: [],
  };

  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    // Capture console warnings for "Fallback route engaged" if any UI-driven service calls fallback
    page.on('console', msg => {
      try {
        if (msg.type() === 'warning') {
          const text = msg.text() || '';
          result.consoleWarnings.push(text);
        }
      } catch {}
    });

    await page.goto(UI_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Try one UI-driven "保存工作流" to potentially exercise services.requestWithFallback()
    try {
      // Open save modal
      await page.waitForSelector('[aria-label="保存工作流"], [data-qa="btn-save"], button[title*="保存"]', { timeout: 8000 });
      await page.click('[aria-label="保存工作流"], [data-qa="btn-save"], button[title*="保存"]');

      // Type name into modal input
      await page.waitForSelector('.ant-modal input', { timeout: 8000 });
      const name = `vw_e2e_network_ui_${stamp}`;
      await page.type('.ant-modal input', name, { delay: 5 });

      // Confirm save (OK button)
      // Prefer OK text selectors, fallback to first primary button inside modal
      const okSelectors = [
        '.ant-modal .ant-btn-primary',
        '.ant-modal-footer .ant-btn-primary',
        '.ant-modal button:has(span:contains("保存"))',
      ];
      let clickedOK = false;
      for (const sel of okSelectors) {
        const exists = await page.$(sel);
        if (exists) {
          await page.click(sel);
          clickedOK = true;
          break;
        }
      }
      if (!clickedOK) {
        // fallback: press Enter
        await page.keyboard.press('Enter');
      }

      // Wait a bit for services call to complete and potential console.warning emission
      await page.waitForTimeout(1200);
    } catch (e) {
      // Non-fatal
    }

    // Utility: in-page fetch with primary → fallback (404/405 only)
    async function runProbes() {
      const toJsonSafe = async (res) => {
        if (!res) return null;
        try {
          return await res.json();
        } catch {
          try {
            const t = await res.text();
            return { raw: t?.slice?.(0, 400) || '' };
          } catch {
            return null;
          }
        }
      };

      const fetchPF = async ({ method = 'GET', primary, fallback, body }) => {
        const headers = { 'Content-Type': 'application/json' };
        const urlP = API_BASE + primary;
        const urlF = fallback ? (API_BASE + fallback) : null;
        let statusPrimary = null;
        let statusFinal = null;
        let usedFallback = false;
        let data = null;
        let urlUsed = urlP;

        try {
          const resP = await fetch(urlP, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });
          statusPrimary = resP.status;
          if (resP.ok) {
            statusFinal = resP.status;
            data = await toJsonSafe(resP);
            return { ok: true, statusPrimary, statusFinal, usedFallback, urlUsed, data };
          }
          const s = resP.status;
          if ((s === 404 || s === 405) && urlF) {
            usedFallback = true;
            urlUsed = urlF;
            const resF = await fetch(urlF, {
              method,
              headers,
              body: body ? JSON.stringify(body) : undefined,
            });
            statusFinal = resF.status;
            if (!resF.ok) {
              data = await toJsonSafe(resF);
              return { ok: false, statusPrimary, statusFinal, usedFallback, urlUsed, data };
            }
            data = await toJsonSafe(resF);
            return { ok: true, statusPrimary, statusFinal, usedFallback, urlUsed, data };
          } else {
            statusFinal = resP.status;
            data = await toJsonSafe(resP);
            return { ok: false, statusPrimary, statusFinal, usedFallback, urlUsed, data };
          }
        } catch (e) {
          return { ok: false, statusPrimary, statusFinal, usedFallback, urlUsed, data: { error: String(e?.message || e) } };
        }
      };

      const apis = [];

      // Create workflow
      const wfName = `vw_e2e_network_${Date.now()}`;
      const create = await fetchPF({
        method: 'POST',
        primary: '/visual_workflow/create_workflow',
        fallback: '/visual_workflow/create',
        body: { name: wfName, description: 'network 200 probe' },
      });
      apis.push({
        api: 'create_workflow',
        primaryUrl: '/visual_workflow/create_workflow',
        fallbackUrl: '/visual_workflow/create',
        usedFallback: create.usedFallback,
        statusPrimary: create.statusPrimary,
        statusFinal: create.statusFinal,
        ok: create.ok,
        urlUsed: create.urlUsed?.replace(API_BASE, ''),
        requestBody: summarizeBody({ name: wfName, description: 'network 200 probe' }),
        responseSummary: summarizeBody(create.data),
      });

      // Unwrap API-Gateway payload if present, then extract workflow_id
      const createdPayload = create && create.data ? create.data : null;
      const createdData = (createdPayload && createdPayload.success && createdPayload.data) ? createdPayload.data : createdPayload;
      const workflowId = (createdData && (createdData.workflow_id || createdData.id || (createdData.workflow && createdData.workflow.id))) || '';

      // List workflows
      const list = await fetchPF({
        method: 'GET',
        primary: '/visual_workflow/list_workflows',
        fallback: '/visual_workflow/list',
      });
      apis.push({
        api: 'list_workflows',
        primaryUrl: '/visual_workflow/list_workflows',
        fallbackUrl: '/visual_workflow/list',
        usedFallback: list.usedFallback,
        statusPrimary: list.statusPrimary,
        statusFinal: list.statusFinal,
        ok: list.ok,
        urlUsed: list.urlUsed?.replace(API_BASE, ''),
        requestBody: null,
        responseSummary: summarizeBody(list.data),
      });

      // Get workflow (detail) – requires an id; use created workflow if present
      if (workflowId) {
        const getW = await fetchPF({
          method: 'POST',
          primary: '/visual_workflow/get_workflow',
          fallback: '/visual_workflow/get',
          body: { workflow_id: workflowId },
        });
        apis.push({
          api: 'get_workflow',
          primaryUrl: '/visual_workflow/get_workflow',
          fallbackUrl: '/visual_workflow/get',
          usedFallback: getW.usedFallback,
          statusPrimary: getW.statusPrimary,
          statusFinal: getW.statusFinal,
          ok: getW.ok,
          urlUsed: getW.urlUsed?.replace(API_BASE, ''),
          requestBody: summarizeBody({ workflow_id: workflowId }),
          responseSummary: summarizeBody(getW.data),
        });
      } else {
        apis.push({
          api: 'get_workflow',
          note: 'skipped: no workflowId returned from create',
        });
      }

      // Update workflow (rename) if id exists
      if (workflowId) {
        const newName = `${wfName}_updated`;
        const update = await fetchPF({
          method: 'POST',
          primary: '/visual_workflow/update_workflow',
          fallback: '/visual_workflow/update',
          body: { workflow_id: workflowId, name: newName },
        });
        apis.push({
          api: 'update_workflow',
          primaryUrl: '/visual_workflow/update_workflow',
          fallbackUrl: '/visual_workflow/update',
          usedFallback: update.usedFallback,
          statusPrimary: update.statusPrimary,
          statusFinal: update.statusFinal,
          ok: update.ok,
          urlUsed: update.urlUsed?.replace(API_BASE, ''),
          requestBody: summarizeBody({ workflow_id: workflowId, name: newName }),
          responseSummary: summarizeBody(update.data),
        });
      } else {
        apis.push({
          api: 'update_workflow',
          note: 'skipped: no workflowId returned from create',
        });
      }

      // Get templates
      const templates = await fetchPF({
        method: 'GET',
        primary: '/visual_workflow/get_workflow_templates',
        fallback: '/visual_workflow/get_templates',
      });
      apis.push({
        api: 'get_workflow_templates',
        primaryUrl: '/visual_workflow/get_workflow_templates',
        fallbackUrl: '/visual_workflow/get_templates',
        usedFallback: templates.usedFallback,
        statusPrimary: templates.statusPrimary,
        statusFinal: templates.statusFinal,
        ok: templates.ok,
        urlUsed: templates.urlUsed?.replace(API_BASE, ''),
        requestBody: null,
        responseSummary: summarizeBody(templates.data),
      });

      // Execute workflow – requires id
      let executionId = '';
      if (workflowId) {
        const exec = await fetchPF({
          method: 'POST',
          primary: '/visual_workflow/execute_workflow',
          fallback: '/visual_workflow/execute',
          body: { workflow_id: workflowId, input_data: { input: 'ping' } },
        });
        apis.push({
          api: 'execute_workflow',
          primaryUrl: '/visual_workflow/execute_workflow',
          fallbackUrl: '/visual_workflow/execute',
          usedFallback: exec.usedFallback,
          statusPrimary: exec.statusPrimary,
          statusFinal: exec.statusFinal,
          ok: exec.ok,
          urlUsed: exec.urlUsed?.replace(API_BASE, ''),
          requestBody: summarizeBody({ workflow_id: workflowId, input_data: { input: 'ping' } }),
          responseSummary: summarizeBody(exec.data),
        });
        // Try pulling executionId from response
        try {
          const execPayload = exec && exec.data ? exec.data : null;
          const execData = (execPayload && execPayload.success && execPayload.data) ? execPayload.data : execPayload;
          const d = execData || {};
          executionId = d.execution_id || d.id || d.run_id || '';
        } catch {}
      } else {
        apis.push({
          api: 'execute_workflow',
          note: 'skipped: no workflowId returned from create',
        });
      }

      // get_execution_state – try using execution_id first; if missing try the alternate body used by services (workflow_id: executionId)
      if (executionId) {
        let ges = await fetchPF({
          method: 'POST',
          primary: '/visual_workflow/get_execution_state',
          fallback: null, // legacy alt body rather than path
          body: { execution_id: executionId },
        });
        // If not ok, try alternate body shape used by services layer
        if (!ges.ok) {
          ges = await fetchPF({
            method: 'POST',
            primary: '/visual_workflow/get_execution_state',
            fallback: null,
            body: { workflow_id: executionId },
          });
        }
        apis.push({
          api: 'get_execution_state',
          primaryUrl: '/visual_workflow/get_execution_state',
          fallbackUrl: null,
          usedFallback: ges.usedFallback,
          statusPrimary: ges.statusPrimary,
          statusFinal: ges.statusFinal,
          ok: ges.ok,
          urlUsed: ges.urlUsed?.replace(API_BASE, ''),
          requestBody: summarizeBody({ tried: ['{execution_id}', '{workflow_id}'], executionId }),
          responseSummary: summarizeBody(ges.data),
        });
      } else {
        apis.push({
          api: 'get_execution_state',
          note: 'skipped: no executionId returned by execute',
        });
      }

      // Delete workflow at the end (cleanup)
      if (workflowId) {
        const del = await fetchPF({
          method: 'POST',
          primary: '/visual_workflow/delete_workflow',
          fallback: '/visual_workflow/delete',
          body: { workflow_id: workflowId },
        });
        apis.push({
          api: 'delete_workflow',
          primaryUrl: '/visual_workflow/delete_workflow',
          fallbackUrl: '/visual_workflow/delete',
          usedFallback: del.usedFallback,
          statusPrimary: del.statusPrimary,
          statusFinal: del.statusFinal,
          ok: del.ok,
          urlUsed: del.urlUsed?.replace(API_BASE, ''),
          requestBody: summarizeBody({ workflow_id: workflowId }),
          responseSummary: summarizeBody(del.data),
        });
      } else {
        apis.push({
          api: 'delete_workflow',
          note: 'skipped: no workflowId returned from create',
        });
      }

      return apis;
    }

    const apis = await page.evaluate(
      (UI_URL, API_BASE) => {
        return (async () => {
          // The function above (runProbes) in page context:
          const toJsonSafe = async (res) => {
            if (!res) return null;
            try {
              return await res.json();
            } catch {
              try {
                const t = await res.text();
                return { raw: t?.slice?.(0, 400) || '' };
              } catch {
                return null;
              }
            }
          };

          const summarizeBody = (body) => {
            try {
              if (body == null) return null;
              const json = typeof body === 'string' ? body : JSON.stringify(body);
              return json.length > 300 ? json.slice(0, 300) + ' ...' : json;
            } catch {
              return null;
            }
          };

          const fetchPF = async ({ method = 'GET', primary, fallback, body }) => {
            const headers = { 'Content-Type': 'application/json' };
            const urlP = API_BASE + primary;
            const urlF = fallback ? (API_BASE + fallback) : null;
            let statusPrimary = null;
            let statusFinal = null;
            let usedFallback = false;
            let data = null;
            let urlUsed = urlP;

            try {
              const resP = await fetch(urlP, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
              });
              statusPrimary = resP.status;
              if (resP.ok) {
                statusFinal = resP.status;
                data = await toJsonSafe(resP);
                return { ok: true, statusPrimary, statusFinal, usedFallback, urlUsed, data };
              }
              const s = resP.status;
              if ((s === 404 || s === 405) && urlF) {
                usedFallback = true;
                urlUsed = urlF;
                const resF = await fetch(urlF, {
                  method,
                  headers,
                  body: body ? JSON.stringify(body) : undefined,
                });
                statusFinal = resF.status;
                if (!resF.ok) {
                  data = await toJsonSafe(resF);
                  return { ok: false, statusPrimary, statusFinal, usedFallback, urlUsed, data };
                }
                data = await toJsonSafe(resF);
                return { ok: true, statusPrimary, statusFinal, usedFallback, urlUsed, data };
              } else {
                statusFinal = resP.status;
                data = await toJsonSafe(resP);
                return { ok: false, statusPrimary, statusFinal, usedFallback, urlUsed, data };
              }
            } catch (e) {
              return { ok: false, statusPrimary, statusFinal, usedFallback, urlUsed, data: { error: String(e?.message || e) } };
            }
          };

          const apis = [];

          const wfName = `vw_e2e_network_${Date.now()}`;
          const create = await fetchPF({
            method: 'POST',
            primary: '/visual_workflow/create_workflow',
            fallback: '/visual_workflow/create',
            body: { name: wfName, description: 'network 200 probe' },
          });
          apis.push({
            api: 'create_workflow',
            primaryUrl: '/visual_workflow/create_workflow',
            fallbackUrl: '/visual_workflow/create',
            usedFallback: create.usedFallback,
            statusPrimary: create.statusPrimary,
            statusFinal: create.statusFinal,
            ok: create.ok,
            urlUsed: create.urlUsed?.replace(API_BASE, ''),
            requestBody: summarizeBody({ name: wfName, description: 'network 200 probe' }),
            responseSummary: summarizeBody(create.data),
          });

          // Unwrap API-Gateway payload if present, then extract workflow_id
          const createdPayload = create && create.data ? create.data : null;
          const createdData = (createdPayload && createdPayload.success && createdPayload.data) ? createdPayload.data : createdPayload;
          const workflowId = (createdData && (createdData.workflow_id || createdData.id || (createdData.workflow && createdData.workflow.id))) || '';

          // list
          const list = await fetchPF({
            method: 'GET',
            primary: '/visual_workflow/list_workflows',
            fallback: '/visual_workflow/list',
          });
          apis.push({
            api: 'list_workflows',
            primaryUrl: '/visual_workflow/list_workflows',
            fallbackUrl: '/visual_workflow/list',
            usedFallback: list.usedFallback,
            statusPrimary: list.statusPrimary,
            statusFinal: list.statusFinal,
            ok: list.ok,
            urlUsed: list.urlUsed?.replace(API_BASE, ''),
            requestBody: null,
            responseSummary: summarizeBody(list.data),
          });

          if (workflowId) {
            const getW = await fetchPF({
              method: 'POST',
              primary: '/visual_workflow/get_workflow',
              fallback: '/visual_workflow/get',
              body: { workflow_id: workflowId },
            });
            apis.push({
              api: 'get_workflow',
              primaryUrl: '/visual_workflow/get_workflow',
              fallbackUrl: '/visual_workflow/get',
              usedFallback: getW.usedFallback,
              statusPrimary: getW.statusPrimary,
              statusFinal: getW.statusFinal,
              ok: getW.ok,
              urlUsed: getW.urlUsed?.replace(API_BASE, ''),
              requestBody: summarizeBody({ workflow_id: workflowId }),
              responseSummary: summarizeBody(getW.data),
            });
          } else {
            apis.push({ api: 'get_workflow', note: 'no workflowId' });
          }

          if (workflowId) {
            const newName = `${wfName}_updated`;
            const update = await fetchPF({
              method: 'POST',
              primary: '/visual_workflow/update_workflow',
              fallback: '/visual_workflow/update',
              body: { workflow_id: workflowId, name: newName },
            });
            apis.push({
              api: 'update_workflow',
              primaryUrl: '/visual_workflow/update_workflow',
              fallbackUrl: '/visual_workflow/update',
              usedFallback: update.usedFallback,
              statusPrimary: update.statusPrimary,
              statusFinal: update.statusFinal,
              ok: update.ok,
              urlUsed: update.urlUsed?.replace(API_BASE, ''),
              requestBody: summarizeBody({ workflow_id: workflowId, name: newName }),
              responseSummary: summarizeBody(update.data),
            });
          } else {
            apis.push({ api: 'update_workflow', note: 'no workflowId' });
          }

          const templates = await fetchPF({
            method: 'GET',
            primary: '/visual_workflow/get_workflow_templates',
            fallback: '/visual_workflow/get_templates',
          });
          apis.push({
            api: 'get_workflow_templates',
            primaryUrl: '/visual_workflow/get_workflow_templates',
            fallbackUrl: '/visual_workflow/get_templates',
            usedFallback: templates.usedFallback,
            statusPrimary: templates.statusPrimary,
            statusFinal: templates.statusFinal,
            ok: templates.ok,
            urlUsed: templates.urlUsed?.replace(API_BASE, ''),
            requestBody: null,
            responseSummary: summarizeBody(templates.data),
          });

          let executionId = '';
          if (workflowId) {
            const exec = await fetchPF({
              method: 'POST',
              primary: '/visual_workflow/execute_workflow',
              fallback: '/visual_workflow/execute',
              body: { workflow_id: workflowId, input_data: { input: 'ping' } },
            });
            apis.push({
              api: 'execute_workflow',
              primaryUrl: '/visual_workflow/execute_workflow',
              fallbackUrl: '/visual_workflow/execute',
              usedFallback: exec.usedFallback,
              statusPrimary: exec.statusPrimary,
              statusFinal: exec.statusFinal,
              ok: exec.ok,
              urlUsed: exec.urlUsed?.replace(API_BASE, ''),
              requestBody: summarizeBody({ workflow_id: workflowId, input_data: { input: 'ping' } }),
              responseSummary: summarizeBody(exec.data),
            });
            try {
              const execPayload = exec && exec.data ? exec.data : null;
              const execData = (execPayload && execPayload.success && execPayload.data) ? execPayload.data : execPayload;
              const d = execData || {};
              executionId = d.execution_id || d.id || d.run_id || '';
            } catch {}
          } else {
            apis.push({ api: 'execute_workflow', note: 'no workflowId' });
          }

          if (executionId) {
            let ges = await fetchPF({
              method: 'POST',
              primary: '/visual_workflow/get_execution_state',
              fallback: null,
              body: { execution_id: executionId },
            });
            if (!ges.ok) {
              ges = await fetchPF({
                method: 'POST',
                primary: '/visual_workflow/get_execution_state',
                fallback: null,
                body: { workflow_id: executionId },
              });
            }
            apis.push({
              api: 'get_execution_state',
              primaryUrl: '/visual_workflow/get_execution_state',
              fallbackUrl: null,
              usedFallback: ges.usedFallback,
              statusPrimary: ges.statusPrimary,
              statusFinal: ges.statusFinal,
              ok: ges.ok,
              urlUsed: ges.urlUsed?.replace(API_BASE, ''),
              requestBody: summarizeBody({ tried: ['{execution_id}', '{workflow_id}'], executionId }),
              responseSummary: summarizeBody(ges.data),
            });
          } else {
            apis.push({ api: 'get_execution_state', note: 'no executionId' });
          }

          if (workflowId) {
            const del = await fetchPF({
              method: 'POST',
              primary: '/visual_workflow/delete_workflow',
              fallback: '/visual_workflow/delete',
              body: { workflow_id: workflowId },
            });
            apis.push({
              api: 'delete_workflow',
              primaryUrl: '/visual_workflow/delete_workflow',
              fallbackUrl: '/visual_workflow/delete',
              usedFallback: del.usedFallback,
              statusPrimary: del.statusPrimary,
              statusFinal: del.statusFinal,
              ok: del.ok,
              urlUsed: del.urlUsed?.replace(API_BASE, ''),
              requestBody: summarizeBody({ workflow_id: workflowId }),
              responseSummary: summarizeBody(del.data),
            });
          } else {
            apis.push({ api: 'delete_workflow', note: 'no workflowId' });
          }

          return apis;
        })();
      },
      UI_URL,
      API_BASE
    );

    result.apis = apis;

    // Screenshot UI for evidence
    try {
      await page.screenshot({ path: outPng, fullPage: true });
    } catch {}

    // Write JSON
    await fs.writeFile(outJson, JSON.stringify(result, null, 2), 'utf8');

    // Also append a short line to last_e2e.txt for quick reference
    try {
      const lastLog = path.join(__dirname, 'logs', 'last_e2e.txt');
      const okAll = result.apis
        .filter(x => x && typeof x === 'object' && 'api' in x && 'ok' in x)
        .every(x => x.ok === true);
      const line = `--- ${new Date().toISOString()} [NETWORK-200] ${okAll ? 'PASS' : 'PARTIAL'} | ${path.basename(outJson)} | warnings=${result.consoleWarnings.length}\n`;
      await fs.appendFile(lastLog, line, 'utf8');
    } catch {}

    console.log('[NETWORK-200] Evidence written:');
    console.log('-', outJson);
    console.log('-', outPng);
  } catch (err) {
    console.error('[NETWORK-200] ERROR:', err?.message || String(err));
    process.exitCode = 1;
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}

main().catch(e => {
  console.error('[NETWORK-200] FATAL:', e?.message || String(e));
  process.exitCode = 1;
});