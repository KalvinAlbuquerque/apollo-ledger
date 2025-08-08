// src/components/EditModal.jsx
import React, { useState, useEffect } from 'react';
import styles from './EditModal.module.css'; // Vamos criar este arquivo de estilo a seguir

function EditModal({ transaction, onSave, onCancel, categories }) {
  const [formData, setFormData] = useState({ amount: '', category: '', description: '' });

  // Preenche o formulário quando uma transação é selecionada para edição
  useEffect(() => {
    if (transaction) {
      setFormData({
        amount: transaction.amount || '',
        category: transaction.category || '',
        description: transaction.description || '',
      });
    }
  }, [transaction]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...formData, amount: parseFloat(formData.amount) });
  };

  if (!transaction) return null; // Não renderiza nada se não houver transação para editar

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Editar Transação</h2>
        <form onSubmit={handleSubmit}>
          <label>Valor (R$):</label>
          <input
            type="number"
            name="amount"
            value={formData.amount}
            onChange={handleChange}
            required
          />

          <label>Categoria:</label>
          <select name="category" value={formData.category} onChange={handleChange} required>
            {categories.map(cat => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>

          <label>Descrição:</label>
          <input
            type="text"
            name="description"
            value={formData.description}
            onChange={handleChange}
          />
          
          <div className={styles.buttonGroup}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>Cancelar</button>
            <button type="submit" className={styles.saveButton}>Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditModal;