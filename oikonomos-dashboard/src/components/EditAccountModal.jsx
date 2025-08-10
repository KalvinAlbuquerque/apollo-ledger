// src/components/EditAccountModal.jsx
import React, { useState, useEffect } from 'react';
import styles from './EditModal.module.css'; // Reutilizaremos o estilo

function EditAccountModal({ account, onSave, onCancel }) {
  const [accountName, setAccountName] = useState('');
  const [isReserve, setIsReserve] = useState(false);

  useEffect(() => {
    if (account) {
      setAccountName(account.accountName || '');
      setIsReserve(account.isReserve || false);
    }
  }, [account]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(account.id, { accountName, isReserve });
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
          <div className={styles.checkboxGroup} style={{marginTop: '15px'}}>
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