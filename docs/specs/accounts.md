# Spec: Contas

## O que é

Representa as contas bancárias ou carteiras do usuário. Cada transação é associada a uma conta. O saldo é mantido de forma incremental — não é recalculado a cada consulta.

---

## Modelo de dados (Firestore: `accounts`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `userId` | string | sim | UID do Firebase Auth |
| `accountName` | string | sim | Nome da conta (ex: "Bradesco", "Mercado Pago") |
| `balance` | number | sim | Saldo atual em BRL |
| `isDefault` | boolean | não | Conta padrão para transações rápidas no Telegram |
| `isReserve` | boolean | não | Conta reserva — excluída do saldo principal |
| `createdAt` | Timestamp | sim | Data de criação |

---

## Regras de negócio

- Só pode existir **uma conta padrão** por usuário (`isDefault: true`)
- A conta reserva (`isReserve: true`) não entra no cálculo do saldo total exibido no dashboard
- O saldo **não pode ser editado diretamente** pelo usuário — é resultado das transações
  - Exceção: o valor inicial é definido na criação da conta
- Ao excluir uma conta, verificar se há transações associadas (integridade referencial manual)
- Contas são usadas nos fluxos de despesa, renda, transferência e pagamento de contas agendadas

---

## Fluxo de criação

1. Usuário acessa ManagementPage → aba "Contas"
2. Preenche nome e saldo inicial
3. Grava em `accounts` com `balance = saldoInicial`

## Conta padrão (Telegram)

Quando o usuário usa `*` no Telegram (transação rápida), o bot busca a conta com `isDefault: true`. Se não encontrar, retorna erro pedindo que o usuário configure a conta padrão no dashboard.

---

## Componentes relacionados

- `AccountManager.jsx` — CRUD de contas
- `EditAccountModal.jsx` — edição
- `SelectAccountModal.jsx` — seleção de conta em fluxos específicos
- `AccountFilter.jsx` — filtro de conta no Dashboard
