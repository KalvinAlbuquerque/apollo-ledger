import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { auth, db } from '../../firebaseClient';
import { collection, query, where, getDocs } from 'firebase/firestore';

// Importe os componentes de gerenciamento
import CategoryManager from '../components/CategoryManager';
import BudgetManager from '../components/BudgetManager';
import GoalManager from '../components/GoalManager';
import AccountManager from '../components/AccountManager';
import DebtManager from '../components/DebtManager';

// Vamos reutilizar os estilos do Dashboard para manter tudo igual
import styles from '../components/Dashboard.module.css'; 
import pageStyles from './ManagementPage.module.css'; // Estilos específicos da página

function ManagementPage({ user }) {
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);

  // Estados para os dados que os componentes filhos precisam
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Função para forçar a re-busca de dados
  const triggerRefresh = () => setDataVersion(v => v + 1);

  // Busca todos os dados necessários para os componentes
  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const accQuery = query(collection(db, "accounts"), where("userId", "==", user.uid));
        const accSnapshot = await getDocs(accQuery);
        const accData = accSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const transQuery = query(collection(db, "transactions"), where("userId", "==", user.uid));
        const transSnapshot = await getDocs(transQuery);
        const transData = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTransactions(transData);

        accData.forEach(acc => acc.balance = 0);
        transData.forEach(tx => {
            const account = accData.find(acc => acc.id === tx.accountId);
            if(account) {
                account.balance += tx.type === 'income' ? tx.amount : -tx.amount;
            }
        });
        setAccounts(accData);

        const catQuery = query(collection(db, "categories"), where("userId", "==", user.uid));
        const catSnapshot = await getDocs(catQuery);
        setCategories(catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      } catch (error) {
        console.error("Erro ao carregar dados:", error);
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
        const txDate = tx.createdAt.toDate();
        return tx.type === 'income' && txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
      })
      .reduce((acc, tx) => acc + tx.amount, 0);
  }, [transactions]);


  if (loading) {
    return <div className={pageStyles.loading}>Carregando central de gerenciamento...</div>;
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.header}>
        <h1>Central de Gerenciamento</h1>
        <Link to="/dashboard" className={pageStyles.backButton}>Voltar ao Dashboard</Link>
      </header>

      {/* Seções de gerenciamento movidas para cá */}
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
          <BudgetManager onDataChanged={triggerRefresh} totalMonthIncome={totalMonthIncome} />
        </section>
        <section className={styles.managerSection}>
          <CategoryManager onDataChanged={triggerRefresh} />
        </section>
    </div>
  );
}

export default ManagementPage;