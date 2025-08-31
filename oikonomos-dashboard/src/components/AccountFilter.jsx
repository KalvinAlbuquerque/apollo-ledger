// src/components/AccountFilter.jsx
import React, { useState, useEffect, useRef } from 'react';
import styles from './AccountFilter.module.css';

function AccountFilter({ accounts, currentSelection, onSelectionChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (accountId) => {
    onSelectionChange(accountId);
    setIsOpen(false);
  };

  const getSelectionName = () => {
    if (currentSelection === 'geral') return 'Visão Geral (sem Reservas)';
    if (currentSelection === 'total') return 'Patrimônio Total';
    const selectedAccount = accounts.find(acc => acc.id === currentSelection);
    return selectedAccount ? selectedAccount.accountName : 'Selecione uma conta';
  };

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} className={styles.button}>
        {getSelectionName()}
        <span className={`${styles.arrow} ${isOpen ? styles.open : ''}`}>▼</span>
      </button>
      {isOpen && (
        <div className={styles.dropdownMenu}>
          <div className={styles.dropdownItem} onClick={() => handleSelect('geral')}>Visão Geral (sem Reservas)</div>
          <div className={styles.dropdownItem} onClick={() => handleSelect('total')}>Patrimônio Total</div>
          <div className={styles.separator}>Contas Individuais</div>
          {accounts.map(acc => (
            <div key={acc.id} className={styles.dropdownItem} onClick={() => handleSelect(acc.id)}>
              {acc.accountName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AccountFilter;