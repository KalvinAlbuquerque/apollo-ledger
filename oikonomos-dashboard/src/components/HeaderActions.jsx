import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './HeaderActions.module.css';
import { exportToCSV, exportToPDF } from '../utils/exportUtils';

function HeaderActions({ transactions, summary, accounts }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Hook para fechar o dropdown ao clicar fora dele
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
    setIsOpen(false); // Fecha o menu após a ação
  };

  const handleExportPDF = () => {
    exportToPDF(transactions, summary, accounts);
    setIsOpen(false); // Fecha o menu após a ação
  };


  return (
    <div className={styles.actionsContainer} ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} className={styles.menuButton}>
        Opções ☰
      </button>
      {isOpen && (
        <div className={styles.dropdownMenu}>
          {/* ADICIONE O LINK PARA A NOVA PÁGINA AQUI */}
          <Link to="/management" className={styles.dropdownItem}>Gerenciamento</Link>
          <hr style={{ border: 'none', borderTop: '1px solid var(--borda-sutil)', margin: '4px 0' }} />
          <Link to="/reports" className={styles.dropdownItem}>Ver Relatórios</Link>
          <Link to="/forecast" className={styles.dropdownItem}>Previsões</Link>
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