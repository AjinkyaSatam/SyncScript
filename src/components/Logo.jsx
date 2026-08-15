import React from 'react';

const Logo = ({ size = 'normal', onClick }) => {
  return (
    <div className={`app-logo logo-${size}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="logo-icon">
        <span className="logo-symbol">⚡</span>
      </div>
      <div className="logo-text">
        <span className="logo-sync">Sync</span>
        <span className="logo-script">Script</span>
      </div>
    </div>
  );
};

export default Logo;
