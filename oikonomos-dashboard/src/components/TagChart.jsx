import React, { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

function TagChart({ transactions }) {
    const chartData = useMemo(() => {
        if (!transactions || transactions.length === 0) {
            return { labels: [], datasets: [] };
        }

        // 1. Filtrar apenas despesas
        const expenses = transactions.filter(tx => tx.type === 'expense' || !tx.type);

        // 2. Acumular valores por tag
        const tagTotals = {};
        expenses.forEach(tx => {
            if (tx.tags && tx.tags.length > 0) {
                tx.tags.forEach(tag => {
                    tagTotals[tag] = (tagTotals[tag] || 0) + tx.amount;
                });
            }
        });

        // 3. Converter para array, ordenar e pegar top 10
        const sortedTags = Object.entries(tagTotals)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        // 4. Formatar para o Chart.js
        const labels = sortedTags.map(tag => `#${tag.name}`);
        const data = sortedTags.map(tag => tag.value);

        // Cores vibrantes para o gráfico de rosca
        const backgroundColors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
            '#FF9F40', '#8DDF3C', '#F45B5B', '#24CBE5', '#64E572'
        ];

        return {
            labels,
            datasets: [
                {
                    data,
                    backgroundColor: backgroundColors.slice(0, data.length),
                    borderColor: '#1E1E1E',
                    borderWidth: 2,
                },
            ],
        };
    }, [transactions]);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: { color: '#A0A0A0', font: { size: 12 } }
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        let label = context.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed !== null) {
                            label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed);
                        }
                        return label;
                    }
                }
            }
        }
    };

    if (!chartData.labels || chartData.labels.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
                Nenhuma tag utilizada neste período.
            </div>
        );
    }

    return <Doughnut options={options} data={chartData} />;
}

export default TagChart;
