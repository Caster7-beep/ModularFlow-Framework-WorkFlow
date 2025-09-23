import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Divider, Form, Input, Modal, Select, Space, Tooltip, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { addIssue, clearIssues, downloadIssuesJson, exportIssues, getIssues, Issue } from '../utils/qaCoop';

type CategoryOption =
  | '布局'
  | '对齐'
  | '菜单'
  | '连线'
  | '性能'
  | '可达性'
  | '其他'
  | 'layout'
  | 'alignment'
  | 'menu'
  | 'edges'
  | 'performance'
  | 'a11y'
  | 'other';

const CATEGORIES: { value: CategoryOption; labelCN: string; labelEN: string }[] = [
  { value: '布局', labelCN: '布局', labelEN: 'Layout' },
  { value: '对齐', labelCN: '对齐', labelEN: 'Alignment' },
  { value: '菜单', labelCN: '菜单', labelEN: 'Menu' },
  { value: '连线', labelCN: '连线', labelEN: 'Edges' },
  { value: '性能', labelCN: '性能', labelEN: 'Performance' },
  { value: '可达性', labelCN: '可达性', labelEN: 'Accessibility' },
  { value: '其他', labelCN: '其他', labelEN: 'Other' },
];

const SEVERITIES = [
  { value: 'low', labelCN: '低', labelEN: 'Low' },
  { value: 'medium', labelCN: '中', labelEN: 'Medium' },
  { value: 'high', labelCN: '高', labelEN: 'High' },
];

interface QAReporterProps {
  onSubmitted?: (issue: Issue) => void;
}

const QAReporter: React.FC<QAReporterProps> = ({ onSubmitted }) => {
  const { t, i18n } = useTranslation();
  const [form] = Form.useForm();
  const [history, setHistory] = useState<Issue[]>([]);
  const [attachConsole, setAttachConsole] = useState<boolean>(false);
  const [consolePreview, setConsolePreview] = useState<string>('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [pasteAttachUrl, setPasteAttachUrl] = useState<string>('');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const localeIsEn = useMemo(() => (i18n.language || '').toLowerCase().startsWith('en'), [i18n.language]);

  const reload = () => {
    try {
      setHistory(getIssues());
    } catch {}
  };

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!attachConsole) return;
    // 抓取最近 N 条 console，仅在 UI 显示，不写入 issue
    const orig = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    };
    const buffer: string[] = [];
    const max = 50;
    const push = (level: string, args: any[]) => {
      const line =
        `[${new Date().toISOString()}] ${level}: ` +
        args
          .map((a) => {
            try {
              if (typeof a === 'string') return a;
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(' ');
      buffer.push(line);
      if (buffer.length > max) buffer.shift();
      setConsolePreview(buffer.join('\n'));
    };
    console.log = (...args: any[]) => {
      push('LOG', args);
      orig.log.apply(console, args as any);
    };
    console.warn = (...args: any[]) => {
      push('WARN', args);
      orig.warn.apply(console, args as any);
    };
    console.error = (...args: any[]) => {
      push('ERROR', args);
      orig.error.apply(console, args as any);
    };
    console.info = (...args: any[]) => {
      push('INFO', args);
      orig.info.apply(console, args as any);
    };
    return () => {
      console.log = orig.log;
      console.warn = orig.warn;
      console.error = orig.error;
      console.info = orig.info;
    };
  }, [attachConsole]);

  const tryCaptureScreenshot = async () => {
    setIsCapturing(true);
    try {
      const anyWin = window as any;
      const h2c = anyWin.html2canvas;
      if (typeof h2c !== 'function') {
        message.info(t('qa.screenshotFallback'));
        setIsCapturing(false);
        return;
      }
      // 尝试对主要画布容器截图（通过 data-tour 标识）
      const el =
        document.querySelector('[data-tour="workflow-canvas"]') ||
        document.body;
      const canvas: HTMLCanvasElement = await h2c(el, { useCORS: true, logging: false });
      const dataUrl = canvas.toDataURL('image/png');
      setScreenshotDataUrl(dataUrl);
      message.success(t('qa.screenshotCaptured'));
    } catch (e) {
      console.error(e);
      message.error(t('qa.screenshotFailed'));
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const attachments: Issue['attachments'] = [];
      if (screenshotDataUrl) {
        attachments.push({ type: 'screenshot', dataUrl: screenshotDataUrl });
      } else if (pasteAttachUrl) {
        // 如果用户手动粘贴了 DataURL 或外链，也按 screenshot 处理
        attachments.push({ type: 'screenshot', dataUrl: pasteAttachUrl });
      }

      const issue = addIssue({
        category: values.category,
        severity: values.severity,
        title: values.title?.trim() || '',
        steps: values.steps?.trim() || '',
        expected: values.expected?.trim() || '',
        actual: values.actual?.trim() || '',
        attachments,
      });

      form.resetFields();
      setScreenshotDataUrl('');
      setPasteAttachUrl('');
      reload();
      onSubmitted?.(issue);
      message.success(t('qa.submitSuccess'));
    } catch (e) {
      // 校验失败不提示为错误
    }
  };

  const handleCopyJson = async () => {
    try {
      const json = exportIssues();
      await navigator.clipboard.writeText(json);
      message.success(t('qa.copied'));
    } catch {
      message.error(t('qa.copyFailed'));
    }
  };

  const handleDownload = () => {
    try {
      downloadIssuesJson();
    } catch {}
  };

  const handleClearAll = async () => {
    clearIssues();
    reload();
    setConfirmClearOpen(false);
    message.success(t('qa.cleared'));
  };

  return (
    <div className="qa-reporter space-y-3" style={{ color: '#0B0B0B' }}>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{t('qa.reportIssue')}</div>
        <Space>
          <Tooltip title={t('qa.copyJson')}>
            <Button onClick={handleCopyJson} style={{ backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B' }}>
              {t('qa.copyJson')}
            </Button>
          </Tooltip>
          <Tooltip title={t('qa.downloadJson')}>
            <Button onClick={handleDownload} style={{ backgroundColor: '#0B0B0B', color: '#FFFFFF', borderColor: '#0B0B0B' }}>
              {t('qa.downloadJson')}
            </Button>
          </Tooltip>
          <Tooltip title={t('qa.clearAll')}>
            <Button
              onClick={() => setConfirmClearOpen(true)}
              style={{ backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B' }}
            >
              {t('qa.clearAll')}
            </Button>
          </Tooltip>
        </Space>
      </div>

      <Modal
        title={t('qa.clearAll')}
        open={confirmClearOpen}
        onOk={handleClearAll}
        onCancel={() => setConfirmClearOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        {t('qa.clearConfirm')}
      </Modal>

      <Divider style={{ margin: '8px 0' }} />

      <Form form={form} layout="vertical">
        <div className="grid md:grid-cols-2 gap-3">
          <Form.Item
            name="category"
            label={t('qa.category')}
            rules={[{ required: true, message: t('qa.required') }]}
          >
            <Select
              placeholder={t('qa.category')}
              options={CATEGORIES.map((c) => ({
                value: c.value,
                label: localeIsEn ? c.labelEN : c.labelCN,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="severity"
            label={t('qa.severity')}
            rules={[{ required: true, message: t('qa.required') }]}
            initialValue="medium"
          >
            <Select
              placeholder={t('qa.severity')}
              options={SEVERITIES.map((s) => ({
                value: s.value,
                label: localeIsEn ? s.labelEN : s.labelCN,
              }))}
            />
          </Form.Item>
        </div>

        <Form.Item
          name="title"
          label={t('qa.title')}
          rules={[{ required: true, message: t('qa.required') }]}
        >
          <Input placeholder={t('qa.title')} />
        </Form.Item>

        <Form.Item name="steps" label={t('qa.steps')}>
          <Input.TextArea rows={3} placeholder={t('qa.steps')} />
        </Form.Item>

        <div className="grid md:grid-cols-2 gap-3">
          <Form.Item name="expected" label={t('qa.expected')}>
            <Input.TextArea rows={3} placeholder={t('qa.expected')} />
          </Form.Item>
          <Form.Item name="actual" label={t('qa.actual')}>
            <Input.TextArea rows={3} placeholder={t('qa.actual')} />
          </Form.Item>
        </div>

        <Divider style={{ margin: '8px 0' }} />

        <div className="space-y-2">
          <Checkbox checked={attachConsole} onChange={(e) => setAttachConsole(e.target.checked)}>
            {t('qa.attachConsole')}
          </Checkbox>
          {attachConsole && (
            <pre
              className="p-2 rounded border border-gray-200 bg-white"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto' }}
            >
              {consolePreview || t('qa.consoleHint')}
            </pre>
          )}

          <div className="flex items-center gap-2">
            <Button
              onClick={tryCaptureScreenshot}
              loading={isCapturing}
              style={{ backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B' }}
            >
              {t('qa.attachScreenshot')}
            </Button>
            {!('html2canvas' in (window as any)) && (
              <span style={{ color: '#666' }}>{t('qa.screenshotNoLib')}</span>
            )}
          </div>

          {screenshotDataUrl && (
            <div className="rounded border border-gray-200 p-2 bg-white">
              <div className="text-xs mb-2">{t('qa.screenshotPreview')}</div>
              <img src={screenshotDataUrl} alt="screenshot" style={{ maxWidth: '100%', borderRadius: 4 }} />
            </div>
          )}

          {!screenshotDataUrl && (
            <div className="space-y-1">
              <div className="text-xs text-gray-600">{t('qa.screenshotFallback')}</div>
              <Input
                value={pasteAttachUrl}
                onChange={(e) => setPasteAttachUrl(e.target.value)}
                placeholder={t('qa.pasteDataUrl')}
              />
            </div>
          )}
        </div>

        <Divider style={{ margin: '8px 0' }} />

        <div className="flex items-center justify-end">
          <Button
            onClick={handleSubmit}
            style={{ backgroundColor: '#0B0B0B', color: '#FFFFFF', borderColor: '#0B0B0B' }}
          >
            {t('qa.submit')}
          </Button>
        </div>
      </Form>

      <Divider style={{ margin: '8px 0' }} />

      <div>
        <div className="text-base font-semibold mb-2">{t('qa.history')}</div>
        {history.length === 0 ? (
          <div className="text-sm text-gray-600">{t('qa.historyEmpty')}</div>
        ) : (
          <div className="space-y-2">
            {history
              .slice()
              .reverse()
              .map((it, idx) => (
                <div
                  key={it.id}
                  className="rounded border border-gray-200 bg-white p-2"
                  style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}
                >
                  <div>
                    <div className="text-sm font-semibold">
                      #{history.length - idx} [{it.severity}] {localeIsEn ? it.category : it.category}
                    </div>
                    <div className="text-sm break-words">"{it.title}"</div>
                    <div className="text-xs text-gray-600">{new Date(it.ts).toLocaleString()}</div>
                  </div>
                  <div className="text-right text-xs text-gray-600">
                    <div>{it.env?.url}</div>
                    <div>{it.env?.ua?.slice(0, 56)}{(it.env?.ua || '').length > 56 ? '…' : ''}</div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default QAReporter;