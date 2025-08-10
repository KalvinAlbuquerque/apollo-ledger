import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
import styles from './CategoryManager.module.css';
import EditCategoryModal from './EditCategoryModal';

function CategoryManager({ onDataChanged }) {
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('expense');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);

  // --- ESTADOS QUE FALTAVAM ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  // -------------------------

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
      fetchCategories();
      if (onDataChanged) onDataChanged();
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
        fetchCategories();
        if (onDataChanged) onDataChanged();
      } catch (error) {
        console.error("Erro ao deletar categoria:", error);
        toast.error("Falha ao excluir categoria.");
      }
    };
    showConfirmationToast(deleteAction, "Excluir esta categoria?");
  };

  // --- FUNÇÕES QUE FALTAVAM ---
  const handleOpenEditModal = (category) => {
    setEditingCategory(category);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setEditingCategory(null);
    setIsEditModalOpen(false);
  };

  const handleUpdateCategory = async (categoryId, updatedData) => {
    try {
      const categoryDocRef = doc(db, "categories", categoryId);
      await updateDoc(categoryDocRef, updatedData);
      toast.success("Categoria atualizada com sucesso!");
      handleCloseEditModal();
      fetchCategories();
      if (onDataChanged) onDataChanged();
    } catch (error) {
      toast.error("Falha ao atualizar a categoria.");
      console.error("Erro ao atualizar categoria:", error);
    }
  };
  // -------------------------

  const filteredCategories = useMemo(() => {
    if (filterType === 'all') return categories;
    return categories.filter(cat => cat.type === filterType);
  }, [categories, filterType]);

  if (loading) return <p>Carregando categorias...</p>;

  return (
    <>
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

        <div className={styles.filterGroup}>
            <button onClick={() => setFilterType('all')} className={`${styles.filterButton} ${filterType === 'all' ? styles.activeFilter : ''}`}>Todas</button>
            <button onClick={() => setFilterType('expense')} className={`${styles.filterButton} ${filterType === 'expense' ? styles.activeFilter : ''}`}>Despesas</button>
            <button onClick={() => setFilterType('income')} className={`${styles.filterButton} ${filterType === 'income' ? styles.activeFilter : ''}`}>Rendas</button>
        </div>

        <ul className={styles.categoryList}>
          {filteredCategories.map(cat => (
            <li key={cat.id} className={styles.categoryItem}>
              <span>{cat.name}</span>
              <span className={`${styles.typeLabel} ${cat.type === 'income' ? styles.income : styles.expense}`}>
                {cat.type === 'income' ? 'Renda' : 'Despesa'}
              </span>
              <div className={styles.actionButtons}>
                <button onClick={() => handleOpenEditModal(cat)} className={styles.editButton}>Editar</button>
                <button onClick={() => handleDeleteCategory(cat.id)} className={styles.deleteButton}>&times;</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isEditModalOpen && (
        <EditCategoryModal 
          category={editingCategory} 
          onSave={handleUpdateCategory} 
          onCancel={handleCloseEditModal} 
        />
      )}
    </>
  );
}

export default CategoryManager;