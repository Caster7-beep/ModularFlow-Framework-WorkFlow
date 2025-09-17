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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={getAntdLocale()}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)