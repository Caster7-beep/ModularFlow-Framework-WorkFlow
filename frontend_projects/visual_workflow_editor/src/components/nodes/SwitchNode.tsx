import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface SwitchNodeData {
  label: string;
  switch_map: Record<string, string>;
  description?: string;
}

const SwitchNode: React.FC<NodeProps<SwitchNodeData>> = ({ 
  data, 
  selected,
  id 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localData, setLocalData] = useState(data);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleSave = () => {
    // 这里应该调用父组件的更新函数
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalData(data);
    setIsEditing(false);
  };

  const addRoute = () => {
    if (newKey && newValue) {
      setLocalData({
        ...localData,
        switch_map: {
          ...localData.switch_map,
          [newKey]: newValue
        }
      });
      setNewKey('');
      setNewValue('');
    }
  };

  const removeRoute = (key: string) => {
    const newSwitchMap = { ...localData.switch_map };
    delete newSwitchMap[key];
    setLocalData({
      ...localData,
      switch_map: newSwitchMap
    });
  };

  const switchMap = data.switch_map || {};
  const routes = Object.entries(switchMap);

  return (
    <div className={`switch-node ${selected ? 'selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="handle-input"
      />
      
      <div className="node-header">
        <div className="node-icon">🔀</div>
        <div className="node-title">{data.label || '开关路由'}</div>
      </div>
      
      <div className="node-content">
        {isEditing ? (
          <div className="edit-form">
            <div className="routes-list">
              <h4>路由规则:</h4>
              {Object.entries(localData.switch_map || {}).map(([key, value]) => (
                <div key={key} className="route-item">
                  <span className="route-key">{key}</span>
                  <span className="route-arrow">→</span>
                  <span className="route-value">{value}</span>
                  <button 
                    onClick={() => removeRoute(key)}
                    className="btn-remove"
                    title="删除路由"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            
            <div className="add-route">
              <div className="add-route-inputs">
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="信号值 (如: 1, >5, default)"
                  className="route-key-input"
                />
                <span className="route-arrow">→</span>
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="输出内容"
                  className="route-value-input"
                />
                <button onClick={addRoute} className="btn-add">+</button>
              </div>
            </div>
            
            <div className="form-actions">
              <button onClick={handleSave} className="btn-save">保存</button>
              <button onClick={handleCancel} className="btn-cancel">取消</button>
            </div>
          </div>
        ) : (
          <div className="display-content" onClick={() => setIsEditing(true)}>
            <div className="routes-display">
              {routes.length > 0 ? (
                routes.map(([key, value]) => (
                  <div key={key} className="route-display-item">
                    <span className="route-key-display">{key}</span>
                    <span className="route-arrow">→</span>
                    <span className="route-value-display">{value}</span>
                  </div>
                ))
              ) : (
                <div className="no-routes">未配置路由规则</div>
              )}
            </div>
            {data.description && (
              <div className="node-description">{data.description}</div>
            )}
          </div>
        )}
      </div>
      
      {/* 输出端口 - 根据路由数量动态生成 */}
      {routes.map(([key], index) => (
        <Handle
          key={key}
          type="source"
          position={Position.Right}
          id={key}
          className="handle-output"
          style={{ 
            top: `${30 + (index * 15)}%`,
            background: `hsl(${(index * 60) % 360}, 70%, 50%)`
          }}
        />
      ))}
      
      {/* 默认输出端口 */}
      <Handle
        type="source"
        position={Position.Right}
        id="default"
        className="handle-output handle-default"
        style={{ bottom: '10px' }}
      />
      
      <style>{`
        .switch-node {
          background: linear-gradient(135deg, #e8f4fd 0%, #b3d9ff 100%);
          border: 2px solid #3498db;
          border-radius: 12px;
          min-width: 220px;
          max-width: 350px;
          box-shadow: 0 4px 12px rgba(52, 152, 219, 0.2);
          transition: all 0.3s ease;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .switch-node.selected {
          border-color: #2980b9;
          box-shadow: 0 6px 20px rgba(52, 152, 219, 0.4);
          transform: translateY(-2px);
        }
        
        .switch-node .node-header {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: rgba(52, 152, 219, 0.1);
          border-bottom: 1px solid rgba(52, 152, 219, 0.2);
          border-radius: 10px 10px 0 0;
        }
        
        .switch-node .node-icon {
          font-size: 18px;
          margin-right: 8px;
        }
        
        .switch-node .node-title {
          font-weight: 600;
          color: #2980b9;
          font-size: 14px;
        }
        
        .switch-node .node-content {
          padding: 16px;
        }
        
        .switch-node .display-content {
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .switch-node .display-content:hover {
          background-color: rgba(52, 152, 219, 0.05);
          border-radius: 6px;
        }
        
        .switch-node .routes-display {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .switch-node .route-display-item {
          display: flex;
          align-items: center;
          padding: 6px 8px;
          background: rgba(52, 152, 219, 0.1);
          border-radius: 4px;
          font-size: 12px;
        }
        
        .switch-node .route-key-display {
          background: #3498db;
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: bold;
          min-width: 40px;
          text-align: center;
        }
        
        .switch-node .route-arrow {
          margin: 0 8px;
          color: #7f8c8d;
          font-weight: bold;
        }
        
        .switch-node .route-value-display {
          color: #2c3e50;
          flex: 1;
        }
        
        .switch-node .no-routes {
          text-align: center;
          color: #7f8c8d;
          font-style: italic;
          padding: 20px;
        }
        
        .switch-node .edit-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .switch-node .routes-list h4 {
          margin: 0 0 8px 0;
          font-size: 12px;
          color: #2980b9;
        }
        
        .switch-node .route-item {
          display: flex;
          align-items: center;
          padding: 6px 8px;
          background: #f8f9fa;
          border-radius: 4px;
          margin-bottom: 4px;
          font-size: 12px;
        }
        
        .switch-node .route-key {
          background: #3498db;
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: bold;
          min-width: 40px;
          text-align: center;
        }
        
        .switch-node .route-value {
          color: #2c3e50;
          flex: 1;
          margin-left: 8px;
        }
        
        .switch-node .btn-remove {
          background: #e74c3c;
          color: white;
          border: none;
          border-radius: 3px;
          width: 20px;
          height: 20px;
          cursor: pointer;
          font-size: 10px;
          margin-left: 8px;
        }
        
        .switch-node .btn-remove:hover {
          background: #c0392b;
        }
        
        .switch-node .add-route-inputs {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .switch-node .route-key-input, .switch-node .route-value-input {
          padding: 6px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
        }
        
        .switch-node .route-key-input {
          width: 120px;
          font-family: 'Courier New', monospace;
        }
        
        .switch-node .route-value-input {
          flex: 1;
        }
        
        .switch-node .btn-add {
          background: #27ae60;
          color: white;
          border: none;
          border-radius: 4px;
          width: 30px;
          height: 30px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
        }
        
        .switch-node .btn-add:hover {
          background: #229954;
        }
        
        .switch-node .form-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        
        .switch-node .btn-save, .switch-node .btn-cancel {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .switch-node .btn-save {
          background: #27ae60;
          color: white;
        }
        
        .switch-node .btn-save:hover {
          background: #229954;
        }
        
        .switch-node .btn-cancel {
          background: #95a5a6;
          color: white;
        }
        
        .switch-node .btn-cancel:hover {
          background: #7f8c8d;
        }
        
        .switch-node .node-description {
          margin-top: 8px;
          font-size: 11px;
          color: #666;
          font-style: italic;
        }
        
        .switch-node .handle-input {
          background: #e74c3c !important;
          border: 2px solid white !important;
          width: 12px !important;
          height: 12px !important;
        }
        
        .switch-node .handle-output {
          border: 2px solid white !important;
          width: 12px !important;
          height: 12px !important;
        }
        
        .switch-node .handle-default {
          background: #95a5a6 !important;
        }
      `}</style>
    </div>
  );
};

export default SwitchNode;