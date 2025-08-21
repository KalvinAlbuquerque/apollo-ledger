import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'; // Importa o useLayoutEffect
import { Link } from 'react-router-dom';
import { auth, db } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, doc, deleteDoc, updateDoc, writeBatch, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

// Componentes Filhos
import SummaryChart from './SummaryChart';
import LineChart from './LineChart';
import DailyBarChart from './DailyBarChart';
import EditModal from './EditModal';
import CategoryManager from './CategoryManager';
import BudgetManager from './BudgetManager';
import BudgetStatus from './BudgetStatus';
import DebtManager from './DebtManager';
import GoalManager from './GoalManager';
import AccountManager from './AccountManager';
import AddTransactionModal from './AddTransactionModal';
import { showConfirmationToast } from '../utils/toastUtils.jsx';

import CategoryFilter from './CategoryFilter';
// Estilos
import styles from './Dashboard.module.css';

// --- FUNÇÕES AUXILIARES DE DATA ---
const formatDate = (date) => date.toISOString().split('T')[0];
const today = new Date();
const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
// ------------------------------------

function Dashboard({ user }) {
  // --- 1. ESTADOS (TODOS JUNTOS NO TOPO) ---
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  const [accountView, setAccountView] = useState('geral');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isAddTransactionModalOpen, setIsAddTransactionModalOpen] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState(formatDate(firstDayOfMonth));
  const [filterEndDate, setFilterEndDate] = useState(formatDate(lastDayOfMonth));
  const [filterCategory, setFilterCategory] = useState('all');
  const [tooltipText, setTooltipText] = useState('Filtre por um período ou categoria');
  const [currentChartIndex, setCurrentChartIndex] = useState(0);
  const [lineChartVisibility, setLineChartVisibility] = useState({ Saldo: true, Despesas: true });
  const [currentPage, setCurrentPage] = useState(1);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState(new Set());
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [selectedExpenseCategories, setSelectedExpenseCategories] = useState(new Set());

  const scrollPositionRef = useRef(0);
  // --- 2. LÓGICA DE PAGINAÇÃO ---
  const itemsPerPage = 15;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentTransactions = transactions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  const triggerRefresh = () => {
    scrollPositionRef.current = window.scrollY;
    setDataVersion(currentVersion => currentVersion + 1);
  };

  const adjustEndDate = (dateStr) => {
    const date = new Date(dateStr);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  };


  const toggleSelectionMode = () => {
    // Ao sair do modo de seleção, limpa a lista de selecionados
    if (isSelectionMode) {
      setSelectedTransactions(new Set());
    }
    setIsSelectionMode(!isSelectionMode);
  };



  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // --- BUSCA DE DADOS FILTRADOS (para a tabela principal) ---
      let baseQuery = collection(db, "transactions");
      const constraints = [where("userId", "==", user.uid)];
      if (filterCategory && filterCategory !== 'all') { constraints.push(where("category", "==", filterCategory)); }
      if (filterStartDate) { constraints.push(where("createdAt", ">=", new Date(filterStartDate))); }
      if (filterEndDate) { constraints.push(where("createdAt", "<=", adjustEndDate(filterEndDate))); }
      constraints.push(orderBy("createdAt", "desc"));

      const finalQuery = query(baseQuery, ...constraints);
      const transSnapshot = await getDocs(finalQuery);
      const transData = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(transData);

      // --- BUSCAS ADICIONAIS (Categorias, Orçamentos) ---
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

      // --- LÓGICA CORRIGIDA PARA BUSCAR CONTAS E CALCULAR SALDOS ---
      const accQuery = query(collection(db, "accounts"), where("userId", "==", user.uid));
      const accSnapshot = await getDocs(accQuery);
      let accData = accSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Busca TODAS as transações (sem filtros) para calcular os saldos corretamente
      const allTransQuery = query(collection(db, "transactions"), where("userId", "==", user.uid));
      const allTransSnapshot = await getDocs(allTransQuery);
      const allTransactions = allTransSnapshot.docs.map(doc => doc.data());

      // Zera o saldo de todas as contas antes de recalcular
      accData.forEach(acc => acc.balance = 0);

      // Itera sobre as transações para somar/subtrair dos saldos
      allTransactions.forEach(tx => {
        const account = accData.find(acc => acc.id === tx.accountId);
        if (account) {
          if (tx.type === 'income') {
            account.balance += tx.amount;
          } else { // 'expense'
            account.balance -= tx.amount;
          }
        }
      });

      setAccounts(accData); // Salva as contas com os saldos calculados

    } catch (error) {
      console.error("Erro ao buscar dados:", error);
      toast.error("Erro ao buscar dados. Pode ser necessário criar um índice no Firestore.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, dataVersion, filterStartDate, filterEndDate, filterCategory]);

  useEffect(() => {
    // Agora seleciona todas as categorias por padrão
    const allCategoryNames = categories.map(cat => cat.name);
    setSelectedExpenseCategories(new Set(allCategoryNames));
  }, [categories]);


  useEffect(() => {
    if (filterStartDate && filterEndDate) {
      const start = new Date(filterStartDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      const end = new Date(filterEndDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      setTooltipText(`Período: ${start} a ${end}`);
    } else {
      setTooltipText('Filtre por período ou categoria');
    }
  }, [filterStartDate, filterEndDate]);

  const summaryData = useMemo(() => {

    const filteredTransactions = transactions.filter(tx => {
      if (accountView === 'total') return true; // Mostra tudo
      if (accountView === 'geral') {
        const nonReserveAccountIds = new Set(accounts.filter(acc => !acc.isReserve).map(acc => acc.id));
        return nonReserveAccountIds.has(tx.accountId);
      }
      // Filtra por uma conta específica
      return tx.accountId === accountView;
    });


    const income = filteredTransactions.filter(tx => tx.type === 'income');
    const expenses = transactions.filter(tx =>
      (tx.type === 'expense' || !tx.type) && selectedExpenseCategories.has(tx.category) // ADICIONE ESTA CONDIÇÃO
    ); const totalIncome = income.reduce((acc, tx) => acc + tx.amount, 0);
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
          backgroundColor: [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
            '#E7E9ED', '#8DDF3C', '#F45B5B', '#7798BF', '#24CBE5', '#64E572',
            '#FFC233', '#50B432', '#ED561B', '#DDDF00', '#24CBE5', '#64E572',
            '#FF9655', '#FFF263', '#6AF9C4', '#2b908f', '#f45b5b', '#91e8e1',
            '#f7a35c', '#8085e9', '#f15c80', '#e4d354', '#2ec4b6', '#011627'
          ],
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

    const existingExpenseCategoryNames = new Set(categories.filter(c => c.type === 'expense').map(c => c.name));
    const budgetProgress = budgets
      .filter(budget => existingExpenseCategoryNames.has(budget.categoryName)) // Filtra os "fantasmas"
      .map(budget => ({
        category: budget.categoryName,
        spent: expenseByCategory[budget.categoryName] || 0,
        budget: budget.amount,
      }))
      .filter(b => b.budget > 0);

    // --- LÓGICA DO GRÁFICO INTELIGENTE (LINHA/BARRAS) REVISADA ---
    let isSingleDayView = filterStartDate && filterEndDate && filterStartDate === filterEndDate;
    let lineChartData = { labels: [], datasets: [] };
    let singleDayChartData = { labels: [], datasets: [] };

    if (transactions.length > 0) {
      if (isSingleDayView) {
        // Prepara os dados para o GRÁFICO DE BARRAS
        singleDayChartData = {
          labels: ['Rendas', 'Despesas'],
          datasets: [{
            label: `Balanço para ${new Date(filterStartDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`,
            data: [totalIncome, totalExpense],
            backgroundColor: ['#50E3C2', '#FF1D58'],
          }],
        };
      } else {
        // Prepara os dados para o GRÁFICO DE LINHA
        const sortedTransactions = [...transactions].sort((a, b) => a.createdAt.toDate() - b.createdAt.toDate());
        const dailyData = new Map();
        sortedTransactions.forEach(tx => {
          const dateKey = tx.createdAt.toDate().toLocaleDateString('pt-BR');
          if (!dailyData.has(dateKey)) { dailyData.set(dateKey, { income: 0, expense: 0 }); }
          const current = dailyData.get(dateKey);
          if (tx.type === 'income') { current.income += tx.amount; }
          else { current.expense += tx.amount; }
        });
        let runningBalance = 0;
        const labels = [];
        const balanceDataPoints = [];
        const expenseDataPoints = [];
        dailyData.forEach((value, date) => {
          labels.push(date);
          runningBalance += value.income - value.expense;
          balanceDataPoints.push(runningBalance);
          expenseDataPoints.push(value.expense);
        });
        lineChartData.labels = labels;
        lineChartData.datasets = [
          { label: 'Saldo', data: balanceDataPoints, borderColor: 'rgb(74, 144, 226)', backgroundColor: 'rgba(74, 144, 226, 0.5)' },
          { label: 'Despesas', data: expenseDataPoints, borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.5)' }
        ];
      }
    }

    return { totalIncome, totalExpense, balance, expenseChartData, incomeChartData, balanceChartData, budgetProgress, lineChartData, singleDayChartData, isSingleDayView };
  }, [transactions, budgets, filterStartDate, filterEndDate, accounts, accountView, selectedExpenseCategories]); // ADICIONE AQUI

  const charts = [
    { title: "Gastos por Categoria", data: summaryData.expenseChartData },
    { title: "Origem das Rendas", data: summaryData.incomeChartData },
    { title: "Rendas vs. Despesas", data: summaryData.balanceChartData }
  ];

  const currentMonthIncome = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    return transactions
      .filter(tx => {
        const txDate = tx.createdAt.toDate();
        return tx.type === 'income' &&
          txDate.getMonth() === currentMonth &&
          txDate.getFullYear() === currentYear;
      })
      .reduce((acc, tx) => acc + tx.amount, 0);
  }, [transactions]);
  const goToNextChart = () => setCurrentChartIndex(prev => (prev + 1) % charts.length);
  const goToPrevChart = () => setCurrentChartIndex(prev => (prev - 1 + charts.length) % charts.length);

  const handleLogout = () => signOut(auth);
  const handleOpenAddTransactionModal = () => {
    setIsAddTransactionModalOpen(true);
  };
  const handleCloseAddTransactionModal = () => {
    setIsAddTransactionModalOpen(false);
  };
  const handleSelectAllOnPage = (e) => {
    const isChecked = e.target.checked;
    const newSelection = new Set(selectedTransactions);

    // Pega os IDs apenas dos itens na página atual
    const idsOnCurrentPage = currentTransactions.map(tx => tx.id);

    if (isChecked) {
      // Adiciona todos os IDs da página atual à seleção
      idsOnCurrentPage.forEach(id => newSelection.add(id));
    } else {
      // Remove todos os IDs da página atual da seleção
      idsOnCurrentPage.forEach(id => newSelection.delete(id));
    }

    setSelectedTransactions(newSelection);
  };

  const handleRowSelect = (transactionId) => {
    // Cria uma cópia do Set para o React detectar a mudança
    const newSelection = new Set(selectedTransactions);
    if (newSelection.has(transactionId)) {
      newSelection.delete(transactionId); // Se já estiver selecionado, desmarca
    } else {
      newSelection.add(transactionId); // Se não, marca
    }
    setSelectedTransactions(newSelection);
  };

  const handleSetMonthlyFilter = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    setFilterStartDate(formatDate(firstDay));
    setFilterEndDate(formatDate(lastDay));
  };
  const handleSetWeeklyFilter = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const firstDayOfWeek = new Date(today);
    firstDayOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
    setFilterStartDate(formatDate(firstDayOfWeek));
    setFilterEndDate(formatDate(lastDayOfWeek));
  };

  const handleSetTodayFilter = () => {
    const today = new Date();
    const formattedToday = formatDate(today); // Usamos a função que já existe!
    setFilterStartDate(formattedToday);
    setFilterEndDate(formattedToday);
  };

  const handleSetYearlyFilter = () => {
    const year = new Date().getFullYear();
    const firstDay = new Date(year, 0, 1);
    const lastDay = new Date(year, 11, 31);
    setFilterStartDate(formatDate(firstDay));
    setFilterEndDate(formatDate(lastDay));
  };


  const handleDelete = (transactionId) => {
    const deleteAction = async () => {
      try {
        await deleteDoc(doc(db, "transactions", transactionId));
        triggerRefresh();
        toast.success("Transação excluída!");
      } catch (error) {
        toast.error("Falha ao excluir.");
      }
    };
    showConfirmationToast(deleteAction, "Excluir esta transação?");
  };

  const handleDeleteSelected = () => {
    // Ação que será executada se o usuário confirmar
    const deleteAction = async () => {
      // Cria um "lote" de escrita no Firebase
      const batch = writeBatch(db);

      // Adiciona cada ordem de exclusão ao lote
      selectedTransactions.forEach(transactionId => {
        const docRef = doc(db, "transactions", transactionId);
        batch.delete(docRef);
      });

      try {
        await batch.commit(); // Envia o lote para o Firebase
        toast.success(`${selectedTransactions.size} transação(ões) excluída(s)!`);
        toggleSelectionMode(); // Sai do modo de seleção
        triggerRefresh(); // Atualiza os dados do dashboard
      } catch (error) {
        console.error("Erro ao excluir transações em massa:", error);
        toast.error("Falha ao excluir as transações selecionadas.");
      }
    };

    // Mostra a nossa notificação de confirmação
    showConfirmationToast(deleteAction, `Excluir ${selectedTransactions.size} transação(ões) permanentemente?`);
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
      triggerRefresh();
      toast.success("Transação atualizada!");
    } catch (error) {
      toast.error("Falha ao salvar.");
    }
  };

  // --- SUBSTITUIÇÃO DO useEffect PELO useLayoutEffect ---
  useLayoutEffect(() => {
    if (scrollPositionRef.current > 0) {
      window.scrollTo(0, scrollPositionRef.current);
    }
  }, [transactions]); // A dependência continua a mesma

  if (loading) return <div>Carregando suas finanças...</div>;

  return (
    <>
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div><h1>Dashboard Oikonomos</h1><p>Olá, {user.email}</p></div>

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

          <div className={styles.headerActions}>
            {/* <<< BOTÃO DE TRANSFERÊNCIA AGORA CHAMA A NOVA FUNÇÃO */}
            <button onClick={handleOpenAddTransactionModal} className={styles.primaryActionButton}>+ Adicionar Transação</button>
            <Link to="/reports" className={styles.headerButton}>Ver Relatórios</Link>
             <Link to="/forecast" className={styles.headerButton}>Previsões</Link> 
            <button onClick={handleLogout} className={styles.logoutButton}>Sair</button>
          </div>
        </header>

        <section className={styles.filterSection}>
          <div className={styles.filterGroup}><label>De:</label><input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} /></div>
          <div className={styles.filterGroup}><label>Até:</label><input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} /></div>
          <div className={styles.quickFilters}>
            <button onClick={handleSetTodayFilter}>Hoje</button>
            <button onClick={handleSetWeeklyFilter}>Semanal</button>
            <button onClick={handleSetMonthlyFilter}>Mensal</button>
            <button onClick={handleSetYearlyFilter}>Anual</button>
            <span className={styles.tooltip} title={tooltipText}>?</span>
          </div>
          <div className={styles.filterGroup}>
            <label>Categoria:</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} >
              <option value="all">Todas as Categorias</option>
              {categories.map(cat => (<option key={cat.id} value={cat.name}>{cat.name}</option>))}
            </select>
          </div>
          <button onClick={fetchData} className={styles.filterButton}>Filtrar</button>
        </section>

        <section className={styles.summary}>
          <div><h4>Total de Rendas</h4><p className={styles.incomeAmount}>R$ {summaryData.totalIncome.toFixed(2)}</p></div>
          <div><h4>Total de Despesas</h4><p className={styles.expenseAmount}>R$ {summaryData.totalExpense.toFixed(2)}</p></div>
          <div><h4>Saldo Atual</h4><p>R$ {summaryData.balance.toFixed(2)}</p></div>
        </section>

        <section className={`${styles.managerSection} ${styles.budgetStatusSection}`}>
          <BudgetStatus budgetProgress={summaryData.budgetProgress} />
        </section>
        <main className={styles.mainContent}>
          <div className={styles.chartsContainer}>
            {/* Este é o único gráfico que ficará no Dashboard */}
            <div className={`${styles.chartWrapper} ${styles.doughnutChartWrapper}`}>
              <div className={styles.chartHeader}>
                <h3 className={styles.chartTitle}>{charts[currentChartIndex].title}</h3>

                <div className={styles.chartActions}>
                  <button onClick={() => setIsCategoryFilterOpen(prev => !prev)} className={styles.filterButton}>
                    Filtrar Categorias
                  </button>
                  {isCategoryFilterOpen && (
                    <CategoryFilter
                      allCategories={categories} // Passe a lista completa de objetos
                      selectedCategories={selectedExpenseCategories}
                      onSelectionChange={setSelectedExpenseCategories}
                    />
                  )}
                </div>

                <div className={styles.navButtons}>
                  <button onClick={goToPrevChart}>&lt;</button>
                  <button onClick={goToNextChart}>&gt;</button>
                </div>
              </div>
              <div className={styles.chartCanvasContainer}>
                <SummaryChart chartData={charts[currentChartIndex].data} />
              </div>
            </div>
          </div>

          <div className={styles.transactionsContainer}>
            <div className={styles.transactionsHeader}>
              <h2>Suas Transações</h2>
              {isSelectionMode ? (
                <div className={styles.selectionActions}>
                  <span>{selectedTransactions.size} selecionada(s)</span>
                  <button onClick={handleDeleteSelected} className={styles.deleteSelectedButton}>Excluir Selecionados</button>
                  <button onClick={toggleSelectionMode} className={styles.cancelSelectionButton}>Cancelar</button>
                </div>
              ) : (
                <button onClick={toggleSelectionMode} className={styles.selectButton}>
                  Selecionar Vários
                </button>
              )}
            </div>
            <table className={styles.table}>
              {/* O conteúdo da sua tabela de transações continua o mesmo aqui... */}
              <thead>
                <tr>
                  {isSelectionMode && (
                    <th className={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        onChange={handleSelectAllOnPage}
                        checked={currentTransactions.length > 0 && currentTransactions.every(tx => selectedTransactions.has(tx.id))}
                      />
                    </th>
                  )}
                  <th>Data</th>
                  <th>Categoria</th>
                  <th>Descrição</th>
                  <th>Conta</th>
                  <th>Valor (R$)</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {currentTransactions.length > 0 ? (
                  currentTransactions.map(tx => {
                    const isSelected = selectedTransactions.has(tx.id);
                    const accountName = accounts.find(acc => acc.id === tx.accountId)?.accountName || 'N/A';
                    return (
                      <tr key={tx.id} className={isSelected ? styles.selectedRow : ''}>
                        {isSelectionMode && (
                          <td className={styles.checkboxCell} onClick={() => handleRowSelect(tx.id)}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                            />
                          </td>
                        )}
                        <td data-label="Data">{tx.createdAt ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : '-'}</td>
                        <td data-label="Categoria">{tx.category}</td>
                        <td data-label="Descrição">{tx.description || '-'}</td>
                        <td data-label="Conta">{accountName}</td>
                        <td data-label="Valor (R$)" className={tx.type === 'income' ? styles.incomeAmount : styles.expenseAmount}>{tx.type === 'income' ? '+ ' : '- '}R$ {tx.amount.toFixed(2)}</td>
                        <td data-label="Ações">
                          <button onClick={() => handleOpenEditModal(tx)} className={styles.editButton}>Editar</button>
                          <button onClick={() => handleDelete(tx.id)} className={styles.deleteButton}>Excluir</button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr><td colSpan={isSelectionMode ? 7 : 6}>Nenhuma transação encontrada.</td></tr>
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1}>
                  Anterior
                </button>
                <span>
                  Página {currentPage} de {totalPages}
                </span>
                <button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages}>
                  Próxima
                </button>
              </div>
            )}
          </div>
        </main>

        <section className={styles.managerSection}>
          <DebtManager
            expenseCategories={categories.filter(c => c.type === 'expense')}
            accounts={accounts}
            onDataChanged={triggerRefresh}
          />
        </section>


        <section className={styles.managerSection}>
          <GoalManager onDataChanged={triggerRefresh} accounts={accounts} />
        </section>
        <section className={styles.managerSection}>
          <AccountManager onDataChanged={triggerRefresh} accounts={accounts} />
        </section>
        <section className={styles.managerSection}>
          <BudgetManager onDataChanged={triggerRefresh} totalMonthIncome={currentMonthIncome} />
        </section>
        <section className={styles.managerSection}>
          <CategoryManager onDataChanged={triggerRefresh} />
        </section>
      </div>
      {isModalOpen && (<EditModal transaction={editingTransaction} onSave={handleSaveTransaction} onCancel={handleCloseModal} categories={categories} />)}
      {isAddTransactionModalOpen && (
        <AddTransactionModal
          onCancel={handleCloseAddTransactionModal}
          onSave={() => {
            handleCloseAddTransactionModal();
            triggerRefresh();
          }}
          categories={categories}
          accounts={accounts}
        />
      )}
    </>
  );
}

export default Dashboard;