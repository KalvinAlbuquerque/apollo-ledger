import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
import styles from './DebtManager.module.css';
import EditDebtModal from './EditDebtModal';

function DebtManager({ expenseCategories, onDataChanged }) { // Recebe onDataChanged
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  // Estados para o formulário
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);

  const user = auth.currentUser;

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

  useEffect(() => {
    if (expenseCategories.length > 0 && !newCategory) {
      setNewCategory(expenseCategories[0].name);
    }
  }, [expenseCategories]);

  // --- FUNÇÃO handleAddDebt CORRIGIDA ---
  const handleAddDebt = async (e) => {
    e.preventDefault();
    if (!newDesc || !newAmount || !newCategory || !newDueDate || !user) return;

    const addPromise = new Promise(async (resolve, reject) => {
      try {
        await addDoc(collection(db, "scheduled_transactions"), {
          userId: user.uid,
          description: newDesc,
          amount: parseFloat(newAmount),
          categoryName: newCategory,
          dueDate: Timestamp.fromDate(new Date(newDueDate)),
          status: 'pending',
          isRecurring: isRecurring,
        });
        
        // Limpa o formulário
        setNewDesc('');
        setNewAmount('');
        setNewDueDate('');
        setIsRecurring(false);
        
        await fetchDebts(); // Re-busca as dívidas deste componente
        
        if (onDataChanged) {
            onDataChanged(); // Notifica o Dashboard para atualizar tudo
        }
        resolve(); // Resolve a promessa com sucesso
      } catch (error) {
        console.error("Erro ao adicionar dívida:", error);
        reject(error); // Rejeita a promessa em caso de erro
      }
    });

    toast.promise(addPromise, {
        loading: 'Adicionando conta...',
        success: 'Nova conta agendada adicionada!',
        error: 'Falha ao adicionar conta.',
    });
  };
  // ------------------------------------

  const handleMarkAsPaid = (debt) => {
    const payAction = async () => {
        try {
            await addDoc(collection(db, "transactions"), {
                userId: user.uid, amount: debt.amount, category: debt.categoryName,
                description: `Pagamento de: ${debt.description}`, createdAt: Timestamp.now(), type: 'expense',
            });
            const debtDocRef = doc(db, "scheduled_transactions", debt.id);
            await updateDoc(debtDocRef, { status: 'paid' });
            
            await fetchDebts();
            if (onDataChanged) { onDataChanged(); }
            
            toast.success(`'${debt.description}' foi paga e registrada!`);
        } catch (error) {
            toast.error("Ocorreu um erro ao registrar o pagamento.");
        }
    };
    showConfirmationToast(payAction, `Confirmar pagamento de ${debt.description}?`);
  };

  const handleDeleteDebt = (debtId) => {
    const deleteAction = async () => {
        try {
            await deleteDoc(doc(db, "scheduled_transactions", debtId));
            await fetchDebts();
            if (onDataChanged) { onDataChanged(); }
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
        if (onDataChanged) { onDataChanged(); }
    } catch(error) {
        toast.error("Falha ao atualizar a conta.");
    }
  };

  if (loading) return <p>Carregando contas...</p>;
    return (
    <>
      <div className={styles.container}>
        <h2>Contas a Pagar & Dívidas</h2>

        {/* --- FORMULÁRIO QUE ESTAVA FALTANDO --- */}
        <form onSubmit={handleAddDebt} className={styles.form}>
          <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descrição (ex: Aluguel)" required />
          <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="Valor" required />
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)} required>
            {expenseCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
          </select>
          <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} required />
          <div className={styles.recurringCheckbox}>
            <input 
              type="checkbox" 
              id="recurring" 
              checked={isRecurring} 
              onChange={e => setIsRecurring(e.target.checked)} 
            />
            <label htmlFor="recurring">Repetir mensalmente</label>
          </div>
          <button type="submit" className={styles.addButton}>Adicionar</button>
        </form>
        {/* --- FIM DO FORMULÁRIO --- */}

        <div className={styles.filterTabs}>
            <button 
                onClick={() => setFilter('pending')} 
                className={`${styles.filterTab} ${filter === 'pending' ? styles.activeTab : ''}`}
            >
                Pendentes
            </button>
            <button 
                onClick={() => setFilter('paid')} 
                className={`${styles.filterTab} ${filter === 'paid' ? styles.activeTab : ''}`}
            >
                Pagas
            </button>
            <button 
                onClick={() => setFilter('all')} 
                className={`${styles.filterTab} ${filter === 'all' ? styles.activeTab : ''}`}
            >
                Todas
            </button>
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
                    <button onClick={() => handleMarkAsPaid(debt)} className={styles.paidButton}>Pagar</button>
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
    </>
  );
}
export default DebtManager;