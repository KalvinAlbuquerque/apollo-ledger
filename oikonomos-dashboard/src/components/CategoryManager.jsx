// src/components/CategoryManager.jsx

import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';

function CategoryManager() {
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);

  const user = auth.currentUser;

  // Função para buscar as categorias do usuário
  const fetchCategories = async () => {
    if (!user) return;
    setLoading(true);
    const q = query(collection(db, "categories"), where("userId", "==", user.uid));
    const querySnapshot = await getDocs(q);
    const userCategories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setCategories(userCategories);
    setLoading(false);
  };

  // Busca as categorias quando o componente é montado
  useEffect(() => {
    fetchCategories();
  }, [user]);

  // Função para adicionar uma nova categoria
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (newCategory.trim() === '') return;

    try {
      await addDoc(collection(db, "categories"), {
        name: newCategory.toLowerCase(),
        userId: user.uid,
      });
      setNewCategory('');
      fetchCategories(); // Atualiza a lista após adicionar
    } catch (error) {
      console.error("Erro ao adicionar categoria:", error);
    }
  };

  // Função para deletar uma categoria
  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm("Tem certeza que deseja apagar esta categoria?")) return;

    try {
      await deleteDoc(doc(db, "categories", categoryId));
      fetchCategories(); // Atualiza a lista após deletar
    } catch (error) {
      console.error("Erro ao deletar categoria:", error);
    }
  };

  if (loading) return <p>Carregando categorias...</p>;

  return (
    <div>
      <h2>Gerenciar Categorias</h2>
      <form onSubmit={handleAddCategory}>
        <input
          type="text"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="Nome da nova categoria"
        />
        <button type="submit">Adicionar</button>
      </form>

      <ul>
        {categories.map(cat => (
          <li key={cat.id}>
            {cat.name}
            <button onClick={() => handleDeleteCategory(cat.id)} style={{ marginLeft: '10px' }}>
              Apagar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CategoryManager;