// src/components/AddTransactionModal.jsx
import React, { useState, useMemo, useEffect } from 'react'; // Adicione useEffect]
import { db, auth } from '../../firebaseClient';
import { collection, doc, writeBatch, Timestamp, increment } from 'firebase/firestore';
import toast from 'react-hot-toast';
import styles from './EditModal.module.css'; // Reutilizamos o estilo dos outros modais

function AddTransactionModal({ onCancel, onSave, categories, accounts }) {
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.id || '');
  const [description, setDescription] = useState('');
  const user = auth.currentUser;

  // Filtra as categorias dinamicamente com base no tipo (renda/despesa)
  const availableCategories = useMemo(() => {
    return categories.filter(cat => cat.type === type);
  }, [type, categories]);

  // Garante que uma categoria válida esteja sempre selecionada
  useEffect(() => {
    if (availableCategories.length > 0) {
      setSelectedCategory(availableCategories[0].name);
    } else {
      setSelectedCategory('');
    }
  }, [availableCategories]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!type || !amount || !selectedCategory || !selectedAccount || !user) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }

    const savePromise = new Promise(async (resolve, reject) => {
      try {
        const batch = writeBatch(db);

        // 1. Cria a nova transação
        const newTransactionRef = doc(collection(db, "transactions"));
        batch.set(newTransactionRef, {
          userId: user.uid,
          type: type,
          amount: parseFloat(amount),
          category: selectedCategory,
          accountId: selectedAccount,
          description: description,
          createdAt: Timestamp.now(),
        });

        // 2. Atualiza o saldo da conta
        const accountDocRef = doc(db, "accounts", selectedAccount);
        const amountToUpdate = type === 'income' ? parseFloat(amount) : -parseFloat(amount);
        batch.update(accountDocRef, { balance: increment(amountToUpdate) });

        await batch.commit();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    
    toast.promise(savePromise, {
        loading: 'A registar transação...',
        success: 'Transação registada com sucesso!',
        error: 'Falha ao registar.',
    });

    onSave(); // Fecha o modal e atualiza o dashboard
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Adicionar Nova Transação</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.radioGroup}>
            <label><input type="radio" value="expense" checked={type === 'expense'} onChange={(e) => setType(e.target.value)} /> Despesa</label>
            <label><input type="radio" value="income" checked={type === 'income'} onChange={(e) => setType(e.target.value)} /> Renda</label>
          </div>

          <label>Valor (R$):</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required step="0.01" />
          
          <label>Conta:</label>
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} required>
            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.accountName}</option>)}
          </select>

          <label>Categoria:</label>
          <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} required>
            {availableCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
          </select>

          <label>Descrição (Opcional):</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} />

          <div className={styles.buttonGroup}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>Cancelar</button>
            <button type="submit" className={styles.saveButton}>Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddTransactionModal;