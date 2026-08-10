import React, { useState, useEffect } from 'react';
import styles from './TopExpensesCarousel.module.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const PAGE_SIZE = 10;

function TopExpensesCarousel({ categoryData, tagData }) {
  const [currentView, setCurrentView] = useState('categories');
  const [catPage, setCatPage] = useState(0);
  const [tagPage, setTagPage] = useState(0);

  // Reset pages when data changes (e.g. period filter changed)
  useEffect(() => { setCatPage(0); setTagPage(0); }, [categoryData, tagData]);

  const isCat = currentView === 'categories';
  const data = isCat ? categoryData : tagData;
  const currentPage = isCat ? catPage : tagPage;
  const setPage = isCat ? setCatPage : setTagPage;
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));

  const pageStart = currentPage * PAGE_SIZE;
  const pageData = data.slice(pageStart, pageStart + PAGE_SIZE);

  // Always fill to PAGE_SIZE rows so the card height never changes
  const rows = [...pageData];
  while (rows.length < PAGE_SIZE) rows.push(null);

  const firstRank = pageStart + 1;
  const lastRank = Math.min(pageStart + PAGE_SIZE, data.length);

  const handleSwitchView = (view) => {
    setCurrentView(view);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          {isCat ? 'Despesas por Categoria' : 'Despesas por Tag'}
        </h3>
        <div className={styles.viewToggle}>
          <button
            onClick={() => handleSwitchView('categories')}
            className={`${styles.toggleBtn} ${isCat ? styles.toggleBtnActive : ''}`}
          >Categorias</button>
          <button
            onClick={() => handleSwitchView('tags')}
            className={`${styles.toggleBtn} ${!isCat ? styles.toggleBtnActive : ''}`}
          >Tags</button>
        </div>
      </div>

      <div className={styles.rankList}>
        {data.length === 0 ? (
          <>
            {rows.map((_, i) => (
              <div key={i} className={`${styles.rankItem} ${styles.rankItemEmpty}`}>
                <span className={styles.rankPosition}>—</span>
              </div>
            ))}
          </>
        ) : (
          rows.map((item, i) => (
            <div key={i} className={`${styles.rankItem} ${!item ? styles.rankItemEmpty : ''}`}>
              {item ? (
                <>
                  <span className={styles.rankPosition}>{pageStart + i + 1}</span>
                  <div className={styles.rankBar}>
                    <div
                      className={styles.rankBarFill}
                      style={{ width: `${Math.round((item.value / data[0].value) * 100)}%` }}
                    />
                  </div>
                  <span className={styles.rankName}>
                    {isCat ? item.name : `#${item.name}`}
                  </span>
                  <span className={styles.rankAmount}>{formatCurrency(item.value)}</span>
                </>
              ) : (
                <span className={styles.rankPosition} style={{ color: 'transparent' }}>—</span>
              )}
            </div>
          ))
        )}
      </div>

      <div className={styles.footer}>
        <button
          className={styles.pageBtn}
          onClick={() => setPage(p => p - 1)}
          disabled={currentPage === 0}
        >&lt;</button>
        <span className={styles.pageInfo}>
          {data.length === 0
            ? 'Sem despesas'
            : `${firstRank}–${lastRank} de ${data.length}`}
        </span>
        <button
          className={styles.pageBtn}
          onClick={() => setPage(p => p + 1)}
          disabled={currentPage >= totalPages - 1}
        >&gt;</button>
      </div>
    </div>
  );
}

export default TopExpensesCarousel;
