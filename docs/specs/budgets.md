# Spec: Orçamentos

## O que é

Define limites mensais de gasto por categoria. Permite ao usuário acompanhar se está dentro do planejado e receber feedback no Telegram ao lançar uma despesa.

---

## Modelo de dados (Firestore: `budgets`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `userId` | string | sim | UID do Firebase Auth |
| `categoryName` | string | sim | Nome da categoria (cópia desnormalizada) |
| `amount` | number | sim | Limite mensal em BRL |
| `month` | number | sim | Mês (1-12) |
| `year` | number | sim | Ano (ex: 2025) |

---

## Regras de negócio

- Um orçamento é **mensal e por categoria** — um documento por (userId, categoryName, month, year)
- O orçamento não deve ultrapassar a renda total do mês (validação no frontend)
- Ao lançar uma despesa no Telegram, o bot calcula quanto já foi gasto na categoria no mês e retorna feedback:
  - Quanto foi gasto vs. o limite
  - Quantos dias restam no mês e quanto pode gastar por dia
  - Se o limite foi ultrapassado, avisa com emoji de alerta
- Orçamentos só podem ser criados para categorias do tipo `"expense"`

---

## Cálculo de allowance diário

Ao receber feedback de orçamento no Telegram:

```
gasto_hoje = soma das despesas da categoria no dia atual
gasto_mes = soma das despesas da categoria no mês atual
saldo_restante = orcamento.amount - gasto_mes
dias_restantes = dias_no_mes - dia_atual + 1
allowance_diario = saldo_restante / dias_restantes
```

---

## Componentes relacionados

- `BudgetManager.jsx` — CRUD de orçamentos
- `send_budget_feedback()` em `bot.py` — função que calcula e envia o feedback pós-lançamento no Telegram
- `ForecastPage.jsx` — usa orçamentos para projeção de gastos
