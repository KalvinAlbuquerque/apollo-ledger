import React, { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import styles from './EditModal.module.css';

function EditModal({ transaction, onSave, onCancel, categories }) {
  const [formData, setFormData] = useState({
    amount: '',
    category: '',
    description: '',
    createdAt: '', // Adicionamos a data ao estado do formulário
  });

  // Função para formatar a data do Firestore para o input (AAAA-MM-DD)
  const formatDateForInput = (timestamp) => {
    if (!timestamp) return '';
    return timestamp.toDate().toISOString().split('T')[0];
  };

  // Preenche o formulário quando o modal abre com uma nova transação
  useEffect(() => {
    if (transaction) {
      setFormData({
        amount: transaction.amount || '',
        category: transaction.category || '',
        description: transaction.description || '',
        createdAt: formatDateForInput(transaction.createdAt),
      });
    }
  }, [transaction]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // --- CORREÇÃO DE FUSO HORÁRIO ---
    // A string 'T12:00:00Z' define o horário como meio-dia em UTC,
    // garantindo que a data nunca seja "puxada" para o dia anterior pela conversão.
    const correctedDate = new Date(`${formData.createdAt}T12:00:00Z`);
    
    const updatedData = {
      amount: parseFloat(formData.amount),
      category: formData.category,
      description: formData.description,
      createdAt: Timestamp.fromDate(correctedDate), // Usa a data corrigida
    };
    onSave(updatedData);
  };

  if (!transaction) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Editar Transação</h2>
        <form onSubmit={handleSubmit}>
          <label>Data:</label>
          <input
            type="date"
            name="createdAt"
            value={formData.createdAt}
            onChange={handleChange}
            required
          />

          <label>Valor (R$):</label>
          <input
            type="number"
            name="amount"
            value={formData.amount}
            onChange={handleChange}
            required
            step="0.01"
          />

          <label>Categoria:</label>
          <select name="category" value={formData.category} onChange={handleChange} required>
            {categories
              .filter(cat => cat.type === transaction.type)
              .map(cat => (
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
            <button type="submit" className={styles.saveButton}>Salvar Alterações</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditModal;