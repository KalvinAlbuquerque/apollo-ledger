// src/components/DailyBarChart.jsx
import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function DailyBarChart({ chartData, title }) {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: title,
        color: '#E0E0E0',
        font: { size: 16 }
      },
    },
    scales: {
        x: { ticks: { color: '#A0E0E0' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
        y: { ticks: { color: '#A0E0E0' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }
    }
  };

  return <Bar options={options} data={chartData} />;
}

export default DailyBarChart;