import React from 'react';
import styles from './ExpenseRank.module.css';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function ExpenseRank({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className={styles.container}>
        <h3>Top 10 Categorias de Despesa</h3>
        <p className={styles.emptyMessage}>Não há despesas para exibir neste período.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3>Top 10 Categorias de Despesa</h3>
      <ul className={styles.rankList}>
        {data.map((item, index) => (
          <li key={item.category} className={styles.rankItem}>
            <span className={styles.rankPosition}>{index + 1}</span>
            <span className={styles.rankCategory}>{item.category}</span>
            <span className={styles.rankAmount}>{formatCurrency(item.totalAmount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ExpenseRank;