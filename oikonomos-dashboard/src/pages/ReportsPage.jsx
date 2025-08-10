// src/pages/ReportsPage.jsx (Versão com Gráfico)
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import MonthlyBarChart from '../components/MonthlyBarChart'; // <<< 1. IMPORTE O NOVO GRÁFICO
import styles from './ReportsPage.module.css';
import SummaryChart from '../components/SummaryChart';
function ReportsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    const fetchAllTransactions = async () => {
      setLoading(true);
      const q = query(
        collection(db, "transactions"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "asc")
      );
      const querySnapshot = await getDocs(q);
      const allTransactions = querySnapshot.docs.map(doc => doc.data());
      setTransactions(allTransactions);
      setLoading(false);
    };

    fetchAllTransactions();
  }, [user]);

  const reportsData = useMemo(() => {
    // --- 1. Lógica do Fluxo de Caixa Mensal (sem alterações) ---
    const monthlyData = {};
    transactions.forEach(tx => {
      const date = tx.createdAt.toDate();
      const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = { income: 0, expense: 0 };
      }
      if (tx.type === 'income') {
        monthlyData[monthYear].income += tx.amount;
      } else {
        monthlyData[monthYear].expense += tx.amount;
      }
    });

    const monthlyFlowData = {
      labels: Object.keys(monthlyData),
      datasets: [
        { label: 'Total de Rendas', data: Object.keys(monthlyData).map(key => monthlyData[key].income), backgroundColor: 'rgba(80, 227, 194, 0.7)' },
        { label: 'Total de Despesas', data: Object.keys(monthlyData).map(key => monthlyData[key].expense), backgroundColor: 'rgba(255, 29, 88, 0.7)' },
      ],
    };

    // --- 2. NOVA LÓGICA DE DESPESAS TOTAIS POR CATEGORIA ---
    const expenseByCategory = {};
    transactions
      .filter(tx => tx.type === 'expense' || !tx.type)
      .forEach(tx => {
        expenseByCategory[tx.category] = (expenseByCategory[tx.category] || 0) + tx.amount;
      });

    const categoryLabels = Object.keys(expenseByCategory);
    const categoryData = Object.values(expenseByCategory);
    
    const categoryExpenseData = {
        labels: categoryLabels,
        datasets: [{
            label: 'Total Gasto',
            data: categoryData,
            backgroundColor: [ '#4A90E2', '#50E3C2', '#B8E986', '#9013FE', '#F5A623', '#BD10E0', '#7ED321', '#F8E71C', '#D0021B' ],
        }]
    };

    // Retorna todos os dados prontos
    return { monthlyFlowData, categoryExpenseData };
  }, [transactions]);

  if (loading) {
    return <div className={styles.loading}>Carregando dados dos relatórios...</div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Relatórios Financeiros</h1>
        <Link to="/dashboard" className={styles.backButton}>Voltar ao Dashboard</Link>
       </header>
      <div className={styles.reportsGrid}>
        <div className={styles.reportCard}>
          <h2>Fluxo de Caixa Mensal</h2>
          <div className={styles.chartContainer}>
            <MonthlyBarChart chartData={reportsData.monthlyFlowData} />
          </div>
        </div>

        {/* <<< NOVO CARD DE RELATÓRIO AQUI */}
        <div className={styles.reportCard}>
          <h2>Despesas Totais por Categoria</h2>
          <div className={styles.chartContainer}>
            <SummaryChart title="" chartData={reportsData.categoryExpenseData} />
          </div>
        </div>

      </div>
    </div>
  );
}

export default ReportsPage;