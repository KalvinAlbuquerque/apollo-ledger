import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, getDocs, addDoc, deleteDoc, updateDoc, doc, increment, Timestamp, writeBatch } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
import CompleteGoalModal from './CompleteGoalModal';
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
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  // Estados para controlar os modais
  const [isContributeModalOpen, setContributeModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentGoal, setCurrentGoal] = useState(null);
  const [newTargetDate, setNewTargetDate] = useState(''); 
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
    if (!newGoalName || !newTargetAmount || !newTargetDate || !user) { // <<< ADICIONADO newTargetDate
      toast.error("Por favor, preencha todos os campos, incluindo a data alvo.");
      return;
    }
    try {
      await addDoc(collection(db, "goals"), {
        userId: user.uid,
        goalName: newGoalName,
        targetAmount: parseFloat(newTargetAmount),
        targetDate: Timestamp.fromDate(new Date(`${newTargetDate}T12:00:00Z`)), // <<< ADICIONADO A DATA
        savedAmount: 0,
        createdAt: new Date(),
        status: 'active',
      });
      setNewGoalName('');
      setNewTargetAmount('');
      setNewTargetDate(''); // <<< LIMPA O CAMPO DE DATA
      toast.success("Nova meta criada!");
      fetchGoals();
    } catch (error) {
      toast.error("Erro ao criar a meta.");
      console.error("Erro ao adicionar meta:", error);
    }
  };
  const handleOpenCompleteModal = (goal) => {
    setCurrentGoal(goal);
    setIsCompleteModalOpen(true);
  };

  const handleCloseCompleteModal = () => {
    setCurrentGoal(null);
    setIsCompleteModalOpen(false);
  };

  const handleCompleteGoal = async (goal, destination, isReserve) => {
    const completePromise = new Promise(async (resolve, reject) => {
      try {
        const batch = writeBatch(db);
        let destinationAccountId = destination;
        let destinationAccountName = '';

        if (destination === 'new_account') {
          // Cenário A: Criar nova conta
          const newAccountRef = doc(collection(db, "accounts"));
          destinationAccountId = newAccountRef.id;
          destinationAccountName = goal.goalName;
          batch.set(newAccountRef, {
            userId: user.uid,
            accountName: goal.goalName,
            balance: goal.savedAmount,
            isReserve: isReserve,
            createdAt: Timestamp.now(),
          });
        } else {
          // Cenário B: Transferir para conta existente
          const toAccountRef = doc(db, "accounts", destinationAccountId);
          batch.update(toAccountRef, { balance: increment(goal.savedAmount) });
          destinationAccountName = accounts.find(acc => acc.id === destinationAccountId)?.accountName;
        }

        // Cria a transação de registo
        const incomeTransRef = doc(collection(db, "transactions"));
        batch.set(incomeTransRef, {
          userId: user.uid, type: 'income', amount: goal.savedAmount,
          category: 'meta concluída',
          description: `Valor da meta '${goal.goalName}' transferido para '${destinationAccountName}'`,
          createdAt: Timestamp.now(), accountId: destinationAccountId,
        });

        // <<< A MUDANÇA ESTÁ AQUI: EM VEZ DE ATUALIZAR, VAMOS APAGAR A META
        const goalDocRef = doc(db, "goals", goal.id);
        batch.delete(goalDocRef); // Apaga a meta da coleção 'goals'

        await batch.commit();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    
    toast.promise(completePromise, {
        loading: 'A finalizar meta...',
        success: 'Meta concluída e valor transferido com sucesso!',
        error: 'Falha ao finalizar a meta.',
    });

    handleCloseCompleteModal();
    if (onDataChanged) onDataChanged();
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
          <input 
            type="date" 
            value={newTargetDate} 
            onChange={e => setNewTargetDate(e.target.value)} 
            required 
          />
          <button type="submit" className={styles.addButton}>Criar Meta</button>
        </form>

        <div className={styles.goalList}>
          {goals.map(goal => {
            const progress = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0;
            const isCompleted = goal.savedAmount >= goal.targetAmount;
            
            const remainingAmount = goal.targetAmount - goal.savedAmount;
            let savingsRate = 0;
            if (goal.targetDate && remainingAmount > 0) {
                const today = new Date();
                const targetDate = goal.targetDate.toDate();
                const monthsRemaining = (targetDate.getFullYear() - today.getFullYear()) * 12 + (targetDate.getMonth() - today.getMonth());
                if (monthsRemaining > 0) {
                    savingsRate = remainingAmount / monthsRemaining;
                } else if (monthsRemaining === 0) {
                    savingsRate = remainingAmount;
                }
            }

            return (
              <div key={goal.id} className={styles.goalItem}>
                <div className={styles.goalInfo}>
                  <div className={styles.goalNameAndDate}>
                    <span className={styles.goalName}>{goal.goalName}</span>
                    {goal.targetDate && <span className={styles.targetDate}>Alvo: {goal.targetDate.toDate().toLocaleDateString('pt-BR')}</span>}
                  </div>
                  <div className={styles.progressLabels}>
                    <span>{formatCurrency(goal.savedAmount)}</span>
                    <span>{formatCurrency(goal.targetAmount)}</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                {savingsRate > 0 && (
                    <div className={styles.savingsRate}>
                        Guarde ~{formatCurrency(savingsRate)} / mês para atingir a tempo!
                    </div>
                )}

                <div className={styles.actionButtons}>
                  {isCompleted ? (
                    <button onClick={() => handleOpenCompleteModal(goal)} className={styles.completeButton}>Concluir Meta</button>
                  ) : (
                    <button onClick={() => handleOpenContributeModal(goal)} className={styles.contributeButton}>+ Adicionar</button>
                  )}
                  <button onClick={() => handleOpenEditModal(goal)} className={styles.editButton}>Editar</button>
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

      {isCompleteModalOpen && (
        <CompleteGoalModal
          goal={currentGoal}
          accounts={accounts}
          onSave={handleCompleteGoal}
          onCancel={handleCloseCompleteModal}
        />
      )}
    </>
  );
}

export default GoalManager;