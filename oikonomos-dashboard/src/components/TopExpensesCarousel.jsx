import React, { useState, useEffect } from 'react';
import styles from './TopExpensesCarousel.module.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const PAGE_SIZE = 10;

function TopExpensesCarousel({ categoryData, tagData, categorySubBreakdown = {} }) {
  const [currentView, setCurrentView] = useState('categories');
  const [catPage, setCatPage] = useState(0);
  const [tagPage, setTagPage] = useState(0);
  const [drillCategory, setDrillCategory] = useState(null);

  // Reset pages when data changes (e.g. period filter changed)
  useEffect(() => { setCatPage(0); setTagPage(0); setDrillCategory(null); }, [categoryData, tagData]);

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

  // Drill-down: subcategory data for the selected category
  const drillData = drillCategory ? (categorySubBreakdown[drillCategory] || []) : null;
  const drillRows = drillData ? [...drillData] : [];
  while (drillRows.length < PAGE_SIZE) drillRows.push(null);
  const drillMax = drillData && drillData.length > 0 ? drillData[0].value : 1;

  const handleSwitchView = (view) => {
    setCurrentView(view);
    setDrillCategory(null);
  };

  const handleCategoryClick = (item) => {
    if (!isCat || !item) return;
    const subs = categorySubBreakdown[item.name];
    if (subs && subs.length > 0) {
      setDrillCategory(item.name);
    }
  };

  if (drillCategory) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => setDrillCategory(null)}>← Voltar</button>
          <h3 className={styles.title}>{drillCategory}</h3>
        </div>

        <div className={styles.rankList}>
          {drillRows.map((item, i) => (
            <div key={i} className={`${styles.rankItem} ${!item ? styles.rankItemEmpty : ''}`}>
              {item ? (
                <>
                  <span className={styles.rankPosition}>{i + 1}</span>
                  <div className={styles.rankBar}>
                    <div
                      className={styles.rankBarFill}
                      style={{ width: `${Math.round((item.value / drillMax) * 100)}%` }}
                    />
                  </div>
                  <span className={styles.rankName}>{item.name}</span>
                  <span className={styles.rankAmount}>{formatCurrency(item.value)}</span>
                </>
              ) : (
                <span className={styles.rankPosition} style={{ color: 'transparent' }}>—</span>
              )}
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <span className={styles.pageInfo}>
            {drillData.length === 0 ? 'Sem subcategorias' : `${drillData.length} subcategoria${drillData.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>
    );
  }

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
          rows.map((item, i) => {
            const hasSubs = isCat && item && categorySubBreakdown[item.name]?.length > 0;
            return (
              <div
                key={i}
                className={`${styles.rankItem} ${!item ? styles.rankItemEmpty : ''} ${hasSubs ? styles.rankItemDrillable : ''}`}
                onClick={() => handleCategoryClick(item)}
                title={hasSubs ? `Ver subcategorias de "${item?.name}"` : undefined}
              >
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
                    {hasSubs && <span className={styles.drillIcon}>›</span>}
                    <span className={styles.rankAmount}>{formatCurrency(item.value)}</span>
                  </>
                ) : (
                  <span className={styles.rankPosition} style={{ color: 'transparent' }}>—</span>
                )}
              </div>
            );
          })
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
