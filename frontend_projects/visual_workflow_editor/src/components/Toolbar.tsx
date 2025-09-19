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
  Divider
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
}) => {
  const { t } = useTranslation();
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [loadModalVisible, setLoadModalVisible] = useState(false);
  const [saveForm] = Form.useForm();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selfTestVisible, setSelfTestVisible] = useState(false);
  const [selfTestLoading, setSelfTestLoading] = useState(false);
  const [selfTestSummary, setSelfTestSummary] = useState<string>('');
  // 折叠工具区（将 fitView 以右、执行按钮以左的区块折叠到第二排）
  const [toolsExpanded, setToolsExpanded] = useState(false);
  // 通知 App 调整 --toolbar-height（56px/112px）
  useEffect(() => {
    try {
      onToolsExpandedChange?.(toolsExpanded);
    } catch {}
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
            // TODO: 验证工作流格式并加载
            console.log('导入工作流:', workflow);
            message.success(t('messages.success.imported'));
          } catch (error) {
            message.error(t('messages.error.invalidFormat'));
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
      const lines: string[] = [];
      lines.push(`Frontend E2E Smoke (LLM): ${res.llm.pass ? 'PASS' : 'FAIL'}`);
      lines.push(`Final Output (LLM): ${res.llm.output || ''}${res.llm.error ? ` | Error: ${res.llm.error}` : ''}`);
      lines.push('');
      lines.push(`Frontend E2E Smoke (CodeBlock): ${res.code.pass ? 'PASS' : 'FAIL'}`);
      lines.push(`Final Output (CodeBlock): ${res.code.output || ''}${res.code.error ? ` | Error: ${res.code.error}` : ''}`);
      lines.push('');
      const eventsText = res.events && res.events.length > 0 ? res.events.join(', ') : 'No Events';
      lines.push(`WS Events (last 20): ${eventsText}`);
      setSelfTestSummary(lines.join('\n'));
      setSelfTestVisible(true);
    } catch (err: any) {
      const msg = err?.message || '未知错误';
      setSelfTestSummary(`Frontend E2E Smoke: FAIL\nError: ${msg}`);
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
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
            />
          </Tooltip>
          
          <Tooltip title={t('toolbar.save')}>
            <Button
              aria-label={t('toolbar.save')}
              icon={<SaveOutlined />}
              onClick={() => setSaveModalVisible(true)}
              data-tour="save-button"
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
            />
          </Tooltip>
          
          <Tooltip title={t('toolbar.load')}>
            <Button
              aria-label={t('toolbar.load')}
              icon={<FolderOpenOutlined />}
              onClick={() => setLoadModalVisible(true)}
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
            />
          </Tooltip>
          
          <Divider type="vertical" />
          
          <Tooltip title={t('toolbar.import')}>
            <Button
              aria-label={t('toolbar.import')}
              icon={<UploadOutlined />}
              onClick={handleImport}
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
            />
          </Tooltip>
          
          <Tooltip title={t('toolbar.export')}>
            <Button
              aria-label={t('toolbar.export')}
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={!currentWorkflow}
              className="flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
            />
          </Tooltip>

          {/* 移动端：打开节点/属性浮层 */}
          <div className="md:hidden flex items-center gap-2">
            <Button
              aria-label="打开节点面板"
              onClick={() => onToggleLeftPanel?.()}
              style={{ backgroundColor: '#0B0B0B', color: '#FFFFFF', borderColor: '#0B0B0B', borderRadius: '4px' }}
            >
              节点
            </Button>
            <Button
              aria-label="打开属性面板"
              onClick={() => onToggleRightPanel?.()}
              style={{ backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
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
          <Tooltip title={t('toolbar.debug')}>
            <Button
              icon={<BugOutlined />}
              type={isDebugging ? 'primary' : 'default'}
              onClick={onDebugToggle}
            >
              {t('toolbar.debug')}
            </Button>
          </Tooltip>

          <Tooltip title={t('toolbar.monitor')}>
            <Button
              icon={<MonitorOutlined />}
              onClick={onShowMonitor}
            >
              {t('toolbar.monitor')}
            </Button>
          </Tooltip>

          {/* 调整尺寸模式切换（与 R 键同步） */}
          <Tooltip title="调整尺寸模式 (R)">
            <Button
              aria-label="切换调整尺寸模式"
              aria-pressed={resizeEnabled}
              onClick={toggleResize}
              style={{
                backgroundColor: resizeEnabled ? '#0B0B0B' : '#FFFFFF',
                color: resizeEnabled ? '#FFFFFF' : '#0B0B0B',
                borderColor: '#0B0B0B'
              }}
            >
              {resizeEnabled ? '尺寸:开' : '尺寸:关'}
            </Button>
          </Tooltip>

          {/* 画布控制：网格吸附、网格尺寸、fitView */}
          <Tooltip title="网格吸附">
            <Button
              aria-label="切换网格吸附"
              aria-pressed={snapEnabled}
              onClick={onToggleSnap}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{
                height: 48, width: 48, padding: 0,
                backgroundColor: snapEnabled ? '#0B0B0B' : '#FFFFFF',
                color: snapEnabled ? '#FFFFFF' : '#0B0B0B',
                borderColor: '#0B0B0B',
                borderRadius: '4px'
              }}
            >
              <i data-lucide="grid-2x2" className="w-5 h-5"></i>
            </Button>
          </Tooltip>

          <Tooltip title="网格尺寸 8/16/24">
            <Button
              aria-label={`切换网格尺寸，当前=${gridSize}`}
              onClick={onGridSizeCycle}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px', fontWeight: 600 }}
            >
              {gridSize}
            </Button>
          </Tooltip>

          <Tooltip title="重置视图 (fitView)">
            <Button
              aria-label="重置视图"
              onClick={onFitView}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
            >
              <i data-lucide="maximize" className="w-5 h-5"></i>
            </Button>
          </Tooltip>

          {/* 折叠触发：展开/收起 中间工具区（对齐/分布/RM/?） */}
          <Button
            aria-label={toolsExpanded ? '收起工具' : '展开工具'}
            onClick={() => setToolsExpanded((v) => !v)}
            className="focus:outline-none focus:ring-2 focus:ring-black"
            style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
            title={toolsExpanded ? '收起工具' : '展开工具'}
          >
            ⋯
          </Button>


          <Tooltip title={t('toolbar.execute')}>
            <Button
              aria-label="执行工作流"
              icon={<PlayCircleOutlined />}
              loading={isExecuting}
              onClick={onExecute}
              data-tour="execute-button"
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ minHeight: 48, backgroundColor: '#0B0B0B', color: '#FFFFFF', borderColor: '#0B0B0B', borderRadius: '4px' }}
            />
          </Tooltip>
          
          <Tooltip title={t('toolbar.reset')}>
            <Button
              aria-label={t('toolbar.reset')}
              icon={<ReloadOutlined />}
              onClick={onReset}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ minHeight: 48, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
            />
          </Tooltip>

          <Tooltip title="快速自检">
            <Button
              aria-label="快速自检"
              icon={<ExperimentOutlined />}
              loading={selfTestLoading}
              onClick={handleSelfTest}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ minHeight: 48, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
            />
          </Tooltip>

          <Divider type="vertical" />

          <div data-tour="language-button">
            <LanguageSwitcher mode="dropdown" size="middle" />
          </div>

          <div data-tour="theme-button">
            <ThemeController type="popover" />
          </div>
        </Space>
      </div>

      {/* 折叠工具区：第二排 */}
      {toolsExpanded && (
        <div className="w-full bg-white border-b border-gray-200 px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* 水平对齐：左/中/右 */}
            <Button
              aria-label="左对齐"
              title={selectedCount < 2 ? '至少选择 2 个节点' : '左对齐'}
              aria-pressed={false}
              disabled={selectedCount < 2}
              onClick={onAlignLeft}
              className="focus:outline-none focus:ring-2 focus:ring-black"
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
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
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
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
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
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
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
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
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
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
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
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
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
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
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
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
                  borderRadius: '4px',
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
                  borderRadius: '4px',
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
              style={{ height: 48, width: 48, padding: 0, backgroundColor: reducedMotion ? '#0B0B0B' : '#FFFFFF', color: reducedMotion ? '#FFFFFF' : '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
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
                  borderRadius: '4px',
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
              style={{ height: 48, width: 48, padding: 0, backgroundColor: '#FFFFFF', color: '#0B0B0B', borderColor: '#0B0B0B', borderRadius: '4px' }}
            >
              ?
            </Button>
          </div>
        </div>
      )}
      {/* 保存工作流模态框 */}
      <Modal
        title={t('workflow.save.title')}
        open={saveModalVisible}
        onOk={handleSave}
        onCancel={() => setSaveModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Form form={saveForm} layout="vertical">
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
    </div>
  );
};

export default Toolbar;