# CLAUDE.md — Apollo Ledger (Oikonomos)

> Spec principal para uso com Claude Code (SDD). Leia este arquivo no início de toda conversa sobre este projeto.

## O que é este projeto

**Apollo Ledger** (também chamado de Oikonomos Dashboard) é um aplicativo de controle financeiro pessoal em português/pt-BR. É usado por um único usuário — o próprio dono do projeto — e tem foco em praticidade: entrada rápida de transações pelo Telegram, visualizações no dashboard web, e controle de orçamentos mensais.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18.2 + Vite, React Router DOM, Recharts, Chart.js |
| Backend | Python 3, Flask, python-telegram-bot |
| Banco de dados | Firebase Firestore (NoSQL) |
| Autenticação | Firebase Auth |
| Hosting (frontend) | Firebase Hosting / Vercel |
| Hosting (backend/API) | Vercel (serverless Python) |
| Bot | Telegram Bot API (webhook via `/api/bot`) |

---

## Estrutura de pastas

```
apollo-ledger/
├── CLAUDE.md                        ← este arquivo
├── vercel.json                      ← rotas e cron jobs
├── package.json                     ← workspace root
├── backend/
│   ├── bot.py                       ← Flask + Telegram bot + API REST (1500+ linhas)
│   └── requirements.txt
└── oikonomos-dashboard/             ← SPA React
    ├── firebaseClient.js            ← inicialização Firebase
    ├── vite.config.js
    ├── src/
    │   ├── App.jsx                  ← routing + auth state
    │   ├── main.jsx
    │   ├── components/              ← 42 componentes JSX
    │   ├── pages/
    │   │   ├── Dashboard.jsx        ← visão principal (transações + gráficos)
    │   │   ├── ManagementPage.jsx   ← hub de gestão (categorias, contas, etc.)
    │   │   ├── ReportsPage.jsx      ← relatórios históricos
    │   │   ├── ForecastPage.jsx     ← previsão de gastos
    │   │   ├── MyAccountPage.jsx    ← perfil + API key
    │   │   └── HelpPage.jsx         ← manual do usuário
    │   └── utils/
    │       ├── exportUtils.js       ← exportação CSV/PDF
    │       ├── importUtils.js       ← importação CSV (formato Apollo)
    │       └── toastUtils.jsx
    └── docs/
        └── specs/                   ← specs por módulo (SDD)
```

---

## Módulos e specs

| Módulo | Spec | Descrição |
|---|---|---|
| Transações | [transactions.md](docs/specs/transactions.md) | Lançamentos de renda/despesa |
| Contas | [accounts.md](docs/specs/accounts.md) | Contas bancárias do usuário |
| Categorias | [categories.md](docs/specs/categories.md) | Classificação das transações |
| Orçamentos | [budgets.md](docs/specs/budgets.md) | Limites mensais por categoria |
| Metas | [goals.md](docs/specs/goals.md) | Objetivos de poupança |
| Contas/Dívidas | [debts.md](docs/specs/debts.md) | Contas recorrentes agendadas |
| Tags | [tags.md](docs/specs/tags.md) | Marcadores transversais |
| Relatórios | [reports.md](docs/specs/reports.md) | Análise histórica |
| Previsão | [forecast.md](docs/specs/forecast.md) | Projeção de gastos futuros |
| Bot Telegram | [telegram-bot.md](docs/specs/telegram-bot.md) | Interface de entrada rápida |
| API REST | [api.md](docs/specs/api.md) | Endpoints externos |
| Apollo AI | [apollo-ai.md](docs/specs/apollo-ai.md) | Agente IA para importação e assistência |

---

## Coleções Firestore

| Coleção | Campos principais |
|---|---|
| `transactions` | userId, type (income/expense), amount, category, description, tags[], accountId, createdAt |
| `accounts` | userId, accountName, balance, isDefault, isReserve, createdAt |
| `categories` | userId, name, type (income/expense), createdAt |
| `budgets` | userId, categoryName, amount, month, year |
| `goals` | userId, name, targetAmount, savedAmount, targetDate, accountId, isCompleted |
| `scheduled_transactions` | userId, description, amount, categoryName, dueDate, status (pending/paid), isRecurring |
| `tags` | userId, name, isActive, createdAt |
| `users` | apiKey, apelido |
| `telegram_users` | firebase_uid, user_email, createdAt |
| `pending_transactions` | userId, type, amount, category, description, tags, createdAt (ephemeral — apagado após commit) |
| `apollo_sessions` | userId, channel, messages[], importSessionId?, createdAt, updatedAt (contexto de conversa com Apollo AI) |
| `import_sessions` | userId, status, sourceFile, format, transactions[], newCategories[], summary{}, createdAt, expiresAt (sessões de importação de extrato — TTL 24h) |

---

## Cron Jobs (Vercel)

| Rota | Schedule | Função |
|---|---|---|
| `/api/cron` | `0 5 * * *` (5h diário) | Cria novas instâncias de contas recorrentes pagas |
| `/api/monthly-closing` | `1 0 1 * *` (1º de cada mês) | Registra transação de fechamento mensal |

---

## Padrões de código

### Backend (Python/Flask)
- Todas as funções async do bot recebem `firebase_uid: str` como parâmetro
- Operações que afetam múltiplos documentos usam `db.batch()`
- Texto normalizado com `normalize_text()` (remove acentos, lowercase) para comparações
- Transações passam por `pending_transactions` antes de ser commitadas (padrão de confirmação via botão inline)

### Frontend (React)
- Sem Redux — estado gerenciado com `useState` / `useEffect` / `useMemo`
- Atualização de dados via callback `onDataChanged` passado para componentes filhos
- Valores monetários sempre formatados em BRL (R$)
- Textos e labels em português (pt-BR)
- Toast notifications via `react-hot-toast`

### Convenções de dados
- Tipo de transação: `"income"` ou `"expense"` (string em inglês internamente)
- Datas no Firestore: `Timestamp` do Firebase (nunca string)
- Tags: array de strings lowercase sem `#`
- Conta padrão: flag `isDefault: true` na coleção `accounts`
- Conta reserva: flag `isReserve: true` (não aparece no saldo principal)

---

## Variáveis de ambiente (backend)

```
TELEGRAM_TOKEN=
CRON_SECRET=
FIREBASE_CREDENTIALS_JSON=  (JSON serializado como string)
GEMINI_API_KEY=             (novo — Apollo AI)
```

---

## Segurança — Diretrizes obrigatórias

Estas regras se aplicam a **toda** implementação, nova ou modificada. Não há exceções por ser app pessoal — dados financeiros exigem o mesmo rigor que qualquer sistema em produção.

### Autenticação e autorização

- **Todo endpoint Flask** que acessa dados do usuário deve verificar identidade antes de qualquer operação:
  - Endpoints chamados pelo frontend: validar Firebase ID Token via `auth.verify_id_token(token)`
  - Endpoints chamados por sistemas externos (Corvus): validar via `X-API-Key` com o decorator `@require_api_key`
  - Cron jobs: validar `Authorization: Bearer <CRON_SECRET>`
  - Webhook do Telegram: validar que a requisição vem do Telegram (token no handler)
- **Todo acesso ao Firestore** deve filtrar por `userId` — nunca retornar documentos sem esse filtro
- **Nunca confiar no `userId` enviado pelo cliente** — sempre extrair do token verificado server-side

### Isolamento de dados no Firestore

- Toda query deve incluir `.where(filter=FieldFilter('userId', '==', firebase_uid))`
- Antes de ler/editar/deletar um documento por ID, verificar se `doc.userId == firebase_uid`
- Nunca usar `db.collection('x').document(id_vindo_do_cliente).get()` sem verificar a propriedade depois

### Validação de entrada

- **Backend**: validar tipo, range e presença de todos os campos obrigatórios antes de usar
  - `amount`: deve ser número positivo (`float`, `> 0`)
  - `type`: deve ser exatamente `"income"` ou `"expense"`
  - Strings: limpar com `.strip()`, checar se não estão vazias
- **Upload de arquivos (Apollo AI)**: validar extensão (`.ofx`, `.csv`, `.pdf`) e tamanho máximo antes de processar
- Nunca passar input do usuário diretamente para queries — sempre normalizar e validar antes

### Gestão de segredos

- Nenhuma credencial, token ou chave deve aparecer no código-fonte
- Todas as credenciais ficam em variáveis de ambiente (ver seção "Variáveis de ambiente")
- `FIREBASE_CREDENTIALS_JSON` é o JSON do service account serializado como string — nunca logar esse valor
- Ao adicionar nova variável de ambiente, documentar aqui e no `.env.example`

### Rate limiting e abuso

- Os endpoints da API REST (`/api/categories`, `/api/transaction`) são públicos com API Key — considerar rate limiting se o uso crescer
- Para os endpoints do Apollo AI (`/api/apollo/*`), implementar rate limiting desde o início para proteger o free tier do Gemini:
  - Máximo de 10 requisições por minuto por usuário
  - Máximo de 5 uploads de extrato por dia
- O Vercel já tem proteção básica contra DDoS — não precisamos implementar isso manualmente

### CORS

- O Flask tem `flask_cors` instalado — configurar `CORS(app, origins=["https://seu-dominio.vercel.app"])` em produção
- Nunca usar `origins="*"` em produção

### Telegram

- O webhook recebe qualquer POST em `/api/bot` — o `python-telegram-bot` valida o token internamente
- Nunca expor o `TELEGRAM_TOKEN` em logs ou respostas de API

---

## Proof of Work — Checklist de implementação

Antes de considerar qualquer implementação concluída, verificar cada item abaixo. Este checklist é obrigatório — não pular mesmo que o item pareça óbvio.

### Segurança
- [ ] Todo novo endpoint tem autenticação verificada server-side
- [ ] Toda query ao Firestore filtra por `userId`
- [ ] Nenhuma credencial ou chave foi exposta no código
- [ ] Inputs do usuário são validados (tipo, range, presença)
- [ ] Se houve upload de arquivo: extensão e tamanho validados

### Integridade de dados
- [ ] Operações que afetam múltiplos documentos usam `db.batch()`
- [ ] Saldo de conta é atualizado no mesmo batch da transação
- [ ] Documentos `pending_transactions` são apagados após commit ou em caso de erro
- [ ] Novos campos no Firestore têm valor padrão definido (não deixar `undefined`)

### Compatibilidade
- [ ] Dados existentes no Firestore não são quebrados pela mudança
- [ ] Se nova coleção foi criada: documentada na seção "Coleções Firestore" do CLAUDE.md
- [ ] Se nova variável de ambiente: adicionada aqui e no `.env.example`
- [ ] Se novo endpoint: adicionado ao `vercel.json` (routes)

### Qualidade
- [ ] Erros tratados com `try/except` e mensagem amigável ao usuário
- [ ] Sem `console.log` / `print` expondo dados sensíveis do usuário em produção
- [ ] Nomes em português no frontend (labels, mensagens de erro, toasts)
- [ ] Spec do módulo afetado atualizada em `docs/specs/`

---

## Notas importantes

- App em português, para uso pessoal (único usuário em produção)
- "Corvus" mencionado no código é um sistema externo que consome a API REST via API Key — os endpoints `/api/categories` e `/api/transaction` foram criados para ele
- O frontend já tem `importUtils.js` para importação de CSV no formato Apollo (diferente do extrato bancário — é um CSV com schema próprio)
- Apollo AI é o próximo grande módulo a ser implementado — ver [apollo-ai.md](docs/specs/apollo-ai.md)
