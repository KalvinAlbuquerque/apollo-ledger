import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, getDocs } from 'firebase/firestore';

// Importe os componentes de gerenciamento
import CategoryManager from '../components/CategoryManager';
import BudgetManager from '../components/BudgetManager';
import GoalManager from '../components/GoalManager';
import AccountManager from '../components/AccountManager';
import DebtManager from '../components/DebtManager';
import HelpModal from '../components/HelpModal'; // Importe o modal de ajuda

// Estilos
import pageStyles from './ManagementPage.module.css';

function ManagementPage({ user }) {
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  const [activeTab, setActiveTab] = useState('accounts');
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Estados para os dados que os componentes filhos precisam
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Função para forçar a re-busca de dados quando um componente filho salvar algo
  const triggerRefresh = () => setDataVersion(v => v + 1);

  // Busca todos os dados necessários para os componentes
  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        // Busca de Contas
        const accQuery = query(collection(db, "accounts"), where("userId", "==", user.uid));
        const accSnapshot = await getDocs(accQuery);
        const accData = accSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Busca de TODAS as transações para calcular o saldo real
        const transQuery = query(collection(db, "transactions"), where("userId", "==", user.uid));
        const transSnapshot = await getDocs(transQuery);
        const transData = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTransactions(transData);

        // Lógica para calcular o saldo de cada conta
        accData.forEach(acc => acc.balance = 0);
        transData.forEach(tx => {
            const account = accData.find(acc => acc.id === tx.accountId);
            if(account) {
                account.balance += tx.type === 'income' ? tx.amount : -tx.amount;
            }
        });
        setAccounts(accData);

        // Busca de Categorias
        const catQuery = query(collection(db, "categories"), where("userId", "==", user.uid));
        const catSnapshot = await getDocs(catQuery);
        setCategories(catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      } catch (error) {
        console.error("Erro ao carregar dados de gerenciamento:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, dataVersion]);

  // Calcula a renda total do mês atual para o BudgetManager
  const totalMonthIncome = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    return transactions
      .filter(tx => {
        if (!tx.createdAt) return false;
        const txDate = tx.createdAt.toDate();
        return tx.type === 'income' && txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
      })
      .reduce((acc, tx) => acc + tx.amount, 0);
  }, [transactions]);


  // Renderiza o componente de gerenciamento ativo com base na aba selecionada
  const renderActiveManager = () => {
    switch (activeTab) {
      case 'accounts':
        return <AccountManager onDataChanged={triggerRefresh} accounts={accounts} />;
      case 'categories':
        return <CategoryManager onDataChanged={triggerRefresh} />;
      case 'budgets':
        return <BudgetManager onDataChanged={triggerRefresh} totalMonthIncome={totalMonthIncome} />;
      case 'goals':
        return <GoalManager onDataChanged={triggerRefresh} accounts={accounts} />;
      case 'debts':
        return <DebtManager expenseCategories={categories.filter(c => c.type === 'expense')} accounts={accounts} onDataChanged={triggerRefresh}/>;
      default:
        return null;
    }
  };

  if (loading) {
    return <div className={pageStyles.loading}>Carregando central de gerenciamento...</div>;
  }

  return (
    <>
      <div className={pageStyles.page}>
        <header className={pageStyles.header}>
          <h1>Central de Gerenciamento</h1>
           <button onClick={() => setIsHelpOpen(true)} className={pageStyles.helpButton}>?</button>
        </header>

        <div className={pageStyles.tabs}>
            <button onClick={() => setActiveTab('accounts')} className={activeTab === 'accounts' ? pageStyles.active : ''}>Contas</button>
            <button onClick={() => setActiveTab('categories')} className={activeTab === 'categories' ? pageStyles.active : ''}>Categorias</button>
            <button onClick={() => setActiveTab('budgets')} className={activeTab === 'budgets' ? pageStyles.active : ''}>Orçamentos</button>
            <button onClick={() => setActiveTab('goals')} className={activeTab === 'goals' ? pageStyles.active : ''}>Metas</button>
            <button onClick={() => setActiveTab('debts')} className={activeTab === 'debts' ? pageStyles.active : ''}>Contas a Pagar</button>
        </div>

        <div className={pageStyles.tabContent}>
            {renderActiveManager()}
        </div>
      </div>

      {isHelpOpen && (
        <HelpModal title="Central de Gerenciamento" onClose={() => setIsHelpOpen(false)}>
            <p>
              Esta é a sua central de configurações. Utilize as abas acima para navegar entre as diferentes seções e organizar a estrutura do seu controle financeiro.
            </p>
            <ul style={{paddingLeft: '20px', lineHeight: '1.8'}}>
              <li><strong>Contas:</strong> Cadastre todas as suas fontes de dinheiro, como contas bancárias, carteiras ou reservas.</li>
              <li><strong>Categorias:</strong> Crie as categorias de renda e despesa que refletem seu estilo de vida.</li>
              <li><strong>Orçamentos:</strong> Defina limites de gastos mensais para suas categorias de despesa.</li>
              <li><strong>Metas:</strong> Crie e acompanhe o progresso de suas metas de poupança.</li>
              <li><strong>Contas a Pagar:</strong> Gerencie suas contas recorrentes ou dívidas para nunca mais perder um vencimento.</li>
            </ul>
        </HelpModal>
      )}
    </>
  );
}

export default ManagementPage;