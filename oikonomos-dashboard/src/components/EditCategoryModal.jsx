// src/components/EditCategoryModal.jsx
import React, { useState, useEffect } from 'react';
import styles from './EditModal.module.css'; // Reutilizaremos o estilo do outro modal

function EditCategoryModal({ category, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');

  useEffect(() => {
    if (category) {
      setName(category.name || '');
      setType(category.type || 'expense');
    }
  }, [category]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const updatedData = {
      name: name.trim().toLowerCase(),
      type: type,
    };
    onSave(category.id, updatedData);
  };

  if (!category) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Editar Categoria</h2>
        <form onSubmit={handleSubmit}>
          <label>Nome da Categoria:</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <label>Tipo:</label>
          <div className={styles.radioGroup}>
            <label>
              <input 
                type="radio" 
                value="expense" 
                checked={type === 'expense'} 
                onChange={(e) => setType(e.target.value)}
              />
              Despesa
            </label>
            <label>
              <input 
                type="radio" 
                value="income" 
                checked={type === 'income'} 
                onChange={(e) => setType(e.target.value)}
              />
              Renda
            </label>
          </div>
          
          <div className={styles.buttonGroup}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>Cancelar</button>
            <button type="submit" className={styles.saveButton}>Salvar Alterações</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditCategoryModal;