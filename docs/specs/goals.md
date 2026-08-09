# Spec: Metas

## O que é

Objetivos de poupança com valor alvo e data limite. O usuário guarda dinheiro em uma meta via comando no Telegram ou dashboard, e pode sacar de volta quando quiser.

---

## Modelo de dados (Firestore: `goals`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `userId` | string | sim | UID do Firebase Auth |
| `name` | string | sim | Nome da meta (ex: "Viagem", "Notebook") |
| `targetAmount` | number | sim | Valor objetivo em BRL |
| `savedAmount` | number | sim | Valor já guardado |
| `targetDate` | Timestamp | não | Data limite para atingir a meta |
| `accountId` | string | não | Conta vinculada à meta |
| `isCompleted` | boolean | sim | Se a meta foi concluída |
| `createdAt` | Timestamp | sim | Data de criação |

---

## Regras de negócio

- `savedAmount` começa em 0 e cresce com operações de `guardar`
- `savedAmount` não pode exceder `targetAmount`
- Ao completar a meta (`savedAmount >= targetAmount`), o usuário é notificado
- O saque (`sacar`) move dinheiro da meta de volta para uma categoria de renda
- A meta pode ter uma conta vinculada — nesse caso, o `balance` da conta é afetado nas operações de guardar/sacar
- Metas completadas ficam visíveis mas marcadas como `isCompleted: true`

---

## Fluxo: guardar dinheiro

Telegram: `guardar <valor> <meta>`
1. Localiza a meta pelo nome (normalizado)
2. Valida que `savedAmount + valor <= targetAmount`
3. Incrementa `savedAmount` na meta
4. Cria transação de despesa com categoria implícita (reserva)
5. Se conta vinculada, debita da conta
6. Retorna progresso: "Meta X: R$ Y de R$ Z (N%)"

## Fluxo: sacar da meta

Telegram: `sacar <valor> <meta> para <categoria de renda>`
1. Localiza a meta e valida saldo disponível
2. Decrementa `savedAmount`
3. Cria transação de renda na categoria especificada
4. Se conta vinculada, credita na conta

---

## Componentes relacionados

- `GoalManager.jsx` — CRUD de metas
- `EditGoalModal.jsx` — edição
- `CompleteGoalModal.jsx` — fluxo de conclusão de meta
