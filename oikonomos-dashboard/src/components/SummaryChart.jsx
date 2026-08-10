import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const PALETTE = [
  '#4A90E2', '#E25F4A', '#4AE28A', '#E2C44A', '#A44AE2',
  '#4AE2D4', '#E24A9E', '#7BE24A', '#E2874A', '#4A6DE2',
  '#E24A4A', '#4AE2C4', '#C4E24A', '#8A4AE2', '#E2AF4A',
];

const formatBRL = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const toTitleCase = (str) =>
  str ? str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : str;

function SummaryChart({ chartData }) {
  if (!chartData || !chartData.labels || chartData.labels.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: '0.9rem', fontStyle: 'italic' }}>
        Sem dados no período
      </div>
    );
  }

  const styledData = {
    ...chartData,
    labels: chartData.labels.map(toTitleCase),
    datasets: chartData.datasets.map((ds, di) => ({
      ...ds,
      backgroundColor: chartData.labels.map((_, i) => PALETTE[(i + di * 5) % PALETTE.length]),
      borderColor: '#141414',
      borderWidth: 2,
      hoverBorderWidth: 3,
      hoverOffset: 6,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    animation: { animateRotate: true, duration: 600 },
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#aaa',
          font: { size: 11, family: 'inherit' },
          boxWidth: 10,
          boxHeight: 10,
          borderRadius: 3,
          useBorderRadius: true,
          padding: 10,
          generateLabels: (chart) => {
            const ds = chart.data.datasets[0];
            return chart.data.labels.map((label, i) => ({
              text: toTitleCase(String(label)),
              fillStyle: ds.backgroundColor[i],
              strokeStyle: 'transparent',
              index: i,
              hidden: false,
            }));
          },
        },
      },
      tooltip: {
        backgroundColor: '#1e1e1e',
        borderColor: '#333',
        borderWidth: 1,
        titleColor: '#e0e0e0',
        bodyColor: '#aaa',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
            return ` ${formatBRL(ctx.parsed)}  (${pct}%)`;
          },
        },
      },
    },
  };

  return <Doughnut data={styledData} options={options} />;
}

export default SummaryChart;
