// src/components/BudgetStatus.jsx

import React from 'react';
import styles from './BudgetStatus.module.css';

function BudgetStatus({ budgetProgress }) {
  return (
    <div className={styles.container}>
      <h2>Progresso dos Orçamentos do Mês</h2>
      <div className={styles.progressList}>
        {budgetProgress.length > 0 ? (
          budgetProgress.map(({ category, spent, budget }) => {
            const percentage = budget > 0 ? (spent / budget) * 100 : 0;
            const isOverBudget = percentage > 100;

            return (
              <div key={category} className={styles.progressItem}>
                <div className={styles.labels}>
                  <span className={styles.categoryName}>{category}</span>
                  <span className={styles.amountText}>
                    R$ {spent.toFixed(2)} / R$ {budget.toFixed(2)}
                  </span>
                </div>
                <div className={styles.progressBar}>
                  <div 
                    className={`${styles.progressFill} ${isOverBudget ? styles.overBudget : ''}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }} // Limita a barra em 100%
                  ></div>
                </div>
              </div>
            );
          })
        ) : (
          <p>Nenhum orçamento definido para este mês.</p>
        )}
      </div>
    </div>
  );
}

export default BudgetStatus;