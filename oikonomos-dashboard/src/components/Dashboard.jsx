import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { auth, db } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, doc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import toast from 'react-hot-toast';

// Componentes Filhos
import SummaryChart from './SummaryChart';
import EditModal from './EditModal';
import AddTransactionModal from './AddTransactionModal';
import ExpenseRank from './ExpenseRank';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
import CategoryFilter from './CategoryFilter';
import AccountFilter from './AccountFilter';
import HelpModal from './HelpModal';
// Estilos
import styles from './Dashboard.module.css';

const formatDate = (date) => date.toISOString().split('T')[0];

function Dashboard({ user, userProfile }) {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  const [accountView, setAccountView] = useState('geral');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isAddTransactionModalOpen, setIsAddTransactionModalOpen] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState(formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [filterEndDate, setFilterEndDate] = useState(formatDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)));
  const [filterCategories, setFilterCategories] = useState(new Set());
  const [currentChartIndex, setCurrentChartIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState(new Set());
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const scrollPositionRef = useRef(0);

  const triggerRefresh = () => {
    scrollPositionRef.current = window.scrollY;
    setDataVersion(currentVersion => currentVersion + 1);
  };

  const adjustEndDate = (dateStr) => {
    const date = new Date(dateStr);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const catQuery = query(collection(db, "categories"), where("userId", "==", user.uid));
        const accQuery = query(collection(db, "accounts"), where("userId", "==", user.uid));
        const allTransQuery = query(collection(db, "transactions"), where("userId", "==", user.uid));

        const [catSnapshot, accSnapshot, allTransSnapshot] = await Promise.all([
          getDocs(catQuery), getDocs(accQuery), getDocs(allTransQuery)
        ]);

        const catData = catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const accData = accSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const allTransactions = allTransSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        accData.forEach(acc => {
          acc.balance = allTransactions
            .filter(tx => tx.accountId === acc.id)
            .reduce((bal, tx) => bal + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
        });
        setCategories(catData);
        setAccounts(accData);

        const constraints = [where("userId", "==", user.uid)];
        if (filterCategories.size > 0) {
          constraints.push(where("category", "in", Array.from(filterCategories)));
        }
        if (filterStartDate) {
          constraints.push(where("createdAt", ">=", new Date(filterStartDate)));
        }
        if (filterEndDate) {
          constraints.push(where("createdAt", "<=", adjustEndDate(filterEndDate)));
        }

        const finalQuery = query(collection(db, "transactions"), ...constraints, orderBy("createdAt", "desc"));
        const transSnapshot = await getDocs(finalQuery);
        const transData = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTransactions(transData);

      } catch (error) {
        console.error("Erro ao buscar dados:", error);
        toast.error("Erro ao buscar dados.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, dataVersion, filterStartDate, filterEndDate, filterCategories]);

  const summaryData = useMemo(() => {
    const relevantTransactions = transactions.filter(tx => {
      if (accountView === 'total') return true;
      if (accountView === 'geral') {
        const nonReserveAccountIds = new Set(accounts.filter(acc => !acc.isReserve).map(acc => acc.id));
        return nonReserveAccountIds.has(tx.accountId);
      }
      return tx.accountId === accountView;
    });

    const income = relevantTransactions.filter(tx => tx.type === 'income');
    const expenses = relevantTransactions.filter(tx => tx.type === 'expense' || !tx.type);

    const totalIncome = income.reduce((acc, tx) => acc + tx.amount, 0);
    const totalExpense = expenses.reduce((acc, tx) => acc + tx.amount, 0);

    const totalBalance = accounts
      .filter(acc => {
        if (accountView === 'total') return true;
        if (accountView === 'geral') return !acc.isReserve;
        return acc.id === accountView;
      })
      .reduce((sum, acc) => sum + acc.balance, 0);

    const processDataForChart = (data, label) => {
      const categoryTotals = data.reduce((acc, tx) => {
        acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
        return acc;
      }, {});
      return {
        labels: Object.keys(categoryTotals),
        datasets: [{
          label, data: Object.values(categoryTotals),
          backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
          borderColor: '#1E1E1E', borderWidth: 2,
        }],
      };
    };

    const expenseChartData = processDataForChart(expenses, 'Gastos R$');
    const incomeChartData = processDataForChart(income, 'Rendas R$');

    const topExpenseCategories = Object.entries(expenses.reduce((acc, tx) => {
      acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
      return acc;
    }, {})).map(([category, totalAmount]) => ({ category, totalAmount }))
      .sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10);

    return { totalIncome, totalExpense, totalBalance, expenseChartData, incomeChartData, topExpenseCategories, relevantTransactions };
  }, [transactions, accounts, accountView]);

  const charts = [
    { title: "Gastos por Categoria", data: summaryData.expenseChartData },
    { title: "Origem das Rendas", data: summaryData.incomeChartData },
  ];

  const itemsPerPage = 15;
  const currentTransactions = transactions.slice(currentPage * itemsPerPage - itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  // ✅ FUNÇÕES DE AÇÃO RESTAURADAS AQUI
  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setSelectedTransactions(new Set());
    }
    setIsSelectionMode(!isSelectionMode);
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
    const deleteAction = async () => {
      const batch = writeBatch(db);
      selectedTransactions.forEach(transactionId => {
        batch.delete(doc(db, "transactions", transactionId));
      });
      try {
        await batch.commit();
        toast.success(`${selectedTransactions.size} transação(ões) excluída(s)!`);
        toggleSelectionMode(); // Sai do modo de seleção
        triggerRefresh();
      } catch (error) {
        toast.error("Falha ao excluir as transações.");
      }
    };
    showConfirmationToast(deleteAction, `Excluir ${selectedTransactions.size} transação(ões)?`);
  };

  const handleSelectAllOnPage = (e) => {
    const isChecked = e.target.checked;
    const newSelection = new Set(selectedTransactions);
    const idsOnCurrentPage = currentTransactions.map(tx => tx.id);
    if (isChecked) idsOnCurrentPage.forEach(id => newSelection.add(id));
    else idsOnCurrentPage.forEach(id => newSelection.delete(id));
    setSelectedTransactions(newSelection);
  };

  const handleRowSelect = (transactionId) => {
    const newSelection = new Set(selectedTransactions);
    if (newSelection.has(transactionId)) newSelection.delete(transactionId);
    else newSelection.add(transactionId);
    setSelectedTransactions(newSelection);
  };

  const goToNextChart = () => setCurrentChartIndex(prev => (prev + 1) % charts.length);
  const handleLogout = () => auth.signOut();
  const handleOpenAddTransactionModal = () => setIsAddTransactionModalOpen(true);
  const setFilterDateRange = (start, end) => { setFilterStartDate(formatDate(start)); setFilterEndDate(formatDate(end)); };
  const handleSetMonthlyFilter = () => { const t = new Date(); setFilterDateRange(new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0)); };
  const handleSetWeeklyFilter = () => { const t = new Date(); const first = t.getDate() - t.getDay() + (t.getDay() === 0 ? -6 : 1); const firstDate = new Date(new Date().setDate(first)); const lastDate = new Date(new Date().setDate(first + 6)); setFilterDateRange(firstDate, lastDate); };
  const handleSetTodayFilter = () => setFilterDateRange(new Date(), new Date());
  const handleSetYearlyFilter = () => { const t = new Date(); setFilterDateRange(new Date(t.getFullYear(), 0, 1), new Date(t.getFullYear(), 11, 31)); };
  const handleOpenEditModal = (transaction) => { setEditingTransaction(transaction); setIsModalOpen(true); };
  const handleSaveTransaction = async (updatedData) => { if (!editingTransaction) return; await updateDoc(doc(db, "transactions", editingTransaction.id), updatedData); setIsModalOpen(false); setEditingTransaction(null); triggerRefresh(); toast.success("Transação atualizada!"); };

  if (loading) return <div>Carregando suas finanças...</div>;

  return (
    <>
      <div className={styles.dashboard}>
        <header className={styles.header}>
          {/* Adicione a className 'titleContainer' a este div */}
          <div className={styles.titleContainer}>
            <h1>
              Dashboard Apollo
              <button onClick={() => setIsHelpOpen(true)} className={styles.helpButton}>?</button>
            </h1>
            <p className={styles.greeting}>
              Olá, {userProfile?.apelido || user.displayName || user.email}
            </p>
          </div>
          <div className={styles.headerActions}>
            <AccountFilter accounts={accounts} currentSelection={accountView} onSelectionChange={setAccountView} />
            <button onClick={handleLogout} className={styles.logoutButton}>Sair</button>
          </div>
        </header>

        <section className={styles.summary}>
          <div><h4>Rendas no Período</h4><p className={styles.incomeAmount}>R$ {summaryData.totalIncome.toFixed(2)}</p></div>
          <div><h4>Despesas no Período</h4><p className={styles.expenseAmount}>R$ {summaryData.totalExpense.toFixed(2)}</p></div>
          <div><h4>Saldo Atual em Contas</h4><p className={summaryData.totalBalance >= 0 ? styles.incomeAmount : styles.expenseAmount}>R$ {summaryData.totalBalance.toFixed(2)}</p></div>
        </section>

        <section className={styles.controlsSection}>
          <div className={styles.filterContainer}>
            <button onClick={() => setIsFilterVisible(!isFilterVisible)} className={styles.controlButton}>Filtros & Opções</button>
            {isFilterVisible && (
              <div className={styles.filterDropdown}>
                <div className={styles.dateFilters}>
                  <div className={styles.filterGroup}><label>De:</label><input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} /></div>
                  <div className={styles.filterGroup}><label>Até:</label><input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} /></div>
                </div>
                <div className={styles.quickFilters}>
                  <button onClick={handleSetTodayFilter}>Hoje</button>
                  <button onClick={handleSetWeeklyFilter}>Semana</button>
                  <button onClick={handleSetMonthlyFilter}>Mês</button>
                  <button onClick={handleSetYearlyFilter}>Ano</button>
                </div>
                <div className={styles.categoryFilterSection}>
                  <label>Filtrar por Categoria:</label>
                  <CategoryFilter allCategories={categories} selectedCategories={filterCategories} onSelectionChange={setFilterCategories} />
                </div>
                <button onClick={() => setIsFilterVisible(false)} className={styles.filterButton}>Aplicar</button>
              </div>
            )}
          </div>
          <button onClick={handleOpenAddTransactionModal} className={styles.primaryActionButton}>+ Adicionar Transação</button>
        </section>

        <main className={styles.mainContent}>
          <div className={styles.chartsContainer}>
            <div className={styles.chartWrapper}>
              <div className={styles.chartHeader}>
                <h3 className={styles.chartTitle}>{charts[currentChartIndex]?.title}</h3>
                <div className={styles.navButtons}>
                  <button onClick={goToNextChart}>&gt;</button>
                </div>
              </div>
              <div className={styles.chartCanvasContainer}>
                <SummaryChart chartData={charts[currentChartIndex]?.data} />
              </div>
            </div>
            <ExpenseRank data={summaryData.topExpenseCategories} />
          </div>

          <div className={styles.transactionsContainer}>
            <div className={styles.transactionsHeader}>
              <h2>Transações do Período</h2>
              {isSelectionMode ? (
                <div className={styles.selectionActions}>
                  <span>{selectedTransactions.size} selecionada(s)</span>
                  <button onClick={handleDeleteSelected} className={styles.deleteSelectedButton}>Excluir</button>
                  <button onClick={toggleSelectionMode} className={styles.cancelSelectionButton}>Cancelar</button>
                </div>
              ) : (
                <button onClick={toggleSelectionMode} className={styles.selectButton}>Selecionar Vários</button>
              )}
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  {isSelectionMode && (<th className={styles.checkboxCell}><input type="checkbox" onChange={handleSelectAllOnPage} checked={currentTransactions.length > 0 && currentTransactions.every(tx => selectedTransactions.has(tx.id))} /></th>)}
                  <th>Data</th><th>Categoria</th><th>Descrição</th><th>Conta</th><th>Valor (R$)</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {currentTransactions.length > 0 ? (
                  currentTransactions.map(tx => {
                    const isSelected = selectedTransactions.has(tx.id);
                    return (
                      <tr key={tx.id} className={isSelected ? styles.selectedRow : ''}>
                        {isSelectionMode && (<td className={styles.checkboxCell}><input type="checkbox" checked={isSelected} onChange={() => handleRowSelect(tx.id)} /></td>)}
                        <td data-label="Data">{tx.createdAt ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : '-'}</td>
                        <td data-label="Categoria">{tx.category}</td>
                        <td data-label="Descrição">{tx.description || '-'}</td>
                        <td data-label="Conta">{accounts.find(acc => acc.id === tx.accountId)?.accountName || 'N/A'}</td>
                        <td data-label="Valor (R$)" className={tx.type === 'income' ? styles.incomeAmount : styles.expenseAmount}>{tx.type === 'income' ? '+ ' : '- '}R$ {tx.amount.toFixed(2)}</td>
                        <td data-label="Ações">
                          <button onClick={() => handleOpenEditModal(tx)} className={styles.editButton}>Editar</button>
                          <button onClick={() => handleDelete(tx.id)} className={styles.deleteButton}>Excluir</button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr><td colSpan={isSelectionMode ? 7 : 6}>Nenhuma transação para os filtros selecionados.</td></tr>
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1}>Anterior</button>
                <span>Página {currentPage} de {totalPages}</span>
                <button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages}>Próxima</button>
              </div>
            )}
          </div>
        </main>
      </div>
      {isModalOpen && (<EditModal transaction={editingTransaction} onSave={handleSaveTransaction} onCancel={() => setIsModalOpen(false)} categories={categories} />)}
      {isAddTransactionModalOpen && (<AddTransactionModal onCancel={() => setIsAddTransactionModalOpen(false)} onSave={() => { setIsAddTransactionModalOpen(false); triggerRefresh(); }} categories={categories} accounts={accounts} />)}
      {isHelpOpen && (
        <HelpModal title="Dashboard" onClose={() => setIsHelpOpen(false)}>
          <p>O Dashboard é o ponto de partida ideal. Siga estes passos para começar a usá-lo:</p>
          <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
            <li>
              <strong>Passo 1: Entenda sua Situação Atual.</strong> Veja nos cartões do topo o resumo das suas finanças no período selecionado, incluindo rendas, despesas e seu saldo atual.
            </li>
            <li>
              <strong>Passo 2: Explore com os Filtros.</strong> Use a seção "Filtros & Opções" para mudar a visualização para o dia, semana, mês ou um período personalizado.
            </li>
            <li>
              <strong>Passo 3: Adicione Transações.</strong> Clique em "+ Adicionar Transação" para registrar novos gastos, rendas ou transferências.
            </li>
            <li>
              <strong>Passo 4: Analise os Gráficos.</strong> Use os gráficos de pizza para ver para onde seu dinheiro está indo e quais são suas maiores fontes de renda.
            </li>
            <li>
              <strong>Passo 5: Gerencie a Tabela.</strong> Edite ou exclua transações individuais, ou use o botão "Selecionar Vários" para fazer alterações em massa.
            </li>
          </ul>
        </HelpModal>
      )}

    </>
  );
}

export default Dashboard;