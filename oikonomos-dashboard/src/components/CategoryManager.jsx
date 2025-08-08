// src/components/CategoryManager.jsx

import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import styles from './CategoryManager.module.css'; // Vamos criar este arquivo de estilo

function CategoryManager() {
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('expense'); // 'expense' como padrão
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all'); 
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
        type: newCategoryType, // Adiciona o tipo
        userId: user.uid,
      });
      setNewCategoryName('');
      fetchCategories();
    } catch (error) {
      console.error("Erro ao adicionar categoria:", error);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm("Tem certeza?")) return;
    try {
      await deleteDoc(doc(db, "categories", categoryId));
      fetchCategories();
    } catch (error) {
      console.error("Erro ao deletar categoria:", error);
    }
  };

  if (loading) return <p>Carregando categorias...</p>;

  return (
    <div className={styles.container}>
      <h2>Gerenciar Categorias</h2>
      <form onSubmit={handleAddCategory} className={styles.form}>
        <div className={styles.inputType}>
          <label>
            <input 
              type="radio" 
              value="expense" 
              checked={newCategoryType === 'expense'} 
              onChange={(e) => setNewCategoryType(e.target.value)}
            />
            Despesa
          </label>
          <label>
            <input 
              type="radio" 
              value="income" 
              checked={newCategoryType === 'income'} 
              onChange={(e) => setNewCategoryType(e.target.value)}
            />
            Renda
          </label>
        </div>
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="Nome da nova categoria"
          className={styles.inputName}
        />
        <button type="submit" className={styles.addButton}>Adicionar</button>
      </form>

      <ul className={styles.categoryList}>
        {categories.map(cat => (
          <li key={cat.id}>
            {cat.name} 
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