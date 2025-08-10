// src/pages/ReportsPage.jsx (Versão com Filtros)
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import MonthlyBarChart from '../components/MonthlyBarChart'; 
import LineChart from '../components/LineChart'; 
import styles from './ReportsPage.module.css';
import CategoryLineChart from '../components/CategoryLineChart';

function ReportsPage() {
  const [allTransactions, setAllTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para os filtros
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const user = auth.currentUser;

  // Busca todas as transações uma única vez
  useEffect(() => {
    if (!user) return;
    const fetchAllTransactions = async () => {
      setLoading(true);
      const q = query(collection(db, "transactions"), where("userId", "==", user.uid), orderBy("createdAt", "asc"));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => doc.data());
      setAllTransactions(data);
      setFilteredTransactions(data); // Inicialmente, mostra tudo
      setLoading(false);
    };
    fetchAllTransactions();
  }, [user]);

  // Filtra as transações localmente sempre que as datas mudam
  useEffect(() => {
    if (!filterStartDate || !filterEndDate) {
      setFilteredTransactions(allTransactions);
      return;
    }
    const start = new Date(filterStartDate);
    const end = new Date(filterEndDate);
    end.setHours(23, 59, 59, 999); // Garante que o dia final seja incluído

    const filtered = allTransactions.filter(tx => {
      const txDate = tx.createdAt.toDate();
      return txDate >= start && txDate <= end;
    });
    setFilteredTransactions(filtered);
  }, [filterStartDate, filterEndDate, allTransactions]);


  // Processa os dados para o gráfico de fluxo de caixa
  const monthlyFlowData = useMemo(() => {
    const monthlyData = {};
    filteredTransactions.forEach(tx => {
      const date = tx.createdAt.toDate();
      const monthYear = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = { income: 0, expense: 0 };
      }
      if (tx.type === 'income') {
        monthlyData[monthYear].income += tx.amount;
      } else {
        monthlyData[monthYear].expense += tx.amount;
      }
    });

    const labels = Object.keys(monthlyData).sort();
    return {
      labels,
      datasets: [
        { label: 'Total de Rendas', data: labels.map(key => monthlyData[key].income), backgroundColor: 'rgba(80, 227, 194, 0.7)' },
        { label: 'Total de Despesas', data: labels.map(key => monthlyData[key].expense), backgroundColor: 'rgba(255, 29, 88, 0.7)' },
      ],
    };
  }, [filteredTransactions]);

  const balanceEvolutionData = useMemo(() => {
    const lineChartData = {
        labels: [],
        datasets: [{
            label: 'Evolução do Saldo',
            data: [],
            borderColor: 'rgb(74, 144, 226)',
            backgroundColor: 'rgba(74, 144, 226, 0.5)',
            tension: 0.1 // Deixa a linha um pouco curva
        }]
    };
    
    if (filteredTransactions.length > 0) {
        // A lista já vem ordenada da busca inicial
        const dailyNetChanges = new Map();
        
        filteredTransactions.forEach(tx => {
            const dateKey = tx.createdAt.toDate().toLocaleDateString('pt-BR');
            const amount = tx.type === 'income' ? tx.amount : -tx.amount;
            dailyNetChanges.set(dateKey, (dailyNetChanges.get(dateKey) || 0) + amount);
        });

        let runningBalance = 0;
        const balanceOverTime = new Map();
        
        // Ordena as datas corretamente
        const sortedDates = Array.from(dailyNetChanges.keys()).sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));

        sortedDates.forEach(date => {
            runningBalance += dailyNetChanges.get(date);
            balanceOverTime.set(date, runningBalance);
        });

        lineChartData.labels = Array.from(balanceOverTime.keys());
        lineChartData.datasets[0].data = Array.from(balanceOverTime.values());
    }
    
    return lineChartData;
  }, [filteredTransactions]);

  const categoryExpenseData = useMemo(() => {
    const expenses = filteredTransactions.filter(tx => tx.type === 'expense' || !tx.type);
    
    if (expenses.length === 0) {
      return { labels: [], datasets: [] };
    }

    const dailyCategoryTotals = new Map();
    const allCategories = new Set();
    
    expenses.forEach(tx => {
      const dateKey = tx.createdAt.toDate().toLocaleDateString('pt-BR');
      const category = tx.category;
      allCategories.add(category);

      if (!dailyCategoryTotals.has(dateKey)) {
        dailyCategoryTotals.set(dateKey, {});
      }
      const dayData = dailyCategoryTotals.get(dateKey);
      dayData[category] = (dayData[category] || 0) + tx.amount;
    });
    
    const sortedDates = Array.from(dailyCategoryTotals.keys()).sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));
    
    const categoryColors = ['#4A90E2', '#50E3C2', '#B8E986', '#9013FE', '#F5A623', '#BD10E0', '#7ED321', '#FF1D58'];

    const datasets = Array.from(allCategories).map((category, index) => {
      return {
        label: category,
        data: sortedDates.map(date => dailyCategoryTotals.get(date)[category] || 0),
        borderColor: categoryColors[index % categoryColors.length],
        backgroundColor: `${categoryColors[index % categoryColors.length]}80`, // Adiciona transparência
        tension: 0.1
      }
    });

    return {
      labels: sortedDates,
      datasets: datasets,
    };
  }, [filteredTransactions]);

  if (loading) {
    return <div className={styles.loading}>Carregando dados...</div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Relatórios Financeiros</h1>
        <Link to="/dashboard" className={styles.backButton}>Voltar ao Dashboard</Link>
      </header>

      <section className={styles.filterSection}>
        {/* ... (seção de filtros sem alterações) ... */}
      </section>

      <div className={styles.reportsGrid}>
        <div className={styles.reportCard}>
          <h2>Fluxo de Caixa Mensal</h2>
          <div className={styles.chartContainer}>
            <MonthlyBarChart chartData={monthlyFlowData} />
          </div>
        </div>

        {/* <<< 3. NOVO CARD COM O GRÁFICO DE LINHA */}
        <div className={styles.reportCard}>
          <h2>Evolução do Saldo no Período</h2>
          <div className={styles.chartContainer}>
            <LineChart chartData={balanceEvolutionData} />
          </div>
        </div>

         <div className={`${styles.reportCard} ${styles.fullWidth}`}>
          <h2>Evolução de Despesas por Categoria</h2>
          <div className={styles.chartContainer}>
            <CategoryLineChart chartData={categoryExpenseData} />
          </div>
        </div>
      </div>
    </div>
  );
}


export default ReportsPage;