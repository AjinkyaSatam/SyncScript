import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidV4 } from 'uuid';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';

const Home = () => {
  const navigate = useNavigate();

  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');

  const createNewRoom = (e) => {
    e.preventDefault();
    const id = uuidV4();
    setRoomId(id);
    toast.success('Generated a new Room ID!', {
      style: {
        background: '#1e293b',
        color: '#38bdf8',
        border: '1px solid #334155',
      },
    });
  };

  const joinRoom = () => {
    if (!roomId.trim() || !username.trim()) {
      toast.error('Room ID & Username are required to join!');
      return;
    }

    // Navigate to Editor Page with username in state
    navigate(`/editor/${roomId.trim()}`, {
      state: {
        username: username.trim(),
      },
    });
  };

  const handleInputEnter = (e) => {
    if (e.code === 'Enter') {
      joinRoom();
    }
  };

  return (
    <div className="home-wrapper">
      <div className="home-container">
        {/* Left Panel: Join Form */}
        <div className="home-left">
          <div className="form-card">
            <div className="home-logo-container">
              <Logo size="large" />
            </div>

            <h1 className="form-title">Join a Room</h1>
            <p className="form-subtitle">Enter your Room ID and Username to start collaborating in real-time.</p>

            <div className="input-group">
              <label htmlFor="roomIdInput">ROOM ID</label>
              <input
                id="roomIdInput"
                type="text"
                className="input-field"
                placeholder="Paste or generate ROOM ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyUp={handleInputEnter}
              />
            </div>

            <div className="input-group">
              <label htmlFor="usernameInput">USERNAME</label>
              <input
                id="usernameInput"
                type="text"
                className="input-field"
                placeholder="Enter your display name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyUp={handleInputEnter}
              />
            </div>

            <button className="btn btn-primary btn-join" onClick={joinRoom}>
              JOIN ROOM
            </button>

            <div className="form-footer">
              <span>Don't have an invite link?</span>
              <button className="btn-link" onClick={createNewRoom}>
                Create a new room
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: About SyncScript */}
        <div className="home-right">
          <div className="about-card">
            <div className="about-badge">⚡ Real-time Pair Programming</div>
            <h2 className="about-title">About SyncScript</h2>
            <p className="about-desc">
              SyncScript is a high-performance, real-time collaborative coding platform designed for technical pair programming, live engineering interviews, and interactive peer learning.
            </p>

            <div className="features-grid">
              <div className="feature-item">
                <div className="feature-icon">🚀</div>
                <div>
                  <h4>Instant Socket Sync</h4>
                  <p>Zero-latency code synchronization across all connected clients in a room.</p>
                </div>
              </div>

              <div className="feature-item">
                <div className="feature-icon">📝</div>
                <div>
                  <h4>CodeMirror 5 Engine</h4>
                  <p>Syntax highlighting for JavaScript, Python, Java, C, and C++ with auto-brackets.</p>
                </div>
              </div>

              <div className="feature-item">
                <div className="feature-icon">⚡</div>
                <div>
                  <h4>Live Code Compilation</h4>
                  <p>Execute code directly in the browser via backend JDoodle compiler integration.</p>
                </div>
              </div>

              <div className="feature-item">
                <div className="feature-icon">👥</div>
                <div>
                  <h4>User Presence & Avatars</h4>
                  <p>Live active client list with personalized avatars and presence tracking.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
