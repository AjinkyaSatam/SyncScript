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

const Client = ({
  username,
  socketId,
  isCurrent,
  isAdmin,
  isCurrentUserAdmin,
  writeAccess = true,
  isActiveTypist = false,
  isSingleWriterMode = false,
  onToggleWrite,
  onMakeActiveTypist,
  onKick
}) => {
  const avatarBg = getAvatarColor(username || 'Anonymous');

  return (
    <div className={`client-card ${isCurrent ? 'current-user' : ''} ${!writeAccess ? 'readonly-user' : ''} ${isActiveTypist ? 'active-typist-card' : ''}`}>
      <div className="avatar-wrapper">
        <Avatar
          name={username}
          size="42"
          round="12px"
          textSizeRatio={2}
          color={avatarBg}
          fgColor={isActiveTypist ? "#10b981" : "#00f2fe"}
        />
        <span className="online-badge" title="Active in room"></span>
      </div>
      <div className="client-info">
        <div className="client-name-container">
          <span className="client-name" title={username}>{username}</span>
          {isAdmin && <span className="admin-badge" title="Room Admin">👑</span>}
        </div>
        <div className="client-tags">
          {isCurrent && <span className="current-tag">(You)</span>}
          {isSingleWriterMode && isActiveTypist && <span className="typist-tag">✏️ Typist</span>}
          {!writeAccess && <span className="readonly-tag">🔒 Read-only</span>}
        </div>
      </div>

      {/* Admin management buttons (only visible to admin for other users) */}
      {isCurrentUserAdmin && !isCurrent && (
        <div className="client-actions">
          {isSingleWriterMode && !isActiveTypist && onMakeActiveTypist && (
            <button
              className="btn-client-action btn-typist-assign"
              onClick={() => onMakeActiveTypist(socketId)}
              title="Pass Typing Control to User"
            >
              ✏️
            </button>
          )}
          <button
            className={`btn-client-action ${!writeAccess ? 'btn-write-disabled' : 'btn-write-enabled'}`}
            onClick={() => onToggleWrite(socketId, writeAccess)}
            title={writeAccess ? "Make Read-Only" : "Allow Writing"}
          >
            {writeAccess ? '📝' : '🔒'}
          </button>
          <button
            className="btn-client-action btn-kick"
            onClick={() => onKick(socketId)}
            title="Kick User"
          >
            ❌
          </button>
        </div>
      )}
    </div>
  );
};

export default Client;
