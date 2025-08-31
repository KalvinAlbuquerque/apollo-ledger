// src/components/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';
import { auth } from '../../firebaseClient';

function Sidebar() {
    const handleLogout = () => auth.signOut();

    return (
        <nav className={styles.sidebar}>
            <div className={styles.logo}>
                <img src="/LogoApollo.png" alt="Apollo Logo" />
                <h1>Apollo Ledger</h1>
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
                {/* ADICIONE O NOVO LINK AQUI */}
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
                <button onClick={handleLogout} className={styles.logoutButton}>
                    Sair
                </button>
            </div>
        </nav>
    );
}

export default Sidebar;