// 本工具：前端凭证分组本地持久化（版本 v1）
// 存储键名：vw_api_providers_v1

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'openai_compatible'
export type ProviderMode = 'direct' | 'proxy' | 'custom'

export interface ProviderKey {
  id: string
  label?: string
  api_key: string
  createdAt: string
}

export interface ProviderCredentialGroup {
  groupId: string
  provider: ProviderType
  mode: ProviderMode
  name?: string
  base_url?: string
  models: string[]
  enabled: boolean
  timeout?: number
  connect_timeout?: number
  enable_logging?: boolean
  keys: ProviderKey[]
}

export interface CredentialsStoreV1 {
  version: 'v1'
  groups: ProviderCredentialGroup[]
  active_provider?: string
  active_group_id?: string
}

const STORAGE_KEY = 'vw_api_providers_v1' as const

// 和后端 Python DEFAULT_MODELS 对齐：modules/llm_api_module/variables.py
const DEFAULT_MODELS: Record<ProviderType, string[]> = {
  openai: [
    'gpt-4',
    'gpt-4-turbo',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k',
  ],
  anthropic: [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
  ],
  gemini: [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.0-pro',
    'gemini-2.0-flash-exp',
  ],
  openai_compatible: [
    'gpt-3.5-turbo',
    'gpt-4',
    'custom-model',
  ],
}

// ========== 工具函数 ==========

function safeNowIso(): string {
  try {
    return new Date().toISOString()
  } catch {
    return '' // 极端环境返回空字符串
  }
}

function genId(prefix = 'key'): string {
  // 简单无依赖ID生成
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now()}_${rand}`
}
export function generateGroupId(): string {
  try {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    return `grp_${ts}_${rand}`;
  } catch {
    // 极端环境回退（避免部分浏览器奇怪行为）
    return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}

function normalizeBaseUrl(input?: string): string | undefined {
  if (!input) return undefined
  const trimmed = input.trim()
  if (!trimmed) return undefined
  // 去尾斜杠
  const withoutTrailing = trimmed.replace(/\/+$/g, '')
  return withoutTrailing
}

function shortNameFromBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return 'unknown'
  const raw = baseUrl.trim()
  if (!raw) return 'unknown'
  let hostLike = raw

  // 优先尝试URL解析
  try {
    const url = raw.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//) ? new URL(raw) : new URL(`http://${raw}`)
    const host = url.hostname || ''
    const firstPathSeg = (url.pathname || '').split('/').filter(Boolean)[0] || ''
    hostLike = firstPathSeg ? `${host}-${firstPathSeg}` : host
  } catch {
    // 回退：移除协议与斜杠
    hostLike = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '').replace(/^\/+|\/+$/g, '')
  }

  const simplified = hostLike
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // 非字母数字用 - 连接
    .replace(/^-+|-+$/g, '') // 去首尾-
  return simplified || 'unknown'
}

function isProviderType(x: string): x is ProviderType {
  return x === 'openai' || x === 'anthropic' || x === 'gemini' || x === 'openai_compatible'
}

function isProviderMode(x: string): x is ProviderMode {
  return x === 'direct' || x === 'proxy' || x === 'custom'
}

function ensureArrayString(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  return arr.filter((x) => typeof x === 'string') as string[]
}

function dedupeKeys(keys: ProviderKey[]): ProviderKey[] {
  const seen = new Set<string>()
  const out: ProviderKey[] = []
  for (const k of keys) {
    if (typeof k.api_key !== 'string') continue
    const keyStr = k.api_key
    if (seen.has(keyStr)) continue
    seen.add(keyStr)
    // 确保必要字段
    out.push({
      id: typeof k.id === 'string' && k.id ? k.id : genId('key'),
      label: typeof k.label === 'string' ? k.label : undefined,
      api_key: keyStr,
      createdAt: typeof k.createdAt === 'string' && k.createdAt ? k.createdAt : safeNowIso(),
    })
  }
  return out
}

function sanitizeGroup(input: any): ProviderCredentialGroup | null {
  if (!input || typeof input !== 'object') return null

  const groupId = typeof input.groupId === 'string' && input.groupId ? input.groupId : genId('group')

  // 兼容 'openai-compatible' 命名：在类型校验前做一次映射
  const rawProvider = typeof input.provider === 'string' ? input.provider : ''
  const normalizedProvider = rawProvider === 'openai-compatible' ? 'openai_compatible' : rawProvider
  const provider = typeof normalizedProvider === 'string' && isProviderType(normalizedProvider) ? (normalizedProvider as ProviderType) : null

  const mode = typeof input.mode === 'string' && isProviderMode(input.mode) ? input.mode : null
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : true
  const models = ensureArrayString(input.models)
  const base_url_raw = typeof input.base_url === 'string' ? input.base_url : undefined
  const nameRaw = typeof input.name === 'string' ? input.name.trim() : undefined
  const name = nameRaw === '' ? undefined : nameRaw

  // 放宽校验：proxy/custom 允许 base_url 为空，编辑期先持久化；仅在导出/使用前再做必填校验（阶段1不实现）
  let base_url: string | undefined
  if (typeof base_url_raw === 'string') {
    const trimmed = base_url_raw.trim()
    if (trimmed === '') {
      base_url = '' // 保留空字符串原值
    } else {
      base_url = normalizeBaseUrl(base_url_raw)
    }
  } else {
    base_url = undefined
  }

  if (!provider || !mode) return null

  // openai-compatible base_url 标准化（仅当 base_url 非空）
  if (typeof base_url === 'string' && base_url.trim() !== '') {
    const isCompat = (input?.provider === 'openai-compatible') || provider === 'openai_compatible'
    if (isCompat) {
      let u = base_url.replace(/\/+$/g, '')
      if (!/\/v1\/?$/.test(u)) u = `${u}/v1`
      base_url = u.replace(/\/+$/g, '')
    }
  }

  const keys = dedupeKeys(Array.isArray(input.keys) ? input.keys : [])

  const out: ProviderCredentialGroup = {
    groupId,
    provider,
    mode,
    ...(name ? { name } : {}),
    base_url,
    models,
    enabled,
    // 以下可选数值字段保留数值或忽略
    ...(typeof input.timeout === 'number' ? { timeout: input.timeout } : {}),
    ...(typeof input.connect_timeout === 'number' ? { connect_timeout: input.connect_timeout } : {}),
    ...(typeof input.enable_logging === 'boolean' ? { enable_logging: input.enable_logging } : {}),
    keys,
  }

  return out
}

function emptyStore(): CredentialsStoreV1 {
  return { version: 'v1', groups: [] }
}

// ========== 导出 API ==========

export function loadCredentials(): CredentialsStoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return emptyStore()
    }

    if (!parsed || typeof parsed !== 'object') return emptyStore()
    const obj = parsed as any

    if (obj.version !== 'v1') {
      // 版本不匹配，回退空结构
      return emptyStore()
    }

    const groupsRaw: unknown = obj.groups
    const groups: ProviderCredentialGroup[] = Array.isArray(groupsRaw)
      ? groupsRaw.map(sanitizeGroup).filter((g): g is ProviderCredentialGroup => !!g)
      : []

    const store: CredentialsStoreV1 = {
      version: 'v1',
      groups,
      ...(typeof obj.active_provider === 'string' ? { active_provider: obj.active_provider } : {}),
      ...(typeof obj.active_group_id === 'string' ? { active_group_id: obj.active_group_id } : {}),
    }

    // 进一步规范化：确保 base_url 去尾斜杠 + openai-compatible 自动补 /v1；当 base_url 为空字符串时跳过 normalize
    for (const g of store.groups) {
      if (typeof g.base_url === 'string' && g.base_url.trim() !== '') {
        let u = normalizeBaseUrl(g.base_url) || undefined
        if (u) {
          if (g.provider === 'openai_compatible') {
            u = u.replace(/\/+$/g, '')
            if (!/\/v1\/?$/.test(u)) u = `${u}/v1`
            u = u.replace(/\/+$/g, '')
          }
          g.base_url = u
        }
      }
    }

    // 一次性迁移：active_provider -> active_group_id
    if (!store.active_group_id && typeof store.active_provider === 'string') {
      const matched = store.groups.find((g) => g.provider === store.active_provider)
      if (matched) {
        store.active_group_id = matched.groupId
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
        } catch {}
      }
    }

    return store
  } catch {
    // localStorage 异常（Safari 隐私模式或额度满等），回退
    return emptyStore()
  }
}

export function saveCredentials(store: CredentialsStoreV1): void {
  try {
    // 仅在本地前端持久化，不抛异常
    const payload = JSON.stringify(store)
    localStorage.setItem(STORAGE_KEY, payload)
  } catch {
    // 忽略存储异常
  }
}

/**
 * 根据 provider 与模式创建默认分组
 * 组ID策略：
 *  - direct: `${provider}-直连`
 *  - proxy: `${provider}-反代-${baseUrl简称}`
 *  - custom: `${provider}-自定义-${baseUrl简称}`
 */
export function createDefaultGroup(
  provider: ProviderType | string,
  mode: ProviderMode,
  baseUrl?: string
): ProviderCredentialGroup {
  // 宽松入参，内部收敛
  const prov: ProviderType = isProviderType(provider) ? provider : 'openai'
  const normalized = normalizeBaseUrl(baseUrl)
  const abbr = shortNameFromBaseUrl(normalized)

  let groupId: string
  if (mode === 'direct') {
    groupId = `${prov}-直连`
  } else if (mode === 'proxy') {
    groupId = `${prov}-反代-${abbr}`
  } else {
    groupId = `${prov}-自定义-${abbr}`
  }

  const models = DEFAULT_MODELS[prov] ? [...DEFAULT_MODELS[prov]] : []

  const group: ProviderCredentialGroup = {
    groupId,
    provider: prov,
    mode,
    base_url: normalized,
    models,
    enabled: true,
    keys: [],
  }

  // direct 模式允许 base_url 为空；proxy/custom 模式需由调用方保证非空
  if (mode !== 'direct' && !group.base_url) {
    group.base_url = '' // 保留空字符串，便于UI校验提示
  }

  return group
}

export function addKeyToGroup(
  store: CredentialsStoreV1,
  groupId: string,
  apiKey: string,
  label?: string
): CredentialsStoreV1 {
  const next: CredentialsStoreV1 = {
    version: 'v1',
    groups: store.groups.map((g) => ({ ...g, keys: g.keys.slice() })),
    ...(store.active_provider ? { active_provider: store.active_provider } : {}),
    ...(store.active_group_id ? { active_group_id: store.active_group_id } : {}),
  }

  const grp = next.groups.find((g) => g.groupId === groupId)
  if (!grp) return next

  if (!apiKey || typeof apiKey !== 'string') return next
  const exists = grp.keys.some((k) => k.api_key === apiKey)
  if (exists) return next

  const key: ProviderKey = {
    id: genId('key'),
    label,
    api_key: apiKey,
    createdAt: safeNowIso(),
  }
  grp.keys.push(key)
  return next
}

export function removeKeyFromGroup(
  store: CredentialsStoreV1,
  groupId: string,
  keyId: string
): CredentialsStoreV1 {
  const next: CredentialsStoreV1 = {
    version: 'v1',
    groups: store.groups.map((g) => ({ ...g, keys: g.keys.slice() })),
    ...(store.active_provider ? { active_provider: store.active_provider } : {}),
    ...(store.active_group_id ? { active_group_id: store.active_group_id } : {}),
  }

  const grp = next.groups.find((g) => g.groupId === groupId)
  if (!grp) return next

  grp.keys = grp.keys.filter((k) => k.id !== keyId)
  return next
}

export function upsertGroup(
  store: CredentialsStoreV1,
  group: ProviderCredentialGroup
): CredentialsStoreV1 {
  const sanitized = sanitizeGroup(group)
  if (!sanitized) {
    // 非法入参则不修改（放宽校验已允许 base_url 为空）
    return store
  }

  const next: CredentialsStoreV1 = {
    version: 'v1',
    groups: store.groups.slice(),
    ...(store.active_provider ? { active_provider: store.active_provider } : {}),
    ...(store.active_group_id ? { active_group_id: store.active_group_id } : {}),
  }

  const idx = next.groups.findIndex((g) => g.groupId === sanitized.groupId)
  if (idx >= 0) {
    const prev = next.groups[idx]
    // 字段级合并，keys 做并集去重
    const mergedKeys = dedupeKeys([...(prev.keys || []), ...(sanitized.keys || [])])
    const merged: ProviderCredentialGroup = {
      ...prev,
      ...sanitized,
      keys: mergedKeys,
    }
    // base_url: 若未在本次入参中提供（undefined），保留原值；允许显式设为 ''（可编辑占位）
    if (sanitized.base_url === undefined) {
      merged.base_url = prev.base_url
    }
    next.groups[idx] = merged
  } else {
    next.groups.push(sanitized)
  }
  return next
}

export function deleteGroup(
  store: CredentialsStoreV1,
  groupId: string
): CredentialsStoreV1 {
  const next: CredentialsStoreV1 = {
    version: 'v1',
    groups: store.groups.filter((g) => g.groupId !== groupId),
    ...(store.active_provider ? { active_provider: store.active_provider } : {}),
    ...(store.active_group_id ? { active_group_id: store.active_group_id } : {}),
  }
  return next
}

export function setActiveGroup(
  store: CredentialsStoreV1,
  groupId: string
): CredentialsStoreV1 {
  // 仅前端设置字段，不触发后端
  return {
    version: 'v1',
    groups: store.groups.slice(),
    ...(store.active_provider ? { active_provider: store.active_provider } : {}),
    active_group_id: groupId,
  }
}

export function setActiveProvider(
  store: CredentialsStoreV1,
  providerKey: string
): CredentialsStoreV1 {
  // 兼容壳：根据 providerKey 匹配首个分组并委托给 setActiveGroup；DEV 打印弃用警告
  const target = store.groups.find((g) => g.provider === providerKey)
  let next = store
  if (target) {
    next = setActiveGroup(store, target.groupId)
  }
  try {
    console.warn('[DEPRECATED] setActiveProvider() 已弃用，请改用 setActiveGroup(groupId)')
  } catch {}
  return next
}

export function exportCredentials(store: CredentialsStoreV1): string {
  try {
    return JSON.stringify(store, null, 2)
  } catch {
    // 回退为最小可用JSON
    try {
      return JSON.stringify({ version: 'v1', groups: [] })
    } catch {
      return '{"version":"v1","groups":[]}'
    }
  }
}

export function importCredentials(jsonString: string): CredentialsStoreV1 {
  if (typeof jsonString !== 'string') return emptyStore()
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonString)
  } catch {
    return emptyStore()
  }

  const obj = parsed as Partial<CredentialsStoreV1>
  if (!obj || obj.version !== 'v1') {
    // 仅接收 v1；其他版本调用方自行处理迁移
    return emptyStore()
  }

  const groupsRaw: unknown = (obj as any).groups
  const groups: ProviderCredentialGroup[] = Array.isArray(groupsRaw)
    ? groupsRaw.map(sanitizeGroup).filter((g): g is ProviderCredentialGroup => !!g)
    : []

  const store: CredentialsStoreV1 = {
    version: 'v1',
    groups,
    ...(typeof obj.active_provider === 'string' ? { active_provider: obj.active_provider } : {}),
    ...(typeof (obj as any).active_group_id === 'string' ? { active_group_id: (obj as any).active_group_id } : {}),
  }
  return store
}