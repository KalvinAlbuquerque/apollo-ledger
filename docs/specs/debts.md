# Spec: Contas a Pagar / Dívidas

## O que é

Contas agendadas com data de vencimento e status. Podem ser recorrentes (renovadas mensalmente pelo cron) ou pontuais. O usuário paga via Telegram com o comando `pagar`.

---

## Modelo de dados (Firestore: `scheduled_transactions`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `userId` | string | sim | UID do Firebase Auth |
| `description` | string | sim | Nome da conta (ex: "Netflix", "Aluguel") |
| `amount` | number | sim | Valor em BRL |
| `categoryName` | string | sim | Categoria de despesa associada |
| `dueDate` | Timestamp | sim | Data de vencimento |
| `status` | string | sim | `"pending"` ou `"paid"` |
| `isRecurring` | boolean | sim | Se renova mensalmente |

---

## Regras de negócio

- Status começa como `"pending"` ao ser criada
- Ao pagar, status muda para `"paid"` e uma transação de despesa é criada
- Contas recorrentes (`isRecurring: true`): quando o cron diário detecta uma conta com status `"paid"`, cria uma nova instância para o mês seguinte
- A renovação não duplica se já existir uma instância com a mesma `description` e `categoryName` para o próximo mês
- A data da nova instância avança exatamente 1 mês (`relativedelta(months=1)`)
- Se a próxima data calculada já passou, avança até a próxima data futura

---

## Cron Job de Recorrência

`/api/cron` — executado diariamente às 5h (UTC):
1. Busca todos os usuários em `telegram_users`
2. Para cada usuário, busca `scheduled_transactions` com `isRecurring: true` e `status: "paid"`
3. Calcula a próxima data de vencimento
4. Verifica se já existe uma instância futura — se não, cria

---

## Fluxo de pagamento (Telegram)

`pagar <descrição da conta>`
1. Busca em `scheduled_transactions` com `status: "pending"` e descrição normalizada
2. Exibe teclado inline com as contas disponíveis
3. Usuário seleciona a conta → transação de despesa criada → `status: "paid"` → saldo decrementado

---

## Componentes relacionados

- `DebtManager.jsx` — CRUD de contas agendadas
- `EditDebtModal.jsx` — edição
- `ForecastPage.jsx` — usa contas pendentes na projeção de gastos
