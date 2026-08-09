# Spec: Relatórios

## O que é

Visualizações históricas de renda e despesa. Permite ao usuário analisar seus gastos por período, categoria e tag.

---

## Localização

`src/pages/ReportsPage.jsx`

---

## Funcionalidades

### Filtros disponíveis
- Período (mês/ano ou intervalo customizado)
- Conta
- Categoria
- Tag

### Visualizações

| Gráfico | Componente | Descrição |
|---|---|---|
| Barras mensais | `MonthlyBarChart.jsx` | Renda vs despesa por mês |
| Barras diárias | `DailyBarChart.jsx` | Gastos por dia dentro de um mês |
| Linha mensal | `LineChart.jsx` | Evolução de saldo ao longo do tempo |
| Pizza/Donut por categoria | `SummaryChart.jsx` | Distribuição de gastos por categoria |
| Linha por categoria | `CategoryLineChart.jsx` | Evolução de uma categoria ao longo dos meses |
| Tags | `TagChart.jsx` | Distribuição por tag em um período |
| Evolução de tags | `TagsEvolutionChart.jsx` | Evolução de tags mês a mês |

---

## Regras de negócio

- Todos os cálculos são feitos no frontend — os dados são carregados do Firestore e processados com `useMemo`
- Transações da categoria `"transferência"` são excluídas dos totais de renda/despesa para não distorcer os números
- Saldo = total de rendas − total de despesas no período
- Quando o Apollo AI for implementado, ele poderá responder perguntas baseadas nesses mesmos dados (ver [apollo-ai.md](apollo-ai.md))

---

## Componentes relacionados

- `ReportsPage.jsx`
- `MonthlyBarChart.jsx`
- `DailyBarChart.jsx`
- `LineChart.jsx`
- `SummaryChart.jsx`
- `CategoryLineChart.jsx`
- `TagChart.jsx`
- `TagsEvolutionChart.jsx`
- `exportUtils.js` — exportação dos dados em CSV/PDF
