// src/components/EditGoalModal.jsx
import React from 'react';
import styles from './EditModal.module.css'; // Reutilizamos o estilo do outro modal

function EditGoalModal({ goal, onSave, onCancel }) {
  // Usaremos um formulário não controlado para simplicidade,
  // mas você pode usar 'useState' como fizemos no outro modal se preferir.
  
  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const updatedData = {
      goalName: formData.get('goalName'),
      targetAmount: parseFloat(formData.get('targetAmount')),
    };
    onSave(goal.id, updatedData);
  };

  if (!goal) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Editar Meta</h2>
        <form onSubmit={handleSubmit}>
          <label>Nome da Meta:</label>
          <input
            type="text"
            name="goalName"
            defaultValue={goal.goalName} // Preenche com o valor atual
            required
          />

          <label>Valor Alvo (R$):</label>
          <input
            type="number"
            name="targetAmount"
            defaultValue={goal.targetAmount} // Preenche com o valor atual
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

export default EditGoalModal;