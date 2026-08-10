// src/pages/ReportsPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import MonthlyBarChart from '../components/MonthlyBarChart';
import LineChart from '../components/LineChart';
import CategoryLineChart from '../components/CategoryLineChart';
import TagsEvolutionChart from '../components/TagsEvolutionChart';
import styles from './ReportsPage.module.css';
import CategoryFilter from '../components/CategoryFilter';
import AccountFilter from '../components/AccountFilter';
import { exportToCSV, exportToPDF } from '../utils/exportUtils';
import HelpModal from '../components/HelpModal'; // 1. IMPORTE O MODAL DE AJUDA

// Função para formatar moeda
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function ReportsPage() {
  const [allTransactions, setAllTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountView, setAccountView] = useState('geral');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [selectedReportCategories, setSelectedReportCategories] = useState(new Set());
  const [allReportCategories, setAllReportCategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [searchCategory, setSearchCategory] = useState('');
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
    setAllReportCategories(categories);
    setSelectedReportCategories(new Set(categories.map(c => c.name)));
  }, [categories]);

  const filteredTransactions = useMemo(() => {
    let accountFiltered = [];
    if (accountView === 'total') {
      accountFiltered = allTransactions;
    } else if (accountView === 'geral') {
      const nonReserveAccountIds = new Set(accounts.filter(acc => !acc.isReserve).map(acc => acc.id));
      accountFiltered = allTransactions.filter(tx => nonReserveAccountIds.has(tx.accountId));
    } else {
      accountFiltered = allTransactions.filter(tx => tx.accountId === accountView);
    }

    if (!filterStartDate && !filterEndDate) {
      return accountFiltered;
    }

    const start = filterStartDate ? new Date(`${filterStartDate}T00:00:00`) : null;
    const end = filterEndDate ? new Date(`${filterEndDate}T23:59:59`) : null;

    return accountFiltered.filter(tx => {
      const txDate = tx.createdAt.toDate();
      if (start && txDate < start) return false;
      if (end && txDate > end) return false;
      return true;
    });
  }, [accountView, allTransactions, accounts, filterStartDate, filterEndDate]);

  const summaryData = useMemo(() => {
    const income = filteredTransactions.filter(tx => tx.type === 'income');
    const expenses = filteredTransactions.filter(tx => tx.type === 'expense' || !tx.type);
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
        datasets: [{ label: label, data: Object.values(categoryTotals) }],
      };
    };

    return {
      totalIncome,
      totalExpense,
      balance,
      expenseChartData: processDataForChart(expenses, 'Gastos R$'),
      incomeChartData: processDataForChart(income, 'Rendas R$'),
    };
  }, [filteredTransactions]);

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

  const balanceAndExpenseData = useMemo(() => {
    const lineChartData = {
      labels: [],
      datasets: [
        { label: 'Saldo Acumulado', data: [], borderColor: 'rgb(74, 144, 226)', backgroundColor: 'rgba(74, 144, 226, 0.5)' },
        { label: 'Despesas Acumuladas', data: [], borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.5)' }
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
        if (tx.type === 'income') current.income += tx.amount;
        else current.expense += tx.amount;
      });

      let runningBalance = 0;
      let runningExpenses = 0;
      const labels = [];
      const balanceDataPoints = [];
      const expenseDataPoints = [];

      dailyData.forEach((value, date) => {
        labels.push(date);
        runningBalance += value.income - value.expense;
        runningExpenses += value.expense;
        balanceDataPoints.push(runningBalance);
        expenseDataPoints.push(runningExpenses);
      });

      lineChartData.labels = labels;
      lineChartData.datasets[0].data = balanceDataPoints;
      lineChartData.datasets[1].data = expenseDataPoints;
    }
    return lineChartData;
  }, [filteredTransactions]);

  const categoryExpenseData = useMemo(() => {
    const expenses = filteredTransactions.filter(tx => (tx.type === 'expense' || !tx.type) && selectedReportCategories.has(tx.category));
    if (expenses.length === 0) return { labels: [], datasets: [] };
    const dailyCategoryTotals = new Map();
    const allCategories = new Set();
    expenses.forEach(tx => {
      const dateKey = tx.createdAt.toDate().toLocaleDateString('pt-BR');
      const category = tx.category;
      allCategories.add(category);
      if (!dailyCategoryTotals.has(dateKey)) dailyCategoryTotals.set(dateKey, {});
      const dayData = dailyCategoryTotals.get(dateKey);
      dayData[category] = (dayData[category] || 0) + tx.amount;
    });
    const sortedDates = Array.from(dailyCategoryTotals.keys()).sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));
    const categoryColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#E7E9ED', '#8DDF3C', '#F45B5B', '#7798BF', '#24CBE5', '#64E572', '#FFC233', '#50B432', '#ED561B', '#DDDF00', '#24CBE5', '#64E572', '#FF9655', '#FFF263', '#6AF9C4'];
    const datasets = Array.from(allCategories).map((category, index) => ({
      label: category,
      data: sortedDates.map(date => dailyCategoryTotals.get(date)[category] || 0),
      borderColor: categoryColors[index % categoryColors.length],
      backgroundColor: `${categoryColors[index % categoryColors.length]}80`,
      tension: 0.1
    }));
    return { labels: sortedDates, datasets: datasets };
  }, [filteredTransactions, selectedReportCategories]);

  const transactionsWithCategoryFilter = useMemo(() => {
    return filteredTransactions.filter(tx => selectedReportCategories.has(tx.category));
  }, [filteredTransactions, selectedReportCategories]);

  const allTagsData = useMemo(() => {
    const expenses = filteredTransactions.filter(tx => tx.type === 'expense' || !tx.type);
    const totals = {};
    expenses.forEach(tx => {
      (tx.tags || []).forEach(tag => { totals[tag] = (totals[tag] || 0) + tx.amount; });
    });
    const totalExpense = expenses.reduce((s, tx) => s + tx.amount, 0);
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value, pct: totalExpense ? (value / totalExpense) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  const categoryTagBreakdown = useMemo(() => {
    const expenses = filteredTransactions.filter(tx => tx.type === 'expense' || !tx.type);
    const byCat = {};
    expenses.forEach(tx => {
      const cat = tx.category || 'Sem categoria';
      if (!byCat[cat]) byCat[cat] = { total: 0, tags: {}, untagged: 0 };
      byCat[cat].total += tx.amount;
      if (!tx.tags || tx.tags.length === 0) {
        byCat[cat].untagged += tx.amount;
      } else {
        tx.tags.forEach(tag => { byCat[cat].tags[tag] = (byCat[cat].tags[tag] || 0) + tx.amount; });
      }
    });
    return Object.entries(byCat)
      .map(([cat, data]) => {
        const tagList = Object.entries(data.tags)
          .map(([name, value]) => ({ name, value, pct: data.total ? (value / data.total) * 100 : 0 }))
          .sort((a, b) => b.value - a.value);
        if (data.untagged > 0) {
          tagList.push({ name: null, value: data.untagged, pct: data.total ? (data.untagged / data.total) * 100 : 0 });
        }
        return { category: cat, total: data.total, tags: tagList };
      })
      .sort((a, b) => b.total - a.total);
  }, [filteredTransactions]);

  const categorySearchData = useMemo(() => {
    if (!searchCategory) return null;
    const txs = filteredTransactions
      .filter(tx => tx.category === searchCategory)
      .sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

    const expenses = txs.filter(tx => tx.type === 'expense' || !tx.type);
    const income = txs.filter(tx => tx.type === 'income');
    const totalExpense = expenses.reduce((s, tx) => s + tx.amount, 0);
    const totalIncome = income.reduce((s, tx) => s + tx.amount, 0);

    const byMonth = {};
    txs.forEach(tx => {
      const d = tx.createdAt.toDate();
      const key = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
      if (!byMonth[key]) byMonth[key] = { expense: 0, income: 0 };
      if (tx.type === 'income') byMonth[key].income += tx.amount;
      else byMonth[key].expense += tx.amount;
    });
    const sortedMonths = Object.keys(byMonth).sort((a, b) => {
      const [ma, ya] = a.split('/'); const [mb, yb] = b.split('/');
      return new Date(ya, ma - 1) - new Date(yb, mb - 1);
    });
    const maxMonthVal = Math.max(...sortedMonths.map(m => byMonth[m].expense + byMonth[m].income), 1);

    return { txs, totalExpense, totalIncome, count: txs.length, sortedMonths, byMonth, maxMonthVal };
  }, [filteredTransactions, searchCategory]);

  const searchCategoryOptions = useMemo(() => {
    const expCats = new Set(); const incCats = new Set();
    filteredTransactions.forEach(tx => {
      if (!tx.category) return;
      if (tx.type === 'income') incCats.add(tx.category);
      else expCats.add(tx.category);
    });
    return {
      expense: [...expCats].sort(),
      income: [...incCats].sort(),
    };
  }, [filteredTransactions]);

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  if (loading) {
    return <div className={styles.loading}>A carregar dados dos relatórios...</div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>
            Análise de Relatórios
            <button onClick={() => setIsHelpOpen(true)} className={styles.helpButton}>?</button> {/* 3. ADICIONE O BOTÃO */}
          </h1>
          <p className={styles.subtitle}>Explore suas tendências financeiras ao longo do tempo.</p>
        </div>
      </header>

      <section className={styles.filterSection}>
        <div className={styles.filterGroup}>
          <label>Conta:</label>
          <AccountFilter
            accounts={accounts}
            currentSelection={accountView}
            onSelectionChange={setAccountView}
          />
        </div>
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

      <section className={styles.exportContainer}>
        <div>
          <h3>Exportar Relatório</h3>
          <p>Gere um arquivo CSV ou PDF com os dados do período e filtros selecionados acima.</p>
        </div>
        <div className={styles.exportButtons}>
          <button onClick={() => exportToCSV(filteredTransactions, summaryData, accounts)}>
            Exportar CSV
          </button>
          <button onClick={() => exportToPDF(filteredTransactions, summaryData, accounts)}>
            Exportar PDF
          </button>
        </div>
      </section>
      {/* --- NOVA SEÇÃO DE RESUMO (KPIs) --- */}
      <section className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <h4>Rendas no Período</h4>
          <p className={styles.income}>{formatCurrency(summaryData.totalIncome)}</p>
        </div>
        <div className={styles.summaryCard}>
          <h4>Despesas no Período</h4>
          <p className={styles.expense}>{formatCurrency(summaryData.totalExpense)}</p>
        </div>
        <div className={styles.summaryCard}>
          <h4>Saldo do Período</h4>
          <p className={summaryData.balance >= 0 ? styles.income : styles.expense}>{formatCurrency(summaryData.balance)}</p>
        </div>
      </section>

      <div className={styles.reportsGrid}>
        <div className={`${styles.reportCard} ${styles.fullWidth}`}>
          <div className={styles.chartHeader}>
            <div>
              <h2>Evolução de Despesas por Categoria</h2>
              <p className={styles.chartSubtitle}>Acompanhe como seus gastos em cada categoria mudam ao longo dos dias.</p>
            </div>
            <div className={styles.chartActions}>
              <button onClick={() => setIsCategoryFilterOpen(prev => !prev)} className={styles.filterButton}>Filtrar Categorias</button>
              {isCategoryFilterOpen && <CategoryFilter allCategories={allReportCategories} selectedCategories={selectedReportCategories} onSelectionChange={setSelectedReportCategories} />}
            </div>
          </div>
          <div className={styles.chartContainer}>
            <CategoryLineChart chartData={categoryExpenseData} />
          </div>
        </div>

        {/* Despesas por Tag — todas */}
        <div className={`${styles.reportCard} ${styles.fullWidth}`}>
          <h2>Despesas por Tag</h2>
          <p className={styles.chartSubtitle}>Todas as tags usadas no período, ordenadas por valor total de despesa.</p>
          {allTagsData.length === 0 ? (
            <p className={styles.emptyMsg}>Nenhuma tag utilizada neste período.</p>
          ) : (
            <div className={styles.tagBarTable}>
              {allTagsData.map((tag, i) => (
                <div key={tag.name} className={styles.tagBarRow}>
                  <span className={styles.tagBarRank}>{i + 1}</span>
                  <span className={styles.tagBarName}>#{tag.name}</span>
                  <div className={styles.tagBarTrack}>
                    <div
                      className={styles.tagBarFill}
                      style={{ width: `${(tag.value / allTagsData[0].value) * 100}%` }}
                    />
                  </div>
                  <span className={styles.tagBarPct}>{tag.pct.toFixed(1)}%</span>
                  <span className={styles.tagBarValue}>{formatCurrency(tag.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Breakdown: Categoria → Tags */}
        <div className={`${styles.reportCard} ${styles.fullWidth}`}>
          <h2>Gastos por Categoria e Tag</h2>
          <p className={styles.chartSubtitle}>Clique em uma categoria para ver como os gastos se distribuem entre as tags utilizadas.</p>
          {categoryTagBreakdown.length === 0 ? (
            <p className={styles.emptyMsg}>Nenhuma despesa no período.</p>
          ) : (
            <div className={styles.catBreakdown}>
              {categoryTagBreakdown.map(({ category, total, tags }) => {
                const isOpen = expandedCategories.has(category);
                const maxTagValue = tags[0]?.value || 1;
                return (
                  <div key={category} className={styles.catRow}>
                    <button className={styles.catRowHeader} onClick={() => toggleCategory(category)}>
                      <span className={styles.catRowArrow}>{isOpen ? '▾' : '▸'}</span>
                      <span className={styles.catRowName}>{category}</span>
                      <div className={styles.catRowBar}>
                        <div
                          className={styles.catRowBarFill}
                          style={{ width: `${(total / categoryTagBreakdown[0].total) * 100}%` }}
                        />
                      </div>
                      <span className={styles.catRowTotal}>{formatCurrency(total)}</span>
                    </button>
                    {isOpen && (
                      <div className={styles.tagBreakdown}>
                        {tags.length === 0 ? (
                          <span className={styles.noTags}>Sem tags</span>
                        ) : tags.map((tag, ti) => (
                          <div key={tag.name ?? '__untagged__'} className={styles.tagBreakRow}>
                            <span className={styles.tagBreakName}>
                              {tag.name ? `#${tag.name}` : <em>sem tag</em>}
                            </span>
                            <div className={styles.tagBreakTrack}>
                              <div
                                className={styles.tagBreakFill}
                                style={{ width: `${(tag.value / maxTagValue) * 100}%` }}
                              />
                            </div>
                            <span className={styles.tagBreakPct}>{tag.pct.toFixed(1)}%</span>
                            <span className={styles.tagBreakValue}>{formatCurrency(tag.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.reportCard}>
          <h2>Evolução de Gastos por Tag</h2>
          <p className={styles.chartSubtitle}>Acompanhe o histórico e a evolução das suas despesas por hashtags.</p>
          <div className={styles.chartContainer}>
            <TagsEvolutionChart transactions={transactionsWithCategoryFilter} />
          </div>
        </div>

        <div className={styles.reportCard}>
          <h2>Fluxo de Caixa Mensal</h2>
          <p className={styles.chartSubtitle}>Compare o total de rendas e despesas, mês a mês.</p>
          <div className={styles.chartContainer}>
            <MonthlyBarChart chartData={monthlyFlowData} />
          </div>
        </div>

        <div className={styles.reportCard}>
          <h2>Evolução do Patrimônio</h2>
          <p className={styles.chartSubtitle}>Veja o crescimento do seu saldo em comparação com o total de despesas.</p>
          <div className={styles.chartContainer}>
            <LineChart chartData={balanceAndExpenseData} />
          </div>
        </div>
      </div>

      {/* Análise por Categoria */}
      <div className={styles.catSearchSection}>
        <div className={styles.catSearchHeader}>
          <div>
            <h2>Análise por Categoria</h2>
            <p className={styles.chartSubtitle}>Selecione uma categoria para ver o total, a evolução mensal e todas as transações do período filtrado.</p>
          </div>
          <select
            className={styles.catSearchSelect}
            value={searchCategory}
            onChange={e => setSearchCategory(e.target.value)}
          >
            <option value="">— Escolha uma categoria —</option>
            {searchCategoryOptions.expense.length > 0 && (
              <optgroup label="Despesas">
                {searchCategoryOptions.expense.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            )}
            {searchCategoryOptions.income.length > 0 && (
              <optgroup label="Rendas">
                {searchCategoryOptions.income.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        {categorySearchData && (
          <>
            <div className={styles.catSearchKPIs}>
              <div className={styles.catSearchKPI}>
                <span className={styles.catSearchKPILabel}>Despesas</span>
                <span className={`${styles.catSearchKPIVal} ${styles.expense}`}>{formatCurrency(categorySearchData.totalExpense)}</span>
              </div>
              <div className={styles.catSearchKPI}>
                <span className={styles.catSearchKPILabel}>Rendas</span>
                <span className={`${styles.catSearchKPIVal} ${styles.income}`}>{formatCurrency(categorySearchData.totalIncome)}</span>
              </div>
              <div className={styles.catSearchKPI}>
                <span className={styles.catSearchKPILabel}>Transações</span>
                <span className={styles.catSearchKPIVal}>{categorySearchData.count}</span>
              </div>
              {categorySearchData.count > 0 && (
                <div className={styles.catSearchKPI}>
                  <span className={styles.catSearchKPILabel}>Ticket médio</span>
                  <span className={styles.catSearchKPIVal}>
                    {formatCurrency((categorySearchData.totalExpense + categorySearchData.totalIncome) / categorySearchData.count)}
                  </span>
                </div>
              )}
            </div>

            {categorySearchData.sortedMonths.length > 0 && (
              <div className={styles.catMonthChart}>
                <p className={styles.catMonthLabel}>Evolução mensal</p>
                <div className={styles.catMonthBars}>
                  {categorySearchData.sortedMonths.map(m => {
                    const d = categorySearchData.byMonth[m];
                    const expH = Math.round((d.expense / categorySearchData.maxMonthVal) * 100);
                    const incH = Math.round((d.income / categorySearchData.maxMonthVal) * 100);
                    return (
                      <div key={m} className={styles.catMonthCol}>
                        <div className={styles.catMonthBarGroup}>
                          {d.expense > 0 && (
                            <div className={styles.catMonthBarExp} style={{ height: `${expH}%` }} title={formatCurrency(d.expense)} />
                          )}
                          {d.income > 0 && (
                            <div className={styles.catMonthBarInc} style={{ height: `${incH}%` }} title={formatCurrency(d.income)} />
                          )}
                        </div>
                        <span className={styles.catMonthTick}>{m.slice(0, 5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={styles.catTxList}>
              <p className={styles.catMonthLabel}>Transações ({categorySearchData.count})</p>
              {categorySearchData.txs.length === 0 ? (
                <p className={styles.emptyMsg}>Nenhuma transação nesta categoria no período.</p>
              ) : (
                <table className={styles.catTxTable}>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Tags</th>
                      <th>Tipo</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorySearchData.txs.map((tx, i) => (
                      <tr key={i}>
                        <td className={styles.catTxDate}>
                          {tx.createdAt
                            ? new Date(tx.createdAt.toDate().toISOString().split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td className={styles.catTxDesc}>{tx.description || <em style={{ color: '#555' }}>—</em>}</td>
                        <td className={styles.catTxTags}>
                          {(tx.tags || []).map(t => (
                            <span key={t} className={styles.catTxTag}>#{t}</span>
                          ))}
                        </td>
                        <td>
                          <span className={tx.type === 'income' ? styles.income : styles.expense} style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                            {tx.type === 'income' ? 'Receita' : 'Despesa'}
                          </span>
                        </td>
                        <td className={`${styles.catTxVal} ${tx.type === 'income' ? styles.income : styles.expense}`}>
                          {tx.type === 'income' ? '+' : '−'} {formatCurrency(tx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {!categorySearchData && (
          <div className={styles.catSearchPlaceholder}>
            Selecione uma categoria acima para começar a análise.
          </div>
        )}
      </div>

      {isHelpOpen && (
        <HelpModal title="Relatórios" onClose={() => setIsHelpOpen(false)}>
          <p>
            A página de Relatórios permite que você visualize o histórico da sua saúde financeira ao longo do tempo. Use os gráficos para identificar padrões, tendências e áreas onde você pode melhorar seus gastos.
          </p>
          <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
            <li><strong>Fluxo de Caixa Mensal:</strong> Compare suas rendas e despesas a cada mês.</li>
            <li><strong>Evolução de Despesas por Categoria:</strong> Veja como seus gastos em uma categoria específica mudam com o tempo.</li>
            <li><strong>Evolução do Saldo:</strong> Acompanhe o crescimento do seu saldo total em comparação com as despesas acumuladas.</li>
          </ul>
        </HelpModal>
      )}
    </div>
  );
}

export default ReportsPage;