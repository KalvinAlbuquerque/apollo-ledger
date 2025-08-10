import React, { useState } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import styles from './AccountManager.module.css';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function AccountManager({ onDataChanged, accounts = [] }) { // <<< Recebe 'accounts' como prop
  const [newAccountName, setNewAccountName] = useState('');
  const [isReserve, setIsReserve] = useState(false);
  const user = auth.currentUser;

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!newAccountName.trim() || !user) return;
    try {
      await addDoc(collection(db, "accounts"), {
        userId: user.uid,
        accountName: newAccountName,
        balance: 0,
        isReserve: isReserve,
        createdAt: Timestamp.now(),
      });
      toast.success(`Conta '${newAccountName}' criada com sucesso!`);
      setNewAccountName('');
      setIsReserve(false);
      if (onDataChanged) onDataChanged();
    } catch (error) {
      toast.error("Falha ao criar a conta.");
      console.error("Erro ao adicionar conta:", error);
    }
  };

  return (
    <div className={styles.container}>
      <h2>Contas & Reservas</h2>
      <form onSubmit={handleAddAccount} className={styles.form}>
        <input
          type="text"
          value={newAccountName}
          onChange={(e) => setNewAccountName(e.target.value)}
          placeholder="Nome da nova conta (ex: Fundo de Emergência)"
          required
        />
        <div className={styles.checkboxGroup}>
          <input
            type="checkbox"
            id="isReserve"
            checked={isReserve}
            onChange={(e) => setIsReserve(e.target.checked)}
          />
          <label htmlFor="isReserve">É uma reserva?</label>
        </div>
        <button type="submit">Criar Conta</button>
      </form>

      <div className={styles.accountList}>
        {accounts.map(acc => (
          <div key={acc.id} className={styles.accountItem}>
            <div className={styles.accountHeader}>
              <p className={styles.accountName}>{acc.accountName}</p>
              {acc.isReserve && <span className={styles.reserveTag}>Reserva</span>}
            </div>
            <p className={styles.accountBalance}>{formatCurrency(acc.balance)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AccountManager;