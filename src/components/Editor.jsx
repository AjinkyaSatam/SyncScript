import React, { useEffect, useRef } from 'react';
import CodeMirror from 'codemirror';

import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/theme/monokai.css';
import 'codemirror/theme/eclipse.css';
import 'codemirror/theme/material.css';
import 'codemirror/theme/github.css';

// Language modes
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/python/python';
import 'codemirror/mode/clike/clike';

// Addons
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/edit/closetag';

const getCodeMirrorMode = (lang) => {
  switch (lang) {
    case 'javascript':
      return 'javascript';
    case 'python':
      return 'python';
    case 'java':
      return 'text/x-java';
    case 'c':
      return 'text/x-csrc';
    case 'cpp':
      return 'text/x-c++src';
    default:
      return 'javascript';
  }
};

const Editor = ({ socketRef, socket, roomId, onCodeChange, language, writeAccess, theme = 'dracula' }) => {
  const editorRef = useRef(null);
  const textareaRef = useRef(null);

  // Initialize CodeMirror editor instance
  useEffect(() => {
    async function initEditor() {
      if (!textareaRef.current) return;

      editorRef.current = CodeMirror.fromTextArea(textareaRef.current, {
        mode: getCodeMirrorMode(language),
        theme: theme,
        autoCloseBrackets: true,
        autoCloseTags: true,
        lineNumbers: true,
        lineWrapping: true,
        indentUnit: 4,
        tabSize: 4,
        readOnly: !writeAccess, // Initialize readOnly status
      });

      // Track typing changes and emit socket event
      editorRef.current.on('change', (instance, changes) => {
        const { origin } = changes;
        const code = instance.getValue();
        onCodeChange(code);

        const currentSocket = socket || socketRef?.current;
        if (origin !== 'setValue' && currentSocket) {
          currentSocket.emit('code-change', {
            roomId,
            code,
          });
        }
      });

      // Track cursor position movement and emit to room
      editorRef.current.on('cursorActivity', (instance) => {
        const cursor = instance.getCursor();
        const currentSocket = socket || socketRef?.current;
        if (currentSocket) {
          currentSocket.emit('cursor-position', {
            roomId,
            cursor: { line: cursor.line, ch: cursor.ch },
          });
        }
      });
    }

    initEditor();

    return () => {
      if (editorRef.current) {
        editorRef.current.toTextArea();
      }
    };
  }, []);

  // Update readOnly status dynamically when writeAccess changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setOption('readOnly', !writeAccess);
    }
  }, [writeAccess]);

  // Update language mode dynamically when language prop changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setOption('mode', getCodeMirrorMode(language));
    }
  }, [language]);

  // Update theme dynamically when theme prop changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setOption('theme', theme);
    }
  }, [theme]);

  const remoteCursorsRef = useRef({});

  // Listen to real-time incoming code changes and remote cursor movements from socket
  useEffect(() => {
    const activeSocket = socket || socketRef?.current;

    if (activeSocket) {
      const handleCodeChange = ({ code }) => {
        if (code !== null && editorRef.current) {
          const currentCode = editorRef.current.getValue();
          if (currentCode !== code) {
            editorRef.current.setValue(code);
          }
        }
      };

      const handleCursorPosition = ({ socketId, username, color, cursor }) => {
        if (!editorRef.current || !cursor || socketId === activeSocket.id) return;

        // Clear existing bookmark for this user
        if (remoteCursorsRef.current[socketId]) {
          remoteCursorsRef.current[socketId].clear();
        }

        // Create remote cursor element
        const cursorEl = document.createElement('span');
        cursorEl.className = 'remote-cursor-widget';
        cursorEl.style.borderLeftColor = color || '#FF5733';

        const labelEl = document.createElement('span');
        labelEl.className = 'remote-cursor-badge';
        labelEl.style.backgroundColor = color || '#FF5733';
        labelEl.innerText = username || 'User';

        cursorEl.appendChild(labelEl);

        try {
          const bookmark = editorRef.current.setBookmark(
            { line: cursor.line, ch: cursor.ch },
            { widget: cursorEl, insertLeft: true }
          );
          remoteCursorsRef.current[socketId] = bookmark;
        } catch (e) {
          console.error('[Remote Cursor Error]', e);
        }
      };

      activeSocket.on('code-change', handleCodeChange);
      activeSocket.on('cursor-position', handleCursorPosition);

      return () => {
        activeSocket.off('code-change', handleCodeChange);
        activeSocket.off('cursor-position', handleCursorPosition);

        // Clear all remote cursors on unmount
        Object.values(remoteCursorsRef.current).forEach((bm) => bm && bm.clear());
        remoteCursorsRef.current = {};
      };
    }
  }, [socket]);

  return (
    <div className="editor-container">
      <textarea ref={textareaRef} id="realtimeEditor"></textarea>
    </div>
  );
};

export default Editor;
