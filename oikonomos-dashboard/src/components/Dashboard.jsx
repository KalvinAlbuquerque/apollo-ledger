import React, { useState, useEffect, useMemo } from 'react';
import { auth, db } from '../../firebaseClient';
import { signOut } from 'firebase/auth';
import { collection, query, where, orderBy, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore'; 

// Componentes filhos
import ExpenseChart from './ExpenseChart';
import EditModal from './EditModal';
import CategoryManager from './CategoryManager';

// Estilos
import styles from './Dashboard.module.css';

function Dashboard({ user }) {
  // Estados para os dados
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);

  // Estados para controlar o modal de edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);

  const fetchData = async () => {
    if (!user) return;
    try {
      const transQuery = query(collection(db, "transactions"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
      const transSnapshot = await getDocs(transQuery);
      const transData = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(transData);
      processDataForChart(transData);

      const catQuery = query(collection(db, "categories"), where("userId", "==", user.uid));
      const catSnapshot = await getDocs(catQuery);
      const catData = catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(catData);

    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const processDataForChart = (transactions) => {
    const expenseTransactions = transactions.filter(tx => tx.type === 'expense' || !tx.type);
    const categoryTotals = {};
    expenseTransactions.forEach(tx => {
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
    });
    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);
    setChartData({
      labels: labels,
      datasets: [{
        label: 'Gastos R$',
        data: data,
        backgroundColor: [ '#4A90E2', '#50E3C2', '#B8E986', '#9013FE', '#F5A623', '#BD10E0', '#7ED321' ],
        borderColor: '#1E1E1E',
        borderWidth: 2,
      }],
    });
  };

  const financialSummary = useMemo(() => {
    const totalIncome = transactions
      .filter(tx => tx.type === 'income')
      .reduce((acc, tx) => acc + tx.amount, 0);
    const totalExpense = transactions
      .filter(tx => tx.type === 'expense' || !tx.type)
      .reduce((acc, tx) => acc + tx.amount, 0);
    const balance = totalIncome - totalExpense;
    return { totalIncome, totalExpense, balance };
  }, [transactions]);

  const handleLogout = () => signOut(auth);

  const handleDelete = async (transactionId) => {
    if (!window.confirm("Tem certeza que deseja excluir?")) return;
    try {
      await deleteDoc(doc(db, "transactions", transactionId));
      fetchData();
    } catch (error) {
      console.error("Erro ao excluir transação:", error);
    }
  };

  const handleOpenEditModal = (transaction) => {
    setEditingTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTransaction(null);
  };

  const handleSaveTransaction = async (updatedData) => {
    if (!editingTransaction) return;
    try {
      const transactionDocRef = doc(db, "transactions", editingTransaction.id);
      await updateDoc(transactionDocRef, updatedData);
      handleCloseModal();
      fetchData();
    } catch (error) {
      console.error("Erro ao atualizar transação:", error);
    }
  };

  if (loading) return <div>Carregando suas finanças...</div>;

  return (
    <>
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div>
            <h1>Dashboard Oikonomos</h1>
            <p>Olá, {user.email}</p>
          </div>
          <button onClick={handleLogout} className={styles.logoutButton}>Sair</button>
        </header>

        <section className={styles.summary}>
          <div>
            <h4>Total de Rendas</h4>
            <p className={styles.incomeAmount}>R$ {financialSummary.totalIncome.toFixed(2)}</p>
          </div>
          <div>
            <h4>Total de Despesas</h4>
            <p className={styles.expenseAmount}>R$ {financialSummary.totalExpense.toFixed(2)}</p>
          </div>
          <div>
            <h4>Saldo Atual</h4>
            <p>R$ {financialSummary.balance.toFixed(2)}</p>
          </div>
        </section>

        <main className={styles.mainContent}>
          <div className={styles.chartContainer}>
            {chartData && transactions.filter(tx => tx.type === 'expense').length > 0 ? (
                <ExpenseChart chartData={chartData} />
            ) : <p>Sem gastos para exibir o gráfico.</p>}
          </div>

          <div className={styles.transactionsContainer}>
            <h2>Suas Transações</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Categoria</th>
                  <th>Descrição</th>
                  <th>Valor (R$)</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length > 0 ? (
                  transactions.map(tx => (
                    <tr key={tx.id}>
                      <td>{tx.createdAt ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : '-'}</td>
                      <td>{tx.category}</td>
                      <td>{tx.description || '-'}</td>
                      <td className={tx.type === 'income' ? styles.incomeAmount : styles.expenseAmount}>
                        {tx.type === 'income' ? '+ ' : '- '}R$ {tx.amount.toFixed(2)}
                      </td>
                      <td>
                        <button onClick={() => handleOpenEditModal(tx)} className={styles.editButton}>Editar</button>
                        <button onClick={() => handleDelete(tx.id)} className={styles.deleteButton}>Excluir</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="5">Nenhuma transação encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
        
        <section className={styles.managerSection}>
            <CategoryManager />
        </section>
      </div>

      {isModalOpen && (
        <EditModal 
          transaction={editingTransaction}
          onSave={handleSaveTransaction}
          onCancel={handleCloseModal}
          categories={categories}
        />
      )}
    </>
  );
}

export default Dashboard;