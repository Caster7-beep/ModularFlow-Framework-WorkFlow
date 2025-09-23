import React, { useState, useEffect } from 'react';
import {
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tooltip,
  Divider,
  Drawer
} from 'antd';
import {
  SaveOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  PlusOutlined,
  DownloadOutlined,
  UploadOutlined,
  BugOutlined,
  MonitorOutlined,
  ExperimentOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ThemeController from './ThemeController';
import LanguageSwitcher from './LanguageSwitcher';
import type { Workflow } from '../types/workflow';
import { runQuickSelfTest } from '../utils/selfTest';
import { showToast } from './Toast';
import QAReporter from './QAReporter';
import CredentialManager from './CredentialManager';
const FEATURE_QA_REPORT = Boolean((import.meta as any)?.env?.VITE_FEATURE_QA_REPORT);

interface ToolbarProps {
  onSave: (name: string, description?: string) => Promise<void>;
  onLoad: (workflowId: string) => Promise<void>;
  onExecute: () => Promise<void>;
  onReset: () => void;
  isExecuting: boolean;
  currentWorkflow: Workflow | null;
  onDebugToggle: () => void;
  isDebugging: boolean;
  onShowMonitor: () => void;
  // 新增：移动端打开浮层
  onToggleLeftPanel?: () => void;
  onToggleRightPanel?: () => void;

  // Polish v3: 画布控制（与 WorkflowCanvas 联动）
  snapEnabled: boolean;
  gridSize: number; // 8 | 16 | 24
  onToggleSnap: () => void;
  onGridSizeCycle: () => void;
  onFitView: () => void;

  // v4: 对齐/分布 + 辅助
  selectedCount: number;
  onAlignLeft: () => void;
  onAlignCenterX: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignCenterY: () => void;
  onAlignBottom: () => void;
  onDistributeH: () => void;
  onDistributeV: () => void;

  reducedMotion: boolean;
  onToggleReducedMotion: () => void;

  onToggleHelp: () => void;

  // v5: 网格显隐、边样式切换、布局导入导出
  showGrid: boolean;
  onToggleShowGrid: () => void;
  edgeStyle: 'smooth' | 'orthogonal';
  onToggleEdgeStyle: () => void; // 兼容保留
  onEdgeStyleChange: (style: 'smooth' | 'orthogonal') => void;
  onExportLayout: () => void;
  onImportLayout: (data: any) => void;

  // v6: 工具区域展开通知 + 自动对齐（参考线）开关
  onToolsExpandedChange?: (expanded: boolean) => void;
  autoAlign?: boolean;
  onToggleAutoAlign?: () => void;

  // v6: 清空画布（第二排按钮触发）
  onClearCanvas?: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onSave,
  onLoad,
  onExecute,
  onReset,
  isExecuting,
  currentWorkflow,
  onDebugToggle,
  isDebugging,
  onShowMonitor,
  onToggleLeftPanel,
  onToggleRightPanel,
  // Polish v3 props
  snapEnabled,
  gridSize,
  onToggleSnap,
  onGridSizeCycle,
  onFitView,
  // v4 props
  selectedCount,
  onAlignLeft,
  onAlignCenterX,
  onAlignRight,
  onAlignTop,
  onAlignCenterY,
  onAlignBottom,
  onDistributeH,
  onDistributeV,
  reducedMotion,
  onToggleReducedMotion,
  onToggleHelp,
  // v5 props
  showGrid,
  onToggleShowGrid,
  edgeStyle,
  onToggleEdgeStyle,
  onEdgeStyleChange,
  onExportLayout,
  onImportLayout,
  // v6 props
  onToolsExpandedChange,
  autoAlign = true,
  onToggleAutoAlign,
  onClearCanvas,
}) => {
  const { t } = useTranslation();
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [loadModalVisible, setLoadModalVisible] = useState(false);
  const [saveForm] = Form.useForm();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selfTestVisible, setSelfTestVisible] = useState(false);
  const [selfTestLoading, setSelfTestLoading] = useState(false);
  const [selfTestSummary, setSelfTestSummary] = useState<string>('');
  // QA Reporter 面板可见性
  const [qaVisible, setQaVisible] = useState(false);
  // 凭证管理面板可见性
  const [credVisible, setCredVisible] = useState(false);
  // 折叠工具区（将 fitView 以右、执行按钮以左的区块折叠到第二排）
  const [toolsExpanded, setToolsExpanded] = useState(false);
  // 通知 App 调整 --toolbar-height（56px/112px）+ ESC 关闭抽屉
  useEffect(() => {
    try {
      onToolsExpandedChange?.(toolsExpanded);
    } catch {}
    if (!toolsExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setToolsExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [toolsExpanded, onToolsExpandedChange]);

  // 调整尺寸模式状态（与全局 body.dataset.resize 同步）
  const [resizeEnabled, setResizeEnabled] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.body?.dataset?.resize === '1';
  });
  useEffect(() => {
    // 轻量轮询同步，避免与其他触发（R键）不同步
    const id = setInterval(() => {
      if (typeof document === 'undefined') return;
      const v = document.body?.dataset?.resize === '1';
      setResizeEnabled(v);
    }, 500);
    return () => clearInterval(id);
  }, []);

  // 初始化 Lucide 图标（全局 UMD）
  useEffect(() => {
    (window as any)?.lucide?.createIcons?.();
  }, []);
  const moreDrawerId = 'toolbar-more-drawer';

  // E2E: 如果 URL 查询包含 e2eOpenDrawer=1，则初始自动展开 Drawer（仅影响当前会话）
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('e2eOpenDrawer') === '1') {
        setToolsExpanded(true);
      }
    } catch {}
  }, []);

  const toggleResize = () => {
    if (typeof document === 'undefined') return;
    const enabled = document.body.dataset.resize === '1';
    const next = !enabled;
    document.body.dataset.resize = next ? '1' : '0';
    try { localStorage.setItem('vw_sizeMode', String(next)); } catch {}
    setResizeEnabled(next);
    try { showToast(next ? '尺寸模式：开' : '尺寸模式：关'); } catch {}
  };

  // 保存工作流
  const handleSave = async () => {
    try {
      const values = await saveForm.validateFields();
      await onSave(values.name, values.description);
      setSaveModalVisible(false);
      saveForm.resetFields();
    } catch (error) {
      console.error('保存失败:', error);
    }
  };

  // 加载工作流
  const handleLoad = async (workflowId: string) => {
    try {
      await onLoad(workflowId);
      setLoadModalVisible(false);
    } catch (error) {
      console.error('加载失败:', error);
    }
  };

  // 新建工作流
  const handleNew = () => {
    Modal.confirm({
      title: t('toolbar.new'),
      content: t('workflow.reset.confirm'),
      onOk: onReset,
    });
  };

  // 导出工作流
  const handleExport = () => {
    if (!currentWorkflow) {
      message.warning(t('messages.warning.noWorkflow'));
      return;
    }

    const dataStr = JSON.stringify(currentWorkflow, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentWorkflow.name || 'workflow'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    message.success(t('messages.success.exported'));
  };

  // 导入工作流
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const workflow = JSON.parse(e.target?.result as string);
            
            // 验证工作流格式
            if (!workflow || typeof workflow !== 'object') {
              throw new Error('无效的工作流文件格式');
            }
            
            // 检查必需字段
            if (!workflow.nodes || !Array.isArray(workflow.nodes) ||
                !workflow.edges || !Array.isArray(workflow.edges)) {
              throw new Error('工作流文件缺少必需的节点或边数据');
            }
            
            // 通过onImportLayout处理导入的数据
            onImportLayout?.(workflow);
            message.success(t('messages.success.imported'));
          } catch (error) {
            console.error('导入工作流失败:', error);
            message.error(error instanceof Error ? error.message : t('messages.error.invalidFormat'));
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleSelfTest = async () => {
    setSelfTestLoading(true);
    try {
      const res = await runQuickSelfTest();
      const getItem = (name: 'Health' | 'Docs' | 'WS' | 'LLM' | 'CodeBlock') =>
        res.items.find(i => i.name === name);
      const health = getItem('Health');
      const docs = getItem('Docs');
      const ws = getItem('WS');
      const llm = getItem('LLM');
      const code = getItem('CodeBlock');
  
      const lines: string[] = [];
      if (health) lines.push(`Health: ${health.pass ? 'PASS' : 'FAIL'} - ${health.detail}`);
      if (docs)   lines.push(`Docs: ${docs.pass ? 'PASS' : 'FAIL'} - ${docs.detail}`);
      if (ws)     lines.push(`WS: ${ws.pass ? 'PASS' : 'FAIL'} - ${ws.detail}`);
      if (llm)    lines.push(`LLM: ${llm.pass ? 'PASS' : 'FAIL'} - ${llm.detail}`);
      if (code)   lines.push(`CodeBlock: ${code.pass ? 'PASS' : 'FAIL'} - ${code.detail}`);
  
      const anyFail = res.items.some(i => !i.pass);
      if (anyFail) {
        lines.push('');
        lines.push('建议:');
        lines.push('- 检查后端 6502 端口可达与代理（/api, /ws）');
        lines.push('- 检查 CORS 设置');
        lines.push('- 检查 GEMINI_API_KEY 与模型可用性');
      }
  
      setSelfTestSummary(lines.join('\n'));
      setSelfTestVisible(true);
      // 结果已在 runQuickSelfTest 内写入 window.__qaHooks.lastSelfTest，这里不重复写
    } catch (err: any) {
      const msg = err?.message || '未知错误';
      setSelfTestSummary(`快速自检失败: ${msg}`);
      setSelfTestVisible(true);
    } finally {
      setSelfTestLoading(false);
    }
  };

  return (
    <div className="app-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
      <div>
        <Space wrap={false}>
          <Tooltip title={t('toolbar.new')}>
            <Button
              aria-label={t('toolbar.new')}
              icon={<PlusOutlined />}
              onClick={handleNew}
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            />
          </Tooltip>
          
          <Tooltip title={t('toolbar.save')}>
            <Button
              aria-label={t('toolbar.save')}
              icon={<SaveOutlined />}
              onClick={() => setSaveModalVisible(true)}
              data-tour="save-button"
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            />
          </Tooltip>
          
          <Tooltip title={t('toolbar.load')}>
            <Button
              aria-label={t('toolbar.load')}
              icon={<FolderOpenOutlined />}
              onClick={() => setLoadModalVisible(true)}
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            />
          </Tooltip>
          
          <Divider type="vertical" />
          
          <Tooltip title={t('toolbar.import')}>
            <Button
              aria-label={t('toolbar.import')}
              icon={<UploadOutlined />}
              onClick={handleImport}
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            />
          </Tooltip>
          
          <Tooltip title={t('toolbar.export')}>
            <Button
              aria-label={t('toolbar.export')}
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={!currentWorkflow}
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            />
          </Tooltip>

          {/* 移动端：打开节点/属性浮层 */}
          <div className="md:hidden flex items-center gap-2">
            <Button
              aria-label="打开节点面板"
              onClick={() => onToggleLeftPanel?.()}
              style={{ backgroundColor: '#0B0B0B', color: '#FFFFFF', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              节点
            </Button>
            <Button
              aria-label="打开属性面板"
              onClick={() => onToggleRightPanel?.()}
              style={{ backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              属性
            </Button>
          </div>
        </Space>
      </div>

      <div>
        <h2 className="toolbar-title" style={{ margin: 0, color: '#0B0B0B' }}>
          {t('app.title')}
        </h2>
      </div>

      <div>
        <Space wrap={false}>
          {/* 执行 Execute（强调态） */}
          <Tooltip title={t('toolbar.execute')}>
            <Button
              aria-label={t('toolbar.execute')}
              data-tour="execute-button"
              data-qa="btn-execute"
              icon={<PlayCircleOutlined />}
              loading={isExecuting}
              onClick={onExecute}
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{
                height: 48, minWidth: 48, padding: '0 16px',
                backgroundColor: '#0B0B0B',
                color: '#FFFFFF',
                borderColor: '#0B0B0B',
                borderRadius: '2px'
              }}
            >
              {t('common.execute')}
            </Button>
          </Tooltip>

          {/* 监控 Monitor */}
          <Tooltip title={t('toolbar.monitor')}>
            <Button
              aria-label={t('toolbar.monitor')}
              data-qa="btn-monitor"
              icon={<MonitorOutlined />}
              onClick={onShowMonitor}
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{
                height: 48, minWidth: 48, padding: '0 16px',
                backgroundColor: '#FFFFFF',
                color: '#0B0B0B',
                borderColor: '#0B0B0B',
                borderRadius: '2px'
              }}
            >
              {/* 短字：监控 */}
              {t('toolbar.monitorShort', '监控')}
            </Button>
          </Tooltip>

          {/* 上报 Report（短字“上报”，tooltip 全称“问题上报”） */}
          {FEATURE_QA_REPORT && (
            <Tooltip title={t('qa.reportIssue', '问题上报')}>
              <Button
                aria-label={t('qa.reportIssue', '问题上报')}
                data-qa="btn-report"
                onClick={() => setQaVisible(true)}
                className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
                style={{
                  height: 48, minWidth: 48, padding: '0 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#0B0B0B',
                  borderColor: '#0B0B0B',
                  borderRadius: '2px'
                }}
              >
                {t('qa.reportShort', '上报')}
              </Button>
            </Tooltip>
          )}

          {/* ⋯ 更多（打开右侧抽屉） */}
          <Tooltip title={t('toolbar.more', '更多')}>
            <Button
              aria-label="More"
              data-qa="btn-more"
              role="button"
              aria-expanded={toolsExpanded}
              aria-controls={moreDrawerId}
              onClick={() => setToolsExpanded(v => !v)}
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{
                height: 48, minWidth: 48, padding: '0 16px',
                backgroundColor: '#FFFFFF',
                color: '#0B0B0B',
                borderColor: '#0B0B0B',
                borderRadius: '2px',
                fontWeight: 700
              }}
              title={t('toolbar.more', '更多')}
            >
              ⋯
            </Button>
          </Tooltip>
        </Space>
      </div>

      {/* Drawer 可见性标记（供 E2E 探测），不影响布局 */}
      <div id="toolbar-more-drawer" data-qa="drawer-marker" style={{ display: toolsExpanded ? 'block' : 'none', width: 1, height: 1, position: 'absolute', top: -9999, left: -9999 }} />
      {/* 右侧抽屉（替代“第二排”） */}
      <Drawer
        title={t('toolbar.more', '更多')}
        placement="right"
        zIndex={1500}
        open={toolsExpanded}
        onClose={() => setToolsExpanded(false)}
        maskClosable={true}
        keyboard={true}
        styles={{ wrapper: { width: 360 }, body: { padding: 16 } }}
        aria-label={t('toolbar.more', '更多')}
        id={moreDrawerId}
        rootClassName="vw-more-drawer"
      >
        <div className="flex flex-col gap-3">
          {/* 快速自检按钮（抽屉顶部） */}
          <div className="flex items-center justify-start">
            <Tooltip title={t('toolbar.selfTest')}>
              <Button
                aria-label={t('toolbar.selfTest')}
                data-qa="btn-selftest"
                onClick={handleSelfTest}
                loading={selfTestLoading}
                className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
                style={{ height: 48, minWidth: 48, padding: '0 16px', backgroundColor: '#0B0B0B', color: '#FFFFFF', borderColor: '#0B0B0B', borderRadius: '2px', fontWeight: 700 }}
              >
                <ExperimentOutlined />&nbsp;{t('toolbar.selfTest')}
              </Button>
            </Tooltip>
          </div>

          {/* 系统设置分组：语言/主题/凭证（按钮触发 + 弹层，统一规范样式） */}
          <div className="flex flex-col gap-2" role="group" aria-label={t('toolbar.systemSettings', '系统设置')}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0B0B0B' }}>
              {t('toolbar.systemSettings', '系统设置')}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LanguageSwitcher
                variant="toolbarItem"
                data-qa="btn-language"
                aria-label={t('toolbar.language')}
              />
              <ThemeController
                variant="toolbarItem"
                data-qa="btn-theme"
                aria-label={t('toolbar.theme')}
              />
              {/* 新增：凭证按钮 */}
              <Button
                aria-label={t('toolbar.credentials')}
                data-qa="btn-credentials"
                onClick={() => { setToolsExpanded(false); setTimeout(() => setCredVisible(true), 200); }}
                className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
                style={{ height: 48, minWidth: 48, padding: '0 16px', backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px', fontWeight: 700 }}
                title={t('toolbar.credentials')}
              >
                {t('toolbar.credentials')}
              </Button>
            </div>
          </div>
 
          <Divider />

          {/* 原“第二排”内容保留功能与语义 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 清空画布 */}
            <Tooltip title="清空画布">
              <Button
                aria-label="清空画布"
                aria-pressed={false}
                onClick={() => onClearCanvas?.()}
                className="focus:outline-none focus:ring-2 focus:ring-black"
                style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px', fontWeight: 600 }}
                title="清空画布"
              >
                Clear
              </Button>
            </Tooltip>

            {/* 水平对齐：左/中/右 */}
            <Button
              aria-label="左对齐"
              title={selectedCount < 2 ? '至少选择 2 个节点' : '左对齐'}
              aria-pressed={false}
              disabled={selectedCount < 2}
              onClick={onAlignLeft}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              {'\u27F8'}
            </Button>
            <Button
              aria-label="水平居中对齐"
              title={selectedCount < 2 ? '至少选择 2 个节点' : '水平居中对齐'}
              aria-pressed={false}
              disabled={selectedCount < 2}
              onClick={onAlignCenterX}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              {'\u2194'}
            </Button>
            <Button
              aria-label="右对齐"
              title={selectedCount < 2 ? '至少选择 2 个节点' : '右对齐'}
              aria-pressed={false}
              disabled={selectedCount < 2}
              onClick={onAlignRight}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              {'\u27F9'}
            </Button>

            {/* 垂直对齐：顶/中/底 */}
            <Button
              aria-label="顶对齐"
              title={selectedCount < 2 ? '至少选择 2 个节点' : '顶对齐'}
              aria-pressed={false}
              disabled={selectedCount < 2}
              onClick={onAlignTop}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              {'\u27F0'}
            </Button>
            <Button
              aria-label="垂直居中对齐"
              title={selectedCount < 2 ? '至少选择 2 个节点' : '垂直居中对齐'}
              aria-pressed={false}
              disabled={selectedCount < 2}
              onClick={onAlignCenterY}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              {'\u2195'}
            </Button>
            <Button
              aria-label="底对齐"
              title={selectedCount < 2 ? '至少选择 2 个节点' : '底对齐'}
              aria-pressed={false}
              disabled={selectedCount < 2}
              onClick={onAlignBottom}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              {'\u27F1'}
            </Button>

            {/* 分布：水平/垂直（需要 ≥3） */}
            <Button
              aria-label="水平等间距"
              title={selectedCount < 3 ? '至少选择 3 个节点' : '水平等间距'}
              aria-pressed={false}
              disabled={selectedCount < 3}
              onClick={onDistributeH}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 16, lineHeight: '1' }}>H</span>
            </Button>
            <Button
              aria-label="垂直等间距"
              title={selectedCount < 3 ? '至少选择 3 个节点' : '垂直等间距'}
              aria-pressed={false}
              disabled={selectedCount < 3}
              onClick={onDistributeV}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 16, lineHeight: '1' }}>V</span>
            </Button>

            {/* 边样式：Smooth / Orthogonal */}
            <Tooltip title="边样式：平滑（Smooth）">
              <Button
                aria-label="边样式：平滑（Smooth）"
                aria-pressed={edgeStyle === 'smooth'}
                onClick={() => onEdgeStyleChange('smooth')}
                className="focus:outline-none focus:ring-2 focus:ring-black"
                style={{
                  height: 48, width: 48, padding: 0,
                  backgroundColor: edgeStyle === 'smooth' ? '#0B0B0B' : '#FFFFFF',
                  color: edgeStyle === 'smooth' ? '#FFFFFF' : '#0B0B0B',
                  borderColor: '#0B0B0B',
                  borderRadius: '2px',
                  fontWeight: 700
                }}
                title="边样式：平滑（Smooth）"
              >
                {'∿'}
              </Button>
            </Tooltip>
            <Tooltip title="边样式：直角（Orthogonal）">
              <Button
                aria-label="边样式：直角（Orthogonal）"
                aria-pressed={edgeStyle === 'orthogonal'}
                onClick={() => onEdgeStyleChange('orthogonal')}
                className="focus:outline-none focus:ring-2 focus:ring-black"
                style={{
                  height: 48, width: 48, padding: 0,
                  backgroundColor: edgeStyle === 'orthogonal' ? '#0B0B0B' : '#FFFFFF',
                  color: edgeStyle === 'orthogonal' ? '#FFFFFF' : '#0B0B0B',
                  borderColor: '#0B0B0B',
                  borderRadius: '2px',
                  fontWeight: 700
                }}
                title="边样式：直角（Orthogonal）"
              >
                {'┐'}
              </Button>
            </Tooltip>

            {/* Reduced Motion 切换 */}
            <Button
              aria-label="切换降低动画（Reduced Motion）"
              aria-pressed={reducedMotion}
              onClick={onToggleReducedMotion}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: reducedMotion ? '#0B0B0B' : '#FFFFFF', color: reducedMotion ? '#FFFFFF' : '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              RM
            </Button>

            {/* 自动对齐（参考线）AA 开关 */}
            <Tooltip title="自动对齐（参考线）">
              <Button
                aria-label="切换自动对齐"
                aria-pressed={!!autoAlign}
                onClick={onToggleAutoAlign}
                className="focus:outline-none focus:ring-2 focus:ring-black"
                style={{
                  height: 48, width: 48, padding: 0,
                  backgroundColor: autoAlign ? '#0B0B0B' : '#FFFFFF',
                  color: autoAlign ? '#FFFFFF' : '#0B0B0B',
                  borderColor: '#0B0B0B',
                  borderRadius: '2px',
                  fontWeight: 700
                }}
              >
                AA
              </Button>
            </Tooltip>

            {/* 快捷键帮助 ? */}
            <Button
              aria-label="打开快捷键帮助"
              onClick={onToggleHelp}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '2px' }}
            >
              ?
            </Button>
          </div>
        </div>
      </Drawer>
      {/* 保存工作流模态框 */}
      <Modal
        title={<span id="save-modal-title">{t('workflow.save.title')}</span>}
        open={saveModalVisible}
        onOk={handleSave}
        onCancel={() => setSaveModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        forceRender
        aria-labelledby="save-modal-title"
      >
        <Form form={saveForm} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label={t('workflow.save.nameLabel')}
            rules={[{ required: true, message: t('workflow.save.nameRequired') }]}
          >
            <Input placeholder={t('workflow.save.namePlaceholder')} />
          </Form.Item>
          
          <Form.Item
            name="description"
            label={t('workflow.save.descriptionLabel')}
          >
            <Input.TextArea
              placeholder={t('workflow.save.descriptionPlaceholder')}
              rows={3}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 加载工作流模态框 */}
      <Modal
        title={t('workflow.load.title')}
        open={loadModalVisible}
        onCancel={() => setLoadModalVisible(false)}
        footer={null}
        width={600}
      >
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {workflows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
              {t('workflow.load.noWorkflows')}
            </div>
          ) : (
            workflows.map(workflow => (
              <div
                key={workflow.id}
                style={{
                  padding: '12px',
                  border: '1px solid #f0f0f0',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => handleLoad(workflow.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                  e.currentTarget.style.borderColor = '#1890ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = '#f0f0f0';
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {workflow.name}
                </div>
                {workflow.description && (
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: '4px' }}>
                    {workflow.description}
                  </div>
                )}
                <div style={{ color: '#999', fontSize: '12px' }}>
                  {t('workflow.nodeCount')}: {workflow.nodes.length} |
                  {t('workflow.updatedAt')}: {new Date(workflow.updatedAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* 快速自检结果 Modal */}
      <Modal
        title="快速自检结果"
        open={selfTestVisible}
        onOk={() => setSelfTestVisible(false)}
        onCancel={() => setSelfTestVisible(false)}
        okText="关闭"
        cancelButtonProps={{ style: { display: 'none' } }}
        width={640}
      >
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
{selfTestSummary}
        </pre>
      </Modal>

      {/* QA Reporter 面板 */}
      {FEATURE_QA_REPORT && (
        <Modal
          title={t('qa.reportIssue', 'Report UI Issue')}
          open={qaVisible}
          onCancel={() => setQaVisible(false)}
          footer={null}
          width={720}
        >
          <QAReporter onSubmitted={() => setQaVisible(false)} />
        </Modal>
      )}

      {/* 凭证管理面板（遵循 UI 规范：CredentialManager 内部使用 AntD Modal，触发按钮位于“系统设置”分组） */}
      <CredentialManager open={credVisible} onClose={() => setCredVisible(false)} />
    </div>
  );
};

export default Toolbar;