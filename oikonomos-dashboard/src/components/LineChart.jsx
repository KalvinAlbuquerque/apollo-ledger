// src/components/LineChart.jsx
import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Em oikonomos-dashboard/src/components/LineChart.jsx

function LineChart({ chartData, title }) {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#A0A0A0' }
      },
      title: {
        display: true,
        text: title,
        color: '#E0E0E0',
        font: { size: 16 }
      },
    },
    // A MUDANÇA ESTÁ AQUI
    scales: {
      x: {
        ticks: { color: '#A0A0A0' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      // VERSÃO SIMPLIFICADA COM UM ÚNICO EIXO Y
      y: {
        ticks: { color: '#A0A0A0' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      }
    }
};

return <Line options={options} data={chartData} />;
}

export default LineChart;