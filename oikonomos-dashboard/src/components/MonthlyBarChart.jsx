// src/components/MonthlyBarChart.jsx
import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

// Regista todos os elementos necessários para o Chart.js
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function MonthlyBarChart({ chartData }) {
  const options = {
    responsive: true,
    maintainAspectRatio: false, // Permite que o gráfico se ajuste à altura do container
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#A0A0A0' }
      },
      title: {
        display: false // O título estará no card, não no gráfico
      },
    },
    scales: {
        x: {
            ticks: { color: '#A0A0A0' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' } // Linhas de grade mais subtis
        },
        y: {
            ticks: { color: '#A0A0A0' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
        }
    }
  };

  return <Bar options={options} data={chartData} />;
}

export default MonthlyBarChart;