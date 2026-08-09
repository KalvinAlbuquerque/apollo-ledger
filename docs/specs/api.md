# Spec: API REST

## O que é

API REST pública do Apollo Ledger. Permite que sistemas externos criem transações e leiam categorias do usuário, autenticados por API Key.

---

## Autenticação

Header obrigatório: `X-API-Key: <chave>`

A chave é gerada pelo próprio usuário no dashboard (`MyAccountPage.jsx` → "Gerar chave de API"). É armazenada em `users/{uid}.apiKey` no Firestore.

O decorator `@require_api_key` em `bot.py` resolve a API Key para o `uid` do usuário antes de chamar cada endpoint.

---

## Endpoints

### `GET /api/categories`

Retorna as categorias de **despesa** do usuário autenticado.

**Response 200:**
```json
[
  { "id": "abc123", "name": "Alimentação", "type": "expense", "userId": "..." }
]
```

---

### `POST /api/transaction`

Cria uma transação de **despesa** na conta padrão do usuário.

**Body:**
```json
{
  "amount": 50.00,
  "category": "Alimentação",
  "description": "Mercado"
}
```

**Regras:**
- `amount` e `category` são obrigatórios
- `amount` deve ser positivo
- Se o usuário não tiver conta padrão, usa a primeira conta encontrada
- A transação é criada com `type: "expense"` e o saldo da conta é decrementado

**Response 201:**
```json
{ "success": true, "message": "Transação criada com sucesso" }
```

---

### `POST /api/generate-api-key`

Gera uma nova API Key para o usuário autenticado via Firebase ID Token.

**Header:** `Authorization: Bearer <firebase_id_token>`

**Response 200:**
```json
{ "apiKey": "abc123..." }
```

---

### `POST /api/bot`

Webhook do Telegram. Recebe updates do Telegram e os processa. Não é para uso direto.

---

### `GET /api/cron`

Cron job de recorrência — executado pelo Vercel às 5h diariamente. Requer `Authorization: Bearer <CRON_SECRET>`.

### `GET /api/monthly-closing`

Cron job de fechamento mensal — executado pelo Vercel no dia 1º de cada mês.

---

## Rotas configuradas em `vercel.json`

```json
"/api/bot"              → backend/bot.py
"/api/generate-api-key" → backend/bot.py
"/api/categories"       → backend/bot.py
"/api/transaction"      → backend/bot.py
```

---

## Integração Corvus

O sistema "Corvus" é uma integração externa que usa os endpoints `/api/categories` e `/api/transaction` para criar transações no Apollo de forma automática. Os endpoints foram construídos especificamente para esse uso.

---

## Endpoints Apollo AI (a implementar)

Quando o Apollo AI for implementado, os seguintes endpoints serão adicionados:

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/apollo/chat` | Mensagem de chat com o Apollo (web) |
| `POST` | `/api/apollo/import` | Upload de extrato bancário para processamento |
| `GET` | `/api/apollo/import/{sessionId}` | Status de um processamento de extrato |
| `POST` | `/api/apollo/import/{sessionId}/confirm` | Confirma transações revisadas |

Ver [apollo-ai.md](apollo-ai.md) para a spec completa.
