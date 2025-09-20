import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import App from './App'
import './i18n' // 初始化i18n
import 'antd/dist/reset.css'

// 根据当前语言设置Antd的locale
const getAntdLocale = () => {
  const currentLang = localStorage.getItem('i18nextLng') || 'zh-CN';
  return currentLang.startsWith('en') ? enUS : zhCN;
};

// 统一初始化 QA Hooks（仅在未存在时定义或以访问器形式合并，不覆盖 App 内只读 getter）
(() => {
  try {
    const w = window as any;
    const desc = Object.getOwnPropertyDescriptor(w, '__qaHooks');
    if (!desc || typeof desc.get !== 'function') {
      let inner: any = {};
      let lastRunId: string | undefined;
      let nodesCount: number | undefined;
      const seed: any = {
        setLastRunId: (id: string) => { lastRunId = String(id || ''); },
        getLastRunId: (): string | undefined => lastRunId,
        setNodesCount: (n: number) => { nodesCount = Number(n); },
        lastSelfTest: undefined,
      };
      Object.defineProperty(w, '__qaHooks', {
        configurable: true,
        enumerable: false,
        get() { return inner; },
        set(v: any) {
          if (v && typeof v === 'object') {
            // 将缺失的方法/字段注入到 App 定义的只读 hooks 上
            for (const k of Object.keys(seed)) {
              if (!(k in v)) {
                (v as any)[k] = seed[k];
              }
            }
            inner = v;
          } else {
            inner = v;
          }
        }
      });
      // 触发 setter，预先种入方法字段
      (w as any).__qaHooks = seed;
    } else {
      // 已存在访问器：确保必要字段存在
      const hooks = (window as any).__qaHooks || {};
      if (!('setLastRunId' in hooks)) hooks.setLastRunId = (id: string) => {};
      if (!('getLastRunId' in hooks)) hooks.getLastRunId = (): string | undefined => undefined;
      if (!('setNodesCount' in hooks)) hooks.setNodesCount = (n: number) => {};
      if (!('lastSelfTest' in hooks)) hooks.lastSelfTest = undefined;
    }
  } catch {}
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={getAntdLocale()}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)