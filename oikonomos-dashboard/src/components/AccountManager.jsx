import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
import styles from './AccountManager.module.css';
import EditAccountModal from './EditAccountModal';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function AccountManager({ onDataChanged, accounts = [] }) {
  const [newAccountName, setNewAccountName] = useState('');
  const [isReserve, setIsReserve] = useState(false);
  const user = auth.currentUser;

  // Estados para o modal de edição
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  // --- NOVOS ESTADOS PARA FILTRO E PESQUISA ---
  const [filter, setFilter] = useState('all'); // 'all', 'reserve', 'standard'
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

  // Funções para o modal de edição
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
      toast.success("Conta atualizada com sucesso!");
      handleCloseEditModal();
      if (onDataChanged) onDataChanged();
    } catch (error)
    {
      toast.error("Falha ao atualizar a conta.");
      console.error("Erro ao atualizar conta:", error);
    }
  };

  const handleDeleteAccount = (account) => {
    if (account.balance !== 0) {
      toast.error("Não é possível excluir uma conta com saldo. Por favor, transfira os valores antes de excluir.");
      return;
    }
    const deleteAction = async () => {
      try {
        await deleteDoc(doc(db, "accounts", account.id));
        toast.success(`Conta '${account.accountName}' excluída!`);
        if (onDataChanged) onDataChanged();
      } catch (error) {
        toast.error("Falha ao excluir a conta.");
        console.error("Erro ao excluir conta:", error);
      }
    };
    showConfirmationToast(deleteAction, `Excluir a conta '${account.accountName}'?`);
  };

  // --- LÓGICA DE FILTRAGEM ---
  const filteredAccounts = useMemo(() => {
    return accounts
      .filter(acc => {
        if (filter === 'all') return true;
        return filter === 'reserve' ? acc.isReserve : !acc.isReserve;
      })
      .filter(acc => 
        acc.accountName.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [accounts, filter, searchTerm]);

  return (
    <>
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

        {/* --- BARRA DE FILTRO E PESQUISA --- */}
        <div className={styles.filterBar}>
          <input 
            type="text"
            placeholder="Pesquisar conta..."
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className={styles.filterTabs}>
            <button onClick={() => setFilter('all')} className={`${styles.filterButton} ${filter === 'all' ? styles.activeFilter : ''}`}>Todas</button>
            <button onClick={() => setFilter('standard')} className={`${styles.filterButton} ${filter === 'standard' ? styles.activeFilter : ''}`}>Contas</button>
            <button onClick={() => setFilter('reserve')} className={`${styles.filterButton} ${filter === 'reserve' ? styles.activeFilter : ''}`}>Reservas</button>
          </div>
        </div>

        {/* --- LISTA DE CONTAS --- */}
        <div className={styles.accountList}>
          {filteredAccounts.map(acc => (
            <div key={acc.id} className={styles.accountItem}>
              <div className={styles.accountInfo}>
                <div className={styles.accountName}>
                  {acc.accountName}
                  {acc.isReserve && <span className={styles.reserveTag}>Reserva</span>}
                </div>
                <p className={styles.accountBalance}>{formatCurrency(acc.balance)}</p>
              </div>
              <div className={styles.actionButtons}>
                <button onClick={() => handleOpenEditModal(acc)} className={styles.editButton}>Editar</button>
                <button onClick={() => handleDeleteAccount(acc)} className={styles.deleteButton}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
        {filteredAccounts.length === 0 && <p>Nenhuma conta encontrada para este filtro.</p>}
      </div>

      {/* --- MODAL DE EDIÇÃO --- */}
      {isEditModalOpen && (
        <EditAccountModal
          account={editingAccount}
          onSave={handleUpdateAccount}
          onCancel={handleCloseEditModal}
        />
      )}
    </>
  );
}

export default AccountManager;