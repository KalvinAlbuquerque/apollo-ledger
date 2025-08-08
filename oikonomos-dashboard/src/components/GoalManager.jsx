import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, getDocs, addDoc, deleteDoc, updateDoc, doc, increment } from 'firebase/firestore';
import styles from './GoalManager.module.css';

// Função auxiliar para formatar números como moeda
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function GoalManager() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados para o formulário
  const [newGoalName, setNewGoalName] = useState('');
  const [newTargetAmount, setNewTargetAmount] = useState('');

  const user = auth.currentUser;

  const fetchGoals = async () => {
    if (!user) return;
    setLoading(true);
    const q = query(collection(db, "goals"), where("userId", "==", user.uid));
    const querySnapshot = await getDocs(q);
    setGoals(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setLoading(false);
  };

  useEffect(() => {
    fetchGoals();
  }, [user]);

  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (!newGoalName || !newTargetAmount || !user) return;
    try {
      await addDoc(collection(db, "goals"), {
        userId: user.uid,
        goalName: newGoalName,
        targetAmount: parseFloat(newTargetAmount),
        savedAmount: 0,
        createdAt: new Date(),
        status: 'active',
      });
      setNewGoalName('');
      setNewTargetAmount('');
      fetchGoals();
    } catch (error) {
      console.error("Erro ao adicionar meta:", error);
    }
  };
  
  const handleContribute = async (goalId) => {
    const amountStr = window.prompt("Qual valor você deseja adicionar a esta meta?");
    if (!amountStr) return;
    
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      alert("Por favor, insira um valor válido.");
      return;
    }

    try {
      const goalDocRef = doc(db, "goals", goalId);
      await updateDoc(goalDocRef, {
        savedAmount: increment(amount)
      });
      fetchGoals();
    } catch (error) {
      console.error("Erro ao adicionar contribuição:", error);
    }
  };

  const handleDeleteGoal = async (goalId) => {
    if (!window.confirm("Tem certeza que deseja apagar esta meta?")) return;
    try {
      await deleteDoc(doc(db, "goals", goalId));
      fetchGoals();
    } catch (error) {
      console.error("Erro ao apagar meta:", error);
    }
  };

  if (loading) return <p>Carregando metas...</p>;

  return (
    <div className={styles.container}>
      <h2>Minhas Metas de Poupança</h2>
      <form onSubmit={handleAddGoal} className={styles.form}>
        <input type="text" value={newGoalName} onChange={e => setNewGoalName(e.target.value)} placeholder="Nome da Meta (ex: Viagem)" required />
        <input type="number" value={newTargetAmount} onChange={e => setNewTargetAmount(e.target.value)} placeholder="Valor Alvo (ex: 5000)" required />
        <button type="submit" className={styles.addButton}>Criar Meta</button>
      </form>

      <div className={styles.goalList}>
        {goals.map(goal => {
          const progress = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0;
          return (
            <div key={goal.id} className={styles.goalItem}>
              {/* ÁREA DE INFORMAÇÕES DA META */}
              <div className={styles.goalInfo}>
                <span className={styles.goalName}>{goal.goalName}</span>
                <div className={styles.progressLabels}>
                  <span>{formatCurrency(goal.savedAmount)}</span>
                  <span>{formatCurrency(goal.targetAmount)}</span>
                </div>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }}></div>
                </div>
              </div>
              
              {/* ÁREA DE AÇÕES UNIFICADA (aparece no hover) */}
              <div className={styles.actionButtons}>
                <button onClick={() => handleContribute(goal.id)} className={styles.contributeButton}>+ Adicionar</button>
                <button onClick={() => handleDeleteGoal(goal.id)} className={styles.deleteButton}>Excluir</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
}

export default GoalManager;