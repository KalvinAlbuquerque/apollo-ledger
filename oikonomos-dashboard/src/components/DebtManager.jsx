// src/components/DebtManager.jsx
import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import styles from './DebtManager.module.css';

function DebtManager({ expenseCategories }) {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados para o formulário de nova dívida
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

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
        isRecurring: false, // Por enquanto, não vamos implementar a recorrência
      });
      // Limpa o formulário e busca os dados novamente
      setNewDesc('');
      setNewAmount('');
      setNewDueDate('');
      fetchDebts();
    } catch (error) {
      console.error("Erro ao adicionar dívida:", error);
    }
  };

  const handleMarkAsPaid = async (debt) => {
    if (!user) return;
    try {
      // 1. Cria uma transação real de despesa
      await addDoc(collection(db, "transactions"), {
        userId: user.uid,
        amount: debt.amount,
        category: debt.categoryName,
        description: `Pagamento de: ${debt.description}`,
        createdAt: Timestamp.now(), // Data de hoje, pois foi pago hoje
        type: 'expense',
      });

      // 2. Atualiza o status da dívida para 'paid'
      const debtDocRef = doc(db, "scheduled_transactions", debt.id);
      await updateDoc(debtDocRef, { status: 'paid' });

      // 3. Remove da lista da tela
      setDebts(prevDebts => prevDebts.filter(d => d.id !== debt.id));
      alert(`'${debt.description}' marcada como paga e registrada como despesa!`);
    } catch (error) {
      console.error("Erro ao marcar como paga:", error);
    }
  };

  const handleDeleteDebt = async (debtId) => {
    if (!window.confirm("Tem certeza que deseja apagar esta conta agendada?")) return;
    try {
      await deleteDoc(doc(db, "scheduled_transactions", debtId));
      fetchDebts();
    } catch (error) {
      console.error("Erro ao apagar dívida:", error);
    }
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