import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import toast from 'react-hot-toast';
import { collection, query, where, getDocs, addDoc, deleteDoc, updateDoc, doc, increment, Timestamp } from 'firebase/firestore';
import styles from './GoalManager.module.css';
import ContributeModal from './ContributeModal'; 
import { showConfirmationToast } from '../utils/toastUtils.jsx'; 

// Função auxiliar para formatar números como moeda
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function GoalManager({fetchData}) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados para o formulário
  const [newGoalName, setNewGoalName] = useState('');
  const [newTargetAmount, setNewTargetAmount] = useState('');
 const [isContributeModalOpen, setContributeModalOpen] = useState(false);
  const [currentGoal, setCurrentGoal] = useState(null);
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

  const handleOpenContributeModal = (goal) => {
    setCurrentGoal(goal);
    setContributeModalOpen(true);
  };
  
  const handleCloseContributeModal = () => {
    setCurrentGoal(null);
    setContributeModalOpen(false);
  };
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
  
  const handleContribute = async (goalId, amount) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const contributePromise = new Promise(async (resolve, reject) => {
        try {
            // Ação 1: Atualiza o valor na meta
            const goalDocRef = doc(db, "goals", goalId);
            await updateDoc(goalDocRef, { savedAmount: increment(amount) });
            
            // Ação 2: Cria a transação de despesa
            await addDoc(collection(db, "transactions"), {
                userId: user.uid,
                type: 'expense',
                amount: amount,
                category: goal.goalName,
                description: `Contribuição para a meta: ${goal.goalName}`,
                createdAt: Timestamp.now(),
            });

            await fetchData(); // Atualiza todo o dashboard
            resolve();
        } catch (error) {
            console.error("Erro ao adicionar contribuição:", error);
            reject(error);
        }
    });

    toast.promise(contributePromise, {
        loading: 'Adicionando contribuição...',
        success: 'Contribuição salva com sucesso!',
        error: 'Falha ao salvar.',
    });
    
    handleCloseContributeModal();
  };


  const handleDeleteGoal = (goalId) => {
  const deleteAction = async () => {
    try {
      await deleteDoc(doc(db, "goals", goalId));
      fetchGoals();
      toast.success("Meta excluída!");
    } catch (error) {
      console.error("Erro ao apagar meta:", error);
      toast.error("Falha ao excluir meta.");
    }
  };
  showConfirmationToast(deleteAction, "Apagar esta meta?");
};

  if (loading) return <p>Carregando metas...</p>;

  return (
    <>
      {/* O container principal do gerenciador de metas */}
      <div className={styles.container}>
        <h2>Minhas Metas de Poupança</h2>
        
        {/* Formulário para adicionar uma nova meta */}
        <form onSubmit={handleAddGoal} className={styles.form}>
          <input 
            type="text" 
            value={newGoalName} 
            onChange={e => setNewGoalName(e.target.value)} 
            placeholder="Nome da Meta (ex: Viagem)" 
            required 
          />
          <input 
            type="number" 
            value={newTargetAmount} 
            onChange={e => setNewTargetAmount(e.target.value)} 
            placeholder="Valor Alvo (ex: 5000)" 
            required 
          />
          <button type="submit" className={styles.addButton}>Criar Meta</button>
        </form>

        {/* Lista onde as metas são renderizadas */}
        <div className={styles.goalList}>
          {goals.map(goal => {
            const progress = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0;
            
            // O JSX para cada item individual da lista
            return (
              <div key={goal.id} className={styles.goalItem}>
                
                {/* Área de Informações da Meta (Nome, Valores, Barra de Progresso) */}
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
                
                {/* Área de Ações Unificada (aparece no hover) */}
                <div className={styles.actionButtons}>
                  <button onClick={() => handleOpenContributeModal(goal)} className={styles.contributeButton}>+ Adicionar</button>
                  <button onClick={() => handleDeleteGoal(goal.id)} className={styles.deleteButton}>Excluir</button>
                </div>

              </div>
            )
          })}
        </div>
      </div>

      {/* Renderiza o Modal de Contribuição se ele estiver aberto */}
      {isContributeModalOpen && (
        <ContributeModal
          goal={currentGoal}
          onSave={handleContribute}
          onCancel={handleCloseContributeModal}
        />
      )}
    </>
  );
}

export default GoalManager;