// src/components/EditAccountModal.jsx
import React, { useState, useEffect } from 'react';
import styles from './EditModal.module.css';

function EditAccountModal({ account, onSave, onCancel }) {
  const [accountName, setAccountName] = useState('');
  const [isReserve, setIsReserve] = useState(false);
  const [balance, setBalance] = useState('');

  useEffect(() => {
    if (account) {
      setAccountName(account.accountName || '');
      setIsReserve(account.isReserve || false);
      setBalance(account.balance != null ? String(account.balance) : '0');
    }
  }, [account]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedBalance = parseFloat(balance);
    onSave(account.id, {
      accountName,
      isReserve,
      balance: isNaN(parsedBalance) ? account.balance : parsedBalance,
    });
  };

  if (!account) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Editar Conta</h2>
        <form onSubmit={handleSubmit}>
          <label>Nome da Conta:</label>
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            required
          />
          <label>Saldo atual (R$):</label>
          <input
            type="number"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            step="0.01"
          />
          <small style={{ color: '#888', fontSize: '11px', marginTop: '-8px', display: 'block' }}>
            Ajuste manual — use apenas para corrigir inconsistências de saldo.
          </small>
          <div className={styles.checkboxGroup} style={{ marginTop: '15px' }}>
            <input
              type="checkbox"
              id="editIsReserve"
              checked={isReserve}
              onChange={(e) => setIsReserve(e.target.checked)}
            />
            <label htmlFor="editIsReserve">É uma reserva?</label>
          </div>
          <div className={styles.buttonGroup}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>Cancelar</button>
            <button type="submit" className={styles.saveButton}>Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditAccountModal;
