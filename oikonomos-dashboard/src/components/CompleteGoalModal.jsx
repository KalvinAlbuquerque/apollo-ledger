// src/components/CompleteGoalModal.jsx
import React from 'react';
import styles from './EditModal.module.css'; // Reutilizamos o estilo

function CompleteGoalModal({ goal, accounts, onSave, onCancel }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const destination = formData.get('destination');
    const isReserve = formData.get('isReserve') === 'on'; // Checkbox value is 'on' if checked
    onSave(goal, destination, isReserve);
  };

  if (!goal) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Concluir Meta: {goal.goalName}</h2>
        <p>Parabéns! Você atingiu ou ultrapassou sua meta. O que deseja fazer com os <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.savedAmount)}</strong> acumulados?</p>
        
        <form onSubmit={handleSubmit}>
          <label>Destino do Valor:</label>
          <select name="destination" required>
            <option value="" disabled>Selecione uma opção...</option>
            <optgroup label="Contas Existentes">
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.accountName}</option>
              ))}
            </optgroup>
            <optgroup label="Nova Opção">
              <option value="new_account">Criar nova conta com o nome da meta</option>
            </optgroup>
          </select>

          {/* Este campo só aparecerá se a opção de criar nova conta for selecionada,
              mas para simplificar a lógica inicial, vamos deixá-lo sempre visível por enquanto. */}
          <div className={styles.checkboxGroup} style={{marginTop: '15px'}}>
            <input type="checkbox" id="isReserve" name="isReserve" />
            <label htmlFor="isReserve">Marcar nova conta como uma reserva?</label>
          </div>
          
          <div className={styles.buttonGroup}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>Cancelar</button>
            <button type="submit" className={styles.saveButton}>Confirmar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CompleteGoalModal;