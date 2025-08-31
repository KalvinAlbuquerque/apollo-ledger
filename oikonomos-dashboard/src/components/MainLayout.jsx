// src/components/MainLayout.jsx
import React from 'react';
import Sidebar from './Sidebar';
import styles from './MainLayout.module.css';

function MainLayout({ children }) {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.content}>
        {children}
      </main>
    </div>
  );
}

export default MainLayout;