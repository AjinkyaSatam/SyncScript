# ⚡ SyncScript - Real-Time Collaborative Code Editor

**SyncScript** is a modern, real-time collaborative code editor web application built with **React**, **CodeMirror 5**, **Socket.io**, and **Node.js/Express**. It enables multiple developers to join a shared room via Room ID, edit code synchronously across multiple programming languages, view active connected users with avatars, and compile & run code in real-time.

---

## 🌟 Key Features

- **⚡ Zero-Latency Synchronization**: Powered by Socket.io for instant real-time code updates and presence tracking.
- **📝 CodeMirror 5 Editor Integration**: Syntax highlighting for **JavaScript**, **Python 3**, **Java**, **C**, and **C++** with auto-closing brackets, line numbering, and dark mode theme.
- **🌐 Shared Language Selector**: Changing the editor language updates the syntax highlighting mode synchronously for all users in the room.
- **💻 Live Code Compilation**: Executes code directly from the browser via backend integration with the **JDoodle API** (with built-in code runner engine).
- **👥 Active User Presence & Avatars**: Dynamic vertical sidebar displaying active room participants using initials-based avatars (`react-avatar`), presence indicators, and self-identification tags.
- **🎨 Pure CSS Styling & Branding**: Built entirely with Vanilla CSS (No Tailwind, no external image assets). Features sleek dark HSL gradients, glassmorphism, and responsive split-screen layouts.
- **📋 One-Click Room Sharing**: Generate Room IDs with `uuid` and copy invite links to clipboard instantly with `react-hot-toast` notifications.

---

## 🛠️ Technology Stack

- **Frontend**: React (React Router v6, React-Hot-Toast, React-Avatar)
- **Code Editor**: CodeMirror 5 (with JS, Python, Java, C, C++ modes)
- **Real-Time WebSockets**: Socket.io (server) & Socket.io-Client (frontend)
- **Backend & Compiler**: Node.js, Express, Axios, JDoodle Compiler API
- **Styling**: Vanilla CSS (CSS Design System with custom scrollbars)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/AjinkyaSatam/SyncScript.git
   cd SyncScript
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. (Optional) Configure environment variables:
   Create a `.env` file in the root directory based on `.env.example`:
   ```env
   PORT=5000
   JDOODLE_CLIENT_ID=your_jdoodle_client_id
   JDOODLE_CLIENT_SECRET=your_jdoodle_client_secret
   ```

---

## 🏃 Running the Application

### Option A: Development Mode (Hot Reloading)
Runs both the backend Node.js server and Vite React frontend server concurrently:
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### Option B: Production Server Mode (Unified Port 5000)
Builds the production assets and runs the unified Express server:
```bash
npm run build
npm start
```
Open **`http://localhost:5000`** in your browser.

---

## 📌 Project Background & Acknowledgements

> **Note**: This application was originally developed as a college mini-project. It has been modernized, polished, and published on GitHub to share with the open-source developer community.
> 
> **Acknowledgements**: This project is inspired by the work and educational content of **Rakesh (aka CodersGyan)**. Special thanks to CodersGyan for inspiring the architectural foundation and real-time collaboration workflow of this project.

---


