// oikonomos-dashboard/src/components/CategoryFilter.jsx
import React, { useState, useMemo } from 'react';
import styles from './CategoryFilter.module.css';

function CategoryFilter({ allCategories, selectedCategories, onSelectionChange }) {
  // Estado para controlar qual seção está recolhida
  const [isCollapsed, setIsCollapsed] = useState({
    income: false,
    expense: false,
  });

  // Separa as categorias por tipo para renderizar em grupos
  const { incomeCategories, expenseCategories } = useMemo(() => {
    const income = allCategories.filter(c => c.type === 'income').map(c => c.name).sort();
    const expense = allCategories.filter(c => c.type === 'expense').map(c => c.name).sort();
    return { incomeCategories: income, expenseCategories: expense };
  }, [allCategories]);

  const handleToggleCollapse = (type) => {
    setIsCollapsed(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleCheckboxChange = (category) => {
    const newSelection = new Set(selectedCategories);
    if (newSelection.has(category)) {
      newSelection.delete(category);
    } else {
      newSelection.add(category);
    }
    onSelectionChange(newSelection);
  };

  const handleSelectAll = (type = 'all') => {
    if (type === 'all') {
        onSelectionChange(new Set([...incomeCategories, ...expenseCategories]));
    } else if (type === 'income') {
        onSelectionChange(new Set([...selectedCategories, ...incomeCategories]));
    } else { // expense
        onSelectionChange(new Set([...selectedCategories, ...expenseCategories]));
    }
  };

  const handleClearAll = (type = 'all') => {
    if (type === 'all') {
        onSelectionChange(new Set());
    } else {
        const newSelection = new Set(selectedCategories);
        const categoriesToClear = type === 'income' ? incomeCategories : expenseCategories;
        categoriesToClear.forEach(cat => newSelection.delete(cat));
        onSelectionChange(newSelection);
    }
  };

  // Componente auxiliar para renderizar cada grupo
  const renderGroup = (title, type, categories) => (
    <div className={styles.group}>
      <div className={styles.groupHeader} onClick={() => handleToggleCollapse(type)}>
        <strong>{title}</strong>
        <span className={`${styles.arrow} ${isCollapsed[type] ? styles.collapsed : ''}`}>▼</span>
      </div>
      {!isCollapsed[type] && (
        <div className={styles.groupContent}>
          <div className={styles.groupActions}>
              <button onClick={() => handleSelectAll(type)}>Marcar todas</button>
              <button onClick={() => handleClearAll(type)}>Limpar</button>
          </div>
          {categories.map(category => (
            <label key={category} className={styles.categoryItem}>
              <input
                type="checkbox"
                checked={selectedCategories.has(category)}
                onChange={() => handleCheckboxChange(category)}
              />
              {category}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.filterDropdown}>
      <div className={styles.buttonGroup}>
        <button onClick={() => handleSelectAll('all')}>Selecionar Todas</button>
        <button onClick={() => handleClearAll('all')}>Limpar Tudo</button>
      </div>
      <div className={styles.categoryList}>
        {/* Renderiza apenas os grupos que têm categorias */}
        {expenseCategories.length > 0 && renderGroup('Despesas', 'expense', expenseCategories)}
        {incomeCategories.length > 0 && renderGroup('Rendas', 'income', incomeCategories)}
      </div>
    </div>
  );
}

export default CategoryFilter;