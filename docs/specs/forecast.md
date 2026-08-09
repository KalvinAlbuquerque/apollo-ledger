# Spec: Previsão de Gastos

## O que é

Projeta os gastos futuros do mês atual com base nos orçamentos definidos, contas pendentes e média histórica de gastos por categoria.

---

## Localização

`src/pages/ForecastPage.jsx`

---

## Lógica de cálculo

### Fontes de dados
1. **Orçamentos** (`budgets`) — limites definidos pelo usuário por categoria
2. **Contas pendentes** (`scheduled_transactions` com `status: "pending"`) — gastos fixos a pagar
3. **Transações do mês atual** — gastos já realizados
4. **Renda do mês** — real (lançada) ou estimada pelo usuário

### Projeção
- Para cada categoria com orçamento: projeta quanto será gasto até o fim do mês
- Contas pendentes são somadas como gasto certo
- A diferença entre renda e gastos projetados mostra a sobra/déficit esperado
- O usuário pode **sobrescrever a renda manualmente** para testar cenários

---

## Funcionalidades da interface

- Slider ou input para ajustar a renda projetada
- Lista de categorias com: gasto atual, orçamento, gasto projetado, percentual
- Indicação visual (cores) se está dentro ou fora do orçamento
- Lista de contas pendentes ainda não pagas no mês

---

## Componentes relacionados

- `ForecastPage.jsx`
