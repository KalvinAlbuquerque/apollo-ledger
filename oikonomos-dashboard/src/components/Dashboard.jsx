import React, { useState, useEffect, useMemo } from 'react';
import { auth, db } from '../../firebaseClient';
import { signOut } from 'firebase/auth';
import { collection, query, where, orderBy, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore'; 

// Componentes filhos
import SummaryChart from './SummaryChart';
import EditModal from './EditModal';
import CategoryManager from './CategoryManager';
import BudgetManager from './BudgetManager';
import BudgetStatus from './BudgetStatus';
import DebtManager from './DebtManager';
import GoalManager from './GoalManager';

// Estilos
import styles from './Dashboard.module.css';

function Dashboard({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [currentChartIndex, setCurrentChartIndex] = useState(0);  
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [tooltipText, setTooltipText] = useState('Filtre por um período ou categoria');

  // Função auxiliar para garantir que o filtro de data final inclua o dia inteiro
  const adjustEndDate = (dateStr) => {
    const date = new Date(dateStr);
    date.setUTCHours(23, 59, 59, 999); // Define para o final do dia em UTC
    return date;
  };

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Começa com a referência base para a coleção 'transactions'
      let baseQuery = collection(db, "transactions");

      // 2. Cria um array de "constraints" (filtros e ordenações) que será populado dinamicamente
      const constraints = [
        where("userId", "==", user.uid)
      ];

      // 3. Adiciona o filtro de categoria, se um for selecionado
      if (filterCategory && filterCategory !== 'all') {
        constraints.push(where("category", "==", filterCategory));
      }

      // 4. Adiciona os filtros de data, se as datas forem preenchidas
      if (filterStartDate) {
        constraints.push(where("createdAt", ">=", new Date(filterStartDate)));
      }
      if (filterEndDate) {
        constraints.push(where("createdAt", "<=", adjustEndDate(filterEndDate)));
      }
      
      // Adiciona a ordenação no final
      constraints.push(orderBy("createdAt", "desc"));
      
      // 5. Monta a query final com todas as constraints
      const finalQuery = query(baseQuery, ...constraints);
      
      // O resto da busca continua igual
      const transSnapshot = await getDocs(finalQuery);
      const transData = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(transData);

      // A busca de categorias não precisa mudar
      const catQuery = query(collection(db, "categories"), where("userId", "==", user.uid));
      const catSnapshot = await getDocs(catQuery);
      const catData = catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(catData);
      
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const budgetQuery = query(collection(db, "budgets"), where("userId", "==", user.uid), where("month", "==", currentMonth), where("year", "==", currentYear));
      const budgetSnapshot = await getDocs(budgetQuery);
      const budgetData = budgetSnapshot.docs.map(doc => doc.data());
      setBudgets(budgetData);

    } catch (error) {
      console.error("Erro ao buscar dados:", error);
      // Aqui é onde o erro do índice aparecerá!
      alert("Ocorreu um erro ao buscar os dados. Verifique o console para mais detalhes (F12). Pode ser necessário criar um índice no Firestore.");
    } finally {
      setLoading(false);
    }
  };



  const formatDate = (date) => date.toISOString().split('T')[0];

  const handleSetMonthlyFilter = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    setFilterStartDate(formatDate(firstDay));
    setFilterEndDate(formatDate(lastDay));
  };

  const handleSetWeeklyFilter = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Domingo, 1=Segunda, ...
    const firstDayOfWeek = new Date(today);
    // Ajusta para o início da semana (Segunda-feira)
    firstDayOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);

    setFilterStartDate(formatDate(firstDayOfWeek));
    setFilterEndDate(formatDate(lastDayOfWeek));
  };

  const handleSetYearlyFilter = () => {
    const year = new Date().getFullYear();
    const firstDay = new Date(year, 0, 1);
    const lastDay = new Date(year, 11, 31);
    setFilterStartDate(formatDate(firstDay));
    setFilterEndDate(formatDate(lastDay));
  };

  useEffect(() => { fetchData(); }, [user]);

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

    const expenseByCategory = {};
    expenses.forEach(tx => {
      expenseByCategory[tx.category] = (expenseByCategory[tx.category] || 0) + tx.amount;
    });

    const budgetProgress = budgets.map(budget => ({
      category: budget.categoryName,
      spent: expenseByCategory[budget.categoryName] || 0,
      budget: budget.amount,
    })).filter(b => b.budget > 0);
    
    return { totalIncome, totalExpense, balance, expenseChartData, incomeChartData, balanceChartData, budgetProgress };
  }, [transactions, budgets]);

  const charts = [
    { title: "Gastos por Categoria", data: summaryData.expenseChartData },
    { title: "Origem das Rendas", data: summaryData.incomeChartData },
    { title: "Rendas vs. Despesas", data: summaryData.balanceChartData }
  ];

  useEffect(() => {
    if (filterStartDate && filterEndDate) {
      const start = new Date(filterStartDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
      const end = new Date(filterEndDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
      setTooltipText(`Período selecionado: ${start} a ${end}`);
    } else {
      setTooltipText('Filtre por um período ou categoria');
    }
  }, [filterStartDate, filterEndDate]);
  const goToNextChart = () => setCurrentChartIndex(prev => (prev + 1) % charts.length);
  const goToPrevChart = () => setCurrentChartIndex(prev => (prev - 1 + charts.length) % charts.length);
  
  const handleLogout = () => signOut(auth);
  const handleDelete = async (transactionId) => {
    if (!window.confirm("Tem certeza?")) return;
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
      await updateDoc(doc(db, "transactions", editingTransaction.id), updatedData);
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
          <div><h1>Dashboard Oikonomos</h1><p>Olá, {user.email}</p></div>
          <button onClick={handleLogout} className={styles.logoutButton}>Sair</button>
        </header>

        <section className={styles.summary}>
          <div><h4>Total de Rendas</h4><p className={styles.incomeAmount}>R$ {summaryData.totalIncome.toFixed(2)}</p></div>
          <div><h4>Total de Despesas</h4><p className={styles.expenseAmount}>R$ {summaryData.totalExpense.toFixed(2)}</p></div>
          <div><h4>Saldo Atual</h4><p>R$ {summaryData.balance.toFixed(2)}</p></div>
        </section>

        <section className={styles.filterSection}>
          <div className={styles.filterGroup}>
            <label>De:</label>
            <input 
              type="date" 
              value={filterStartDate} 
              onChange={e => setFilterStartDate(e.target.value)} 
            />
          </div>
          <div className={styles.filterGroup}>
            <label>Até:</label>
            <input 
              type="date" 
              value={filterEndDate} 
              onChange={e => setFilterEndDate(e.target.value)} 
            />
          </div>

            <div className={styles.quickFilters}>
            <button onClick={handleSetWeeklyFilter}>Semanal</button>
            <button onClick={handleSetMonthlyFilter}>Mensal</button>
            <button onClick={handleSetYearlyFilter}>Anual</button>
            <span className={styles.tooltip} title={tooltipText}>?</span>
          </div>

          <div className={styles.filterGroup}>
            <label>Categoria:</label>
            <select 
              value={filterCategory} 
              onChange={e => setFilterCategory(e.target.value)}
            >
              <option value="all">Todas as Categorias</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>
          <button onClick={fetchData} className={styles.filterButton}>Filtrar</button>
        </section>
        <section className={styles.managerSection}><BudgetStatus budgetProgress={summaryData.budgetProgress} /></section>

        <main className={styles.mainContent}>
          <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
              <h3 className={styles.chartTitle}>{charts[currentChartIndex].title}</h3>
              <div className={styles.navButtons}><button onClick={goToPrevChart}>&lt;</button><button onClick={goToNextChart}>&gt;</button></div>
            </div>
            <SummaryChart chartData={charts[currentChartIndex].data} />
          </div>
          <div className={styles.transactionsContainer}>
            <h2>Suas Transações</h2>
            <table className={styles.table}>
              <thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor (R$)</th><th>Ações</th></tr></thead>
              <tbody>
                {transactions.length > 0 ? (
                  transactions.map(tx => (
                    <tr key={tx.id}>
                      <td>{tx.createdAt ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : '-'}</td>
                      <td>{tx.category}</td>
                      <td>{tx.description || '-'}</td>
                      <td className={tx.type === 'income' ? styles.incomeAmount : styles.expenseAmount}>{tx.type === 'income' ? '+ ' : '- '}R$ {tx.amount.toFixed(2)}</td>
                      <td>
                        <button onClick={() => handleOpenEditModal(tx)} className={styles.editButton}>Editar</button>
                        <button onClick={() => handleDelete(tx.id)} className={styles.deleteButton}>Excluir</button>
                      </td>
                    </tr>
                  ))
                ) : ( <tr><td colSpan="5">Nenhuma transação encontrada.</td></tr> )}
              </tbody>
            </table>
          </div>
        </main>
        
        <section className={styles.managerSection}>
            <DebtManager expenseCategories={categories.filter(c => c.type === 'expense')} />
        </section>
        <section className={styles.managerSection}>
           <GoalManager fetchData={fetchData} />        
        </section>
        <section className={styles.managerSection}><BudgetManager /></section>
        <section className={styles.managerSection}><CategoryManager /></section>
      </div>
      {isModalOpen && (<EditModal transaction={editingTransaction} onSave={handleSaveTransaction} onCancel={handleCloseModal} categories={categories} />)}
    </>
  );
}

export default Dashboard;