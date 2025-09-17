import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface ConditionNodeData {
  label: string;
  condition: string;
  true_output: string;
  false_output: string;
  description?: string;
}

const ConditionNode: React.FC<NodeProps<ConditionNodeData>> = ({ 
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

  return (
    <div className={`condition-node ${selected ? 'selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="handle-input"
      />
      
      <div className="node-header">
        <div className="node-icon">🔀</div>
        <div className="node-title">{data.label || '条件判断'}</div>
      </div>
      
      <div className="node-content">
        {isEditing ? (
          <div className="edit-form">
            <div className="form-group">
              <label>条件表达式:</label>
              <input
                type="text"
                value={localData.condition || ''}
                onChange={(e) => setLocalData({
                  ...localData,
                  condition: e.target.value
                })}
                placeholder="例如: length > 10"
                className="condition-input"
              />
            </div>
            
            <div className="form-group">
              <label>True输出:</label>
              <input
                type="text"
                value={localData.true_output || ''}
                onChange={(e) => setLocalData({
                  ...localData,
                  true_output: e.target.value
                })}
                placeholder="条件为真时的输出"
                className="output-input"
              />
            </div>
            
            <div className="form-group">
              <label>False输出:</label>
              <input
                type="text"
                value={localData.false_output || ''}
                onChange={(e) => setLocalData({
                  ...localData,
                  false_output: e.target.value
                })}
                placeholder="条件为假时的输出"
                className="output-input"
              />
            </div>
            
            <div className="form-actions">
              <button onClick={handleSave} className="btn-save">保存</button>
              <button onClick={handleCancel} className="btn-cancel">取消</button>
            </div>
          </div>
        ) : (
          <div className="display-content" onClick={() => setIsEditing(true)}>
            <div className="condition-display">
              <strong>条件:</strong> {data.condition || '未设置'}
            </div>
            <div className="outputs-display">
              <div className="true-output">
                <span className="output-label true">✓</span>
                {data.true_output || '真'}
              </div>
              <div className="false-output">
                <span className="output-label false">✗</span>
                {data.false_output || '假'}
              </div>
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
        id="true"
        className="handle-output handle-true"
        style={{ top: '40%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        className="handle-output handle-false"
        style={{ top: '60%' }}
      />
      
      <style>{`
        .condition-node {
          background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
          border: 2px solid #f39c12;
          border-radius: 12px;
          min-width: 200px;
          max-width: 300px;
          box-shadow: 0 4px 12px rgba(243, 156, 18, 0.2);
          transition: all 0.3s ease;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .condition-node.selected {
          border-color: #e67e22;
          box-shadow: 0 6px 20px rgba(243, 156, 18, 0.4);
          transform: translateY(-2px);
        }
        
        .condition-node .node-header {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: rgba(243, 156, 18, 0.1);
          border-bottom: 1px solid rgba(243, 156, 18, 0.2);
          border-radius: 10px 10px 0 0;
        }
        
        .condition-node .node-icon {
          font-size: 18px;
          margin-right: 8px;
        }
        
        .condition-node .node-title {
          font-weight: 600;
          color: #d68910;
          font-size: 14px;
        }
        
        .condition-node .node-content {
          padding: 16px;
        }
        
        .condition-node .display-content {
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .condition-node .display-content:hover {
          background-color: rgba(243, 156, 18, 0.05);
          border-radius: 6px;
        }
        
        .condition-node .condition-display {
          margin-bottom: 12px;
          padding: 8px;
          background: rgba(243, 156, 18, 0.1);
          border-radius: 6px;
          font-size: 12px;
          color: #8b4513;
        }
        
        .condition-node .outputs-display {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .condition-node .true-output, .condition-node .false-output {
          display: flex;
          align-items: center;
          padding: 6px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        
        .condition-node .true-output {
          background: rgba(39, 174, 96, 0.1);
          color: #27ae60;
        }
        
        .condition-node .false-output {
          background: rgba(231, 76, 60, 0.1);
          color: #e74c3c;
        }
        
        .condition-node .output-label {
          margin-right: 6px;
          font-weight: bold;
        }
        
        .condition-node .output-label.true {
          color: #27ae60;
        }
        
        .condition-node .output-label.false {
          color: #e74c3c;
        }
        
        .condition-node .edit-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .condition-node .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .condition-node .form-group label {
          font-size: 12px;
          font-weight: 600;
          color: #8b4513;
        }
        
        .condition-node .condition-input, .condition-node .output-input {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
        }
        
        .condition-node .condition-input {
          background: #f8f9fa;
        }
        
        .condition-node .form-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        
        .condition-node .btn-save, .condition-node .btn-cancel {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .condition-node .btn-save {
          background: #27ae60;
          color: white;
        }
        
        .condition-node .btn-save:hover {
          background: #229954;
        }
        
        .condition-node .btn-cancel {
          background: #95a5a6;
          color: white;
        }
        
        .condition-node .btn-cancel:hover {
          background: #7f8c8d;
        }
        
        .condition-node .node-description {
          margin-top: 8px;
          font-size: 11px;
          color: #666;
          font-style: italic;
        }
        
        .condition-node .handle-input {
          background: #3498db !important;
          border: 2px solid white !important;
          width: 12px !important;
          height: 12px !important;
        }
        
        .condition-node .handle-output {
          border: 2px solid white !important;
          width: 12px !important;
          height: 12px !important;
        }
        
        .condition-node .handle-true {
          background: #27ae60 !important;
        }
        
        .condition-node .handle-false {
          background: #e74c3c !important;
        }
      `}</style>
    </div>
  );
};

export default ConditionNode;