import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
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
  const [searchTerm, setSearchTerm] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  // Subcategory states
  const [subcategories, setSubcategories] = useState([]);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [newSubcategoryInputs, setNewSubcategoryInputs] = useState({});

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

  const fetchSubcategories = async () => {
    if (!user) return;
    const q = query(collection(db, "subcategories"), where("userId", "==", user.uid));
    const snap = await getDocs(q);
    setSubcategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    fetchCategories();
    fetchSubcategories();
  }, [user]);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (newCategoryName.trim() === '') return;
    try {
      await addDoc(collection(db, "categories"), {
        name: newCategoryName.trim().toLowerCase(),
        type: newCategoryType,
        userId: user.uid,
        isActive: true,
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
        await updateDoc(doc(db, "categories", categoryId), { isActive: false });
        toast.success("Categoria arquivada com sucesso!");
        fetchCategories();
        if (onDataChanged) onDataChanged();
      } catch (error) {
        console.error("Erro ao arquivar categoria:", error);
        toast.error("Falha ao arquivar categoria.");
      }
    };
    showConfirmationToast(deleteAction, "Arquivar esta categoria?");
  };

  const handleRestoreCategory = async (categoryId) => {
    try {
      await updateDoc(doc(db, "categories", categoryId), { isActive: true });
      toast.success("Categoria restaurada com sucesso!");
      fetchCategories();
      if (onDataChanged) onDataChanged();
    } catch (error) {
      console.error("Erro ao restaurar categoria:", error);
      toast.error("Falha ao restaurar categoria.");
    }
  };

  const handleAddSubcategory = async (categoryName) => {
    const name = (newSubcategoryInputs[categoryName] || '').trim().toLowerCase();
    if (!name) return;
    const alreadyExists = subcategories.some(s => s.categoryName === categoryName && s.name === name);
    if (alreadyExists) { toast.error("Subcategoria já existe."); return; }
    try {
      await addDoc(collection(db, "subcategories"), {
        userId: user.uid, name, categoryName, createdAt: serverTimestamp(),
      });
      setNewSubcategoryInputs(prev => ({ ...prev, [categoryName]: '' }));
      toast.success("Subcategoria adicionada!");
      fetchSubcategories();
    } catch (e) {
      toast.error("Erro ao adicionar subcategoria.");
    }
  };

  const handleDeleteSubcategory = (subcategoryId) => {
    const deleteAction = async () => {
      try {
        await deleteDoc(doc(db, "subcategories", subcategoryId));
        toast.success("Subcategoria removida!");
        fetchSubcategories();
      } catch (e) {
        toast.error("Erro ao remover subcategoria.");
      }
    };
    showConfirmationToast(deleteAction, "Remover esta subcategoria?");
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
    return categories
      .filter(cat => {
        // Primeiro, filtra pelo tipo (renda/despesa/todos)
        if (filterType === 'all') return true;
        return cat.type === filterType;
      })
      .filter(cat => {
        // Depois, filtra pelo termo da busca
        return cat.name.toLowerCase().includes(searchTerm.toLowerCase());
      });
  }, [categories, filterType, searchTerm]); 

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
          {/* <<< BARRA DE BUSCA ADICIONADA AQUI */}
          <input 
            type="text"
            placeholder="Pesquisar categoria..."
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className={styles.filterTabs}> {/* Renomeei a classe para clareza */}
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
        </div>

        <ul className={styles.categoryList}>
          {filteredCategories.map(cat => {
            const catSubs = subcategories.filter(s => s.categoryName === cat.name);
            const isExpanded = expandedCategory === cat.id;
            return (
              <li key={cat.id} className={styles.categoryItem} style={{ opacity: cat.isActive === false ? 0.6 : 1 }}>
                <div className={styles.categoryRow}>
                  <button
                    className={styles.expandBtn}
                    onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                    title={isExpanded ? 'Recolher subcategorias' : 'Ver subcategorias'}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                  <span style={{ textDecoration: cat.isActive === false ? 'line-through' : 'none', color: cat.isActive === false ? 'gray' : 'inherit', flex: 1 }}>
                    {cat.name}
                    {cat.isActive === false && <span style={{ fontSize: '0.8em', fontStyle: 'italic', marginLeft: '5px' }}>(Arquivada)</span>}
                    {catSubs.length > 0 && (
                      <span className={styles.subcatBadge}>{catSubs.length}</span>
                    )}
                  </span>
                  <span className={`${styles.typeLabel} ${cat.type === 'income' ? styles.income : styles.expense}`}>
                    {cat.type === 'income' ? 'Renda' : 'Despesa'}
                  </span>
                  <div className={styles.actionButtons}>
                    {cat.isActive === false ? (
                      <button onClick={() => handleRestoreCategory(cat.id)} className={styles.editButton} style={{ backgroundColor: '#4CAF50', color: 'white' }}>Restaurar</button>
                    ) : (
                      <>
                        <button onClick={() => handleOpenEditModal(cat)} className={styles.editButton}>Editar</button>
                        <button title="Arquivar" onClick={() => handleDeleteCategory(cat.id)} className={styles.deleteButton}>&times;</button>
                      </>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className={styles.subcatSection}>
                    {catSubs.length === 0 ? (
                      <p className={styles.subcatEmpty}>Nenhuma subcategoria ainda.</p>
                    ) : (
                      <ul className={styles.subcatList}>
                        {catSubs.map(sub => (
                          <li key={sub.id} className={styles.subcatItem}>
                            <span className={styles.subcatName}>{sub.name}</span>
                            <button
                              className={styles.subcatDeleteBtn}
                              onClick={() => handleDeleteSubcategory(sub.id)}
                              title="Remover"
                            >&times;</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className={styles.subcatAddRow}>
                      <input
                        type="text"
                        placeholder="Nova subcategoria..."
                        value={newSubcategoryInputs[cat.name] || ''}
                        onChange={e => setNewSubcategoryInputs(prev => ({ ...prev, [cat.name]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubcategory(cat.name); } }}
                        className={styles.subcatInput}
                      />
                      <button
                        onClick={() => handleAddSubcategory(cat.name)}
                        className={styles.subcatAddBtn}
                      >+</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
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