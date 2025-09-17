import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 导入翻译资源
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

// 支持的语言列表
export const supportedLanguages = {
  'zh-CN': {
    name: '简体中文',
    nativeName: '简体中文',
    flag: '🇨🇳'
  },
  'en-US': {
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸'
  }
} as const;

export type SupportedLanguage = keyof typeof supportedLanguages;

// i18n 配置
i18n
  .use(LanguageDetector) // 自动检测用户语言
  .use(initReactI18next) // 集成React
  .init({
    // 翻译资源
    resources: {
      'zh-CN': {
        translation: zhCN
      },
      'en-US': {
        translation: enUS
      }
    },
    
    // 默认语言
    fallbackLng: {
      'zh': ['zh-CN'],
      'zh-TW': ['zh-CN'],
      'zh-HK': ['zh-CN'],
      'en': ['en-US'],
      'default': ['zh-CN']
    },
    
    // 语言检测选项
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage']
    },
    
    // 插值配置
    interpolation: {
      escapeValue: false // React已经处理了XSS防护
    },
    
    // 调试模式（生产环境下关闭）
    debug: import.meta.env?.DEV || false,
    
    // 键值分隔符
    keySeparator: '.',
    nsSeparator: ':',
    
    // 处理缺失的键
    missingKeyHandler: (lng, ns, key, fallbackValue) => {
      if (import.meta.env?.DEV) {
        console.warn(`缺失翻译键: ${lng}:${ns}:${key}`);
      }
      return fallbackValue || key;
    }
  });

// 语言切换函数
export const changeLanguage = (language: SupportedLanguage) => {
  return i18n.changeLanguage(language);
};

// 获取当前语言
export const getCurrentLanguage = (): SupportedLanguage => {
  const currentLng = i18n.language;
  
  // 如果是支持的语言，直接返回
  if (isSupportedLanguage(currentLng)) {
    return currentLng;
  }
  
  // 处理语言变体
  if (currentLng.startsWith('zh')) {
    return 'zh-CN';
  }
  
  if (currentLng.startsWith('en')) {
    return 'en-US';
  }
  
  // 默认返回中文
  return 'zh-CN';
};

// 检查是否为支持的语言
export const isSupportedLanguage = (lng: string): lng is SupportedLanguage => {
  return lng in supportedLanguages;
};

// 获取浏览器首选语言
export const getBrowserLanguage = (): SupportedLanguage => {
  const browserLang = navigator.language;
  
  // 精确匹配
  if (isSupportedLanguage(browserLang)) {
    return browserLang;
  }
  
  // 处理中文变体
  if (browserLang.startsWith('zh')) {
    return 'zh-CN';
  }
  
  // 处理英文变体
  if (browserLang.startsWith('en')) {
    return 'en-US';
  }
  
  // 语言代码匹配（例如 'en' 匹配 'en-US'）
  const languageCode = browserLang.split('-')[0];
  const matchedLanguage = Object.keys(supportedLanguages).find(
    key => key.startsWith(languageCode)
  );
  
  if (matchedLanguage && isSupportedLanguage(matchedLanguage)) {
    return matchedLanguage;
  }
  
  // 默认返回中文
  return 'zh-CN';
};

// 格式化插值函数
export const formatMessage = (key: string, values?: Record<string, any>) => {
  return i18n.t(key, values);
};

// 复数处理函数
export const formatPlural = (key: string, count: number, values?: Record<string, any>) => {
  return i18n.t(key, { count, ...values });
};

// 日期时间格式化配置
export const getDateTimeFormats = (language: SupportedLanguage) => {
  const formats = {
    'zh-CN': {
      date: 'YYYY年MM月DD日',
      time: 'HH:mm:ss',
      datetime: 'YYYY年MM月DD日 HH:mm:ss',
      relative: {
        justNow: '刚刚',
        minutesAgo: '{{count}}分钟前',
        hoursAgo: '{{count}}小时前',
        daysAgo: '{{count}}天前'
      }
    },
    'en-US': {
      date: 'MMM DD, YYYY',
      time: 'HH:mm:ss',
      datetime: 'MMM DD, YYYY HH:mm:ss',
      relative: {
        justNow: 'just now',
        minutesAgo: '{{count}} minutes ago',
        hoursAgo: '{{count}} hours ago',
        daysAgo: '{{count}} days ago'
      }
    }
  };
  
  return formats[language];
};

// 数字格式化配置
export const getNumberFormats = (language: SupportedLanguage) => {
  const formats = {
    'zh-CN': {
      currency: '¥{{value}}',
      percentage: '{{value}}%',
      decimal: '{{value}}'
    },
    'en-US': {
      currency: '${{value}}',
      percentage: '{{value}}%',
      decimal: '{{value}}'
    }
  };
  
  return formats[language];
};

export default i18n;