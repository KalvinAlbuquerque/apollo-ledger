// src/components/ExpenseChart.jsx

import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// É necessário registrar os componentes do Chart.js que vamos usar
ChartJS.register(ArcElement, Tooltip, Legend);

function SummaryChart({ chartData, title }) { 
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top', // Posição da legenda
      },
      title: {
        display: true,
        text: title,
        color: '#E0E0E0',
        font: { size: 16 }
      },
      legend: {
        labels: { color: '#A0A0A0' } // Cor da legenda
      }
    },
  };

  return <Doughnut data={chartData} options={options} />;
}

export default SummaryChart;