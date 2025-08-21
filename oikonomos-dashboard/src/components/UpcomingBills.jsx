// oikonomos-dashboard/src/components/UpcomingBills.jsx
import React from 'react';
import styles from './UpcomingBills.module.css';

const formatDate = (timestamp) => {
  if (!timestamp) return '-';
  // Usamos timeZone UTC para evitar problemas de fuso horário que podem mudar o dia
  return timestamp.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(value);

function UpcomingBills({ bills }) {
  if (!bills || bills.length === 0) {
    return <p className={styles.emptyMessage}>Nenhuma conta pendente para os próximos meses. Você está em dia!</p>;
  }

  return (
    <div className={styles.billsList}>
      {bills.map(bill => (
        <div key={bill.id} className={styles.billItem}>
          <div className={styles.billInfo}>
            <span className={styles.billDescription}>{bill.description}</span>
            <span className={styles.billCategory}>{bill.categoryName}</span>
          </div>
          <div className={styles.billDetails}>
            <span className={styles.billDueDate}>Vence em: {formatDate(bill.dueDate)}</span>
            <span className={styles.billAmount}>{formatCurrency(bill.amount)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default UpcomingBills;