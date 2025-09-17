import React, { useState } from 'react';
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
  MonitorOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ThemeController from './ThemeController';
import LanguageSwitcher from './LanguageSwitcher';
import type { Workflow } from '../types/workflow';

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
  onShowMonitor
}) => {
  const { t } = useTranslation();
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [loadModalVisible, setLoadModalVisible] = useState(false);
  const [saveForm] = Form.useForm();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

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

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
      <div>
        <Space>
          <Tooltip title={t('toolbar.new')}>
            <Button
              icon={<PlusOutlined />}
              onClick={handleNew}
            >
              {t('common.create')}
            </Button>
          </Tooltip>
          
          <Tooltip title={t('toolbar.save')}>
            <Button
              icon={<SaveOutlined />}
              onClick={() => setSaveModalVisible(true)}
              data-tour="save-button"
            >
              {t('common.save')}
            </Button>
          </Tooltip>
          
          <Tooltip title={t('toolbar.load')}>
            <Button
              icon={<FolderOpenOutlined />}
              onClick={() => setLoadModalVisible(true)}
            >
              {t('common.load')}
            </Button>
          </Tooltip>
          
          <Divider type="vertical" />
          
          <Tooltip title={t('toolbar.import')}>
            <Button
              icon={<UploadOutlined />}
              onClick={handleImport}
            >
              {t('common.import')}
            </Button>
          </Tooltip>
          
          <Tooltip title={t('toolbar.export')}>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={!currentWorkflow}
            >
              {t('common.export')}
            </Button>
          </Tooltip>
        </Space>
      </div>

      <div>
        <h2 className="toolbar-title" style={{ margin: 0, color: '#1890ff' }}>
          {t('app.title')}
        </h2>
      </div>

      <div>
        <Space>
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

          <Divider type="vertical" />

          <Tooltip title={t('toolbar.execute')}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={isExecuting}
              onClick={onExecute}
              data-tour="execute-button"
            >
              {isExecuting ? t('messages.info.executing') : t('common.execute')}
            </Button>
          </Tooltip>
          
          <Tooltip title={t('toolbar.reset')}>
            <Button
              icon={<ReloadOutlined />}
              onClick={onReset}
            >
              {t('common.reset')}
            </Button>
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
    </div>
  );
};

export default Toolbar;