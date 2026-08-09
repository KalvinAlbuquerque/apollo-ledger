# Spec: Transações

## O que é

O módulo central do sistema. Registra entradas (renda) e saídas (despesa) de dinheiro associadas a uma conta e categoria.

---

## Modelo de dados (Firestore: `transactions`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `userId` | string | sim | UID do Firebase Auth |
| `type` | string | sim | `"income"` ou `"expense"` |
| `amount` | number | sim | Valor positivo em BRL |
| `category` | string | sim | Nome da categoria (cópia do nome no momento do lançamento) |
| `accountId` | string | sim | ID do documento em `accounts` |
| `description` | string | não | Texto livre descritivo |
| `tags` | string[] | não | Array de tags lowercase sem `#` |
| `createdAt` | Timestamp | sim | Data/hora da transação |

---

## Regras de negócio

- Uma transação **não pode ser criada** se não existir nenhuma conta cadastrada
- `amount` deve ser sempre positivo — o tipo (`income`/`expense`) determina o sinal
- Ao registrar uma despesa, o saldo da conta é decrementado: `balance -= amount`
- Ao registrar uma renda, o saldo da conta é incrementado: `balance += amount`
- Tags são extraídas automaticamente da descrição via regex `#(\w+)` — o `#` não é salvo na tag
- Se a tag não existir na coleção `tags`, é criada automaticamente
- A categoria é validada contra as categorias cadastradas (normalizada — sem acentos, lowercase)
- O nome da categoria é salvo como cópia no momento do lançamento (não é FK — é desnormalizado)

---

## Fluxo de criação (web dashboard)

1. Usuário abre `AddTransactionModal`
2. Preenche: tipo, valor, categoria, conta, descrição (opcional), data (opcional)
3. Submit → valida → grava em `transactions` → atualiza `balance` na conta (batch)
4. `onDataChanged` é chamado → dashboard recarrega transações

## Fluxo de criação (Telegram)

Ver [telegram-bot.md](telegram-bot.md) — o bot usa `pending_transactions` como estado intermediário antes de confirmar a conta via botão inline.

## Fluxo de importação (Apollo AI)

Ver [apollo-ai.md](apollo-ai.md) — extrato bancário é parseado pela IA que atribui categorias automaticamente, passa por revisão do usuário, e então é commitado em lote.

---

## Casos especiais

### Transferência entre contas
Não existe um tipo `"transfer"` — uma transferência é registrada como **dois documentos**:
- `expense` na conta de origem com categoria `"transferência"`
- `income` na conta de destino com categoria `"transferência"`

### Pagamento de conta agendada
Quando uma `scheduled_transaction` é paga:
- Cria-se uma `transaction` do tipo `expense`
- O status da `scheduled_transaction` muda para `"paid"`
- O saldo da conta é decrementado

### Fechamento mensal
No 1º de cada mês, o cron `/api/monthly-closing` cria uma transação especial:
- Se saldo positivo: `income` com categoria `"saldo anterior"`
- Se saldo negativo: `expense` com categoria `"dívida anterior"`

---

## Componentes relacionados

- `AddTransactionModal.jsx` — formulário de criação
- `EditModal.jsx` — edição de transação existente
- `Dashboard.jsx` — listagem principal com filtros
- `importUtils.js` — importação de CSV no formato Apollo (não é extrato bancário)
- `exportUtils.js` — exportação de transações para CSV/PDF
