// src/components/EditGoalModal.jsx
import React, { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import styles from './EditModal.module.css';

function EditGoalModal({ goal, onSave, onCancel }) {
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState(''); // Estado para a data

  // Função para formatar a data do Firestore para o input (AAAA-MM-DD)
  const formatDateForInput = (timestamp) => {
    if (!timestamp) return '';
    return timestamp.toDate().toISOString().split('T')[0];
  };

  useEffect(() => {
    if (goal) {
      setGoalName(goal.goalName || '');
      setTargetAmount(goal.targetAmount || '');
      setTargetDate(formatDateForInput(goal.targetDate)); // Preenche a data
    }
  }, [goal]);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Cria a data em UTC para evitar problemas de fuso horário
    const correctedDate = new Date(`${targetDate}T12:00:00Z`);
    
    const updatedData = {
      goalName: goalName,
      targetAmount: parseFloat(targetAmount),
      targetDate: Timestamp.fromDate(correctedDate), // Converte de volta para o formato do Firestore
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
            value={goalName}
            onChange={(e) => setGoalName(e.target.value)}
            required
          />

          <label>Valor Alvo (R$):</label>
          <input
            type="number"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            required
          />

          {/* NOVO CAMPO DE DATA ALVO */}
          <label>Data Alvo:</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
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