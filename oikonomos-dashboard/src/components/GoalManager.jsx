import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, getDocs, addDoc, deleteDoc, updateDoc, doc, increment, Timestamp, writeBatch } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { showConfirmationToast } from '../utils/toastUtils.jsx';

// Componentes Filhos
import EditGoalModal from './EditGoalModal';
import SelectAccountModal from './SelectAccountModal';

// Estilos
import styles from './GoalManager.module.css';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function GoalManager({ onDataChanged, accounts = [] }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados para o formulário de nova meta
  const [newGoalName, setNewGoalName] = useState('');
  const [newTargetAmount, setNewTargetAmount] = useState('');

  // Estados para controlar os modais
  const [isContributeModalOpen, setContributeModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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
      toast.success("Nova meta criada!");
      fetchGoals();
    } catch (error) {
      toast.error("Erro ao criar a meta.");
      console.error("Erro ao adicionar meta:", error);
    }
  };
  
  // Funções para o Modal de Contribuição
  const handleOpenContributeModal = (goal) => {
    setCurrentGoal(goal);
    setContributeModalOpen(true);
  };
  const handleCloseContributeModal = () => {
    setCurrentGoal(null);
    setContributeModalOpen(false);
  };
  const handleContribute = async (selectedAccountId, form) => {
    const amountStr = form.amount.value;
    const amount = parseFloat(amountStr);

    if (!currentGoal || !user || isNaN(amount) || amount <= 0) {
        toast.error("Por favor, insira um valor válido.");
        handleCloseContributeModal();
        return;
    }

    const sourceAccount = accounts.find(acc => acc.id === selectedAccountId);
    if (sourceAccount && sourceAccount.balance < amount) {
        toast.error(`Saldo insuficiente na conta '${sourceAccount.accountName}'.`);
        handleCloseContributeModal();
        return;
    }

    const contributePromise = new Promise(async (resolve, reject) => {
        try {
            const batch = writeBatch(db);
            const goalDocRef = doc(db, "goals", currentGoal.id);
            batch.update(goalDocRef, { savedAmount: increment(amount) });
            
            const newTransactionRef = doc(collection(db, "transactions"));
            batch.set(newTransactionRef, {
                userId: user.uid, type: 'expense', amount: amount,
                category: currentGoal.goalName, description: `Contribuição para a meta: ${currentGoal.goalName}`,
                createdAt: Timestamp.now(), accountId: selectedAccountId,
            });
            
            const accountDocRef = doc(db, "accounts", selectedAccountId);
            batch.update(accountDocRef, { balance: increment(-amount) });
            
            await batch.commit();
            if (onDataChanged) onDataChanged();
            resolve();
        } catch (error) {
            console.error("Erro ao adicionar contribuição:", error);
            reject(error);
        }
    });

    toast.promise(contributePromise, {
        loading: 'A guardar dinheiro...',
        success: 'Contribuição salva com sucesso!',
        error: 'Falha ao salvar.',
    });
    
    handleCloseContributeModal();
  };

  // Funções para o Modal de Edição
  const handleOpenEditModal = (goal) => {
    setCurrentGoal(goal);
    setIsEditModalOpen(true);
  };
  const handleCloseEditModal = () => {
    setCurrentGoal(null);
    setIsEditModalOpen(false);
  };
  const handleUpdateGoal = async (goalId, updatedData) => {
    try {
      const goalDocRef = doc(db, "goals", goalId);
      await updateDoc(goalDocRef, updatedData);
      toast.success("Meta atualizada com sucesso!");
      handleCloseEditModal();
      fetchGoals();
    } catch (error) {
      toast.error("Falha ao atualizar a meta.");
      console.error("Erro ao atualizar meta:", error);
    }
  };

  // Função de Exclusão
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

  if (loading) return <p>A carregar metas...</p>;

  return (
    <>
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
                
                <div className={styles.actionButtons}>
                  <button onClick={() => handleOpenEditModal(goal)} className={styles.editButton}>Editar</button>
                  <button onClick={() => handleOpenContributeModal(goal)} className={styles.contributeButton}>+ Adicionar</button>
                  <button onClick={() => handleDeleteGoal(goal.id)} className={styles.deleteButton}>Excluir</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {isContributeModalOpen && (
        <SelectAccountModal
            title={`Guardar para '${currentGoal.goalName}' a partir de:`}
            accounts={accounts}
            onConfirm={handleContribute}
            onCancel={handleCloseContributeModal}
        >
            <label htmlFor="amount">Valor a guardar (R$):</label>
            <input
                type="number"
                id="amount"
                name="amount"
                placeholder="Ex: 50.00"
                required
                step="0.01"
                autoFocus
            />
        </SelectAccountModal>
      )}
      
      {isEditModalOpen && (
        <EditGoalModal 
            goal={currentGoal} 
            onSave={handleUpdateGoal} 
            onCancel={handleCloseEditModal} 
        />
      )}
    </>
  );
}

export default GoalManager;