import React from 'react';

const OutputPanel = ({ output, isCompiling, stats, onClear, isExpanded, onToggleExpand }) => {
  return (
    <div className={`console-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="console-header" onClick={onToggleExpand}>
        <div className="console-title">
          <span className="terminal-icon">💻</span>
          <span>Execution Console</span>
          {isCompiling ? (
            <span className="badge badge-running">Compiling...</span>
          ) : stats?.statusCode === 200 ? (
            <span className="badge badge-success">Success</span>
          ) : stats?.statusCode ? (
            <span className="badge badge-error">Failed</span>
          ) : (
            <span className="badge badge-idle">Ready</span>
          )}
        </div>

        <div className="console-actions" onClick={(e) => e.stopPropagation()}>
          {stats && (
            <div className="console-meta">
              {stats.cpuTime && <span className="meta-item">⏱️ {stats.cpuTime}</span>}
              {stats.memory && <span className="meta-item">💾 {stats.memory}</span>}
            </div>
          )}
          <button className="btn-icon" onClick={onClear} title="Clear Console">
            🗑️ Clear
          </button>
          <button className="btn-icon toggle-btn" onClick={onToggleExpand}>
            {isExpanded ? '▼ Minimize' : '▲ Open Console'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="console-body">
          <pre className={`output-content ${stats?.statusCode && stats?.statusCode !== 200 ? 'output-error' : ''}`}>
            {isCompiling ? (
              <span className="compiling-text">Compiling and running code via backend compiler...</span>
            ) : output ? (
              output
            ) : (
              <span className="placeholder-text">Click "Run Code" in sidebar to execute your code.</span>
            )}
          </pre>
        </div>
      )}
    </div>
  );
};

export default OutputPanel;
