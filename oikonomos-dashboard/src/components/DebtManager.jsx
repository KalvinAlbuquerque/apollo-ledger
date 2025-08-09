// src/components/DebtManager.jsx
import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import styles from './DebtManager.module.css';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
function DebtManager({ expenseCategories }) {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados para o formulário de nova dívida
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
const [isRecurring, setIsRecurring] = useState(false); 
  const user = auth.currentUser;

  const fetchDebts = async () => {
    if (!user) return;
    setLoading(true);
    const q = query(
      collection(db, "scheduled_transactions"),
      where("userId", "==", user.uid),
      where("status", "==", "pending"), // Busca apenas as contas pendentes
      orderBy("dueDate", "asc") // Ordena pela mais próxima a vencer
    );
    const querySnapshot = await getDocs(q);
    setDebts(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setLoading(false);
  };

  useEffect(() => {
    fetchDebts();
    // Define a primeira categoria de despesa como padrão no select
    if (expenseCategories.length > 0) {
      setNewCategory(expenseCategories[0].name);
    }
  }, [user, expenseCategories]);

  const handleAddDebt = async (e) => {
    e.preventDefault();
    if (!newDesc || !newAmount || !newCategory || !newDueDate || !user) return;

    try {
      await addDoc(collection(db, "scheduled_transactions"), {
        userId: user.uid,
        description: newDesc,
        amount: parseFloat(newAmount),
        categoryName: newCategory,
        dueDate: Timestamp.fromDate(new Date(newDueDate)),
        status: 'pending',
        isRecurring: isRecurring, // Por enquanto, não vamos implementar a recorrência
      });
      // Limpa o formulário e busca os dados novamente
      setNewDesc('');
      setNewAmount('');
      setNewDueDate('');
      setIsRecurring(false); 
      fetchDebts();
    } catch (error) {
      console.error("Erro ao adicionar dívida:", error);
    }
  };

  const handleMarkAsPaid = (debt) => {
    const payAction = async () => {
        try {
            await addDoc(collection(db, "transactions"), {
                userId: user.uid,
                amount: debt.amount,
                category: debt.categoryName,
                description: `Pagamento de: ${debt.description}`,
                createdAt: Timestamp.now(),
                type: 'expense',
            });

            const debtDocRef = doc(db, "scheduled_transactions", debt.id);
            await updateDoc(debtDocRef, { status: 'paid' });

            fetchDebts(); // Re-busca as dívidas pendentes
            toast.success(`'${debt.description}' foi paga e registrada como despesa!`);
        } catch (error) {
            console.error("Erro ao marcar como paga:", error);
            toast.error("Ocorreu um erro ao registrar o pagamento.");
        }
    };
    
    showConfirmationToast(payAction, `Confirmar pagamento de ${debt.description}?`);
};

  const handleDeleteDebt = (debtId) => {
    const deleteAction = async () => {
        try {
            await deleteDoc(doc(db, "scheduled_transactions", debtId));
            fetchDebts();
            toast.success("Conta agendada excluída com sucesso!");
        } catch (error) {
            console.error("Erro ao apagar dívida:", error);
            toast.error("Falha ao excluir a conta agendada.");
        }
    };

    showConfirmationToast(deleteAction, "Apagar esta conta agendada?");
};

  if (loading) return <p>Carregando contas a pagar...</p>;

  return (
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

      <ul className={styles.debtList}>
        {debts.map(debt => (
          <li key={debt.id} className={styles.debtItem}>
            <span className={styles.debtDescription}>{debt.description}</span>
            <span className={styles.debtDate}>Vence: {debt.dueDate.toDate().toLocaleDateString('pt-BR')}</span>
            <span className={styles.debtAmount}>R$ {debt.amount.toFixed(2)}</span>
            <div className={styles.actionButtons}>
              <button onClick={() => handleMarkAsPaid(debt)} className={styles.paidButton}>Paga</button>
              <button onClick={() => handleDeleteDebt(debt.id)} className={styles.deleteButton}>Excluir</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DebtManager;