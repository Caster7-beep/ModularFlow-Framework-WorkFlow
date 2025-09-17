import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface MergerNodeData {
  label: string;
  merge_strategy: 'concat' | 'first' | 'last' | 'weighted';
  separator: string;
  description?: string;
}

const MergerNode: React.FC<NodeProps<MergerNodeData>> = ({ 
  data, 
  selected,
  id 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localData, setLocalData] = useState(data);

  const handleSave = () => {
    // 这里应该调用父组件的更新函数
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalData(data);
    setIsEditing(false);
  };

  const mergeStrategies = [
    { value: 'concat', label: '连接合并', description: '将所有输入连接在一起' },
    { value: 'first', label: '取第一个', description: '只保留第一个输入' },
    { value: 'last', label: '取最后一个', description: '只保留最后一个输入' },
    { value: 'weighted', label: '加权合并', description: '基于信号值加权合并' }
  ];

  const currentStrategy = mergeStrategies.find(s => s.value === data.merge_strategy) || mergeStrategies[0];

  return (
    <div className={`merger-node ${selected ? 'selected' : ''}`}>
      {/* 多个输入端口 */}
      <Handle
        type="target"
        position={Position.Left}
        id="input1"
        className="handle-input"
        style={{ top: '25%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="input2"
        className="handle-input"
        style={{ top: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="input3"
        className="handle-input"
        style={{ top: '75%' }}
      />
      
      <div className="node-header">
        <div className="node-icon">🔗</div>
        <div className="node-title">{data.label || '结果聚合'}</div>
      </div>
      
      <div className="node-content">
        {isEditing ? (
          <div className="edit-form">
            <div className="form-group">
              <label>合并策略:</label>
              <select
                value={localData.merge_strategy || 'concat'}
                onChange={(e) => setLocalData({
                  ...localData,
                  merge_strategy: e.target.value as any
                })}
                className="strategy-select"
              >
                {mergeStrategies.map(strategy => (
                  <option key={strategy.value} value={strategy.value}>
                    {strategy.label}
                  </option>
                ))}
              </select>
              <div className="strategy-description">
                {mergeStrategies.find(s => s.value === localData.merge_strategy)?.description}
              </div>
            </div>
            
            {(localData.merge_strategy === 'concat' || !localData.merge_strategy) && (
              <div className="form-group">
                <label>分隔符:</label>
                <input
                  type="text"
                  value={localData.separator || '\n'}
                  onChange={(e) => setLocalData({
                    ...localData,
                    separator: e.target.value
                  })}
                  placeholder="例如: \n, , 或自定义"
                  className="separator-input"
                />
                <div className="separator-presets">
                  <button 
                    onClick={() => setLocalData({...localData, separator: '\n'})}
                    className="preset-btn"
                  >
                    换行
                  </button>
                  <button 
                    onClick={() => setLocalData({...localData, separator: ', '})}
                    className="preset-btn"
                  >
                    逗号
                  </button>
                  <button 
                    onClick={() => setLocalData({...localData, separator: ' '})}
                    className="preset-btn"
                  >
                    空格
                  </button>
                </div>
              </div>
            )}
            
            <div className="form-actions">
              <button onClick={handleSave} className="btn-save">保存</button>
              <button onClick={handleCancel} className="btn-cancel">取消</button>
            </div>
          </div>
        ) : (
          <div className="display-content" onClick={() => setIsEditing(true)}>
            <div className="strategy-display">
              <div className="strategy-info">
                <span className="strategy-label">{currentStrategy.label}</span>
                <div className="strategy-desc">{currentStrategy.description}</div>
              </div>
              {data.merge_strategy === 'concat' && (
                <div className="separator-display">
                  <strong>分隔符:</strong> 
                  <span className="separator-value">
                    {data.separator === '\n' ? '换行' : 
                     data.separator === ', ' ? '逗号' :
                     data.separator === ' ' ? '空格' :
                     data.separator || '换行'}
                  </span>
                </div>
              )}
            </div>
            
            <div className="inputs-preview">
              <div className="input-slot">
                <div className="input-indicator"></div>
                <span>输入 1</span>
              </div>
              <div className="input-slot">
                <div className="input-indicator"></div>
                <span>输入 2</span>
              </div>
              <div className="input-slot">
                <div className="input-indicator"></div>
                <span>输入 3</span>
              </div>
              <div className="merge-arrow">⬇</div>
              <div className="output-preview">合并输出</div>
            </div>
            
            {data.description && (
              <div className="node-description">{data.description}</div>
            )}
          </div>
        )}
      </div>
      
      {/* 输出端口 */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="handle-output"
      />
      
      <style>{`
        .merger-node {
          background: linear-gradient(135deg, #f0f8ff 0%, #e1f5fe 100%);
          border: 2px solid #00bcd4;
          border-radius: 12px;
          min-width: 200px;
          max-width: 280px;
          box-shadow: 0 4px 12px rgba(0, 188, 212, 0.2);
          transition: all 0.3s ease;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .merger-node.selected {
          border-color: #0097a7;
          box-shadow: 0 6px 20px rgba(0, 188, 212, 0.4);
          transform: translateY(-2px);
        }
        
        .merger-node .node-header {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: rgba(0, 188, 212, 0.1);
          border-bottom: 1px solid rgba(0, 188, 212, 0.2);
          border-radius: 10px 10px 0 0;
        }
        
        .merger-node .node-icon {
          font-size: 18px;
          margin-right: 8px;
        }
        
        .merger-node .node-title {
          font-weight: 600;
          color: #0097a7;
          font-size: 14px;
        }
        
        .merger-node .node-content {
          padding: 16px;
        }
        
        .merger-node .display-content {
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .merger-node .display-content:hover {
          background-color: rgba(0, 188, 212, 0.05);
          border-radius: 6px;
        }
        
        .merger-node .strategy-display {
          margin-bottom: 12px;
          padding: 8px;
          background: rgba(0, 188, 212, 0.1);
          border-radius: 6px;
        }
        
        .merger-node .strategy-label {
          font-weight: bold;
          color: #0097a7;
          font-size: 13px;
        }
        
        .merger-node .strategy-desc {
          font-size: 11px;
          color: #546e7a;
          margin-top: 2px;
        }
        
        .merger-node .separator-display {
          margin-top: 6px;
          font-size: 11px;
          color: #546e7a;
        }
        
        .merger-node .separator-value {
          background: #00bcd4;
          color: white;
          padding: 1px 4px;
          border-radius: 2px;
          margin-left: 4px;
        }
        
        .merger-node .inputs-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        
        .merger-node .input-slot {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #546e7a;
        }
        
        .merger-node .input-indicator {
          width: 8px;
          height: 8px;
          background: #00bcd4;
          border-radius: 50%;
        }
        
        .merger-node .merge-arrow {
          font-size: 16px;
          color: #00bcd4;
          margin: 4px 0;
        }
        
        .merger-node .output-preview {
          background: #00bcd4;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
        }
        
        .merger-node .edit-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .merger-node .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .merger-node .form-group label {
          font-size: 12px;
          font-weight: 600;
          color: #0097a7;
        }
        
        .merger-node .strategy-select {
          padding: 6px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
          background: white;
        }
        
        .merger-node .strategy-description {
          font-size: 10px;
          color: #666;
          font-style: italic;
          margin-top: 2px;
        }
        
        .merger-node .separator-input {
          padding: 6px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
        }
        
        .merger-node .separator-presets {
          display: flex;
          gap: 4px;
          margin-top: 4px;
        }
        
        .merger-node .preset-btn {
          padding: 2px 6px;
          border: 1px solid #00bcd4;
          background: white;
          color: #00bcd4;
          border-radius: 3px;
          font-size: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .merger-node .preset-btn:hover {
          background: #00bcd4;
          color: white;
        }
        
        .merger-node .form-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        
        .merger-node .btn-save, .merger-node .btn-cancel {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .merger-node .btn-save {
          background: #27ae60;
          color: white;
        }
        
        .merger-node .btn-save:hover {
          background: #229954;
        }
        
        .merger-node .btn-cancel {
          background: #95a5a6;
          color: white;
        }
        
        .merger-node .btn-cancel:hover {
          background: #7f8c8d;
        }
        
        .merger-node .node-description {
          margin-top: 8px;
          font-size: 11px;
          color: #666;
          font-style: italic;
        }
        
        .merger-node .handle-input {
          background: #ff9800 !important;
          border: 2px solid white !important;
          width: 12px !important;
          height: 12px !important;
        }
        
        .merger-node .handle-output {
          background: #00bcd4 !important;
          border: 2px solid white !important;
          width: 12px !important;
          height: 12px !important;
        }
      `}</style>
    </div>
  );
};

export default MergerNode;