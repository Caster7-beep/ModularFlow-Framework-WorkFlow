/**
 * QA 协同工具模块
 * - 本地持久化 localStorage key: 'vw_ui_issues'
 * - 队列上限 100 条，超过裁剪最旧
 * - 将 { uiIssues, addIssue, clearIssues, exportIssues } 挂载到 window.__qaHooks（与现有字段合并，不覆盖）
 */

export type IssueSeverity = 'low' | 'medium' | 'high';

export interface IssueAttachment {
  type: 'screenshot';
  dataUrl: string;
}

export interface Issue {
  id: string;
  ts: string; // ISO
  category: string;
  severity: IssueSeverity;
  title: string;
  steps: string;
  expected: string;
  actual: string;
  attachments?: IssueAttachment[];
  env: {
    ua: string;
    url: string;
    locale: string;
  };
  source: 'human';
}

const LS_KEY = 'vw_ui_issues';
const MAX_ISSUES = 100;

// 内部缓存，避免频繁解析
let cache: Issue[] | null = null;

function readFromLS(): Issue[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      cache = [];
      return cache;
    }
    const arr = JSON.parse(raw);
    cache = Array.isArray(arr) ? arr : [];
    return cache!;
  } catch {
    cache = [];
    return cache!;
  }
}

function writeToLS(list: Issue[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {}
  cache = list;
}

function clip(list: Issue[]): Issue[] {
  if (list.length <= MAX_ISSUES) return list;
  return list.slice(list.length - MAX_ISSUES);
}

function uuid(): string {
  try {
    // 现代浏览器
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return (crypto as any).randomUUID();
    }
  } catch {}
  // 退化实现
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getIssues(): Issue[] {
  // 返回副本，避免外部修改内部缓存
  return [...readFromLS()];
}

export function addIssue(issue: Omit<Issue, 'id' | 'ts' | 'env' | 'source'> & Partial<Pick<Issue, 'attachments'>>): Issue {
  const full: Issue = {
    id: uuid(),
    ts: new Date().toISOString(),
    category: String(issue.category || '其他'),
    severity: (['low', 'medium', 'high'] as IssueSeverity[]).includes(issue.severity as IssueSeverity)
      ? (issue.severity as IssueSeverity)
      : 'medium',
    title: String(issue.title || ''),
    steps: String(issue.steps || ''),
    expected: String(issue.expected || ''),
    actual: String(issue.actual || ''),
    attachments: Array.isArray(issue.attachments) ? issue.attachments : undefined,
    env: {
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      url: typeof location !== 'undefined' ? location.href : '',
      locale: (localStorage.getItem('i18nextLng') || navigator.language || 'zh-CN'),
    },
    source: 'human',
  };
  const list = readFromLS();
  const next = clip([...list, full]);
  writeToLS(next);
  // 同步到 window.__qaHooks
  try {
    const w = window as any;
    if (!w.__qaHooks || typeof w.__qaHooks !== 'object') {
      w.__qaHooks = {};
    }
    if (!Array.isArray(w.__qaHooks.uiIssues)) {
      w.__qaHooks.uiIssues = [];
    }
    // 覆盖为最新副本（不要持有原数组引用，避免外部直接 push）
    w.__qaHooks.uiIssues = [...next];
  } catch {}
  return full;
}

export function clearIssues(): void {
  writeToLS([]);
  try {
    const w = window as any;
    if (!w.__qaHooks || typeof w.__qaHooks !== 'object') {
      w.__qaHooks = {};
    }
    w.__qaHooks.uiIssues = [];
  } catch {}
}

export function exportIssues(): string {
  const data = getIssues();
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    // 最差情况返回空数组 JSON
    return '[]';
  }
}

export function mountHooks(): void {
  try {
    const w = window as any;
    // 确保 __qaHooks 是一个对象（遵守 main/App 已有 getter/setter 逻辑，尽量合并）
    const existing = w.__qaHooks;
    let hooks: any;
    if (existing && typeof existing === 'object') {
      hooks = existing;
    } else {
      hooks = {};
      w.__qaHooks = hooks;
    }

    // 将当前 issues 写入
    const issues = getIssues();
    hooks.uiIssues = Array.isArray(hooks.uiIssues) ? hooks.uiIssues : [];
    hooks.uiIssues = [...issues];

    // 方法挂载（若不存在时才挂，以免覆盖既有实现）
    if (typeof hooks.addIssue !== 'function') hooks.addIssue = (data: Parameters<typeof addIssue>[0]) => addIssue(data);
    if (typeof hooks.clearIssues !== 'function') hooks.clearIssues = () => clearIssues();
    if (typeof hooks.exportIssues !== 'function') hooks.exportIssues = () => exportIssues();

    // 不触碰其他已有字段（如 App/main 注入的 getter/setter）
  } catch {
    // 忽略错误，避免影响应用启动
  }
}

// 可选：便捷下载函数（供组件侧调用）
export function downloadIssuesJson(filename?: string) {
  const json = exportIssues();
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const name =
    filename ||
    `ui_issues_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}