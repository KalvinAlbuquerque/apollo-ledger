// src/components/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';
import { auth } from '../../firebaseClient';

// Recebe as propriedades isCollapsed e toggleSidebar do MainLayout
function Sidebar({ isCollapsed }) {
    const handleLogout = () => auth.signOut();

    return (
        // Aplica a classe 'collapsed' condicionalmente
        <nav className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
            
            <div className={styles.logo}>
                <h1>{isCollapsed ? 'AL' : 'Apollo Ledger'}</h1>
            </div>
            
            <ul className={styles.navList}>
                <li>
                    <NavLink to="/dashboard" className={({ isActive }) => isActive ? styles.active : ''}>
                        <span>Dashboard</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/management" className={({ isActive }) => isActive ? styles.active : ''}>
                        <span>Gerenciamento</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/reports" className={({ isActive }) => isActive ? styles.active : ''}>
                        <span>Relatórios</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/forecast" className={({ isActive }) => isActive ? styles.active : ''}>
                        <span>Previsões</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/my-account" className={({ isActive }) => isActive ? styles.active : ''}>
                        <span>Minha Conta</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/help" className={({ isActive }) => isActive ? styles.active : ''}>
                        <span>Ajuda</span>
                    </NavLink>
                </li>
            </ul>
            <div className={styles.footer}>
                <img src="/Logo_arpa_cores_fortes.png" alt="Apollo Logo" className={styles.footerLogo} />
                <button onClick={handleLogout} className={styles.logoutButton}>
                    <span>Sair</span>
                </button>
            </div>
        </nav>
    );
}

export default Sidebar;