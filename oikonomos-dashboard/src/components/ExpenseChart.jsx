// src/components/ExpenseChart.jsx

import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// É necessário registrar os componentes do Chart.js que vamos usar
ChartJS.register(ArcElement, Tooltip, Legend);

function ExpenseChart({ chartData }) {
  // Opções para customizar a aparência e comportamento do gráfico
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top', // Posição da legenda
      },
      title: {
        display: true,
        text: 'Gastos por Categoria',
      },
    },
  };

  return <Doughnut data={chartData} options={options} />;
}

export default ExpenseChart;