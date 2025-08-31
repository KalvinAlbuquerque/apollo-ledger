// src/components/HeaderActions.jsx (VERSÃO CORRIGIDA E REUTILIZÁVEL)
import React, { useState, useEffect, useRef } from 'react';
import styles from './HeaderActions.module.css';
import { exportToCSV, exportToPDF } from '../utils/exportUtils';

function HeaderActions({ transactions, summary, accounts }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const handleExportCSV = () => {
    exportToCSV(transactions, summary, accounts);
    setIsOpen(false);
  };

  const handleExportPDF = () => {
    exportToPDF(transactions, summary, accounts);
    setIsOpen(false);
  };

  return (
    <div className={styles.actionsContainer} ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} className={styles.menuButton}>
        Opções ☰
      </button>
      {isOpen && (
        <div className={styles.dropdownMenu}>
          <button onClick={handleExportCSV} className={styles.dropdownItem}>
            Exportar CSV
          </button>
          <button onClick={handleExportPDF} className={styles.dropdownItem}>
            Exportar PDF
          </button>
        </div>
      )}
    </div>
  );
}

export default HeaderActions;