// Substitua o conteúdo em: src/components/AccountManager.jsx

import React, { useState, useMemo } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, getDocs, addDoc, doc, writeBatch, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
import styles from './AccountManager.module.css';
import EditAccountModal from './EditAccountModal';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function AccountManager({ onDataChanged, accounts = [] }) {
  const [newAccountName, setNewAccountName] = useState('');
  const [isReserve, setIsReserve] = useState(false);
  const user = auth.currentUser;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!newAccountName.trim() || !user) return;
    try {
      await addDoc(collection(db, "accounts"), {
        userId: user.uid,
        accountName: newAccountName,
        balance: 0,
        isReserve: isReserve,
        isDefault: false, // <-- NOVO: Contas novas nunca são padrão
        createdAt: Timestamp.now(),
      });
      toast.success(`Conta '${newAccountName}' criada com sucesso!`);
      setNewAccountName('');
      setIsReserve(false);
      if (onDataChanged) onDataChanged();
    } catch (error) {
      toast.error("Falha ao criar a conta.");
    }
  };

  // --- NOVA FUNÇÃO PARA DEFINIR A CONTA PADRÃO ---
  const handleSetDefault = async (accountToSet) => {
    if (accountToSet.isDefault) {
        toast.success("Essa já é sua conta padrão.");
        return;
    }
    
    const setDefaultPromise = new Promise(async (resolve, reject) => {
        try {
            const batch = writeBatch(db);
            
            // 1. Remove o status de padrão da conta antiga (se houver)
            const currentDefault = accounts.find(acc => acc.isDefault);
            if (currentDefault) {
                const oldDefaultRef = doc(db, "accounts", currentDefault.id);
                batch.update(oldDefaultRef, { isDefault: false });
            }

            // 2. Define a nova conta como padrão
            const newDefaultRef = doc(db, "accounts", accountToSet.id);
            batch.update(newDefaultRef, { isDefault: true });

            await batch.commit();
            if (onDataChanged) onDataChanged();
            resolve();
        } catch (error) {
            console.error("Erro ao definir conta padrão:", error);
            reject(error);
        }
    });

    toast.promise(setDefaultPromise, {
        loading: 'Definindo conta padrão...',
        success: `'${accountToSet.accountName}' agora é sua conta padrão!`,
        error: 'Falha ao definir a conta padrão.',
    });
  };

  const handleOpenEditModal = (account) => {
    setEditingAccount(account);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setEditingAccount(null);
    setIsEditModalOpen(false);
  };

  const handleUpdateAccount = async (accountId, updatedData) => {
    try {
      const accountDocRef = doc(db, "accounts", accountId);
      await updateDoc(accountDocRef, updatedData);
      toast.success("Conta atualizada!");
      handleCloseEditModal();
      if (onDataChanged) onDataChanged();
    } catch (error) {
      toast.error("Falha ao atualizar a conta.");
    }
  };

  const handleDeleteAccount = (account) => {
    if (account.balance !== 0) {
      toast.error("Não é possível excluir contas com saldo.");
      return;
    }
    const deleteAction = async () => {
      await deleteDoc(doc(db, "accounts", account.id));
      toast.success(`Conta '${account.accountName}' excluída!`);
      if (onDataChanged) onDataChanged();
    };
    showConfirmationToast(deleteAction, `Excluir a conta '${account.accountName}'?`);
  };

  const filteredAccounts = useMemo(() => {
    return accounts
      .filter(acc => filter === 'all' || (filter === 'reserve' ? acc.isReserve : !acc.isReserve))
      .filter(acc => acc.accountName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [accounts, filter, searchTerm]);

  return (
    <>
      <div className={styles.container}>
        <h2>Contas & Reservas</h2>
        <form onSubmit={handleAddAccount} className={styles.form}>
          <input type="text" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="Nome da nova conta" required />
          <div className={styles.checkboxGroup}>
            <input type="checkbox" id="isReserve" checked={isReserve} onChange={(e) => setIsReserve(e.target.checked)} />
            <label htmlFor="isReserve">É uma reserva?</label>
          </div>
          <button type="submit">Criar Conta</button>
        </form>

        <div className={styles.filterBar}>
          <input type="text" placeholder="Pesquisar conta..." className={styles.searchInput} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <div className={styles.filterTabs}>
            <button onClick={() => setFilter('all')} className={`${styles.filterButton} ${filter === 'all' ? styles.activeFilter : ''}`}>Todas</button>
            <button onClick={() => setFilter('standard')} className={`${styles.filterButton} ${filter === 'standard' ? styles.activeFilter : ''}`}>Contas</button>
            <button onClick={() => setFilter('reserve')} className={`${styles.filterButton} ${filter === 'reserve' ? styles.activeFilter : ''}`}>Reservas</button>
          </div>
        </div>

        <div className={styles.accountList}>
          {filteredAccounts.map(acc => (
            <div key={acc.id} className={styles.accountItem}>
              <div className={styles.accountInfo}>
                <div className={styles.accountName}>
                  {acc.isDefault && <span className={styles.defaultStar} title="Conta Padrão">⭐</span>}
                  {acc.accountName}
                  {acc.isReserve && <span className={styles.reserveTag}>Reserva</span>}
                </div>
                <p className={styles.accountBalance}>{formatCurrency(acc.balance)}</p>
              </div>
              <div className={styles.actionButtons}>
                <button onClick={() => handleSetDefault(acc)} className={styles.defaultButton} title="Definir como Padrão">⭐</button>
                <button onClick={() => handleOpenEditModal(acc)} className={styles.editButton}>Editar</button>
                <button onClick={() => handleDeleteAccount(acc)} className={styles.deleteButton}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
        {filteredAccounts.length === 0 && <p>Nenhuma conta encontrada para este filtro.</p>}
      </div>

      {isEditModalOpen && (
        <EditAccountModal account={editingAccount} onSave={handleUpdateAccount} onCancel={handleCloseEditModal} />
      )}
    </>
  );
}

export default AccountManager;