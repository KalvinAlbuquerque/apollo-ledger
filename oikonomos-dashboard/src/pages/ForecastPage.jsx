// src/pages/ForecastPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import HelpModal from '../components/HelpModal';

import styles from './ForecastPage.module.css'; // Adicione esta linha

// Registrar os componentes do Chart.js que vamos usar
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function ForecastPage() {
  const [loading, setLoading] = useState(true);
  const [allTransactions, setAllTransactions] = useState([]);
  const [scheduledTransactions, setScheduledTransactions] = useState([]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [forecastMonth, setForecastMonth] = useState(new Date(new Date().setMonth(new Date().getMonth() + 1, 1)));
  const [manualIncomes, setManualIncomes] = useState([{ id: 1, description: 'Salário', amount: '' }]);
  const [manualExpenses, setManualExpenses] = useState([]);
  const [excludedFixed, setExcludedFixed] = useState(new Set());

  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const fetchForecastData = async () => {
      setLoading(true);

      const transQuery = query(collection(db, "transactions"), where("userId", "==", user.uid));
      const transSnapshot = await getDocs(transQuery);
      setAllTransactions(transSnapshot.docs.map(doc => doc.data()));

      const scheduledQuery = query(collection(db, "scheduled_transactions"), where("userId", "==", user.uid));
      const scheduledSnapshot = await getDocs(scheduledQuery);
      setScheduledTransactions(scheduledSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      setLoading(false);
    };
    fetchForecastData();
  }, [user]);

  const averageSpending = useMemo(() => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentExpenses = allTransactions.filter(tx => tx.type === 'expense' && tx.createdAt.toDate() > threeMonthsAgo);
    const categoryTotals = {};
    recentExpenses.forEach(tx => {
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
    });
    const averages = [];
    for (const category in categoryTotals) {
      averages.push({
        category,
        amount: categoryTotals[category] / 3
      });
    }
    return averages.sort((a, b) => b.amount - a.amount);
  }, [allTransactions]);

  const predictedExpenses = useMemo(() => {
    const forecastYear = forecastMonth.getFullYear();
    const forecastMonthIndex = forecastMonth.getMonth();
    const fixedExpenses = scheduledTransactions
      .filter(st => {
        const dueDate = st.dueDate.toDate();
        const isCorrectMonth = dueDate.getFullYear() === forecastYear && dueDate.getMonth() === forecastMonthIndex;
        return isCorrectMonth && st.status === 'pending' && !excludedFixed.has(`fixed-${st.id}`);
      })
      .map(st => ({
        id: `fixed-${st.id}`,
        description: st.description,
        amount: st.amount,
        type: 'Fixo'
      }));
    const manualExpenseCategories = new Set(manualExpenses.map(exp => exp.description.replace('Média de ', '')));
    const variableExpenses = averageSpending
      .filter(avg => !manualExpenseCategories.has(avg.category))
      .slice(0, 5)
      .map((avg) => ({
        id: `var-${avg.category}`,
        description: `Média de ${avg.category}`,
        amount: avg.amount,
        type: 'Variável (Média)'
      }));
    return [...fixedExpenses, ...variableExpenses, ...manualExpenses].sort((a, b) => b.amount - a.amount);
  }, [scheduledTransactions, averageSpending, forecastMonth, manualExpenses, excludedFixed]);

  const totalPredictedIncome = useMemo(() => manualIncomes.reduce((acc, income) => acc + parseFloat(income.amount || 0), 0), [manualIncomes]);
  const totalPredictedExpense = useMemo(() => predictedExpenses.reduce((acc, expense) => acc + parseFloat(expense.amount || 0), 0), [predictedExpenses]);
  const predictedBalance = totalPredictedIncome - totalPredictedExpense;

  const summaryChartData = useMemo(() => {
    return {
      labels: ['Previsão'],
      datasets: [
        {
          label: 'Rendas',
          data: [totalPredictedIncome],
          backgroundColor: 'rgba(57, 255, 20, 0.7)',
        },
        {
          label: 'Despesas',
          data: [totalPredictedExpense],
          backgroundColor: 'rgba(255, 29, 88, 0.7)',
        },
      ],
    };
  }, [totalPredictedIncome, totalPredictedExpense]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { color: '#A0A0A0' } }, y: { ticks: { color: '#A0A0A0' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } } }
  };

  // --- FUNÇÃO CORRIGIDA E MAIS ROBUSTA ---
  const handleSaveForecast = async () => {
    if (!user) return;

    // 1. Filtra e "limpa" os dados, removendo o 'id' e garantindo que 'amount' é número
    const sanitizedIncomes = manualIncomes
      .filter(i => i.description && parseFloat(i.amount) > 0)
      .map(({ id, ...rest }) => ({ // Desestrutura para remover o 'id'
        ...rest,
        amount: parseFloat(rest.amount)
      }));

    const sanitizedExpenses = predictedExpenses
      .filter(e => e.description && parseFloat(e.amount) > 0)
      .map(({ id, ...rest }) => ({ // Desestrutura para remover o 'id'
        ...rest,
        amount: parseFloat(rest.amount)
      }));

    // 2. Monta o objeto final apenas com dados limpos
    const forecastData = {
      userId: user.uid,
      forecastMonth: Timestamp.fromDate(forecastMonth),
      predictedIncomes: sanitizedIncomes,
      predictedExpenses: sanitizedExpenses,
      totalIncome: totalPredictedIncome,
      totalExpense: totalPredictedExpense,
      predictedBalance: predictedBalance,
      createdAt: Timestamp.now(),
    };

    // 3. Envia para o Firestore
    const savePromise = addDoc(collection(db, "forecasts"), forecastData);

    toast.promise(savePromise, {
      loading: 'Salvando sua previsão...',
      success: 'Previsão salva com sucesso!',
      error: 'Erro ao salvar a previsão.',
    });
  };

  const handleMonthChange = (increment) => {
    setForecastMonth(currentMonth => {
      const newMonth = new Date(currentMonth);
      newMonth.setMonth(newMonth.getMonth() + increment);
      return newMonth;
    });
    setExcludedFixed(new Set());
  };

  const addAverageToManual = (avg) => {
    const newId = (manualExpenses.length > 0 ? Math.max(...manualExpenses.map(e => e.id)) : 0) + 1;
    setManualExpenses(prev => [...prev, {
      id: newId,
      description: avg.category,
      amount: avg.amount.toFixed(2),
      type: 'Variável'
    }]);
  };

  const deleteExpense = (id) => {
    if (String(id).startsWith('fixed-')) {
      setExcludedFixed(prev => new Set(prev).add(id));
    } else {
      setManualExpenses(prev => prev.filter(exp => exp.id !== id));
    }
  };

  const handleManualIncomeChange = (id, field, value) => {
    setManualIncomes(prevIncomes =>
      prevIncomes.map(income => income.id === id ? { ...income, [field]: value } : income)
    );
  };

  const addManualIncome = () => {
    const newId = manualIncomes.length > 0 ? Math.max(...manualIncomes.map(i => i.id)) + 1 : 1;
    setManualIncomes([...manualIncomes, { id: newId, description: '', amount: '' }]);
  };

  if (loading) return <div style={{ color: 'white', textAlign: 'center', paddingTop: '50px' }}>Carregando dados para previsão...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>
          Previsão Financeira
          <button onClick={() => setIsHelpOpen(true)} className={styles.helpButton}>?</button>
        </h1>
        <Link to="/dashboard" className={styles.backButton}>Voltar ao Dashboard</Link>
      </header>

      <div className={styles.forecastGrid}>
        <div className={styles.card}>
          <h3>Sua Média de Gastos (Últimos 3 Meses)</h3>
          <p className={styles.cardSubtitle}>Clique em '+' para adicionar uma média à sua previsão como um gasto editável.</p>
          <ul className={styles.averageList}>
            {averageSpending.map(avg => (
              <li key={avg.category}>
                <div className={styles.averageItem}>
                  <span>{avg.category}</span>
                  <strong>{formatCurrency(avg.amount)}/mês</strong>
                </div>
                <button onClick={() => addAverageToManual(avg)} className={styles.addAverageButton} title="Adicionar à previsão">+</button>
              </li>
            ))}
            {averageSpending.length === 0 && <p>Nenhum dado de despesa nos últimos 3 meses para calcular médias.</p>}
          </ul>
        </div>

        <div className={styles.card}>
          <div className={styles.monthSelector}>
            <button onClick={() => handleMonthChange(-1)}>&lt;</button>
            <h2>Previsão para: {forecastMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
            <button onClick={() => handleMonthChange(1)}>&gt;</button>
          </div>
          <div className={styles.section}>
            <h4>Rendas Previstas</h4>
            {manualIncomes.map((income) => (
              <div key={income.id} className={styles.inputRow}>
                <input type="text" value={income.description} onChange={e => handleManualIncomeChange(income.id, 'description', e.target.value)} placeholder="Descrição da Renda" />
                <input type="number" value={income.amount} onChange={e => handleManualIncomeChange(income.id, 'amount', e.target.value)} placeholder="0.00" />
              </div>
            ))}
            <button onClick={addManualIncome} className={styles.addButton}>+ Adicionar Renda</button>
          </div>
          <div className={styles.section}>
            <h4>Despesas Previstas</h4>
            <table className={styles.forecastTable}>
              <tbody>
                {predictedExpenses.map(exp => (
                  <tr key={exp.id}>
                    <td>{exp.description} <span className={`${styles.tag} ${styles[exp.type.split(' ')[0].toLowerCase()]}`}>{exp.type}</span></td>
                    <td className={styles.amountCell}>{formatCurrency(exp.amount)}<button onClick={() => deleteExpense(exp.id)} className={styles.deleteButton}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${styles.card} ${styles.summaryCard}`}>
          <h3>Resumo da Previsão</h3>
          <div className={styles.summaryItem}>
            <span>Rendas Previstas</span>
            <span className={styles.income}>{formatCurrency(totalPredictedIncome)}</span>
          </div>
          <div className={styles.summaryItem}>
            <span>Despesas Previstas</span>
            <span className={styles.expense}>{formatCurrency(totalPredictedExpense)}</span>
          </div>
          <hr />
          <div className={`${styles.summaryItem} ${styles.balanceItem}`}>
            <strong>Saldo Final Previsto</strong>
            <strong className={predictedBalance >= 0 ? styles.income : styles.expense}>{formatCurrency(predictedBalance)}</strong>
          </div>

          <div className={styles.chartContainer}>
            <Bar options={chartOptions} data={summaryChartData} />
          </div>

          <button onClick={handleSaveForecast} className={styles.saveButton}>Salvar Previsão</button>
        </div>
      </div>
      {isHelpOpen && (
        <HelpModal title="Previsão Financeira" onClose={() => setIsHelpOpen(false)}>
          <p>A página de Previsão é a sua "bola de cristal" financeira. Ela ajuda a planejar o próximo mês e a simular cenários para garantir que você não termine no vermelho.</p>
          <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
            <li><strong>Média de Gastos:</strong> O sistema calcula automaticamente a média dos seus gastos dos últimos 3 meses, oferecendo uma base para sua previsão.</li>
            <li><strong>Despesas Fixas e Variáveis:</strong> As contas agendadas do próximo mês são importadas como despesas fixas, e você pode adicionar despesas variáveis com base nas suas médias ou em valores manuais.</li>
            <li><strong>Simulação:</strong> Insira as suas rendas esperadas e compare com o total de despesas projetadas para ver o seu saldo final.</li>
            <li><strong>Salve a Previsão:</strong> Você pode salvar suas previsões para consultá-las no futuro e comparar o planejado com o realizado.</li>
          </ul>
        </HelpModal>
      )}
    </div>
  );
}

export default ForecastPage;