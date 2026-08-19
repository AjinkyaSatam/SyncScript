import React, { useState, useEffect, createContext } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Home from './pages/Home';
import EditorPage from './pages/EditorPage';
import './App.css';

export const AppThemeContext = createContext();

function App() {
  const [appTheme, setAppTheme] = useState(() => localStorage.getItem('syncscript_appTheme') || 'dark');

  useEffect(() => {
    if (appTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('syncscript_appTheme', appTheme);
  }, [appTheme]);

  const toggleTheme = () => {
    setAppTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <AppThemeContext.Provider value={{ appTheme, toggleTheme }}>
      <div>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#0f172a',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#0f172a',
              },
            },
          }}
        />
      </div>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/editor/:roomId" element={<EditorPage />} />
        </Routes>
      </Router>
    </AppThemeContext.Provider>
  );
}

export default App;
