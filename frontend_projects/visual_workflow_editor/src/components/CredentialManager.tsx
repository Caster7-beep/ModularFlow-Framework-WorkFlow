import { CopyOutlined, DeleteOutlined, ExportOutlined, ImportOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Collapse, Divider, Form, Input, Modal, Popconfirm, Select, Space, Tag, Typography, message } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addKeyToGroup,
  deleteGroup,
  exportCredentials,
  importCredentials,
  loadCredentials,
  removeKeyFromGroup,
  saveCredentials,
  setActiveGroup,
  upsertGroup,
  generateGroupId,
  type CredentialsStoreV1,
  type ProviderCredentialGroup,
} from '../utils/credentials';

/**
 * 说明（遵照 ui美化规范.md 与现有 theme/App.css 变量）：
 * - 黑白极简：主色黑(#0B0B0B)，表面白(#FFFFFF)，边框 #0B0B0B 或 var(--color-border)
 * - 48×48 触达尺寸：主要操作按钮保持最小高48
 * - 4/8pt 间距：gaps使用 8/16 等
 * - 圆角≤4px：按钮/容器 borderRadius=2~4px
 * - 不引入新依赖，沿用 AntD 组件
 * - 文案优先 i18n，不存在的键使用本地回退
 */

type Props = {
  open: boolean;
  onClose: () => void;
};

const providerOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic (Claude)', value: 'anthropic' },
  { label: 'Google Gemini', value: 'gemini' },
  { label: 'OpenAI-Compatible (Custom)', value: 'openai_compatible' },
] as const;


const popupInModal = (trigger?: HTMLElement): HTMLElement => {
  return (
    (trigger?.closest('.ant-modal-root') as HTMLElement) ||
    (trigger?.closest('.ant-modal-wrap') as HTMLElement) ||
    (trigger?.parentElement as HTMLElement) ||
    document.body
  );
};

const fieldStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  color: '#0B0B0B',
  borderColor: '#0B0B0B',
  borderRadius: 2,
};

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  color: '#0B0B0B',
};

const CredentialManager: React.FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [store, setStore] = useState<CredentialsStoreV1>(loadCredentials());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(store.groups[0]?.groupId ?? null);

  const modeOptions = useMemo(() => ([
    { label: t('credentials.mode.direct'), value: 'direct' },
    { label: t('credentials.mode.proxy'), value: 'proxy' },
    { label: t('credentials.mode.custom'), value: 'custom' },
  ]), [t]);

  const activeGroup = useMemo(
    () => store.groups.find(g => g.groupId === activeGroupId) || null,
    [store, activeGroupId]
  );

  useEffect(() => {
    // 每次打开时同步存储（容错）
    if (open) {
      try {
        setStore(loadCredentials());
        if (!activeGroupId && loadCredentials().groups[0]) {
          setActiveGroupId(loadCredentials().groups[0].groupId);
        }
      } catch {}
    }
  }, [open]);

  const persist = (next: CredentialsStoreV1) => {
    setStore(next);
    try {
      saveCredentials(next);
    } catch {}
  };

  const handleAddGroup = async () => {
    // 生成唯一 groupId，并构造直连可编辑默认分组对象
    const gid = generateGroupId();
    const newGroup: ProviderCredentialGroup = {
      groupId: gid,
      provider: 'openai',
      mode: 'direct',
      base_url: '',
      name: undefined,
      keys: [],
      enabled: true,
      models: [],
      timeout: 30000,
      connect_timeout: 10000,
      enable_logging: false,
    };
    // upsert 并设为活动分组（写入 active_group_id）
    const next1 = upsertGroup(store, newGroup);
    const next2 = setActiveGroup(next1, gid);
    persist(next2);
    // 同步本地编辑选择态
    setActiveGroupId(gid);
    // 重置并填充表单缓冲（键录入表单）
    try {
      form.resetFields();
      form.setFieldsValue({ api_key: '', label: '' });
    } catch {}
    // 成功提示
    message.success(t('credentials.groupCreated'));
  };

  const handleDeleteGroup = async (groupId: string) => {
    const next = deleteGroup(store, groupId);
    persist(next);
    if (activeGroupId === groupId) {
      setActiveGroupId(next.groups[0]?.groupId ?? null);
    }
    message.success(t('credentials.deleted'));
  };

  const handleGroupChange = (patch: Partial<ProviderCredentialGroup>) => {
    if (!activeGroup) return;
    const merged: ProviderCredentialGroup = {
      ...activeGroup,
      ...patch,
      // patch 可能更改 provider 或 mode，需要协调 base_url 可见性
    };
    const next = upsertGroup(store, merged);
    persist(next);
  };

  const handleAddKey = async (apiKey: string, label?: string) => {
    if (!activeGroup) return;
    const value = apiKey?.trim();
    if (!value) {
      message.warning(t('credentials.inputKey'));
      return;
    }
    // UI 层补齐重复提示：若当前分组已存在该 Key，则仅提示“已存在”，不触发“已保存”
    const exists = (activeGroup.keys || []).some(k => k.api_key === value);
    if (exists) {
      message.warning(t('credentials.keyExists'));
      return;
    }
    const next = addKeyToGroup(store, activeGroup.groupId, value, label?.trim());
    persist(next);
    message.success(t('credentials.saved'));
  };

  const handleRemoveKey = async (keyId: string) => {
    if (!activeGroup) return;
    const next = removeKeyFromGroup(store, activeGroup.groupId, keyId);
    persist(next);
    message.success(t('credentials.deleted'));
  };

  const handleSetActiveGroup = async (groupId: string) => {
    const next = setActiveGroup(store, groupId);
    persist(next);
    message.success(t('credentials.saved'));
  };

  const handleExport = () => {
    try {
      const data = exportCredentials(store);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vw_credentials.json';
      a.click();
      URL.revokeObjectURL(url);
      message.success(t('credentials.exported'));
    } catch {
      message.error(t('credentials.exportFailed'));
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e: any) => {
      const file = e?.target?.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = importCredentials(text);
        // 合并策略：简单覆盖（可按需改成合并）
        persist(parsed);
        setActiveGroupId(parsed.groups[0]?.groupId ?? null);
        message.success(t('credentials.imported'));
      } catch (err: any) {
        message.error(t('credentials.importFailed'));
      }
    };
    input.click();
  };

  // 分组标题显示（provider + mode + base_url 简称）
  const groupLabel = (g: ProviderCredentialGroup) => {
    if (typeof g.name === 'string' && g.name.trim()) return g.name.trim();
    const providerTitle =
      g.provider === 'openai' ? 'OpenAI' :
      g.provider === 'anthropic' ? 'Claude' :
      g.provider === 'gemini' ? 'Gemini' :
      'OpenAI-Compatible';
    const modeTitle =
      g.mode === 'direct' ? t('credentials.mode.direct') :
      g.mode === 'proxy' ? t('credentials.mode.proxy') : t('credentials.mode.custom');
    const baseHint = g.mode !== 'direct' && g.base_url ? ` (${g.base_url})` : '';
    return `${providerTitle} - ${modeTitle}${baseHint}`;
  };

  // Keys 录入表单临时状态
  const [form] = Form.useForm();
  const submitAddKey = async () => {
    const v = await form.validateFields();
    await handleAddKey(v.api_key, v.label);
    form.resetFields();
  };

  // 官方代理折叠区（仅当 provider 为官方渠道 且 mode=proxy 显示；custom 不显示折叠区，直接要求 base_url）
  const showOfficialProxyFold = activeGroup
    ? (activeGroup.mode === 'proxy' && (activeGroup.provider === 'openai' || activeGroup.provider === 'anthropic' || activeGroup.provider === 'gemini'))
    : false;

  return (
    <Modal
        title={t('credentials.title')}
        open={open}
        onCancel={onClose}
        footer={null}
        width={860}
        maskClosable={true}
        keyboard={true}
        zIndex={2100}
        getContainer={() => document.body}
        rootClassName="vw-credentials-modal"
      >
      <div className="flex flex-col gap-3">
        {/* 顶部操作栏：新增分组 / 导入 / 导出 */}
        <div className="flex items-center justify-between">
          <Space>
            <Button
              icon={<PlusOutlined />}
              onClick={handleAddGroup}
              aria-label="creds-add-group"
              data-qa="creds-add-group"
              size="large"
              style={{ ...fieldStyle, minHeight: 48, minWidth: 48 }}
            >
              {t('credentials.addGroup')}
            </Button>
            <Button
              icon={<ImportOutlined />}
              onClick={handleImport}
              aria-label="import-credentials"
              data-qa="creds-import"
              size="large"
              style={{ ...fieldStyle, minHeight: 48, minWidth: 48 }}
            >
              {t('credentials.import')}
            </Button>
            <Button
              icon={<ExportOutlined />}
              onClick={handleExport}
              aria-label="export-credentials"
              data-qa="creds-export"
              size="large"
              style={{ backgroundColor: '#0B0B0B', color: '#FFFFFF', borderColor: '#0B0B0B', borderRadius: 2, minHeight: 48, minWidth: 48 }}
            >
              {t('credentials.export')}
            </Button>
          </Space>
          <div>
            <Typography.Text>{t('credentials.activeProvider')}:&nbsp;</Typography.Text>
            <Select
              style={{ minWidth: 260 }}
              value={store.active_group_id || undefined}
              placeholder={t('credentials.selectActive')}
              onChange={(v) => handleSetActiveGroup(v)}
              options={store.groups.map(g => ({ label: groupLabel(g), value: g.groupId }))}
              data-qa="active-group-select"
              aria-label="active-group-select"
              getPopupContainer={popupInModal}
              dropdownStyle={{ zIndex: 3000 }}
              dropdownMatchSelectWidth={false}
            />
          </div>
        </div>

        <Divider style={{ margin: '8px 0' }} />

        <div className="grid md:grid-cols-3 gap-3">
          {/* 左侧：分组列表 */}
          <div className="space-y-2">
            <div style={sectionTitleStyle}>{t('credentials.groups')}</div>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, padding: 8, background: '#fff', maxHeight: 360, overflowY: 'auto' }}>
              {store.groups.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>{t('credentials.noGroups')}</div>
              ) : (
                store.groups.map(g => (
                  <div
                    key={g.groupId}
                    onClick={() => setActiveGroupId(g.groupId)}
                    style={{
                      padding: 8,
                      marginBottom: 6,
                      border: '1px solid #f0f0f0',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: activeGroupId === g.groupId ? '#f5f5f5' : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{groupLabel(g)}</div>
                        <div style={{ color: '#666', fontSize: 12 }}>{t('credentials.keysCount')}: {g.keys?.length || 0}</div>
                      </div>
                      <Space>
                        <Popconfirm
                          title={t('common.delete', '删除')}
                          description={t('credentials.confirmDeleteGroup')}
                          onConfirm={() => handleDeleteGroup(g.groupId)}
                        >
                          <Button
                            icon={<DeleteOutlined />}
                            style={{ ...fieldStyle, minWidth: 48, minHeight: 48 }}
                            aria-label="delete-group"
                            data-qa="creds-group-delete"
                            size="large"
                          />
                        </Popconfirm>
                      </Space>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 右侧两列：分组详情 + 密钥管理 */}
          <div className="md:col-span-2 space-y-2">
            <div style={sectionTitleStyle}>{t('credentials.groupDetail')}</div>
            {!activeGroup ? (
              <div style={{ color: '#666', fontSize: 12 }}>{t('credentials.selectGroup')}</div>
            ) : (
              <>
                {/* 分组显示名称（优先用于下拉与标题） */}
                <div>
                  <div className="text-xs" style={{ color: '#666', marginBottom: 4 }}>{t('credentials.groupName')}</div>
                  <Input
                    placeholder={t('credentials.groupNamePlaceholder', '请输入分组名称')}
                    value={activeGroup.name || ''}
                    onChange={(e) => handleGroupChange({ name: e.target.value })}
                    style={fieldStyle}
                  />
                </div>

                <div className="grid md:grid-cols-3 gap-2" style={{ marginTop: 8 }}>
                  <div>
                    <div className="text-xs" style={{ color: '#666', marginBottom: 4 }}>{t('credentials.provider')}</div>
                    <Select
                      value={activeGroup.provider}
                      onChange={(v) => handleGroupChange({ provider: v as any })}
                      options={providerOptions as any}
                      style={{ width: '100%' }}
                      data-qa="creds-provider-select"
                      aria-label="creds-provider-select"
                      getPopupContainer={popupInModal}
                      dropdownStyle={{ zIndex: 3000 }}
                      dropdownMatchSelectWidth={false}
                    />
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: '#666', marginBottom: 4 }}>{t('credentials.mode')}</div>
                    <Select
                      value={activeGroup.mode}
                      onChange={(v) => handleGroupChange({ mode: v as any })}
                      options={modeOptions as any}
                      style={{ width: '100%' }}
                      data-qa="creds-mode-select"
                      aria-label="creds-mode-select"
                      getPopupContainer={popupInModal}
                      dropdownStyle={{ zIndex: 3000 }}
                      dropdownMatchSelectWidth={false}
                    />
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: '#666', marginBottom: 4 }}>{t('credentials.models')}</div>
                    <Select
                      mode="tags"
                      value={activeGroup.models}
                      onChange={(vals) => handleGroupChange({ models: vals as string[] })}
                      placeholder={t('credentials.modelsPlaceholder')}
                      style={{ width: '100%' }}
                      getPopupContainer={popupInModal}
                      dropdownStyle={{ zIndex: 3000 }}
                      dropdownMatchSelectWidth={false}
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-2" style={{ marginTop: 8 }}>
                  <div>
                    <div className="text-xs" style={{ color: '#666', marginBottom: 4 }}>{t('credentials.timeout')}</div>
                    <Input
                      type="number"
                      min={1}
                      value={activeGroup.timeout ?? undefined}
                      onChange={(e) => handleGroupChange({ timeout: Number(e.target.value || 0) || undefined })}
                      style={fieldStyle}
                    />
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: '#666', marginBottom: 4 }}>{t('credentials.connectTimeout')}</div>
                    <Input
                      type="number"
                      min={1}
                      value={activeGroup.connect_timeout ?? undefined}
                      onChange={(e) => handleGroupChange({ connect_timeout: Number(e.target.value || 0) || undefined })}
                      style={fieldStyle}
                    />
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: '#666', marginBottom: 4 }}>{t('credentials.enableLogging')}</div>
                    <Select
                      value={!!activeGroup.enable_logging}
                      onChange={(v) => handleGroupChange({ enable_logging: !!v })}
                      options={[{ label: t('common.enable', '启用'), value: true }, { label: t('common.disable', '禁用'), value: false }]}
                      style={{ width: '100%' }}
                      getPopupContainer={popupInModal}
                      dropdownStyle={{ zIndex: 3000 }}
                      dropdownMatchSelectWidth={false}
                    />
                  </div>
                </div>

                {/* 官方代理折叠区（仅官方渠道 + mode=proxy） */}
                {showOfficialProxyFold && (
                  <Collapse ghost style={{ marginTop: 8 }}>
                    <Collapse.Panel header={t('credentials.useOfficialProxy')} key="proxy">
                      <div className="grid md:grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs" style={{ color: '#666', marginBottom: 4 }}>{t('credentials.baseURL')}</div>
                          <Input
                            placeholder="https://proxy.example.com/v1"
                            value={activeGroup.base_url || ''}
                            onChange={(e) => handleGroupChange({ base_url: e.target.value })}
                            style={fieldStyle}
                          />
                        </div>
                        <div style={{ alignSelf: 'end' }}>
                          <Tag color="default">{t('credentials.aistudioNote')}</Tag>
                        </div>
                      </div>
                    </Collapse.Panel>
                  </Collapse>
                )}

                {/* 自定义端点（openai-compatible/custom）：直接要求填写 base_url */}
                {activeGroup.mode === 'custom' && (
                  <div className="grid md:grid-cols-2 gap-2" style={{ marginTop: 8 }}>
                    <div>
                      <div className="text-xs" style={{ color: '#666', marginBottom: 4 }}>{t('credentials.baseURL')}</div>
                      <Input
                        placeholder="https://your-endpoint.example.com/v1"
                        value={activeGroup.base_url || ''}
                        onChange={(e) => handleGroupChange({ base_url: e.target.value })}
                        style={fieldStyle}
                      />
                    </div>
                  </div>
                )}

                <Divider style={{ margin: '8px 0' }} />

                {/* 密钥管理 */}
                <div className="flex items-center justify-between">
                  <div style={sectionTitleStyle}>{t('credentials.keys')}</div>
                  <div className="text-xs" style={{ color: '#666' }}>{t('credentials.maskInfo')}</div>
                </div>

                <Form form={form} layout="inline" style={{ marginTop: 8, marginBottom: 8, gap: 8 }}>
                  <Form.Item
                    name="api_key"
                    rules={[{ required: true, message: t('credentials.keyRequired') }]}
                    style={{ flex: 1 }}
                  >
                    <Input placeholder={t('credentials.keyPlaceholder')} style={fieldStyle} />
                  </Form.Item>
                  <Form.Item name="label" style={{ width: 220 }}>
                    <Input placeholder={t('credentials.keyLabel')} style={fieldStyle} />
                  </Form.Item>
                  <Form.Item>
                    <Button
                      onClick={submitAddKey}
                      aria-label="add-key"
                      data-qa="creds-key-add"
                      size="large"
                      style={{ backgroundColor: '#0B0B0B', color: '#FFFFFF', borderColor: '#0B0B0B', borderRadius: 2, minHeight: 48, minWidth: 48 }}
                    >
                      {t('common.add', '添加')}
                    </Button>
                  </Form.Item>
                </Form>

                <div className="space-y-2">
                  {(activeGroup.keys || []).length === 0 ? (
                    <div style={{ color: '#666', fontSize: 12 }}>{t('credentials.noKeys')}</div>
                  ) : (
                    (activeGroup.keys || []).slice().reverse().map(k => (
                      <div
                        key={k.id}
                        style={{ border: '1px solid #f0f0f0', borderRadius: 4, padding: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}
                      >
                        <div>
                          <div className="text-sm" style={{ fontWeight: 600 }}>{k.label || 'Key'}</div>
                          <div className="text-xs" style={{ color: '#666' }}>
                            {k.api_key.length > 8 ? `${k.api_key.slice(0, 4)}••••${k.api_key.slice(-4)}` : '••••'}
                          </div>
                          <div className="text-xs" style={{ color: '#999' }}>{new Date(k.createdAt).toLocaleString()}</div>
                        </div>
                        <Space>
                          <Button
                            icon={<CopyOutlined />}
                            aria-label="copy-key"
                            data-qa="creds-key-copy"
                            size="large"
                            onClick={async () => {
                              const text = k.api_key;
                              const copyViaExecCommand = (): boolean => {
                                try {
                                  const input = document.createElement('input');
                                  input.style.position = 'fixed';
                                  input.style.left = '-9999px';
                                  input.value = text;
                                  document.body.appendChild(input);
                                  input.select();
                                  const ok = document.execCommand('copy');
                                  document.body.removeChild(input);
                                  return ok;
                                } catch {
                                  return false;
                                }
                              };
                              try {
                                if ((navigator as any)?.clipboard && (window as any)?.isSecureContext) {
                                  await navigator.clipboard.writeText(text);
                                  message.success(t('credentials.copied'));
                                } else {
                                  const ok = copyViaExecCommand();
                                  if (ok) {
                                    message.success(t('credentials.copied'));
                                  } else {
                                    message.error(t('credentials.copyFailed'));
                                  }
                                }
                              } catch {
                                const ok = copyViaExecCommand();
                                if (ok) {
                                  message.success(t('credentials.copied'));
                                } else {
                                  message.error(t('credentials.copyFailed'));
                                }
                              }
                            }}
                            style={{ ...fieldStyle, minWidth: 48, minHeight: 48 }}
                          />
                          <Popconfirm
                            title={t('common.delete', '删除')}
                            description={t('credentials.confirmDeleteKey')}
                            onConfirm={() => handleRemoveKey(k.id)}
                          >
                            <Button
                              icon={<DeleteOutlined />}
                              aria-label="delete-key"
                              data-qa="creds-key-delete"
                              size="large"
                              style={{ ...fieldStyle, minWidth: 48, minHeight: 48 }}
                            />
                          </Popconfirm>
                        </Space>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <Divider style={{ margin: '8px 0' }} />

        <div className="flex items-center justify-end">
          <Button onClick={onClose} style={{ ...fieldStyle, minHeight: 48 }}>{t('common.close', '关闭')}</Button>
        </div>
      </div>
    </Modal>
  );
};

export default CredentialManager;