import React from 'react';
import Avatar from 'react-avatar';

const getAvatarColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 25%)`;
};

const Client = ({ username, socketId, isCurrent }) => {
  const avatarBg = getAvatarColor(username || 'Anonymous');

  return (
    <div className={`client-card ${isCurrent ? 'current-user' : ''}`}>
      <div className="avatar-wrapper">
        <Avatar
          name={username}
          size="42"
          round="12px"
          textSizeRatio={2}
          color={avatarBg}
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
