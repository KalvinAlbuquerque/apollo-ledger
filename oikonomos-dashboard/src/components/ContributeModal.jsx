// src/components/ContributeModal.jsx
import React, { useState } from 'react';
import styles from './EditModal.module.css'; // Reutilizaremos o estilo do outro modal

function ContributeModal({ goal, onSave, onCancel }) {
  const [amount, setAmount] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      // Podemos adicionar um toast de erro aqui depois!
      alert("Valor inválido");
      return;
    }
    onSave(goal.id, parsedAmount);
  };

  if (!goal) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Adicionar à Meta</h2>
        <p><strong>Meta:</strong> {goal.goalName}</p>
        <form onSubmit={handleSubmit}>
          <label>Valor a Adicionar (R$):</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus // Foca no campo de input automaticamente
            required
          />
          <div className={styles.buttonGroup}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>Cancelar</button>
            <button type="submit" className={styles.saveButton}>Adicionar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ContributeModal;