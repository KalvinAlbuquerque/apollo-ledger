import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
import styles from './CategoryManager.module.css';

function CategoryManager({ onDataChanged }) { // <<< 1. RECEBE A NOVA PROP
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('expense');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);

  const user = auth.currentUser;

  const fetchCategories = async () => {
    if (!user) return;
    setLoading(true);
    const q = query(collection(db, "categories"), where("userId", "==", user.uid), orderBy("name"));
    const querySnapshot = await getDocs(q);
    const userCategories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setCategories(userCategories);
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, [user]);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (newCategoryName.trim() === '') return;
    try {
      await addDoc(collection(db, "categories"), {
        name: newCategoryName.toLowerCase(),
        type: newCategoryType,
        userId: user.uid,
      });
      setNewCategoryName('');
      toast.success("Categoria adicionada!");
      fetchCategories(); // Atualiza a lista local
      if (onDataChanged) onDataChanged(); // <<< 2. ATUALIZA O DASHBOARD
    } catch (error) {
      toast.error("Erro ao adicionar categoria.");
      console.error("Erro ao adicionar categoria:", error);
    }
  };

  const handleDeleteCategory = (categoryId) => {
    const deleteAction = async () => {
      try {
        await deleteDoc(doc(db, "categories", categoryId));
        toast.success("Categoria excluída!");
        fetchCategories(); // Atualiza a lista local
        if (onDataChanged) onDataChanged(); // <<< 3. ATUALIZA O DASHBOARD
      } catch (error) {
        console.error("Erro ao deletar categoria:", error);
        toast.error("Falha ao excluir categoria.");
      }
    };
    showConfirmationToast(deleteAction, "Excluir esta categoria?");
  };

  const filteredCategories = useMemo(() => {
    if (filterType === 'all') return categories;
    return categories.filter(cat => cat.type === filterType);
  }, [categories, filterType]);
  if (loading) return <p>Carregando categorias...</p>;

  return (
    <div className={styles.container}>
      <h2>Gerenciar Categorias</h2>
      <form onSubmit={handleAddCategory} className={styles.form}>
        <div className={styles.inputType}>
          <label><input type="radio" value="expense" checked={newCategoryType === 'expense'} onChange={(e) => setNewCategoryType(e.target.value)} /> Despesa</label>
          <label><input type="radio" value="income" checked={newCategoryType === 'income'} onChange={(e) => setNewCategoryType(e.target.value)} /> Renda</label>
        </div>
        <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Nome da nova categoria" className={styles.inputName} required />
        <button type="submit" className={styles.addButton}>Adicionar</button>
      </form>

      {/* FILTRO DE BOTÕES ATUALIZADO */}
      <div className={styles.filterGroup}>
        <button onClick={() => setFilterType('all')} className={`${styles.filterButton} ${filterType === 'all' ? styles.activeFilter : ''}`}>
          Todas
        </button>
        <button onClick={() => setFilterType('expense')} className={`${styles.filterButton} ${filterType === 'expense' ? styles.activeFilter : ''}`}>
          Despesas
        </button>
        <button onClick={() => setFilterType('income')} className={`${styles.filterButton} ${filterType === 'income' ? styles.activeFilter : ''}`}>
          Rendas
        </button>
      </div>

      <ul className={styles.categoryList}>
        {filteredCategories.map(cat => (
          <li key={cat.id} className={styles.categoryItem}>
            <span>{cat.name}</span>
            <span className={`${styles.typeLabel} ${cat.type === 'income' ? styles.income : styles.expense}`}>
              {cat.type === 'income' ? 'Renda' : 'Despesa'}
            </span>
            <button onClick={() => handleDeleteCategory(cat.id)} className={styles.deleteButton}>
              &times;
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CategoryManager;