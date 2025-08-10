import React, { useState } from 'react';
import styles from './EditModal.module.css';

// <<< 1. A FUNÇÃO AGORA ACEITA 'children' COMO PROP
function SelectAccountModal({ accounts, onConfirm, onCancel, title, children }) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts?.[0]?.id || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedAccountId) {
      toast.error("Por favor, selecione uma conta.");
      return;
    }
    // Passa o ID da conta e o formulário inteiro para a função onConfirm
    onConfirm(selectedAccountId, e.target);
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>{title}</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="account">Conta de Origem:</label>
          <select
            id="account"
            name="accountId" // Damos um nome para o formulário
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            required
          >
            {accounts?.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.accountName} ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.balance)})
              </option>
            ))}
          </select>

          {/* <<< 2. RENDERIZA QUALQUER CAMPO EXTRA QUE FOR ENVIADO */}
          {children}

          <div className={styles.buttonGroup}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>Cancelar</button>
            <button type="submit" className={styles.saveButton}>Confirmar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SelectAccountModal;