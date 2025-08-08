// src/components/BudgetManager.jsx

import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore';
import styles from './BudgetManager.module.css'; // Vamos criar este estilo
import toast from 'react-hot-toast'; 
function BudgetManager() {
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [budgets, setBudgets] = useState({}); // Objeto para guardar os orçamentos: { categoria: valor }
  const [loading, setLoading] = useState(true);

  const user = auth.currentUser;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      // 1. Buscar apenas as categorias de despesa
      const catQuery = query(collection(db, "categories"), where("userId", "==", user.uid), where("type", "==", "expense"));
      const catSnapshot = await getDocs(catQuery);
      const catData = catSnapshot.docs.map(doc => doc.data().name);
      setExpenseCategories(catData);

      // 2. Buscar os orçamentos já definidos para o mês atual
      const budgetQuery = query(collection(db, "budgets"), where("userId", "==", user.uid), where("month", "==", currentMonth), where("year", "==", currentYear));
      const budgetSnapshot = await getDocs(budgetQuery);
      const budgetData = {};
      budgetSnapshot.forEach(doc => {
        const data = doc.data();
        budgetData[data.categoryName] = data.amount;
      });
      setBudgets(budgetData);
      setLoading(false);
    };

    fetchData();
  }, [user]);

  const handleBudgetChange = (categoryName, amount) => {
    const newAmount = parseFloat(amount) || 0;
    setBudgets(prev => ({ ...prev, [categoryName]: newAmount }));
  };

 const handleSaveBudgets = async () => {
    if (!user) return;
    
    // Mostra um toast de "carregando" enquanto salva
    const savePromise = new Promise(async (resolve, reject) => {
        const savePromises = expenseCategories.map(categoryName => {
            const budgetAmount = budgets[categoryName] || 0;
            const docId = `${user.uid}-${currentYear}-${currentMonth}-${categoryName}`;
            const budgetDocRef = doc(db, "budgets", docId);

            return setDoc(budgetDocRef, {
                userId: user.uid,
                categoryName: categoryName,
                amount: budgetAmount,
                month: currentMonth,
                year: currentYear,
            });
        });

        try {
            await Promise.all(savePromises);
            resolve();
        } catch (error) {
            console.error("Erro ao salvar orçamentos:", error);
            reject(error);
        }
    });

    // 2. SUBSTITUA OS ALERTS POR ESTA LÓGICA DE TOAST
    toast.promise(savePromise, {
        loading: 'Salvando orçamentos...',
        success: 'Orçamentos salvos com sucesso!',
        error: 'Falha ao salvar orçamentos.',
    });
  };

  
  if (loading) return <p>Carregando orçamentos...</p>;

  return (
    <div className={styles.container}>
      <h2>Orçamentos para {new Date().toLocaleString('pt-BR', { month: 'long' })}</h2>
      <div className={styles.budgetList}>
        {expenseCategories.map(categoryName => (
          <div key={categoryName} className={styles.budgetItem}>
            <label>{categoryName}</label>
            <div className={styles.inputGroup}>
              <span>R$</span>
              <input
                type="number"
                placeholder="0.00"
                value={budgets[categoryName] || ''}
                onChange={(e) => handleBudgetChange(categoryName, e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
      <button onClick={handleSaveBudgets} className={styles.saveButton}>Salvar Orçamentos</button>
    </div>
  );
}

export default BudgetManager;