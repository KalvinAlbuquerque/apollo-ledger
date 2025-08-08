// src/components/Dashboard.jsx

import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebaseClient';
import { signOut } from 'firebase/auth';
// <<< 1. IMPORTS ATUALIZADOS
import { collection, query, where, orderBy, getDocs, doc, deleteDoc } from 'firebase/firestore'; 
import ExpenseChart from './ExpenseChart';
import styles from './Dashboard.module.css';

function Dashboard({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const q = query(
          collection(db, "transactions"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const transactionsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTransactions(transactionsData);
        processDataForChart(transactionsData);
      } catch (error) {
        console.error("Erro ao buscar transações:", error);
      } finally {
        setLoading(false);
      }
    };

    const processDataForChart = (transactions) => {
      const categoryTotals = {};
      transactions.forEach(tx => {
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
          borderColor: 'var(--cinza-elemento)',
          borderWidth: 2,
        }],
      });
    };

    if (user) {
      fetchTransactions();
    }
  }, [user]);

  const handleLogout = () => signOut(auth);

  // <<< 2. NOVA FUNÇÃO DE EXCLUSÃO
  const handleDelete = async (transactionId) => {
    if (!window.confirm("Tem certeza que deseja excluir esta transação? A ação não pode ser desfeita.")) {
      return;
    }
    try {
      const transactionDocRef = doc(db, "transactions", transactionId);
      await deleteDoc(transactionDocRef);
      setTransactions(prevTransactions => prevTransactions.filter(tx => tx.id !== transactionId));
    } catch (error) {
      console.error("Erro ao excluir transação:", error);
      alert("Ocorreu um erro ao excluir a transação.");
    }
  };

  if (loading) return <div>Carregando suas finanças...</div>;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1>Dashboard Oikonomos</h1>
          <p>Olá, {user.email}</p>
        </div>
        <button onClick={handleLogout} className={styles.logoutButton}>Sair</button>
      </header>

      <main className={styles.mainContent}>
        <div className={styles.chartContainer}>
          {chartData && <ExpenseChart chartData={chartData} />}
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
                <th>Ações</th> {/* <<< 3. NOVA COLUNA NO CABEÇALHO */}
              </tr>
            </thead>
            <tbody>
              {transactions.length > 0 ? (
                transactions.map(tx => (
                  <tr key={tx.id}>
                    <td>{tx.createdAt ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : '-'}</td>
                    <td>{tx.category}</td>
                    <td>{tx.description || '-'}</td>
                    <td>{tx.amount.toFixed(2)}</td>
                    {/* <<< 4. NOVA CÉLULA COM O BOTÃO DE EXCLUIR */}
                    <td>
                      <button onClick={() => handleDelete(tx.id)} className={styles.deleteButton}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">Nenhuma transação encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;