import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from 'axios';

import Logo from '../components/Logo';
import Client from '../components/Client';
import Editor from '../components/Editor';
import OutputPanel from '../components/OutputPanel';
import { initSocket } from '../socket';

const DEFAULT_TEMPLATES = {
  javascript: `// Welcome to SyncScript Real-Time Code Editor!
function greet(name) {
    console.log("Hello, " + name + "!");
}

greet("Developer");
`,
  python: `# Welcome to SyncScript Real-Time Code Editor!
def greet(name):
    print(f"Hello, {name}!")

greet("Developer")
`,
  java: `// Welcome to SyncScript Real-Time Code Editor!
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Developer!");
    }
}
`,
  c: `// Welcome to SyncScript Real-Time Code Editor!
#include <stdio.h>

int main() {
    printf("Hello, Developer!\\n");
    return 0;
}
`,
  cpp: `// Welcome to SyncScript Real-Time Code Editor!
#include <iostream>

int main() {
    std::cout << "Hello, Developer!" << std::endl;
    return 0;
}
`,
};

const EditorPage = () => {
  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const location = useLocation();
  const { roomId } = useParams();
  const reactNavigator = useNavigate();

  const [socket, setSocket] = useState(null);
  const [clients, setClients] = useState([]);
  const [language, setLanguage] = useState('javascript');
  const [consoleOutput, setConsoleOutput] = useState('');
  const [consoleStats, setConsoleStats] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(true);

  // Guard: If username not provided, redirect home
  if (!location.state || !location.state.username) {
    return <Navigate to="/" />;
  }

  const username = location.state.username;

  useEffect(() => {
    const init = async () => {
      const socketInstance = await initSocket();
      socketRef.current = socketInstance;
      setSocket(socketInstance);

      const handleErrors = (e) => {
        console.error('Socket error', e);
        toast.error('Socket connection failed, try again later.');
        reactNavigator('/');
      };

      socketInstance.on('connect_error', handleErrors);
      socketInstance.on('connect_failed', handleErrors);

      // Emit Join Room event
      socketInstance.emit('join', {
        roomId,
        username,
      });

      // Listen for joined event
      socketInstance.on('joined', ({ clients, username: joinedUser, socketId }) => {
        if (joinedUser !== username) {
          toast.success(`${joinedUser} joined the room.`, {
            icon: '👤',
          });
        }
        setClients(clients);

        // Sync latest code and language to newly joined client
        if (codeRef.current) {
          socketInstance.emit('sync-code', {
            code: codeRef.current,
            socketId,
          });
        }
        socketInstance.emit('sync-language', {
          language,
          socketId,
        });
      });

      // Listen for language change sync from other users
      socketInstance.on('language-change', ({ language: newLang }) => {
        setLanguage(newLang);
      });

      // Listen for user leaving room
      socketInstance.on('disconnected', ({ socketId, username: leftUser }) => {
        toast(`${leftUser || 'A user'} left the room.`, {
          icon: '👋',
        });
        setClients((prev) => prev.filter((client) => client.socketId !== socketId));
      });
    };

    init();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current.off('joined');
        socketRef.current.off('disconnected');
        socketRef.current.off('language-change');
        socketRef.current.off('connect_error');
        socketRef.current.off('connect_failed');
      }
    };
  }, []);

  const handleLanguageChange = (e) => {
    const selectedLang = e.target.value;
    setLanguage(selectedLang);

    // Sync language selection across all connected sockets in room
    if (socketRef.current) {
      socketRef.current.emit('language-change', {
        roomId,
        language: selectedLang,
      });
    }

    // Set default code template if editor is empty or on default template
    if (!codeRef.current || Object.values(DEFAULT_TEMPLATES).includes(codeRef.current)) {
      const template = DEFAULT_TEMPLATES[selectedLang] || '';
      codeRef.current = template;
      if (socketRef.current) {
        socketRef.current.emit('code-change', {
          roomId,
          code: template,
        });
      }
    }
  };

  const copyRoomId = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(roomId);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = roomId;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast.success('Room ID copied to clipboard!');
    } catch (err) {
      toast.error('Could not copy Room ID');
    }
  };

  const leaveRoom = () => {
    reactNavigator('/');
  };

  const compileCode = async () => {
    setIsCompiling(true);
    setIsConsoleExpanded(true);
    setConsoleOutput('Compiling code...');
    setConsoleStats(null);

    const currentCode = codeRef.current || DEFAULT_TEMPLATES[language] || '';

    try {
      const res = await axios.post('/api/compile', {
        code: currentCode,
        language,
      });

      setConsoleOutput(res.data.output || 'No output returned.');
      setConsoleStats({
        statusCode: res.data.statusCode || 200,
        memory: res.data.memory,
        cpuTime: res.data.cpuTime,
      });

      if (res.data.statusCode === 200) {
        toast.success('Code executed successfully!');
      } else {
        toast.error('Execution finished with errors.');
      }
    } catch (err) {
      console.error('Compilation error', err);
      setConsoleOutput(`Error executing code:\n${err.response?.data?.error || err.message}`);
      setConsoleStats({ statusCode: 500 });
      toast.error('Compilation request failed.');
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className="editor-page-wrapper">
      {/* Left Sidebar */}
      <aside className="editor-sidebar">
        <div className="sidebar-header">
          <Logo size="normal" onClick={leaveRoom} />
          <span className="room-badge" title={`Room ID: ${roomId}`}>
            Room: {roomId.length > 8 ? `${roomId.substring(0, 8)}...` : roomId}
          </span>
        </div>

        {/* Language Selector */}
        <div className="sidebar-section">
          <label className="sidebar-label" htmlFor="languageSelect">
            <span>🌐</span> Programming Language
          </label>
          <div className="select-wrapper">
            <select
              id="languageSelect"
              className="language-dropdown"
              value={language}
              onChange={handleLanguageChange}
            >
              <option value="javascript">JavaScript (Node.js)</option>
              <option value="python">Python 3</option>
              <option value="java">Java</option>
              <option value="c">C</option>
              <option value="cpp">C++ (C++17)</option>
            </select>
          </div>
        </div>

        {/* Connected Active Users */}
        <div className="sidebar-section clients-section">
          <div className="sidebar-label">
            <span>👥</span> Connected Users ({clients.length})
          </div>
          <div className="clients-list">
            {clients.map((client) => (
              <Client
                key={client.socketId}
                username={client.username}
                socketId={client.socketId}
                isCurrent={client.username === username}
              />
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="sidebar-footer">
          <button className="btn btn-compile" onClick={compileCode} disabled={isCompiling}>
            {isCompiling ? '⏳ Compiling...' : '▶ Run Code'}
          </button>

          <div className="room-actions">
            <button className="btn btn-secondary btn-copy" onClick={copyRoomId}>
              📋 Copy Room ID
            </button>
            <button className="btn btn-danger btn-leave" onClick={leaveRoom}>
              🚪 Leave Room
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="editor-main">
        <div className="editor-header-bar">
          <div className="editor-mode-indicator">
            <span className="mode-dot"></span>
            <span>Editing in <strong>{language.toUpperCase()}</strong></span>
          </div>
          <div className="room-id-display">
            <span>ROOM: {roomId}</span>
          </div>
        </div>

        {/* CodeMirror 5 Editor */}
        <div className="editor-workspace">
          <Editor
            socketRef={socketRef}
            socket={socket}
            roomId={roomId}
            language={language}
            onCodeChange={(code) => {
              codeRef.current = code;
            }}
          />
        </div>

        {/* Bottom Console Panel */}
        <OutputPanel
          output={consoleOutput}
          isCompiling={isCompiling}
          stats={consoleStats}
          onClear={() => {
            setConsoleOutput('');
            setConsoleStats(null);
          }}
          isExpanded={isConsoleExpanded}
          onToggleExpand={() => setIsConsoleExpanded(!isConsoleExpanded)}
        />
      </main>
    </div>
  );
};

export default EditorPage;
