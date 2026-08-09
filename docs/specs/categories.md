# Spec: Categorias

## O que é

Categorias classificam cada transação em renda ou despesa. São criadas pelo usuário e referenciadas pelo nome (desnormalizado) nas transações.

---

## Modelo de dados (Firestore: `categories`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `userId` | string | sim | UID do Firebase Auth |
| `name` | string | sim | Nome da categoria (ex: "Alimentação", "Salário") |
| `type` | string | sim | `"expense"` ou `"income"` |
| `createdAt` | Timestamp | sim | Data de criação |

---

## Regras de negócio

- Nomes são comparados com normalização (sem acentos, lowercase) para validação no bot e no frontend
- O nome original (com acentos e capitalização) é salvo nas transações
- Não há hierarquia — categorias são planas
- Categorias de tipo `"expense"` aparecem para lançamento de despesas
- Categorias de tipo `"income"` aparecem para lançamento de rendas
- Ao excluir uma categoria, as transações existentes **não são afetadas** — o nome já está copiado
- Categorias especiais usadas internamente (não criadas pelo usuário):
  - `"transferência"` — criada automaticamente em transferências entre contas
  - `"saldo anterior"` — criada pelo cron de fechamento mensal
  - `"dívida anterior"` — criada pelo cron de fechamento mensal quando saldo é negativo

---

## Criação via Apollo AI

O Apollo AI pode criar categorias automaticamente ao importar um extrato bancário:
- Se uma transação do extrato não encontrar categoria existente compatível, o Apollo **propõe uma nova categoria** ao usuário
- Após confirmação do usuário, a categoria é criada e usada na transação
- O usuário também pode pedir ao Apollo via chat: `"Cria uma categoria chamada Streaming"`
- Ver [apollo-ai.md](apollo-ai.md) para o fluxo completo

---

## Componentes relacionados

- `CategoryManager.jsx` — CRUD de categorias no dashboard
- `EditCategoryModal.jsx` — edição
- `CategoryFilter.jsx` — filtro por categoria no Dashboard
- `BudgetManager.jsx` — usa categorias de despesa para criar orçamentos
