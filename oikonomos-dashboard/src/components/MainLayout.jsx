// src/components/MainLayout.jsx
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import styles from './MainLayout.module.css';

function MainLayout({ children }) {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(!isSidebarCollapsed);
  };

  return (
    <div className={styles.layout}>
      {/* 1. A Sidebar agora só precisa saber se está fechada ou não */}
      <Sidebar isCollapsed={isSidebarCollapsed} />

      {/* 2. O BOTÃO AGORA MORA AQUI, fora da Sidebar */}
      <button 
        onClick={toggleSidebar} 
        className={`${styles.sidebarToggleButton} ${isSidebarCollapsed ? styles.buttonCollapsed : ''}`}
      >
        {isSidebarCollapsed ? '>' : '<'}
      </button>

      <main className={`${styles.content} ${isSidebarCollapsed ? styles.contentCollapsed : ''}`}>
        {children}
      </main>
    </div>
  );
}

export default MainLayout;