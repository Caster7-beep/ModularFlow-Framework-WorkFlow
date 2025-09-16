export const API_BASE_URL: string = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';

export const getWsUrl = (): string => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
};

export type FileItem = {
  name: string;
  path: string;
  display_name?: string;
  size?: number;
  modified?: string;
  full_path?: string;
  extension?: string;
};

export type ConfigGroup = {
  display_name: string;
  icon: string;
  files: FileItem[];
  has_files?: boolean;
};

export type ConfigOptions = Partial<Record<'presets' | 'world_books' | 'regex_rules' | 'characters' | 'personas' | 'conversations', ConfigGroup>>;

export type ActiveConfig = {
  preset?: string | null;
  world_book?: string | null;
  regex_rule?: string | null;
  character?: string | null;
  conversation?: string | null;
};

export const CONFIG_KEY_MAP = {
  presets: 'preset',
  world_books: 'world_book',
  regex_rules: 'regex_rule',
  characters: 'character',
  conversations: 'conversation',
} as const;

export type FrontendConfigKey = keyof typeof CONFIG_KEY_MAP;
export type BackendConfigKey = (typeof CONFIG_KEY_MAP)[FrontendConfigKey];

export const mapFrontendToBackendKey = (k: FrontendConfigKey): BackendConfigKey => CONFIG_KEY_MAP[k];

export const unwrapData = <T, R extends { data?: T } | T>(json: R): T => {
  // 某些网关会包一层 { data: {...} }
  return (json as any)?.data ?? (json as any);
};