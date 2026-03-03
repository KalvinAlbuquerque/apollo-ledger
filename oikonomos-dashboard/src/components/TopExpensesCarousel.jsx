import React, { useState } from 'react';
import styles from './TopExpensesCarousel.module.css';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function TopExpensesCarousel({ categoryData, tagData }) {
    const [currentView, setCurrentView] = useState('categories'); // 'categories' or 'tags'

    const toggleView = () => {
        setCurrentView(prev => prev === 'categories' ? 'tags' : 'categories');
    };

    const isCategoriesView = currentView === 'categories';
    const data = isCategoriesView ? categoryData : tagData;
    const title = isCategoriesView ? 'Top 10 Categorias de Despesa' : 'Top 10 Despesas por Tag';

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <button className={styles.navArrow} onClick={toggleView}>&lt;</button>
                <div className={styles.headerContent}>
                    <h3>{title}</h3>
                    <div className={styles.pagination}>
                        <span className={`${styles.dot} ${isCategoriesView ? styles.active : ''}`} onClick={() => setCurrentView('categories')}></span>
                        <span className={`${styles.dot} ${!isCategoriesView ? styles.active : ''}`} onClick={() => setCurrentView('tags')}></span>
                    </div>
                </div>
                <button className={styles.navArrow} onClick={toggleView}>&gt;</button>
            </div>

            {!data || data.length === 0 ? (
                <p className={styles.emptyMessage}>Não há despesas para exibir neste período.</p>
            ) : (
                <ul className={styles.rankList}>
                    {data.map((item, index) => (
                        <li key={item.name} className={styles.rankItem}>
                            <span className={styles.rankPosition}>{index + 1}</span>
                            <span className={styles.rankName}>{isCategoriesView ? item.name : `#${item.name}`}</span>
                            <span className={styles.rankAmount}>{formatCurrency(item.value)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default TopExpensesCarousel;
