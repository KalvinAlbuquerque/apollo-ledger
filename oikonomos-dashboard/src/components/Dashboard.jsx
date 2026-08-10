import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { auth, db } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, doc, writeBatch, Timestamp, increment } from 'firebase/firestore';
import toast from 'react-hot-toast';

// Componentes Filhos
import SummaryChart from './SummaryChart';
import EditModal from './EditModal';
import AddTransactionModal from './AddTransactionModal';
import TopExpensesCarousel from './TopExpensesCarousel';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
import CategoryFilter from './CategoryFilter';
import AccountFilter from './AccountFilter';
import HelpModal from './HelpModal';
import { parseCSVAndValidate } from '../utils/importUtils';
// Estilos
import styles from './Dashboard.module.css';

const formatDate = (date) => date.toISOString().split('T')[0];

function Dashboard({ user, userProfile }) {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
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
  const [draftStartDate, setDraftStartDate] = useState(formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [draftEndDate, setDraftEndDate] = useState(formatDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)));
  const [activeQuickFilter, setActiveQuickFilter] = useState('month');
  const [filterType, setFilterType] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterTags, setFilterTags] = useState(new Set());
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
        const subcatQuery = query(collection(db, "subcategories"), where("userId", "==", user.uid));

        const [catSnapshot, accSnapshot, subcatSnapshot] = await Promise.all([
          getDocs(catQuery), getDocs(accQuery), getDocs(subcatQuery),
        ]);

        const catData = catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const accData = accSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const subcatData = subcatSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        setCategories(catData);
        setAccounts(accData);
        setSubcategories(subcatData);

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

    // Categorias (todas, ordenadas por valor)
    const topExpenseCategories = Object.entries(expenses.reduce((acc, tx) => {
      acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
      return acc;
    }, {})).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Tags (todas, ordenadas por valor)
    const tagTotals = {};
    expenses.forEach(tx => {
      (tx.tags || []).forEach(tag => {
        tagTotals[tag] = (tagTotals[tag] || 0) + tx.amount;
      });
    });
    const topExpenseTags = Object.entries(tagTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Subcategory breakdown: { [categoryName]: [{name, value}] }
    const categorySubData = {};
    expenses.forEach(tx => {
      if (tx.subcategory) {
        if (!categorySubData[tx.category]) categorySubData[tx.category] = {};
        categorySubData[tx.category][tx.subcategory] = (categorySubData[tx.category][tx.subcategory] || 0) + tx.amount;
      }
    });
    const categorySubBreakdown = Object.fromEntries(
      Object.entries(categorySubData).map(([cat, subs]) => [
        cat,
        Object.entries(subs).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      ])
    );

    return { totalIncome, totalExpense, totalBalance, expenseChartData, incomeChartData, topExpenseCategories, topExpenseTags, relevantTransactions, categorySubBreakdown };
  }, [transactions, accounts, accountView]);

  const charts = [
    { title: "Gastos por Categoria", data: summaryData.expenseChartData },
    { title: "Origem das Rendas", data: summaryData.incomeChartData },
  ];
  const handleDownloadTemplate = () => {
    const headers = "data,tipo,categoria,valor,conta,descricao,tags";
    const example = "2025-08-31,despesa,Alimentação,25.50,Carteira,Almoço no restaurante,restaurante;almoco";
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + example;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "modelo_transacoes.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const toastId = toast.loading('A processar e validar o seu ficheiro CSV...');

      try {
        const { validTransactions, errors } = await parseCSVAndValidate(text, user.uid, categories, accounts);

        // --- LÓGICA ANTI-FALHA ---
        // 1. Se houver qualquer erro, interrompa TUDO.
        if (errors.length > 0) {
          const firstError = errors[0];
          toast.error(
            `Erro na linha ${firstError.line}: ${firstError.message}. Nenhuma transação foi importada.`,
            { id: toastId, duration: 6000 } // Toast mais longo para dar tempo de ler
          );
          console.error("Erros de validação do CSV:", errors);
          return; // Interrompe a execução
        }

        // 2. Se não houver transações válidas (ficheiro vazio ou só com cabeçalho)
        if (validTransactions.length === 0) {
          toast.error("O ficheiro não contém transações válidas para importar.", { id: toastId });
          return;
        }

        // 3. Se passou por todas as validações, prossiga com o salvamento.
        const batch = writeBatch(db);
        validTransactions.forEach(tx => {
          const newTransactionRef = doc(collection(db, "transactions"));
          batch.set(newTransactionRef, tx.data);

          const accountDocRef = doc(db, "accounts", tx.accountId);
          const amountToUpdate = tx.data.type === 'income' ? tx.data.amount : -tx.data.amount;
          batch.update(accountDocRef, { balance: increment(amountToUpdate) });
        });

        await batch.commit();

        toast.success(`${validTransactions.length} transações importadas com sucesso!`, { id: toastId });
        triggerRefresh();

      } catch (error) {
        toast.error(`Erro inesperado ao processar o ficheiro: ${error.message}`, { id: toastId });
        console.error(error);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };


  const availableTags = useMemo(() => {
    const tagSet = new Set();
    transactions.forEach(tx => (tx.tags || []).forEach(t => tagSet.add(t)));
    return [...tagSet].sort();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (filterType !== 'all' && tx.type !== filterType) return false;
      if (filterTags.size > 0 && !(tx.tags || []).some(t => filterTags.has(t))) return false;
      if (filterSearch.trim() && !(tx.description || '').toLowerCase().includes(filterSearch.toLowerCase())) return false;
      return true;
    });
  }, [transactions, filterType, filterTags, filterSearch]);

  useEffect(() => { setCurrentPage(1); }, [filterType, filterTags, filterSearch, filterStartDate, filterEndDate, filterCategories]);

  const itemsPerPage = 15;
  const currentTransactions = filteredTransactions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  const handleTagFilterToggle = (tag) => {
    const newTags = new Set(filterTags);
    if (newTags.has(tag)) newTags.delete(tag); else newTags.add(tag);
    setFilterTags(newTags);
  };

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
        const tx = transactions.find(t => t.id === transactionId);
        const batch = writeBatch(db);
        batch.delete(doc(db, "transactions", transactionId));
        if (tx) {
          const balanceDelta = tx.type === 'income' ? -tx.amount : tx.amount;
          batch.update(doc(db, "accounts", tx.accountId), { balance: increment(balanceDelta) });
        }
        await batch.commit();
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
      const accountDeltas = {};
      selectedTransactions.forEach(transactionId => {
        const tx = transactions.find(t => t.id === transactionId);
        if (tx) {
          const delta = tx.type === 'income' ? -tx.amount : tx.amount;
          accountDeltas[tx.accountId] = (accountDeltas[tx.accountId] || 0) + delta;
        }
      });

      const batch = writeBatch(db);
      selectedTransactions.forEach(transactionId => {
        batch.delete(doc(db, "transactions", transactionId));
      });
      Object.entries(accountDeltas).forEach(([accountId, delta]) => {
        if (delta !== 0) {
          batch.update(doc(db, "accounts", accountId), { balance: increment(delta) });
        }
      });

      try {
        await batch.commit();
        toast.success(`${selectedTransactions.size} transação(ões) excluída(s)!`);
        toggleSelectionMode();
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
  const applyDateRange = (startStr, endStr, preset = null) => {
    setFilterStartDate(startStr);
    setFilterEndDate(endStr);
    setDraftStartDate(startStr);
    setDraftEndDate(endStr);
    setActiveQuickFilter(preset);
    setIsFilterVisible(false);
  };
  const handleApplyFilter = () => {
    setFilterStartDate(draftStartDate);
    setFilterEndDate(draftEndDate);
    setActiveQuickFilter(null);
    setIsFilterVisible(false);
  };
  const setFilterDateRange = (start, end, preset = null) => applyDateRange(formatDate(start), formatDate(end), preset);
  const handleSetMonthlyFilter = () => { const t = new Date(); setFilterDateRange(new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0), 'month'); };
  const handleSetWeeklyFilter = () => { const t = new Date(); const first = t.getDate() - t.getDay() + (t.getDay() === 0 ? -6 : 1); const firstDate = new Date(new Date().setDate(first)); const lastDate = new Date(new Date().setDate(first + 6)); setFilterDateRange(firstDate, lastDate, 'week'); };
  const handleSetTodayFilter = () => setFilterDateRange(new Date(), new Date(), 'today');
  const handleSetYearlyFilter = () => { const t = new Date(); setFilterDateRange(new Date(t.getFullYear(), 0, 1), new Date(t.getFullYear(), 11, 31), 'year'); };
  const handleOpenEditModal = (transaction) => { setEditingTransaction(transaction); setIsModalOpen(true); };
  const handleSaveTransaction = async (updatedData) => {
    if (!editingTransaction) return;

    try {
      const batch = writeBatch(db);

      const txRef = doc(db, "transactions", editingTransaction.id);
      batch.update(txRef, updatedData);

      // Ajusta o saldo quando o valor muda (tipo e conta não podem ser alterados no EditModal)
      const oldAmount = editingTransaction.amount;
      const newAmount = parseFloat(updatedData.amount);
      const amountDelta = newAmount - oldAmount;
      if (amountDelta !== 0) {
        const balanceDelta = editingTransaction.type === 'income' ? amountDelta : -amountDelta;
        batch.update(doc(db, "accounts", editingTransaction.accountId), { balance: increment(balanceDelta) });
      }

      // Cria novas tags se necessário
      if (updatedData.tags && updatedData.tags.length > 0) {
        const existingTagsQuery = query(collection(db, "tags"), where("userId", "==", user.uid));
        const tagsSnapshot = await getDocs(existingTagsQuery);
        const existingTags = tagsSnapshot.docs.map(tDoc => tDoc.data().name);
        const newTagsToCreate = updatedData.tags.filter(tag => !existingTags.includes(tag));
        newTagsToCreate.forEach(tag => {
          const newTagRef = doc(collection(db, "tags"));
          batch.set(newTagRef, { name: tag, userId: user.uid, isActive: true });
        });
      }

      await batch.commit();

      setIsModalOpen(false);
      setEditingTransaction(null);
      triggerRefresh();
      toast.success("Transação atualizada!");
    } catch (error) {
      console.error("Erro ao atualizar transação:", error);
      toast.error("Falha ao atualizar transação.");
    }
  };

  if (loading) return <div>Carregando suas finanças...</div>;

  return (
    <>
      <div className={styles.dashboard}>
        <header className={styles.header}>
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
          </div>
        </header>

        <section className={styles.summary}>
          <div><h4>Rendas no Período</h4><p className={styles.incomeAmount}>R$ {summaryData.totalIncome.toFixed(2)}</p></div>
          <div><h4>Despesas no Período</h4><p className={styles.expenseAmount}>R$ {summaryData.totalExpense.toFixed(2)}</p></div>
          <div><h4>Saldo Atual em Contas</h4><p className={summaryData.totalBalance >= 0 ? styles.incomeAmount : styles.expenseAmount}>R$ {summaryData.totalBalance.toFixed(2)}</p></div>
        </section>

        <section className={styles.controlsSection}>
          <div className={styles.filterContainer}>
            <div className={styles.filterTriggerGroup}>
              <button
                onClick={() => setIsFilterVisible(!isFilterVisible)}
                className={`${styles.controlButton} ${isFilterVisible ? styles.controlButtonActive : ''}`}
              >
                Filtros & Opções
                {(filterCategories.size > 0 || filterType !== 'all' || filterTags.size > 0) > 0 && (
                  <span className={styles.filterBadge}>
                    {filterCategories.size + (filterType !== 'all' ? 1 : 0) + filterTags.size}
                  </span>
                )}
              </button>
              <span className={styles.activeFilterLabel}>
                {filterStartDate === filterEndDate
                  ? new Date(filterStartDate + 'T12:00:00').toLocaleDateString('pt-BR')
                  : `${new Date(filterStartDate + 'T12:00:00').toLocaleDateString('pt-BR')} — ${new Date(filterEndDate + 'T12:00:00').toLocaleDateString('pt-BR')}`}
              </span>
              {filterSearch.trim() && (
                <span className={styles.searchChip}>"{filterSearch}" <button onClick={() => setFilterSearch('')} className={styles.chipClear}>✕</button></span>
              )}
            </div>
            {isFilterVisible && (
              <div className={styles.filterDropdown}>
                <p className={styles.filterSectionLabel}>Período</p>
                <div className={styles.quickFilters}>
                  {[['today', 'Hoje'], ['week', 'Semana'], ['month', 'Mês'], ['year', 'Ano']].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={key === 'today' ? handleSetTodayFilter : key === 'week' ? handleSetWeeklyFilter : key === 'month' ? handleSetMonthlyFilter : handleSetYearlyFilter}
                      className={`${styles.quickFilterBtn} ${activeQuickFilter === key ? styles.quickFilterBtnActive : ''}`}
                    >{label}</button>
                  ))}
                </div>
                <p className={styles.filterSectionLabel}>Datas personalizadas</p>
                <div className={styles.dateFilters}>
                  <div className={styles.filterGroup}>
                    <label className={styles.dateLabel}>De</label>
                    <input type="date" value={draftStartDate} onChange={e => { setDraftStartDate(e.target.value); setActiveQuickFilter(null); }} className={styles.dateInput} />
                  </div>
                  <span className={styles.dateSeparator}>—</span>
                  <div className={styles.filterGroup}>
                    <label className={styles.dateLabel}>Até</label>
                    <input type="date" value={draftEndDate} onChange={e => { setDraftEndDate(e.target.value); setActiveQuickFilter(null); }} className={styles.dateInput} />
                  </div>
                </div>

                <p className={styles.filterSectionLabel}>Tipo</p>
                <div className={styles.quickFilters}>
                  {[['all', 'Todos'], ['income', 'Receitas'], ['expense', 'Despesas']].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFilterType(key)}
                      className={`${styles.quickFilterBtn} ${filterType === key ? styles.quickFilterBtnActive : ''}`}
                    >{label}</button>
                  ))}
                </div>

                <p className={styles.filterSectionLabel}>Busca por descrição</p>
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  value={filterSearch}
                  onChange={e => setFilterSearch(e.target.value)}
                  className={styles.searchInput}
                />

                <div className={styles.categoryFilterSection}>
                  <label>Categoria</label>
                  <CategoryFilter allCategories={categories} selectedCategories={filterCategories} onSelectionChange={setFilterCategories} />
                </div>

                {availableTags.length > 0 && (
                  <div className={styles.tagFilterSection}>
                    <p className={styles.filterSectionLabel}>Tags</p>
                    <div className={styles.tagFilterList}>
                      {availableTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => handleTagFilterToggle(tag)}
                          className={`${styles.tagFilterPill} ${filterTags.has(tag) ? styles.tagFilterPillActive : ''}`}
                        >#{tag}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.filterFooter}>
                  <button onClick={() => setIsFilterVisible(false)} className={styles.filterCancelBtn}>Fechar</button>
                  <button onClick={handleApplyFilter} className={styles.filterButton}>Aplicar datas</button>
                </div>
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
            <TopExpensesCarousel
              categoryData={summaryData.topExpenseCategories}
              tagData={summaryData.topExpenseTags}
              categorySubBreakdown={summaryData.categorySubBreakdown}
            />
          </div>

          <div className={styles.transactionsContainer}>
            <div className={styles.transactionsHeader}>
              <h2>Transações do Período</h2>
              <div className={styles.headerActionsContainer}>
                {isSelectionMode ? (
                  <div className={styles.selectionActions}>
                    <span>{selectedTransactions.size} selecionada(s)</span>
                    <button onClick={handleDeleteSelected} className={styles.deleteSelectedButton}>Excluir</button>
                    <button onClick={toggleSelectionMode} className={styles.cancelSelectionButton}>Cancelar</button>
                  </div>
                ) : (
                  <button onClick={toggleSelectionMode} className={styles.selectButton}>Selecionar Vários</button>
                )}

                <div className={styles.importMenu}>
                  <button className={styles.dotsButton}>⋮</button>
                  <div className={styles.dropdownContent}>
                    <a href="#!" onClick={handleDownloadTemplate}>Baixar Modelo CSV</a>
                    <label htmlFor="csv-importer">
                      Importar CSV
                      <input
                        type="file"
                        id="csv-importer"
                        accept=".csv"
                        style={{ display: 'none' }}
                        onChange={handleFileImport}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.tableResultCount}>
              {filteredTransactions.length} transaç{filteredTransactions.length === 1 ? 'ão' : 'ões'} encontrada{filteredTransactions.length !== 1 ? 's' : ''}
              {filteredTransactions.length !== transactions.length && <span className={styles.tableResultHint}> (de {transactions.length} no período)</span>}
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  {isSelectionMode && (<th className={styles.checkboxCell}><input type="checkbox" onChange={handleSelectAllOnPage} checked={currentTransactions.length > 0 && currentTransactions.every(tx => selectedTransactions.has(tx.id))} /></th>)}
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Categoria / Tags</th>
                  <th>Descrição</th>
                  <th>Conta</th>
                  <th>Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {currentTransactions.length > 0 ? (
                  currentTransactions.map(tx => {
                    const isSelected = selectedTransactions.has(tx.id);
                    return (
                      <tr key={tx.id} className={`${styles.txRow} ${isSelected ? styles.selectedRow : ''}`}>
                        {isSelectionMode && (<td className={styles.checkboxCell}><input type="checkbox" checked={isSelected} onChange={() => handleRowSelect(tx.id)} /></td>)}
                        <td data-label="Data" className={styles.dateCell}>
                          {tx.createdAt ? new Date(tx.createdAt.toDate().toISOString().split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td data-label="Tipo">
                          <span className={tx.type === 'income' ? styles.badgeIncome : styles.badgeExpense}>
                            {tx.type === 'income' ? 'Receita' : 'Despesa'}
                          </span>
                        </td>
                        <td data-label="Categoria">
                          <div className={styles.catTagsCell}>
                            <span className={styles.catName}>{tx.category || '—'}</span>
                            {tx.subcategory && (
                              <span className={styles.subcatPill}>{tx.subcategory}</span>
                            )}
                            {tx.tags && tx.tags.length > 0 && (
                              <div className={styles.tagsRow}>
                                {tx.tags.map((tag, idx) => (
                                  <span key={idx} className={styles.tagPill}>#{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td data-label="Descrição" className={styles.descCell}>
                          {tx.description || <span className={styles.emptyDesc}>—</span>}
                        </td>
                        <td data-label="Conta" className={styles.accountCell}>
                          {accounts.find(acc => acc.id === tx.accountId)?.accountName || '—'}
                        </td>
                        <td data-label="Valor" className={styles.valueCell}>
                          <span className={tx.type === 'income' ? styles.valueIncome : styles.valueExpense}>
                            {tx.type === 'income' ? '+' : '−'} R$ {tx.amount.toFixed(2)}
                          </span>
                        </td>
                        <td data-label="Ações" className={styles.actionsCell}>
                          <button onClick={() => handleOpenEditModal(tx)} className={styles.editButton} title="Editar">✎</button>
                          <button onClick={() => handleDelete(tx.id)} className={styles.deleteButton} title="Excluir">✕</button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan={isSelectionMode ? 8 : 7} className={styles.emptyRow}>Nenhuma transação para os filtros selecionados.</td></tr>
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