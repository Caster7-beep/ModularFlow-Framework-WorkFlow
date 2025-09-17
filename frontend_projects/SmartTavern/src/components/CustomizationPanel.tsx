import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import OverlayScrollbar from './OverlayScrollbar'
import '../styles/CustomizationPanel.css'

interface CustomizationPanelProps {
  loadConfigData: () => void;
}

interface CustomizationFile {
  name: string;
  type: 'css' | 'js' | 'component';
  enabled: boolean;
}

interface CustomizationPackage {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  files: CustomizationFile[];
}

export default function CustomizationPanel({ loadConfigData }: CustomizationPanelProps) {
  const [customizationPackages, setCustomizationPackages] = useState<CustomizationPackage[]>([])
  const [expandedPackage, setExpandedPackage] = useState<string | null>(null)
  const [editedPackages, setEditedPackages] = useState<{[id: string]: CustomizationPackage}>({})
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [activePackage, setActivePackage] = useState<string | null>(null)

  useEffect(() => {
    loadAllCustomizationPackages();
    loadActivePackage();
  }, [])

  // 模拟数据加载
  const loadAllCustomizationPackages = async () => {
    try {
      // 使用占位符数据进行测试
      const mockPackages: CustomizationPackage[] = [
        {
          id: '1',
          name: '暗黑主题美化包',
          description: '深色主题风格的美化组件',
          author: 'SmartTavern Team',
          version: '1.0.0',
          files: [
            { name: 'dark-theme.css', type: 'css', enabled: true },
            { name: 'dark-components.js', type: 'js', enabled: true },
            { name: 'DarkButton.tsx', type: 'component', enabled: false },
            { name: 'DarkModal.tsx', type: 'component', enabled: true }
          ]
        },
        {
          id: '2',
          name: '赛博朋克风格包',
          description: '未来感十足的赛博朋克UI风格',
          author: 'CyberUI Studio',
          version: '2.1.0',
          files: [
            { name: 'cyber-theme.css', type: 'css', enabled: false },
            { name: 'neon-effects.css', type: 'css', enabled: false },
            { name: 'cyber-animations.js', type: 'js', enabled: false },
            { name: 'GlitchText.tsx', type: 'component', enabled: false },
            { name: 'NeonButton.tsx', type: 'component', enabled: false }
          ]
        },
        {
          id: '3',
          name: '简约白色主题',
          description: '干净清爽的白色主题美化',
          author: 'MinimalUI',
          version: '1.5.2',
          files: [
            { name: 'minimal-theme.css', type: 'css', enabled: true },
            { name: 'clean-layout.css', type: 'css', enabled: true },
            { name: 'minimal-utils.js', type: 'js', enabled: false }
          ]
        }
      ];
      setCustomizationPackages(mockPackages);
    } catch (err) {
      console.error('加载自定义美化包失败:', err);
    }
  };

  const loadActivePackage = async () => {
    try {
      // 模拟当前活动包
      setActivePackage('1');
    } catch (err) {
      console.error('加载活动美化包失败:', err);
    }
  };

  const handleUsePackage = async (packageId: string) => {
    try {
      // 模拟设置活动美化包
      setActivePackage(packageId);
      const packageName = customizationPackages.find(p => p.id === packageId)?.name || '未知包';
      alert(`✅ 已设置 "${packageName}" 为活动美化包`);
    } catch (err) {
      console.error('设置活动美化包失败:', err);
      alert('❌ 设置失败，请重试');
    }
  };

  const handleCreateNewPackage = async () => {
    const packageName = prompt('请输入新美化包的名称：')
    if (!packageName) return

    const newPackage: CustomizationPackage = {
      id: Date.now().toString(),
      name: packageName,
      description: '自定义美化包',
      author: '用户',
      version: '1.0.0',
      files: []
    }

    try {
      // 模拟创建新美化包
      setCustomizationPackages(prev => [...prev, newPackage]);
      alert('✅ 新美化包创建成功');
    } catch (err) {
      console.error('创建新美化包失败:', err)
      alert('创建新美化包失败，请重试')
    }
  }

  const handleDeletePackage = async (packageId: string) => {
    const packageName = customizationPackages.find(p => p.id === packageId)?.name || packageId;
    const confirmDelete = confirm(`确定要删除美化包 "${packageName}" 吗？此操作无法撤销。`)
    if (!confirmDelete) return

    try {
      // 模拟删除美化包
      setCustomizationPackages(prev => prev.filter(p => p.id !== packageId));
      if (activePackage === packageId) {
        setActivePackage(null);
      }
      alert('✅ 美化包删除成功');
    } catch (err) {
      console.error('删除美化包失败:', err)
      alert('删除美化包失败，请重试')
    }
  }

  const handlePackageExpand = (packageId: string) => {
    if (expandedPackage === packageId) {
      setExpandedPackage(null)
      setEditedPackages(prev => {
        const newState = { ...prev }
        delete newState[packageId]
        return newState
      })
    } else {
      setExpandedPackage(packageId)
      const packageData = customizationPackages.find(p => p.id === packageId)
      setEditedPackages(prev => ({
        ...prev,
        [packageId]: packageData ? { ...packageData } : {} as CustomizationPackage
      }))
    }
  }

  const handleInputChange = (packageId: string, field: keyof CustomizationPackage, value: string) => {
    setEditedPackages(prev => {
      const currentPackage = prev[packageId]
      if (!currentPackage) return prev
      
      const updatedPackage: CustomizationPackage = {
        ...currentPackage,
        [field]: value
      }
      
      return {
        ...prev,
        [packageId]: updatedPackage
      }
    })
  }

  const handleBlur = async (packageId: string) => {
    const editedPackage = editedPackages[packageId]
    if (!editedPackage) return

    try {
      // 模拟保存操作
      setCustomizationPackages(prev =>
        prev.map(pkg =>
          pkg.id === packageId
            ? { ...pkg, ...editedPackage }
            : pkg
        )
      );
      console.log('美化包信息已保存:', editedPackage);
    } catch (err) {
      console.error('保存美化包信息失败:', err)
      alert('保存美化包信息失败，请重试')
    }
  }

  const handleFileToggle = async (packageId: string, fileName: string, enabled: boolean) => {
    try {
      // 更新编辑状态
      setEditedPackages(prev => {
        const updatedPackage = { ...prev[packageId] };
        if (updatedPackage.files) {
          updatedPackage.files = updatedPackage.files.map(file =>
            file.name === fileName ? { ...file, enabled } : file
          );
        }
        return {
          ...prev,
          [packageId]: updatedPackage
        };
      });

      // 更新主状态
      setCustomizationPackages(prev =>
        prev.map(pkg =>
          pkg.id === packageId
            ? {
                ...pkg,
                files: pkg.files.map(file =>
                  file.name === fileName ? { ...file, enabled } : file
                )
              }
            : pkg
        )
      );

      console.log(`文件 ${fileName} 已${enabled ? '启用' : '禁用'}`);
    } catch (err) {
      console.error('切换文件状态失败:', err);
      alert('切换文件状态失败，请重试');
    }
  };

  const getFileTypeIcon = (type: string) => {
    switch (type) {
      case 'css': return '🎨'
      case 'js': return '⚙️'
      case 'component': return '🧩'
      default: return '📄'
    }
  }

  const getFileTypeLabel = (type: string) => {
    switch (type) {
      case 'css': return '样式文件'
      case 'js': return 'JavaScript文件'
      case 'component': return '组件文件'
      default: return '未知类型'
    }
  }

  return (
    <motion.div
      className="customization-panel"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="customization-panel-content">
        <div className="customization-panel-header">
          <span>自定义美化</span>
          <div className="customization-panel-header-buttons">
            <button
              className="customization-panel-add-btn"
              onClick={handleCreateNewPackage}
              title="添加美化包"
            >
              ➕
            </button>
          </div>
        </div>

        {customizationPackages.length > 0 ? (
          <OverlayScrollbar
            className="customization-scrollbar-container"
            showOnHover={true}
            autoHide={true}
          >
            {customizationPackages.map((pkg) => {
              const editedPackage = editedPackages[pkg.id]

              return (
                <div key={pkg.id} className="customization-package-card-container">
                  {/* 美化包卡片显示 */}
                  <motion.div
                    className={`customization-package-card ${
                      activePackage === pkg.id
                        ? 'customization-package-card-active'
                        : hoveredCard === pkg.id
                          ? 'customization-package-card-hover'
                          : 'customization-package-card-inactive'
                    }`}
                    onMouseEnter={() => setHoveredCard(pkg.id)}
                    onMouseLeave={() => setHoveredCard(null)}
                    onClick={() => handlePackageExpand(pkg.id)}
                  >
                    {/* 图标区域 */}
                    <div className="customization-package-icon">
                      🎭
                    </div>

                    {/* 内容区域 */}
                    <div className="customization-package-content">
                      <div className="customization-package-name-row">
                        <span className={`customization-package-name ${
                          activePackage === pkg.id ? 'customization-package-name-active' : 'customization-package-name-inactive'
                        }`}>
                          {pkg.name}
                          {activePackage === pkg.id && (
                            <span className="customization-package-active-indicator">⚡</span>
                          )}
                        </span>
                      </div>
                      
                      <div className="customization-package-description">
                        {pkg.description}
                      </div>
                      
                      <div className="customization-package-meta">
                        {pkg.author} • v{pkg.version} • {pkg.files.filter(f => f.enabled).length}/{pkg.files.length} 文件启用
                      </div>
                    </div>

                    {/* 展开按钮 */}
                    <div className="customization-package-expand-btn">
                      <span className={`customization-package-expand-icon ${
                        expandedPackage === pkg.id ? 'customization-package-expand-icon-expanded' : 'customization-package-expand-icon-collapsed'
                      }`}>
                        ▶
                      </span>
                    </div>

                    {/* 操作按钮区域 */}
                    <div className="customization-package-actions">
                      <button
                        className={`customization-package-use-btn ${
                          activePackage === pkg.id ? 'customization-package-use-btn-active' : 'customization-package-use-btn-inactive'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUsePackage(pkg.id)
                        }}
                        title="使用此美化包"
                      >
                        使用
                      </button>
                      <button
                        className="customization-package-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeletePackage(pkg.id)
                        }}
                        title="删除美化包"
                      >
                        删除
                      </button>
                    </div>
                  </motion.div>

                  {/* 展开的文件列表区域 */}
                  <AnimatePresence>
                    {expandedPackage === pkg.id && editedPackage && (
                      <motion.div
                        className="customization-package-expanded"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* 美化包信息编辑区域 */}
                        <div className="customization-config-section">
                          <h4 className="customization-section-title">基本信息</h4>
                          
                          {/* 名称编辑 */}
                          <div className="customization-config-field-group">
                            <label className="customization-config-field-label">
                              名称
                            </label>
                            <input
                              type="text"
                              className="customization-config-input"
                              value={editedPackage.name || ''}
                              onChange={(e) => handleInputChange(pkg.id, 'name', e.target.value)}
                              onBlur={() => handleBlur(pkg.id)}
                              placeholder="请输入美化包名称"
                            />
                          </div>

                          {/* 描述编辑 */}
                          <div className="customization-config-field-group">
                            <label className="customization-config-field-label">
                              描述
                            </label>
                            <textarea
                              className="customization-config-textarea"
                              rows={3}
                              value={editedPackage.description || ''}
                              onChange={(e) => handleInputChange(pkg.id, 'description', e.target.value)}
                              onBlur={() => handleBlur(pkg.id)}
                              placeholder="请输入美化包描述"
                            />
                          </div>

                          {/* 作者编辑 */}
                          <div className="customization-config-field-group">
                            <label className="customization-config-field-label">
                              作者
                            </label>
                            <input
                              type="text"
                              className="customization-config-input"
                              value={editedPackage.author || ''}
                              onChange={(e) => handleInputChange(pkg.id, 'author', e.target.value)}
                              onBlur={() => handleBlur(pkg.id)}
                              placeholder="请输入作者名称"
                            />
                          </div>

                          {/* 版本编辑 */}
                          <div className="customization-config-field-group">
                            <label className="customization-config-field-label">
                              版本
                            </label>
                            <input
                              type="text"
                              className="customization-config-input"
                              value={editedPackage.version || ''}
                              onChange={(e) => handleInputChange(pkg.id, 'version', e.target.value)}
                              onBlur={() => handleBlur(pkg.id)}
                              placeholder="1.0.0"
                            />
                          </div>
                        </div>

                        <div className="customization-files-header">
                          <h4>美化文件列表</h4>
                          <span className="customization-files-count">
                            {editedPackage.files?.length || 0} 个文件
                          </span>
                        </div>

                        <div className="customization-files-list">
                          {editedPackage.files?.map((file, index) => (
                            <div key={index} className="customization-file-item">
                              <div className="customization-file-info">
                                <span className="customization-file-icon">
                                  {getFileTypeIcon(file.type)}
                                </span>
                                <div className="customization-file-details">
                                  <span className="customization-file-name">
                                    {file.name}
                                  </span>
                                  <span className="customization-file-type">
                                    {getFileTypeLabel(file.type)}
                                  </span>
                                </div>
                              </div>
                              <div className="customization-file-toggle">
                                <label className="customization-switch">
                                  <input
                                    type="checkbox"
                                    checked={file.enabled}
                                    onChange={(e) => handleFileToggle(pkg.id, file.name, e.target.checked)}
                                  />
                                  <span className="customization-switch-slider"></span>
                                </label>
                                <span className={`customization-file-status ${file.enabled ? 'enabled' : 'disabled'}`}>
                                  {file.enabled ? '启用' : '禁用'}
                                </span>
                              </div>
                            </div>
                          )) || (
                            <div className="customization-files-empty">
                              暂无美化文件
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </OverlayScrollbar>
        ) : (
          <div className="customization-panel-empty">
            暂无美化包，点击 ➕ 按钮创建新美化包
          </div>
        )}
      </div>
    </motion.div>
  )
}