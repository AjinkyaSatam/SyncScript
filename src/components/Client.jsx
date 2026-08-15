import React from 'react';
import Avatar from 'react-avatar';

const Client = ({ username, socketId, isCurrent }) => {
  return (
    <div className={`client-card ${isCurrent ? 'current-user' : ''}`}>
      <div className="avatar-wrapper">
        <Avatar
          name={username}
          size="42"
          round="12px"
          textSizeRatio={2}
          color="hsl(215, 60%, 25%)"
          fgColor="#00f2fe"
        />
        <span className="online-badge" title="Active in room"></span>
      </div>
      <div className="client-info">
        <span className="client-name">{username}</span>
        {isCurrent && <span className="current-tag">(You)</span>}
      </div>
    </div>
  );
};

export default Client;
