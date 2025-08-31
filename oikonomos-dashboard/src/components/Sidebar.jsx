// src/components/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';
import { auth } from '../../firebaseClient';

// Importe alguns ícones (sugestão)
// Você pode usar uma biblioteca como 'react-icons' ou usar SVGs
// Ex: import { FaTachometerAlt, FaCog, FaChartBar, FaQuestionCircle } from 'react-icons/fa';

function Sidebar() {
  const handleLogout = () => auth.signOut();

  return (
    <nav className={styles.sidebar}>
      <div className={styles.logo}>
        <img src="/tridente.png" alt="Oikonomos Logo" />
        <h1>Oikonomos</h1>
      </div>
      <ul className={styles.navList}>
        <li>
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? styles.active : ''}>
            {/* <FaTachometerAlt /> */}
            <span>Dashboard</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/management" className={({ isActive }) => isActive ? styles.active : ''}>
            {/* <FaCog /> */}
            <span>Gerenciamento</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/reports" className={({ isActive }) => isActive ? styles.active : ''}>
            {/* <FaChartBar /> */}
            <span>Relatórios</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/forecast" className={({ isActive }) => isActive ? styles.active : ''}>
            {/* <FaQuestionCircle /> */}
            <span>Previsões</span>
          </NavLink>
        </li>
         <li>
          <NavLink to="/help" className={({ isActive }) => isActive ? styles.active : ''}>
            {/* <FaQuestionCircle /> */}
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