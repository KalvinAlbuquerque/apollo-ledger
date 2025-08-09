// src/components/EditDebtModal.jsx
import React from 'react';
import styles from './EditModal.module.css'; // Reutilizamos o mesmo estilo

function EditDebtModal({ debt, onSave, onCancel, expenseCategories }) {
  
  // Função para formatar a data do Firestore para o input type="date"
  const formatDateForInput = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    // Retorna no formato AAAA-MM-DD
    return date.toISOString().split('T')[0];
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const updatedData = {
      description: formData.get('description'),
      amount: parseFloat(formData.get('amount')),
      categoryName: formData.get('categoryName'),
      // Converte a data de volta para o formato do Firestore
      dueDate: new Date(formData.get('dueDate')),
    };
    onSave(debt.id, updatedData);
  };

  if (!debt) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Editar Conta Agendada</h2>
        <form onSubmit={handleSubmit}>
          <label>Descrição:</label>
          <input
            type="text"
            name="description"
            defaultValue={debt.description}
            required
          />

          <label>Valor (R$):</label>
          <input
            type="number"
            name="amount"
            defaultValue={debt.amount}
            step="0.01" // Permite centavos
            required
          />
          
          <label>Categoria:</label>
          <select name="categoryName" defaultValue={debt.categoryName} required>
            {expenseCategories.map(cat => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>

          <label>Data de Vencimento:</label>
          <input
            type="date"
            name="dueDate"
            defaultValue={formatDateForInput(debt.dueDate)}
            required
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

export default EditDebtModal;