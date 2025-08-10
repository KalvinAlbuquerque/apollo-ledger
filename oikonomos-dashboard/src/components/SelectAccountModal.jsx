import React, { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import styles from './EditModal.module.css';

function SelectAccountModal({ accounts, onConfirm, onCancel, title, children }) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts?.[0]?.id || '');
  
  // Novo estado para o checkbox de reposição
  const [createPayback, setCreatePayback] = useState(false);

  // Verifica se a conta de origem selecionada é uma reserva
  const isSourceAccountReserve = useMemo(() => {
    const sourceAccount = accounts.find(acc => acc.id === selectedAccountId);
    return sourceAccount?.isReserve || false;
  }, [selectedAccountId, accounts]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedAccountId) {
      toast.error("Por favor, selecione uma conta.");
      return;
    }
    // Agora passa o formulário E o estado do checkbox
    onConfirm(selectedAccountId, e.target, createPayback);
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>{title}</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="account">Conta de Origem:</label>
          <select
            id="account"
            name="accountId"
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

          {children}

          {/* Checkbox condicional que aparece quando a origem é uma reserva */}
          {isSourceAccountReserve && (
            <div className={styles.checkboxGroup}>
              <input 
                type="checkbox" 
                id="createPayback"
                checked={createPayback}
                onChange={(e) => setCreatePayback(e.target.checked)}
              />
              <label htmlFor="createPayback">Criar conta a pagar para repor este valor</label>
            </div>
          )}

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