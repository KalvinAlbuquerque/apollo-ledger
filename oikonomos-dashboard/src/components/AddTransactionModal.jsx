import React, { useState, useMemo, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, doc, writeBatch, Timestamp, increment, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import styles from './EditModal.module.css';

function AddTransactionModal({ onCancel, onSave, categories, accounts }) {
  const [type, setType] = useState('expense');

  // Estados para transação normal
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(''); // Inicia vazio
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');

  // Estados para transferência
  const [fromAccountId, setFromAccountId] = useState(''); // Inicia vazio
  const [toAccountId, setToAccountId] = useState(''); // Inicia vazio
  const [createPaybackDebt, setCreatePaybackDebt] = useState(false);

  const user = auth.currentUser;
  const [availableTags, setAvailableTags] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [selectedSubcategory, setSelectedSubcategory] = useState('');

  useEffect(() => {
    const fetchTags = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, "tags"), where("userId", "==", user.uid), where("isActive", "==", true));
        const querySnapshot = await getDocs(q);
        const fetchedTags = querySnapshot.docs.map(doc => doc.data().name);
        setAvailableTags(fetchedTags);
      } catch (error) {
        console.error("Erro ao buscar tags:", error);
      }
    };
    const fetchSubcategories = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, "subcategories"), where("userId", "==", user.uid));
        const snap = await getDocs(q);
        setSubcategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Erro ao buscar subcategorias:", error);
      }
    };
    fetchTags();
    fetchSubcategories();
  }, [user]);

  // --- LÓGICA CORRIGIDA COM useEffect ---
  // Primeiro, calculamos qual é a conta padrão sempre que a lista de contas mudar.
  const defaultAccount = useMemo(() => {
    return accounts.find(acc => acc.isDefault) || accounts[0];
  }, [accounts]);

  // Depois, usamos um Effect para ATUALIZAR o estado quando a conta padrão for encontrada.
  useEffect(() => {
    if (defaultAccount) {
      setSelectedAccount(defaultAccount.id);
      setFromAccountId(defaultAccount.id);

      // Define uma conta de destino padrão para transferências
      const firstOtherAccount = accounts.find(acc => acc.id !== defaultAccount.id);
      if (firstOtherAccount) {
        setToAccountId(firstOtherAccount.id);
      } else if (accounts.length > 1) {
        setToAccountId(accounts[1].id);
      }
    }
  }, [defaultAccount, accounts]);
  // ------------------------------------

  const isSourceAccountReserve = useMemo(() => {
    if (type !== 'transfer') return false;
    const sourceAccount = accounts.find(acc => acc.id === fromAccountId);
    return sourceAccount?.isReserve || false;
  }, [fromAccountId, accounts, type]);

  const availableCategories = useMemo(() => {
    return categories.filter(cat => cat.type === type && cat.isActive !== false);
  }, [type, categories]);

  useEffect(() => {
    if (availableCategories.length > 0) {
      setSelectedCategory(availableCategories[0].name);
    } else {
      setSelectedCategory('');
    }
    setSelectedSubcategory('');
  }, [type, availableCategories]);

  const availableSubcategories = useMemo(() => {
    return subcategories.filter(s => s.categoryName === selectedCategory);
  }, [subcategories, selectedCategory]);

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSave = async () => {
    if (!user) return;
    let savePromise;
    const transferAmount = parseFloat(amount);

    if (type === 'transfer') {
      // --- LÓGICA DE TRANSFERÊNCIA ---
      if (fromAccountId === toAccountId) {
        toast.error("A conta de origem e destino não podem ser a mesma.");
        return;
      }
      const sourceAccount = accounts.find(acc => acc.id === fromAccountId);
      if (sourceAccount.balance < transferAmount) {
        toast.error(`Saldo insuficiente na conta de origem: '${sourceAccount.accountName}'.`);
        return;
      }
      savePromise = new Promise(async (resolve, reject) => {
        try {
          const batch = writeBatch(db);
          const fromAccountRef = doc(db, "accounts", fromAccountId);
          const toAccountRef = doc(db, "accounts", toAccountId);
          const fromAccountData = accounts.find(acc => acc.id === fromAccountId);
          const toAccountData = accounts.find(acc => acc.id === toAccountId);

          // 1. Cria as transações de entrada e saída
          const expenseTransRef = doc(collection(db, "transactions"));
          batch.set(expenseTransRef, {
            userId: user.uid, type: 'expense', amount: transferAmount,
            category: 'transferência',
            description: `Transferência para: ${toAccountData.accountName}`,
            createdAt: Timestamp.now(), accountId: fromAccountId,
          });
          const incomeTransRef = doc(collection(db, "transactions"));
          batch.set(incomeTransRef, {
            userId: user.uid, type: 'income', amount: transferAmount,
            category: 'transferência',
            description: `Transferência de: ${fromAccountData.accountName}`,
            createdAt: Timestamp.now(), accountId: toAccountId,
          });
          // 2. Atualiza os saldos das contas
          batch.update(fromAccountRef, { balance: increment(-transferAmount) });
          batch.update(toAccountRef, { balance: increment(transferAmount) });

          // 3. Cria a conta a pagar, se necessário
          if (isSourceAccountReserve && createPaybackDebt) {
            const paybackDebtRef = doc(collection(db, "scheduled_transactions"));
            batch.set(paybackDebtRef, {
              userId: user.uid,
              description: `Reposição para: ${fromAccountData.accountName}`,
              amount: transferAmount,
              categoryName: 'reservas',
              dueDate: Timestamp.fromDate(new Date(new Date().setMonth(new Date().getMonth() + 2, 0))),
              status: 'pending',
              isRecurring: false,
            });
          }

          await batch.commit();
          resolve();
        } catch (error) { reject(error); }
      });
      toast.promise(savePromise, {
        loading: 'Transferindo...',
        success: 'Transferência realizada com sucesso!',
        error: 'Falha ao realizar a transferência.',
      });
    } else {
      // --- LÓGICA DE RENDA/DESPESA ---
      savePromise = new Promise(async (resolve, reject) => {
        try {
          const batch = writeBatch(db);

          let finalTags = [...tags];
          const pendingTag = tagInput.trim().toLowerCase().replace(/\s+/g, '');
          if (pendingTag && !finalTags.includes(pendingTag)) {
            finalTags.push(pendingTag);
          }

          const newTransactionRef = doc(collection(db, "transactions"));
          const txData = {
            userId: user.uid, type: type, amount: parseFloat(amount),
            category: selectedCategory, accountId: selectedAccount,
            description: description, tags: finalTags, createdAt: Timestamp.now(),
          };
          if (selectedSubcategory) txData.subcategory = selectedSubcategory;
          batch.set(newTransactionRef, txData);
          const accountDocRef = doc(db, "accounts", selectedAccount);
          const amountToUpdate = type === 'income' ? parseFloat(amount) : -parseFloat(amount);
          batch.update(accountDocRef, { balance: increment(amountToUpdate) });

          // Cria novas tags dinamicamente
          const newTagsToCreate = finalTags.filter(tag => !availableTags.includes(tag));
          newTagsToCreate.forEach(tag => {
            const newTagRef = doc(collection(db, "tags"));
            batch.set(newTagRef, {
              name: tag,
              userId: user.uid,
              isActive: true
            });
          });

          await batch.commit();
          resolve();
        } catch (error) { reject(error); }
      });
      toast.promise(savePromise, {
        loading: 'Registrando transação...',
        success: 'Transação registrada com sucesso!',
        error: 'Falha ao registrar.',
      });
    }
    onSave();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSave();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Nova Operação</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.radioGroup}>
            <label><input type="radio" value="expense" checked={type === 'expense'} onChange={(e) => setType(e.target.value)} /> Despesa</label>
            <label><input type="radio" value="income" checked={type === 'income'} onChange={(e) => setType(e.target.value)} /> Renda</label>
            <label><input type="radio" value="transfer" checked={type === 'transfer'} onChange={(e) => setType(e.target.value)} /> Transferência</label>
          </div>

          {type === 'transfer' ? (
            // --- FORMULÁRIO DE TRANSFERÊNCIA ---
            <>
              <label>Valor (R$):</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required step="0.01" />
              <label>De:</label>
              <select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} required>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.accountName}</option>)}
              </select>
              <label>Para:</label>
              <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} required>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.accountName}</option>)}
              </select>
              {isSourceAccountReserve && (
                <div className={styles.checkboxGroup}>
                  <input type="checkbox" id="createPayback" checked={createPaybackDebt} onChange={(e) => setCreatePaybackDebt(e.target.checked)} />
                  <label htmlFor="createPayback">Criar conta a pagar para repor este valor</label>
                </div>
              )}
            </>
          ) : (
            // --- FORMULÁRIO DE RENDA/DESPESA ---
            <>
              <label>Valor (R$):</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required step="0.01" />
              <label>Conta:</label>
              <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} required>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.accountName}</option>)}
              </select>
              <label>Categoria:</label>
              <select value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setSelectedSubcategory(''); }} required>
                {availableCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
              </select>
              {availableSubcategories.length > 0 && (
                <>
                  <label>Subcategoria (opcional):</label>
                  <select value={selectedSubcategory} onChange={e => setSelectedSubcategory(e.target.value)}>
                    <option value="">— Nenhuma —</option>
                    {availableSubcategories.map(sub => <option key={sub.id} value={sub.name}>{sub.name}</option>)}
                  </select>
                </>
              )}
              <label>Tags:</label>
              <div className={styles.tagsInputContainer}>
                <div className={styles.tagsList}>
                  {tags.map((tag, index) => (
                    <span key={index} className={styles.tagPill}>
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className={styles.removeTagBtn}>&times;</button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  list="tag-suggestions"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Digite uma tag e aperte Enter ou Espaço"
                  autoComplete="off"
                />
                <datalist id="tag-suggestions">
                  {availableTags.map((t, idx) => (
                    <option key={idx} value={t} />
                  ))}
                </datalist>
              </div>
              <label>Descrição (Opcional):</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} />
            </>
          )}

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