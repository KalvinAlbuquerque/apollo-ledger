import React, { useState, useEffect, useMemo } from 'react';
import { auth, db } from '../../firebaseClient';
import { signOut } from 'firebase/auth';
import { collection, query, where, orderBy, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore'; 

// Componentes filhos
import SummaryChart from './SummaryChart';
import EditModal from './EditModal';
import CategoryManager from './CategoryManager';

// Estilos
import styles from './Dashboard.module.css';

function Dashboard({ user }) {
  // Estados
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [currentChartIndex, setCurrentChartIndex] = useState(0); // Estado para o carrossel

  // Busca inicial dos dados
  const fetchData = async () => {
    if (!user) return;
    try {
      const transQuery = query(collection(db, "transactions"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
      const transSnapshot = await getDocs(transQuery);
      const transData = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(transData);

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

  // Hook de memorização para todos os cálculos
  const summaryData = useMemo(() => {
    const income = transactions.filter(tx => tx.type === 'income');
    const expenses = transactions.filter(tx => tx.type === 'expense' || !tx.type);

    const totalIncome = income.reduce((acc, tx) => acc + tx.amount, 0);
    const totalExpense = expenses.reduce((acc, tx) => acc + tx.amount, 0);
    const balance = totalIncome - totalExpense;

    const processDataForChart = (data, label) => {
        const categoryTotals = {};
        data.forEach(tx => {
            categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
        });
        return {
            labels: Object.keys(categoryTotals),
            datasets: [{
                label: label,
                data: Object.values(categoryTotals),
                backgroundColor: [ '#4A90E2', '#50E3C2', '#B8E986', '#9013FE', '#F5A623', '#BD10E0', '#7ED321' ],
                borderColor: '#1E1E1E',
                borderWidth: 2,
            }],
        };
    };

    const expenseChartData = processDataForChart(expenses, 'Gastos R$');
    const incomeChartData = processDataForChart(income, 'Rendas R$');
    
    const balanceChartData = {
        labels: ['Rendas', 'Despesas'],
        datasets: [{
            label: 'Balanço R$',
            data: [totalIncome, totalExpense],
            backgroundColor: ['#50E3C2', '#FF1D58'],
            borderColor: '#1E1E1E',
            borderWidth: 2,
        }],
    };

    return { totalIncome, totalExpense, balance, expenseChartData, incomeChartData, balanceChartData };
  }, [transactions]);

  // Lógica do Carrossel de Gráficos
  const charts = [
    { title: "Gastos por Categoria", data: summaryData.expenseChartData },
    { title: "Origem das Rendas", data: summaryData.incomeChartData },
    { title: "Rendas vs. Despesas", data: summaryData.balanceChartData }
  ];

  const goToNextChart = () => {
    setCurrentChartIndex(prevIndex => (prevIndex + 1) % charts.length);
  };

  const goToPrevChart = () => {
    setCurrentChartIndex(prevIndex => (prevIndex - 1 + charts.length) % charts.length);
  };
  
  // Funções de Ação
  const handleLogout = () => signOut(auth);

  const handleDelete = async (transactionId) => {
    if (!window.confirm("Tem certeza que deseja excluir esta transação?")) return;
    try {
      await deleteDoc(doc(db, "transactions", transactionId));
      fetchData();
    } catch (error) {
      console.error("Erro ao excluir transação:", error);
      alert("Ocorreu um erro ao excluir a transação.");
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
      alert("Falha ao salvar as alterações.");
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
            <p className={styles.incomeAmount}>R$ {summaryData.totalIncome.toFixed(2)}</p>
          </div>
          <div>
            <h4>Total de Despesas</h4>
            <p className={styles.expenseAmount}>R$ {summaryData.totalExpense.toFixed(2)}</p>
          </div>
          <div>
            <h4>Saldo Atual</h4>
            <p>R$ {summaryData.balance.toFixed(2)}</p>
          </div>
        </section>

        <main className={styles.mainContent}>
          <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
              <h3 className={styles.chartTitle}>{charts[currentChartIndex].title}</h3>
              <div className={styles.navButtons}>
                <button onClick={goToPrevChart}>&lt;</button>
                <button onClick={goToNextChart}>&gt;</button>
              </div>
            </div>
            <SummaryChart chartData={charts[currentChartIndex].data} />
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