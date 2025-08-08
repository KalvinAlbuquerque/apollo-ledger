// src/components/Dashboard.jsx

import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebaseClient';
import { signOut } from 'firebase/auth';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import ExpenseChart from './ExpenseChart'; // 1. IMPORTE O NOVO COMPONENTE
import styles from './Dashboard.module.css'; 
import CategoryManager from './CategoryManager'; 
function Dashboard({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null); // 2. NOVO ESTADO PARA O GRÁFICO

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const q = query(
          collection(db, "transactions"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const transactionsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTransactions(transactionsData);

        // 3. LÓGICA PARA PROCESSAR OS DADOS PARA O GRÁFICO
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
        // Se a categoria já existe no objeto, soma o valor. Se não, cria.
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
      });

      // Pega os nomes das categorias e os totais
      const labels = Object.keys(categoryTotals);
      const data = Object.values(categoryTotals);

      // Prepara o objeto final para o Chart.js
      setChartData({
        labels: labels,
        datasets: [
          {
            label: 'Gastos R$',
            data: data,
            backgroundColor: [
              '#4A90E2', // Azul Principal (igual ao da categoria)
              '#50E3C2', // Verde Água
              '#B8E986', // Verde Claro
              '#9013FE', // Roxo Vibrante
              '#F5A623', // Laranja
              '#BD10E0', // Magenta
              '#7ED321', // Verde Limão
            ],
            borderColor: 'var(--cinza-elemento)', // Borda sutil entre as fatias
            borderWidth: 2,
          },
        ],
      });
    };

    if (user) {
      fetchTransactions();
    }
  }, [user]);

  const handleLogout = () => signOut(auth);

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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4">Nenhuma transação encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      <section style={{ marginTop: '40px' }}>
        <CategoryManager />
      </section>
    </div>
    
  );
}


export default Dashboard;