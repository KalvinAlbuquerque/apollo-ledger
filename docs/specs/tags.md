# Spec: Tags

## O que é

Marcadores livres que o usuário aplica às transações para agrupamentos transversais (além de categoria). São criadas automaticamente via `#hashtag` na descrição.

---

## Modelo de dados (Firestore: `tags`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `userId` | string | sim | UID do Firebase Auth |
| `name` | string | sim | Nome da tag (lowercase, sem `#`) |
| `isActive` | boolean | sim | Se a tag está ativa |
| `createdAt` | Timestamp | sim | Data de criação |

---

## Regras de negócio

- Tags são extraídas da descrição da transação via regex `#(\w+)`
- O `#` não é armazenado — só o texto da tag, em lowercase
- Se a tag não existe em `tags`, é criada automaticamente no mesmo batch da transação
- Tags são armazenadas no array `tags[]` do documento `transactions`
- Tags inativas (`isActive: false`) ainda aparecem em transações existentes, mas não são sugeridas na interface
- Não há limite de tags por transação

---

## Uso nos relatórios

- `TagChart.jsx` — distribuição de gastos por tag em um período
- `TagsEvolutionChart.jsx` — evolução de gastos por tag ao longo dos meses
- `ReportsPage.jsx` — filtros por tag

---

## Componentes relacionados

- `TagManager.jsx` — listar, ativar/desativar tags
- `TagChart.jsx`
- `TagsEvolutionChart.jsx`
