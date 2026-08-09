# Spec: Bot Telegram

## O que é

Interface de entrada rápida de transações via Telegram. O usuário envia mensagens de texto com comandos e o bot processa no Firestore. Webhook registrado em `/api/bot`.

---

## Configuração

- Bot: `@OikonomosBot` (ou o nome configurado)
- Webhook: `POST /api/bot` → `backend/bot.py`
- Autenticação: usuário vincula e-mail Firebase no primeiro uso

---

## Fluxo de autenticação

1. Usuário envia qualquer mensagem pela primeira vez
2. Bot pede o e-mail cadastrado no dashboard web
3. Bot busca o UID do Firebase pelo e-mail e salva em `telegram_users/{chat_id}`
4. A partir daí, todas as mensagens do `chat_id` são mapeadas para o `firebase_uid`

---

## Comandos disponíveis

### Transações

| Comando | Exemplo | Descrição |
|---|---|---|
| `<valor> <categoria> [descrição]` | `50 alimentação mercado` | Registra despesa |
| `+ <valor> <origem> [descrição]` | `+ 3000 salário` | Registra renda |
| `guardar <valor> <meta>` | `guardar 200 viagem` | Guarda em uma meta |
| `sacar <valor> <meta> para <categoria>` | `sacar 100 viagem para lazer` | Saca de uma meta |
| `pagar <descrição>` | `pagar netflix` | Paga conta agendada |
| `transferir <valor> da <conta> para <conta>` | `transferir 500 da bradesco para mercado pago` | Transferência entre contas |

### Transações rápidas (conta padrão)

Prefixo `*` pula a etapa de seleção de conta e usa a conta com `isDefault: true`.

| Comando | Exemplo |
|---|---|
| `* <valor> <categoria> [descrição]` | `* 25 alimentação café` |
| `*+ <valor> <origem>` | `*+ 100 freelance` |
| `*renda <valor> <origem>` | `*renda 100 freelance` |

### Consultas

| Comando | Descrição |
|---|---|
| `ver categorias` | Lista categorias de renda e despesa |
| `ver orçamentos` | Resumo de todos os orçamentos do mês |
| `ver orçamento <categoria>` | Detalhe de um orçamento específico |
| `ver contas` | Lista contas agendadas |
| `ver contas pagas` | Filtra contas pagas |
| `ver contas pendentes` | Filtra contas pendentes |
| `ver gastos hoje` | Total gasto no dia |
| `ver gastos hoje categorizado` | Gastos do dia por categoria |
| `ver hoje` | Quanto ainda pode gastar hoje com base nos orçamentos |

### Ajuda

| Comando | Descrição |
|---|---|
| `?` ou `ajuda` | Exibe o manual completo |
| `/ai` | Entra em modo Apollo AI (ver [apollo-ai.md](apollo-ai.md)) |

---

## Padrão de confirmação via botão inline

Todos os fluxos que precisam selecionar conta (despesa, renda, pagamento) usam o padrão:

1. Bot valida a transação e grava em `pending_transactions` (estado intermediário)
2. Bot envia teclado inline com as contas disponíveis
3. Usuário clica em uma conta → `handle_account_selection()` é chamado
4. Bot lê `pending_transactions`, cria a transação final, atualiza saldo, apaga o pendente

O `callback_data` dos botões inline segue o formato:
- Despesa/Renda: `account_{accountId}_{pendingId}`
- Pagamento: `pay_{accountId}_{pendingId}`

---

## Feedback de orçamento pós-lançamento

Após registrar uma despesa com categoria que tem orçamento, o bot envia automaticamente:
```
✅ Gasto de R$ X em [Categoria] registrado!

📊 Orçamento [Categoria] — Mês atual:
Gasto: R$ Y / R$ Z (N%)
💰 Você pode gastar R$ W por dia pelos próximos D dias.
```

---

## Normalização de texto

Todas as comparações de categoria, conta, meta e conta agendada usam `normalize_text()`:
- Remove acentos (NFD → ASCII)
- Converte para lowercase
- Permite que o usuário escreva "Alimentação", "alimentacao", "ALIMENTACAO" — todos funcionam

---

## Apollo AI no Telegram

O comando `/ai` (ou botão "Apollo") muda o contexto do bot para modo conversacional com a IA. Ver [apollo-ai.md](apollo-ai.md) para o fluxo completo.
