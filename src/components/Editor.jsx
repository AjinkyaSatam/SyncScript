import React, { useEffect, useRef } from 'react';
import CodeMirror from 'codemirror';

import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';

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

const Editor = ({ socketRef, roomId, onCodeChange, language }) => {
  const editorRef = useRef(null);
  const textareaRef = useRef(null);

  // Initialize CodeMirror editor instance
  useEffect(() => {
    async function initEditor() {
      if (!textareaRef.current) return;

      editorRef.current = CodeMirror.fromTextArea(textareaRef.current, {
        mode: getCodeMirrorMode(language),
        theme: 'dracula',
        autoCloseBrackets: true,
        autoCloseTags: true,
        lineNumbers: true,
        lineWrapping: true,
        indentUnit: 4,
        tabSize: 4,
      });

      // Track typing changes and emit socket event
      editorRef.current.on('change', (instance, changes) => {
        const { origin } = changes;
        const code = instance.getValue();
        onCodeChange(code);

        if (origin !== 'setValue' && socketRef.current) {
          socketRef.current.emit('code-change', {
            roomId,
            code,
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

  // Update language mode dynamically when language prop changes
  useEffect(() => {
    if (editorRef.current) {
      const mode = getCodeMirrorMode(language);
      editorRef.current.setOption('mode', mode);
    }
  }, [language]);

  // Listen to real-time incoming code changes from socket
  useEffect(() => {
    if (socketRef.current) {
      const socket = socketRef.current;

      const handleCodeChange = ({ code }) => {
        if (code !== null && editorRef.current) {
          const currentCode = editorRef.current.getValue();
          if (currentCode !== code) {
            editorRef.current.setValue(code);
          }
        }
      };

      socket.on('code-change', handleCodeChange);

      return () => {
        socket.off('code-change', handleCodeChange);
      };
    }
  }, [socketRef.current]);

  return (
    <div className="editor-container">
      <textarea ref={textareaRef} id="realtimeEditor"></textarea>
    </div>
  );
};

export default Editor;
