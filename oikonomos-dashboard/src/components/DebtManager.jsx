import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, updateDoc, doc, Timestamp, writeBatch, increment } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
import styles from './DebtManager.module.css';
import EditDebtModal from './EditDebtModal';
import SelectAccountModal from './SelectAccountModal';

function DebtManager({ expenseCategories, accounts, onDataChanged }) {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  // Estados para o formulário de nova conta
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  // Estados para os modais
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [isSelectAccountModalOpen, setSelectAccountModalOpen] = useState(false);
  const [debtToPay, setDebtToPay] = useState(null);

  const user = auth.currentUser;

  // Função para buscar as contas agendadas do Firestore
  const fetchDebts = async () => {
    if (!user) return;
    setLoading(true);
    let q = query(
      collection(db, "scheduled_transactions"),
      where("userId", "==", user.uid),
      orderBy("dueDate", "asc")
    );

    if (filter !== 'all') {
        q = query(q, where("status", "==", filter));
    }

    const querySnapshot = await getDocs(q);
    setDebts(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setLoading(false);
  };

  useEffect(() => {
    fetchDebts();
  }, [user, filter]);

  // Define uma categoria padrão no formulário
  useEffect(() => {
    if (expenseCategories.length > 0 && !newCategory) {
      setNewCategory(expenseCategories[0].name);
    }
  }, [expenseCategories]);

  // --- FUNÇÕES DE AÇÃO ---

  const handleAddDebt = async (e) => {
    e.preventDefault();
    if (!newDesc || !newAmount || !newCategory || !newDueDate || !user) return;

    const addPromise = new Promise(async (resolve, reject) => {
      try {
        const correctedDate = new Date(`${newDueDate}T12:00:00Z`);
        await addDoc(collection(db, "scheduled_transactions"), {
          userId: user.uid,
          description: newDesc,
          amount: parseFloat(newAmount),
          categoryName: newCategory,
          dueDate: Timestamp.fromDate(correctedDate),
          status: 'pending',
          isRecurring: isRecurring,
        });
        
        setNewDesc('');
        setNewAmount('');
        setNewDueDate('');
        setIsRecurring(false);
        await fetchDebts();
        if (onDataChanged) onDataChanged();
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    toast.promise(addPromise, {
        loading: 'A adicionar conta...',
        success: 'Nova conta agendada adicionada!',
        error: 'Falha ao adicionar conta.',
    });
  };
  
  const handleMarkAsPaid = (selectedAccountId) => {
    if (!debtToPay || !user) return;
    
    const sourceAccount = accounts.find(acc => acc.id === selectedAccountId);
    if (sourceAccount && sourceAccount.balance < debtToPay.amount) {
        toast.error(`Saldo insuficiente na conta '${sourceAccount.accountName}'.`);
        handleClosePayModal();
        return;
    }

    const payAction = async () => {
        const batch = writeBatch(db);
        const newTransactionRef = doc(collection(db, "transactions"));
        batch.set(newTransactionRef, {
            userId: user.uid, amount: debtToPay.amount, category: debtToPay.categoryName,
            description: `Pagamento de: ${debtToPay.description}`, createdAt: Timestamp.now(), type: 'expense',
            accountId: selectedAccountId,
        });
        const debtDocRef = doc(db, "scheduled_transactions", debtToPay.id);
        batch.update(debtDocRef, { status: 'paid' });
        
        const accountDocRef = doc(db, "accounts", selectedAccountId);
        batch.update(accountDocRef, { balance: increment(-debtToPay.amount) });

        await batch.commit();
        if (onDataChanged) onDataChanged();
        toast.success(`'${debtToPay.description}' foi paga e registada!`);
    };
    
    showConfirmationToast(payAction, `Confirmar pagamento de ${debtToPay.description}?`);
    handleClosePayModal();
  };

  const handleDeleteDebt = (debtId) => {
    const deleteAction = async () => {
        try {
            await deleteDoc(doc(db, "scheduled_transactions", debtId));
            await fetchDebts();
            if (onDataChanged) onDataChanged();
            toast.success("Conta agendada excluída!");
        } catch (error) {
            toast.error("Falha ao excluir a conta.");
        }
    };
    showConfirmationToast(deleteAction, "Apagar esta conta agendada?");
  };

  const handleOpenEditModal = (debt) => {
    setEditingDebt(debt);
    setIsEditModalOpen(true);
  };
  const handleCloseEditModal = () => {
    setEditingDebt(null);
    setIsEditModalOpen(false);
  };
  const handleUpdateDebt = async (debtId, updatedData) => {
    try {
        const debtDocRef = doc(db, "scheduled_transactions", debtId);
        await updateDoc(debtDocRef, updatedData);
        toast.success("Conta atualizada!");
        handleCloseEditModal();
        await fetchDebts();
    } catch(error) {
        toast.error("Falha ao atualizar a conta.");
    }
  };

  const handleOpenPayModal = (debt) => {
    setDebtToPay(debt);
    setSelectAccountModalOpen(true);
  };
  const handleClosePayModal = () => {
    setDebtToPay(null);
    setSelectAccountModalOpen(false);
  };
  
  if (loading) return <p>A carregar contas a pagar...</p>;

  return (
    <>
      <div className={styles.container}>
        <h2>Contas a Pagar & Dívidas</h2>
        <form onSubmit={handleAddDebt} className={styles.form}>
          <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descrição (ex: Aluguel)" required />
          <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="Valor" required />
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)} required>
            {expenseCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
          </select>
          <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} required />
          <div className={styles.recurringCheckbox}>
            <input type="checkbox" id="recurring" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
            <label htmlFor="recurring">Repetir mensalmente</label>
          </div>
          <button type="submit" className={styles.addButton}>Adicionar</button>
        </form>

        <div className={styles.filterTabs}>
            <button onClick={() => setFilter('pending')} className={`${styles.filterTab} ${filter === 'pending' ? styles.activeTab : ''}`}>Pendentes</button>
            <button onClick={() => setFilter('paid')} className={`${styles.filterTab} ${filter === 'paid' ? styles.activeTab : ''}`}>Pagas</button>
            <button onClick={() => setFilter('all')} className={`${styles.filterTab} ${filter === 'all' ? styles.activeTab : ''}`}>Todas</button>
        </div>

        <ul className={styles.debtList}>
          {debts.map(debt => (
            <li key={debt.id} className={styles.debtItem}>
              <span className={styles.debtDescription}>{debt.description}</span>
              <span className={styles.debtDate}>Vence: {debt.dueDate.toDate().toLocaleDateString('pt-BR')}</span>
              <span className={styles.debtAmount}>R$ {debt.amount.toFixed(2)}</span>
              <div className={styles.actionButtons}>
                <button type="button" onClick={() => handleOpenEditModal(debt)} className={styles.editButton}>Editar</button>
                {debt.status === 'pending' && (
                    <button onClick={() => handleOpenPayModal(debt)} className={styles.paidButton}>Paga</button>
                )}
                <button onClick={() => handleDeleteDebt(debt.id)} className={styles.deleteButton}>Excluir</button>
              </div>
            </li>
          ))}
        </ul>
        {debts.length === 0 && <p>Nenhuma conta encontrada para este filtro.</p>}
      </div>
      
      {isEditModalOpen && (
        <EditDebtModal
            debt={editingDebt}
            onSave={handleUpdateDebt}
            onCancel={handleCloseEditModal}
            expenseCategories={expenseCategories}
        />
      )}
      {isSelectAccountModalOpen && (
        <SelectAccountModal 
            title={`Pagar '${debtToPay.description}' a partir de:`}
            accounts={accounts}
            onConfirm={handleMarkAsPaid}
            onCancel={handleClosePayModal}
        />
      )}
    </>
  );
}

export default DebtManager;