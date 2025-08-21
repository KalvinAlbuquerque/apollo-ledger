import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import MonthlyBarChart from '../components/MonthlyBarChart';
import LineChart from '../components/LineChart';
import CategoryLineChart from '../components/CategoryLineChart';
import styles from './ReportsPage.module.css';
import CategoryFilter from '../components/CategoryFilter';
function ReportsPage() {
  const [allTransactions, setAllTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados para os filtros
  const [accountView, setAccountView] = useState('geral');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [selectedReportCategories, setSelectedReportCategories] = useState(new Set());
  const [allReportCategories, setAllReportCategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const fetchInitialData = async () => {
      setLoading(true);
      const transQuery = query(collection(db, "transactions"), where("userId", "==", user.uid), orderBy("createdAt", "asc"));
      const transSnapshot = await getDocs(transQuery);
      const transData = transSnapshot.docs.map(doc => doc.data());
      setAllTransactions(transData);

      const accQuery = query(collection(db, "accounts"), where("userId", "==", user.uid));
      const accSnapshot = await getDocs(accQuery);
      const accData = accSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAccounts(accData);

      const catQuery = query(collection(db, "categories"), where("userId", "==", user.uid));
      const catSnapshot = await getDocs(catQuery);
      const catData = catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(catData);


      setLoading(false);
    };
    fetchInitialData();
  }, [user]);

  useEffect(() => {
    // A lista 'allReportCategories' agora terá os objetos completos
    setAllReportCategories(categories);
    // A seleção inicial continua sendo todos os nomes de categoria
    setSelectedReportCategories(new Set(categories.map(c => c.name)));
  }, [categories]); // A dependência agora é a nova lista de categorias

  // Hook 'useMemo' para filtrar as transações com base em TODAS as seleções
  const filteredTransactions = useMemo(() => {
    // Primeiro, filtra por conta
    let accountFiltered = [];
    if (accountView === 'total') {
      accountFiltered = allTransactions;
    } else if (accountView === 'geral') {
      const nonReserveAccountIds = new Set(accounts.filter(acc => !acc.isReserve).map(acc => acc.id));
      accountFiltered = allTransactions.filter(tx => nonReserveAccountIds.has(tx.accountId));
    } else {
      accountFiltered = allTransactions.filter(tx => tx.accountId === accountView);
    }

    // Se não houver filtros de data, retorna a lista filtrada por conta
    if (!filterStartDate && !filterEndDate) {
      return accountFiltered;
    }

    // Se houver filtros de data, aplica-os à lista já filtrada por conta
    const start = filterStartDate ? new Date(`${filterStartDate}T00:00:00`) : null;
    const end = filterEndDate ? new Date(`${filterEndDate}T23:59:59`) : null;

    return accountFiltered.filter(tx => {
      const txDate = tx.createdAt.toDate();
      if (start && txDate < start) return false;
      if (end && txDate > end) return false;
      return true;
    });
  }, [accountView, allTransactions, accounts, filterStartDate, filterEndDate]);


  // Processa dados para o gráfico de Fluxo de Caixa Mensal
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

  // Processa dados para o gráfico de Evolução do Saldo
  const balanceAndExpenseData = useMemo(() => {
    const lineChartData = {
      labels: [],
      datasets: [
        {
          label: 'Saldo Acumulado',
          data: [],
          borderColor: 'rgb(74, 144, 226)',
          backgroundColor: 'rgba(74, 144, 226, 0.5)',
          // yAxisID: 'y_balance', // Não precisamos mais disto
        },
        {
          // NOME ATUALIZADO
          label: 'Despesas Acumuladas',
          data: [],
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          // yAxisID: 'y_expenses', // Nem disto
        }
      ]
    };

    if (filteredTransactions.length > 0) {
      const dailyData = new Map();
      const sortedTransactions = [...filteredTransactions].sort((a, b) => a.createdAt.toDate() - b.createdAt.toDate());

      sortedTransactions.forEach(tx => {
        const dateKey = tx.createdAt.toDate().toLocaleDateString('pt-BR');
        if (!dailyData.has(dateKey)) {
          dailyData.set(dateKey, { income: 0, expense: 0 });
        }
        const current = dailyData.get(dateKey);
        if (tx.type === 'income') {
          current.income += tx.amount;
        } else {
          current.expense += tx.amount;
        }
      });

      let runningBalance = 0;
      // NOVA VARIÁVEL PARA ACUMULAR DESPESAS
      let runningExpenses = 0;

      const labels = [];
      const balanceDataPoints = [];
      const expenseDataPoints = []; // Agora vai guardar os valores acumulados

      dailyData.forEach((value, date) => {
        labels.push(date);
        runningBalance += value.income - value.expense;
        // LÓGICA DE ACÚMULO DE DESPESAS
        runningExpenses += value.expense;

        balanceDataPoints.push(runningBalance);
        // Adiciona o valor acumulado ao array
        expenseDataPoints.push(runningExpenses);
      });

      lineChartData.labels = labels;
      lineChartData.datasets[0].data = balanceDataPoints;
      lineChartData.datasets[1].data = expenseDataPoints;
    }
    return lineChartData;
  }, [filteredTransactions]);

  // Processa dados para o gráfico de Despesas por Categoria
  const categoryExpenseData = useMemo(() => {
    const expenses = filteredTransactions.filter(
      tx => (tx.type === 'expense' || !tx.type) && selectedReportCategories.has(tx.category)
    ); if (expenses.length === 0) return { labels: [], datasets: [] };
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
    const categoryColors = [
      '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
      '#E7E9ED', '#8DDF3C', '#F45B5B', '#7798BF', '#24CBE5', '#64E572',
      '#FFC233', '#50B432', '#ED561B', '#DDDF00', '#24CBE5', '#64E572',
      '#FF9655', '#FFF263', '#6AF9C4', '#2b908f', '#f45b5b', '#91e8e1',
      '#f7a35c', '#8085e9', '#f15c80', '#e4d354', '#2ec4b6', '#011627'
    ];
    const datasets = Array.from(allCategories).map((category, index) => {
      return {
        label: category,
        data: sortedDates.map(date => dailyCategoryTotals.get(date)[category] || 0),
        borderColor: categoryColors[index % categoryColors.length],
        backgroundColor: `${categoryColors[index % categoryColors.length]}80`,
        tension: 0.1
      }
    });
    return { labels: sortedDates, datasets: datasets };
  }, [filteredTransactions, selectedReportCategories]); // ADICIONE AQUI
  if (loading) {
    return <div className={styles.loading}>A carregar dados dos relatórios...</div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Relatórios Financeiros</h1>
          <div className={styles.accountSelector}>
            <select value={accountView} onChange={(e) => setAccountView(e.target.value)}>
              <option value="geral">Visão Geral (sem Reservas)</option>
              <option value="total">Patrimônio Total</option>
              <option disabled>--- Contas ---</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.accountName}</option>
              ))}
            </select>
          </div>
        </div>
        <Link to="/dashboard" className={styles.backButton}>Voltar ao Dashboard</Link>
      </header>

      <section className={styles.filterSection}>
        <div className={styles.filterGroup}>
          <label>De:</label>
          <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
        </div>
        <div className={styles.filterGroup}>
          <label>Até:</label>
          <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
        </div>
        <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className={styles.clearButton}>Limpar Datas</button>
      </section>

      <div className={styles.reportsGrid}>
        {/* Gráfico 1: Fluxo de Caixa Mensal (Existente) */}
        <div className={styles.reportCard}>
          <h2>Fluxo de Caixa Mensal</h2>
          <div className={styles.chartContainer}>
            <MonthlyBarChart chartData={monthlyFlowData} />
          </div>
        </div>

        <div className={`${styles.reportCard} ${styles.fullWidth}`}>
          <div className={styles.chartHeader}>
            <h2>Evolução de Despesas por Categoria</h2>
            <div className={styles.chartActions}>
              <button onClick={() => setIsCategoryFilterOpen(prev => !prev)} className={styles.filterButton}>
                Filtrar Categorias
              </button>
              {isCategoryFilterOpen && (
                <CategoryFilter
                  allCategories={allReportCategories} // Passe a lista completa
                  selectedCategories={selectedReportCategories}
                  onSelectionChange={setSelectedReportCategories}
                />

              )}
            </div>
          </div>
          <div className={styles.chartContainer}>
            <CategoryLineChart chartData={categoryExpenseData} />
          </div>
        </div>
        {/* Gráfico 3: Saldo vs. Despesas (O que adicionamos) */}
        <div className={`${styles.reportCard} ${styles.fullWidth}`}>
          <h2>Evolução do Saldo vs. Despesas Acumuladas</h2>
          <div className={styles.chartContainer}>
            <LineChart chartData={balanceAndExpenseData} />
          </div>
        </div>
      </div>

    </div>
  );
}

export default ReportsPage;