import React, { useState, useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import styles from './TagsEvolutionChart.module.css';

const COLORS = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#E7E9ED', '#8DDF3C', '#F45B5B', '#7798BF',
    '#24CBE5', '#64E572', '#FFC233', '#50B432', '#ED561B',
    '#DDDF00', '#FF9655', '#FFF263', '#6AF9C4'
];

const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const TagsEvolutionChart = ({ transactions }) => {
    const [period, setPeriod] = useState('6m'); // '6m', '1y', 'all'

    const { data, uniqueTags } = useMemo(() => {
        // Filter out incomes, we only want expenses
        let expenses = transactions.filter(tx => tx.type === 'expense' || !tx.type);

        const now = new Date();
        let startDate = null;

        // Set up the boundary dates strictly covering complete months
        if (period === '6m') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        } else if (period === '1y') {
            startDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
        }

        if (startDate) {
            expenses = expenses.filter(tx => tx.createdAt.toDate() >= startDate);
        }

        const monthlyDataMap = new Map();
        const uniqueTagsSet = new Set();

        expenses.forEach(tx => {
            const date = tx.createdAt.toDate();

            const monthStr = date.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
            const yearStr = date.getFullYear().toString().slice(-2);
            const monthYear = `${monthStr.charAt(0).toUpperCase() + monthStr.slice(1)}/${yearStr}`;

            const sortKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

            if (!monthlyDataMap.has(sortKey)) {
                monthlyDataMap.set(sortKey, { name: monthYear, sortKey });
            }

            const monthData = monthlyDataMap.get(sortKey);
            const tags = tx.tags || [];

            if (tags.length > 0) {
                tags.forEach(tag => {
                    uniqueTagsSet.add(tag);
                    monthData[tag] = (monthData[tag] || 0) + tx.amount;
                });
            }
        });

        const sortedData = Array.from(monthlyDataMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        return {
            data: sortedData,
            uniqueTags: Array.from(uniqueTagsSet)
        };

    }, [transactions, period]);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <select
                    className={styles.periodSelector}
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                >
                    <option value="6m">Últimos 6 meses</option>
                    <option value="1y">Último 1 ano</option>
                    <option value="all">Todo o período</option>
                </select>
            </div>

            <div className={styles.chartWrapper}>
                {data.length > 0 && uniqueTags.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                            <XAxis dataKey="name" stroke="#ccc" tick={{ fill: '#ccc' }} />
                            <YAxis
                                stroke="#ccc"
                                tick={{ fill: '#ccc' }}
                                tickFormatter={(value) => `R$ ${value}`}
                            />
                            <Tooltip
                                formatter={(value, name) => [formatCurrency(value), name]}
                                contentStyle={{ backgroundColor: '#1e1e2d', borderColor: '#333', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />

                            {uniqueTags.map((tag, index) => (
                                <Bar
                                    key={tag}
                                    dataKey={tag}
                                    stackId="a"
                                    fill={COLORS[index % COLORS.length]}
                                    radius={[uniqueTags.length === 1 ? 4 : 0, uniqueTags.length === 1 ? 4 : 0, 0, 0]}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
                        Nenhum dado de tag encontrado para este período.
                    </div>
                )}
            </div>
        </div>
    );
};

export default TagsEvolutionChart;
