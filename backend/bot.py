import os
import re
import asyncio
import json
import unicodedata
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
import calendar

import firebase_admin
from firebase_admin import credentials, firestore, auth
from google.cloud.firestore_v1.base_query import FieldFilter
from dotenv import load_dotenv
from flask import Flask, request
from telegram import Update
from telegram.ext import Application, MessageHandler, filters,ContextTypes

# --- 1. CONFIGURAÇÃO INICIAL ---
load_dotenv()
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
CRON_SECRET = os.getenv("CRON_SECRET")

firebase_creds_json_str = os.getenv("FIREBASE_CREDENTIALS_JSON")
if not firebase_creds_json_str:
    cred = credentials.Certificate("firebase-credentials.json")
else:
    firebase_creds_dict = json.loads(firebase_creds_json_str)
    cred = credentials.Certificate(firebase_creds_dict)

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)
db = firestore.client()

# --- 2. FUNÇÕES AUXILIARES ---
def normalize_text(text: str) -> str:
    """Remove acentos e converte para minúsculas."""
    if not text: return ""
    text = unicodedata.normalize('NFD', text)
    text = text.encode('ascii', 'ignore')
    text = text.decode("utf-8")
    return text.lower()

# --- 3. LÓGICA DE USUÁRIOS ---
async def get_firebase_user_id(chat_id: int) -> str | None:
    """Busca no Firestore o UID do Firebase correspondente a um chat_id do Telegram."""
    user_ref = db.collection('telegram_users').document(str(chat_id)).get()
    if user_ref.exists:
        return user_ref.to_dict().get('firebase_uid')
    return None

async def register_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Vincula um chat do Telegram a um usuário do Firebase através do e-mail."""
    email = update.message.text.strip().lower()
    chat_id = update.effective_chat.id
    try:
        user = auth.get_user_by_email(email)
        user_link_data = {
            'firebase_uid': user.uid,
            'user_email': email,
            'createdAt': firestore.SERVER_TIMESTAMP,
        }
        db.collection('telegram_users').document(str(chat_id)).set(user_link_data)
        context.user_data.pop('state', None)
        await update.message.reply_text("✅ Conta vinculada com sucesso! Agora você já pode usar todos os comandos. Envie '?' para ver o manual.")
    except auth.UserNotFoundError:
        await update.message.reply_text("❌ E-mail não encontrado. Verifique se você já se cadastrou no dashboard web e tente novamente.")
    except Exception as e:
        print(f"Erro no registro para o chat {chat_id}: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao vincular sua conta.")

# --- 4. FUNÇÕES DE COMANDO (agora recebem firebase_uid) ---
# Em: backend/bot.py

async def send_manual(update: Update, context: ContextTypes.DEFAULT_TYPE, firebase_uid: str):
    manual_text = """
📖 *Manual de Comandos Oikonomos*

A seguir, a lista de comandos simplificados.

---
*✍️ REGISTRAR TRANSAÇÕES*
---
> *Gasto:* `<valor> <categoria> [descrição]`
> `ex: 25,50 alimentação almoço`

> *Renda:* `+ <valor> <origem> [descrição]`
> `ex: + 1500 salário`

> *Guardar:* `guardar <valor> <meta>`
> `ex: guardar 100 viagem`

> *Sacar:* `sacar <valor> <meta> para <categoria de renda>`
> `ex: sacar 50 viagem para outras rendas`

> *Pagar Conta:* `pagar <descrição da conta>`
> `ex: pagar conta de luz`

---
*📊 CONSULTAR INFORMAÇÕES*
---
> *Use o comando `ver` seguido do que deseja consultar.*

> *Orçamentos:*
> `ver orçamentos`
> `ver orçamento alimentação`

> *Categorias:*
> `ver categorias`
> `ver categorias renda`

> *Contas Agendadas:*
> `ver contas`
> `ver contas pagas` ou `ver contas pendentes`

> *Resumo do Dia:*
> `ver gastos hoje`
> `ver hoje` (mostra o que ainda pode gastar)

---
> *Para ver este manual novamente:*
> `?` ou `ajuda`
    """
    await update.message.reply_text(manual_text.strip(), parse_mode='Markdown')


async def process_payment(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Marca uma conta agendada como 'paga' e cria a transação de despesa correspondente."""
    try:
        if not text_parts:
            await update.message.reply_text("Formato inválido. Use: pagar <descrição da conta>")
            return

        description_input = " ".join(text_parts).strip()
        description_normalized = normalize_text(description_input)

        # 1. Busca todas as contas PENDENTES do usuário
        q = db.collection('scheduled_transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('status', '==', 'pending'))
        pending_debts_docs = list(q.stream())

        if not pending_debts_docs:
            await update.message.reply_text("Você não tem nenhuma conta pendente para pagar.")
            return

        # 2. Procura a conta correspondente na lista de pendentes
        found_debt = None
        for debt_doc in pending_debts_docs:
            if normalize_text(debt_doc.to_dict().get('description', '')) == description_normalized:
                found_debt = debt_doc
                break
        
        if not found_debt:
            pending_debts_names = [d.to_dict().get('description') for d in pending_debts_docs]
            available_debts_text = "\n- ".join(pending_debts_names)
            error_message = f"❌ Conta pendente '{description_input}' não encontrada.\n\nSuas contas a pagar são:\n- {available_debts_text}"
            await update.message.reply_text(error_message)
            return

        # 3. Se encontrou, executa as ações
        debt_data = found_debt.to_dict()

        # Ação A: Cria a transação de despesa
        payment_expense_data = {
            'type': 'expense',
            'amount': debt_data.get('amount'),
            'category': debt_data.get('categoryName'),
            'description': f"Pagamento de: {debt_data.get('description')}",
            'createdAt': firestore.SERVER_TIMESTAMP,
            'userId': firebase_uid
        }
        db.collection('transactions').add(payment_expense_data)

        # Ação B: Atualiza o status da conta para 'paid'
        debt_doc_ref = db.collection('scheduled_transactions').document(found_debt.id)
        debt_doc_ref.update({'status': 'paid'})

        await update.message.reply_text(f"✅ Pagamento de '{debt_data.get('description')}' no valor de R$ {debt_data.get('amount'):.2f} foi registrado com sucesso!")

    except Exception as e:
        print(f"Erro ao processar pagamento: {e}")
        await update.message.reply_text("❌ Ocorreu um erro interno ao registrar o pagamento.")


async def process_expense(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Processa e salva uma despesa, e retorna o status detalhado e intuitivo do orçamento."""
    try:
        # --- Parte 1: Validação da Categoria (sem alterações) ---
        categories_ref = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).stream()
        original_categories = [doc.to_dict()['name'] for doc in categories_ref]
        valid_categories_normalized = [normalize_text(name) for name in original_categories]

        if not original_categories:
            await update.message.reply_text("Você não tem nenhuma categoria de DESPESA cadastrada.")
            return
        
        expense_text = " ".join(text_parts)
        match = re.match(r"^\s*(\d+[\.,]?\d*)\s+([\w\sáàâãéèêíïóôõöúçñ]+?)(?:\s+(.+))?$", expense_text)

        if not match:
            await update.message.reply_text("Formato de gasto inválido. Use: [gasto] <valor> <categoria> [descrição]")
            return

        value_str, category_name_input, description = match.groups()
        category_name_normalized = normalize_text(category_name_input.strip())

        if category_name_normalized not in valid_categories_normalized:
            available_cats_text = "\n- ".join(original_categories)
            error_message = f"❌ Categoria de DESPESA '{category_name_input}' não encontrada.\n\nCategorias disponíveis:\n- {available_cats_text}"
            await update.message.reply_text(error_message)
            return

        match_index = valid_categories_normalized.index(category_name_normalized)
        correct_category_name = original_categories[match_index]
        amount = float(value_str.replace(',', '.'))
        description = description.strip() if description else None
        
        # --- Parte 2: Salvar a Transação (sem alterações) ---
        expense_data = { 'type': 'expense', 'amount': amount, 'category': correct_category_name, 'description': description, 'createdAt': firestore.SERVER_TIMESTAMP, 'userId': firebase_uid }
        db.collection('transactions').add(expense_data)
        
        base_reply = f"💸 Gasto de R$ {amount:.2f} na categoria '{correct_category_name}' registrado!"
        
        # --- Parte 3: LÓGICA DE FEEDBACK REESTRUTURADA ---
        today = datetime.now(timezone.utc)
        current_month = today.month
        current_year = today.year

        budget_query = db.collection('budgets').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('categoryName', '==', correct_category_name)).where(filter=FieldFilter('month', '==', current_month)).where(filter=FieldFilter('year', '==', current_year)).limit(1).stream()        
        budget_doc = next(budget_query, None)
        
        if budget_doc and budget_doc.to_dict().get('amount', 0) > 0:
            budget_amount = budget_doc.to_dict().get('amount', 0)
            
            start_of_month = datetime(current_year, current_month, 1)
            all_month_expenses_query = db.collection('transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).where(filter=FieldFilter('category', '==', correct_category_name)).where(filter=FieldFilter('createdAt', '>=', start_of_month)).stream()            
            total_spent_this_month = sum(doc.to_dict().get('amount', 0) for doc in all_month_expenses_query)
            remaining_budget_month = budget_amount - total_spent_this_month
            
            total_days_in_month = calendar.monthrange(current_year, current_month)[1]
            days_remaining = total_days_in_month - today.day + 1
            
            allowance_before_spend = (remaining_budget_month + amount) / days_remaining if days_remaining > 0 else 0

            start_of_day = today.replace(hour=0, minute=0, second=0, microsecond=0)
            today_expenses_query = db.collection('transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).where(filter=FieldFilter('category', '==', correct_category_name)).where(filter=FieldFilter('createdAt', '>=', start_of_day)).stream()            
            total_spent_today = sum(doc.to_dict().get('amount', 0) for doc in today_expenses_query)

            budget_feedback = f"\n\n*Resumo de Hoje ({correct_category_name}):*"
            budget_feedback += f"\n- Gasto de Hoje: R$ {total_spent_today:.2f}"
            budget_feedback += f"\n- Meta do Dia: R$ {allowance_before_spend:.2f}"
            
            remaining_for_today = allowance_before_spend - total_spent_today

            if remaining_for_today >= 0:
                # Cenário A: Dentro da meta diária
                budget_feedback += f"\n- *Disponível para Hoje: R$ {remaining_for_today:.2f}*"
                # Calcula a média semanal atual
                current_daily_avg = remaining_budget_month / days_remaining if days_remaining > 0 else 0
                current_weekly_avg = current_daily_avg * 7
                budget_feedback += f"\n\n*Orçamento Atualizado:*"
                budget_feedback += f"\n- Saldo Mensal Restante: R$ {remaining_budget_month:.2f}"
                budget_feedback += f"\n- Média Semanal Segura: R$ {current_weekly_avg:.2f}"
            else:
                # Cenário B: Acima da meta diária
                budget_feedback += f"\n- Você ultrapassou a meta em R$ {abs(remaining_for_today):.2f}"
                budget_feedback += f"\n\n🔴 *Orçamento Recalculado:*"
                budget_feedback += f"\n- Saldo Mensal Restante: R$ {remaining_budget_month:.2f}"
                # Recalcula as novas médias para o futuro
                days_truly_remaining = days_remaining - 1
                new_daily_avg = remaining_budget_month / days_truly_remaining if days_truly_remaining > 0 else remaining_budget_month
                new_weekly_avg = new_daily_avg * 7
                budget_feedback += f"\n- Nova Média Diária: R$ {new_daily_avg:.2f}"
                budget_feedback += f"\n- Nova Média Semanal: R$ {new_weekly_avg:.2f}"
            
            base_reply += budget_feedback

        await update.message.reply_text(base_reply, parse_mode='Markdown')

    except Exception as e:
        print(f"Erro ao processar despesa: {e}")
        await update.message.reply_text("❌ Ocorreu um erro interno ao processar o gasto.")

async def process_income(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Processa e salva uma renda, separando a origem da descrição e ignorando acentos."""
    try:
        # 1. Busca as categorias de renda válidas
        categories_ref = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'income')).stream()
        
        # Guarda as categorias originais (com acento) e uma lista normalizada para comparação
        original_categories = [doc.to_dict()['name'] for doc in categories_ref]
        valid_categories_normalized = [normalize_text(name) for name in original_categories]

        if not original_categories:
            await update.message.reply_text("Você não tem nenhuma categoria de RENDA cadastrada.")
            return
            
        if len(text_parts) < 2:
            await update.message.reply_text("Formato de renda inválido. Use: <saldo/renda> <valor> <origem> [descrição]")
            return
            
        value_str = text_parts[0]
        potential_source_and_desc = text_parts[1:]

        # 2. Lógica de busca normalizada para encontrar a categoria
        found_category_original = None
        category_word_count = 0

        for i in range(len(potential_source_and_desc), 0, -1):
            potential_category_input = " ".join(potential_source_and_desc[:i])
            potential_category_normalized = normalize_text(potential_category_input)
            
            if potential_category_normalized in valid_categories_normalized:
                # Encontra o nome original correspondente para salvar com acento
                match_index = valid_categories_normalized.index(potential_category_normalized)
                found_category_original = original_categories[match_index]
                category_word_count = i
                break
        
        if not found_category_original:
            input_source = " ".join(potential_source_and_desc)
            available_cats_text = "\n- ".join(original_categories)
            error_message = f"❌ Origem de RENDA '{input_source}' não encontrada.\n\nCategorias de renda disponíveis:\n- {available_cats_text}"
            await update.message.reply_text(error_message)
            return

        # 3. Se encontrou, o que sobrar é a descrição
        description = " ".join(potential_source_and_desc[category_word_count:]).strip() or None
        amount = float(value_str.replace(',', '.'))
        
        income_data = {
            'type': 'income',
            'amount': amount,
            'category': found_category_original, # Salva o nome com acento
            'description': description,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'userId': firebase_uid
        }
        db.collection('transactions').add(income_data)
        
        reply_message = f"💰 Renda de R$ {amount:.2f} da origem '{found_category_original}' registrada!"
        if description:
            reply_message += f"\nDescrição: {description}"
            
        await update.message.reply_text(reply_message)

    except ValueError:
        await update.message.reply_text(f"Valor inválido: '{value_str}'. O valor deve ser um número.")
    except Exception as e:
        print(f"Erro ao processar renda: {e}")
        await update.message.reply_text("❌ Ocorreu um erro interno ao processar a renda.")

        
async def process_saving(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list,firebase_uid: str):
    """Processa uma contribuição para uma meta de poupança."""
    try:
        if len(text_parts) < 2:
            await update.message.reply_text("Formato inválido. Use: guardar <valor> <nome da meta>")
            return
            
        value_str = text_parts[0]
        goal_name_input = " ".join(text_parts[1:]).strip()
        goal_name_normalized = normalize_text(goal_name_input)
        
        goals_ref = db.collection('goals').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()        
        user_goals = list(goals_ref)
        
        found_goal = None
        for goal_doc in user_goals:
            if normalize_text(goal_doc.to_dict().get('goalName', '')) == goal_name_normalized:
                found_goal = goal_doc
                break
        
        if not found_goal:
            available_goals_names = [g.to_dict().get('goalName') for g in user_goals]
            available_goals_text = "\n- ".join(available_goals_names)
            error_message = f"❌ Meta '{goal_name_input}' não encontrada.\n\nSuas metas ativas são:\n- {available_goals_text}"
            await update.message.reply_text(error_message)
            return

        amount = float(value_str.replace(',', '.'))
        goal_doc_ref = db.collection('goals').document(found_goal.id)
        
        # Ação 1: Atualiza o valor na meta (SEM AWAIT)
        goal_doc_ref.update({
            'savedAmount': firestore.firestore.Increment(amount)
        })

        # Ação 2: Cria uma transação de despesa correspondente
        saving_expense_data = {
            'type': 'expense',
            'amount': amount,
            'category': found_goal.to_dict().get('goalName'),
            'description': f"Contribuição para a meta: {found_goal.to_dict().get('goalName')}",
            'createdAt': firestore.SERVER_TIMESTAMP,
            'userId': firebase_uid
        }
        db.collection('transactions').add(saving_expense_data)
        
        # Busca os dados atualizados para a mensagem de confirmação (SEM AWAIT)
        updated_goal_doc = goal_doc_ref.get()
        updated_data = updated_goal_doc.to_dict()
        saved = updated_data.get('savedAmount', 0)
        target = updated_data.get('targetAmount', 0)
        progress = (saved / target) * 100 if target > 0 else 100

        reply_message = (
            f"✅ Você guardou R$ {amount:.2f} para a meta '{updated_data.get('goalName')}'!\n\n"
            f"Progresso: R$ {saved:.2f} / R$ {target:.2f} (*{progress:.1f}%*)"
        )
        await update.message.reply_text(reply_message, parse_mode='Markdown')

    except ValueError:
        await update.message.reply_text(f"Valor inválido: '{value_str}'.")
    except Exception as e:
        print(f"Erro ao processar poupança: {e}")
        await update.message.reply_text("❌ Ocorreu um erro interno ao processar a contribuição.")
        
        
        
        
async def process_withdrawal(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Processa um saque de uma meta de poupança, transferindo o valor para uma categoria de renda."""
    try:
        # 1. Parse do comando: sacar <valor> <meta> para <categoria>
        # Ex: ['100', 'fundo', 'de', 'emergencia', 'para', 'salário']
        if 'para' not in text_parts:
            await update.message.reply_text("Formato inválido. Use: sacar <valor> <nome da meta> para <categoria de renda>")
            return

        para_index = text_parts.index('para')
        value_str = text_parts[0]
        goal_name_input = " ".join(text_parts[1:para_index]).strip()
        income_category_input = " ".join(text_parts[para_index+1:]).strip()

        if not all([value_str, goal_name_input, income_category_input]):
             await update.message.reply_text("Formato inválido. Faltam informações. Use: sacar <valor> <meta> para <categoria>")
             return

        amount = float(value_str.replace(',', '.'))
        
        # 2. Valida a meta de poupança
        goal_name_normalized = normalize_text(goal_name_input)
        goals_ref = db.collection('goals').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
        user_goals = list(goals_ref)
        found_goal = next((g for g in user_goals if normalize_text(g.to_dict().get('goalName', '')) == goal_name_normalized), None)

        if not found_goal:
            await update.message.reply_text(f"❌ Meta '{goal_name_input}' não encontrada.")
            return

        # Valida se há saldo suficiente na meta
        saved_amount = found_goal.to_dict().get('savedAmount', 0)
        if saved_amount < amount:
            await update.message.reply_text(f"❌ Saldo insuficiente na meta '{goal_name_input}'. Você tem R$ {saved_amount:.2f} e tentou sacar R$ {amount:.2f}.")
            return

        # 3. Valida a categoria de renda
        income_category_normalized = normalize_text(income_category_input)
        categories_ref = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'income')).stream()
        income_categories = list(categories_ref)
        found_income_category = next((c for c in income_categories if normalize_text(c.to_dict().get('name', '')) == income_category_normalized), None)
        
        if not found_income_category:
            available_cats_text = "\n- ".join([c.to_dict().get('name') for c in income_categories])
            await update.message.reply_text(f"❌ Categoria de renda '{income_category_input}' não encontrada.\n\nCategorias de renda disponíveis:\n- {available_cats_text}")
            return

        # 4. Executa as operações no banco de dados
        # Ação A: Subtrai o valor da meta usando 'increment' com valor negativo
        goal_doc_ref = db.collection('goals').document(found_goal.id)
        goal_doc_ref.update({'savedAmount': firestore.firestore.Increment(-amount)})
        
        # Ação B: Adiciona uma nova transação de RENDA
        income_transaction_data = {
            'type': 'income',
            'amount': amount,
            'category': found_income_category.to_dict().get('name'),
            'description': f"Saque da meta: {found_goal.to_dict().get('goalName')}",
            'createdAt': firestore.SERVER_TIMESTAMP,
            'userId': firebase_uid
        }
        db.collection('transactions').add(income_transaction_data)

        await update.message.reply_text(f"✅ Saque de R$ {amount:.2f} da meta '{found_goal.to_dict().get('goalName')}' realizado e adicionado à renda '{found_income_category.to_dict().get('name')}'.")

    except ValueError:
        await update.message.reply_text(f"Valor inválido: '{value_str}'. O valor deve ser um número.")
    except Exception as e:
        print(f"Erro ao processar saque: {e}")
        await update.message.reply_text("❌ Ocorreu um erro interno ao processar o saque.")
        
 
async def list_categories(update: Update, context: ContextTypes.DEFAULT_TYPE, firebase_uid: str, parts: list):
    """Lista as categorias de renda, despesa, ou ambas."""
    try:
        filter_type = None
        if parts and parts[0].lower() in ['renda', 'despesa']:
            filter_type = parts[0].lower()

        q = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid))
        # O filtro de tipo é aplicado depois, na lógica do Python, para evitar um índice extra
        
        docs = list(q.stream())
        
        # <<< CORREÇÃO AQUI: Verifica se há alguma categoria ANTES de continuar
        if not docs:
            await update.message.reply_text("Você ainda não cadastrou nenhuma categoria no dashboard.")
            return

        income_cats = []
        expense_cats = []
        for doc in docs:
            cat = doc.to_dict()
            if cat.get('type') == 'income':
                income_cats.append(cat.get('name'))
            else:
                expense_cats.append(cat.get('name'))

        reply_message = ""
        # Monta a mensagem apenas para os tipos relevantes
        if not filter_type or filter_type == 'income':
            reply_message += "*Categorias de Renda:*\n"
            reply_message += "- " + "\n- ".join(sorted(income_cats)) if income_cats else "_Nenhuma cadastrada._\n"
        
        if not filter_type:
            reply_message += "\n"

        if not filter_type or filter_type == 'expense':
            reply_message += "*Categorias de Despesa:*\n"
            reply_message += "- " + "\n- ".join(sorted(expense_cats)) if expense_cats else "_Nenhuma cadastrada._\n"
            
        # Garante que a mensagem não seja enviada vazia
        if reply_message.strip():
            await update.message.reply_text(reply_message, parse_mode='Markdown')
        else: # Caso raro onde um filtro por tipo não encontra nada
            await update.message.reply_text(f"Nenhuma categoria do tipo '{filter_type}' encontrada.")
        
    except Exception as e:
        print(f"Erro ao listar categorias: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao buscar as categorias.")

async def list_scheduled_transactions(update: Update, context: ContextTypes.DEFAULT_TYPE, firebase_uid: str, parts: list):
    """Lista as contas do mês, podendo filtrar por 'pagas' ou 'pendentes'."""
    try:
        status_filter = None
        if parts and parts[0].lower() in ['pagas', 'pendentes']:
            status_filter = 'paid' if parts[0].lower() == 'pagas' else 'pending'
        
        today = datetime.now(timezone.utc)
        start_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_of_month = start_of_month + relativedelta(months=1) - relativedelta(seconds=1)

        q = db.collection('scheduled_transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('dueDate', '>=', start_of_month)).where(filter=FieldFilter('dueDate', '<=', end_of_month))
        
        if status_filter:
            q = q.where(filter=FieldFilter('status', '==', status_filter))

        docs = q.stream()
        
        accounts = list(docs)
        if not accounts:
            await update.message.reply_text("Nenhuma conta encontrada para este mês com os filtros aplicados.")
            return

        title = "Contas do Mês"
        if status_filter == 'paid': title = "Contas Pagas do Mês"
        if status_filter == 'pending': title = "Contas Pendentes do Mês"
        
        reply_message = f"*{title}:*\n\n"
        for doc in sorted(accounts, key=lambda x: x.to_dict()['dueDate']):
            account = doc.to_dict()
            status_icon = "✅" if account.get('status') == 'paid' else "⏳"
            due_date = account['dueDate'].strftime('%d/%m')
            reply_message += f"{status_icon} *{account.get('description')}* - R$ {account.get('amount'):.2f} (Vence: {due_date})\n"
            
        await update.message.reply_text(reply_message, parse_mode='Markdown')

    except Exception as e:
        print(f"Erro ao listar contas: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao buscar as contas. Pode ser necessário criar um índice no Firestore (verifique os logs).")
               

async def list_budgets(update: Update, context: ContextTypes.DEFAULT_TYPE, firebase_uid: str, parts: list):
    """Lista os orçamentos do mês, de forma geral ou para uma categoria específica."""
    try:
        today = datetime.now()
        current_month = today.month
        current_year = today.year

        q_budget = db.collection('budgets').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('month', '==', current_month)).where(filter=FieldFilter('year', '==', current_year)).where(filter=FieldFilter('amount', '>', 0))
        
        category_filter_parts = [p for p in parts if p != '?']
        category_filter = " ".join(category_filter_parts).strip().lower()

        if category_filter:
            q_budget = q_budget.where(filter=FieldFilter('categoryName', '==', category_filter))

        budgets_docs = list(q_budget.stream())

        if not budgets_docs:
            reply = f"Nenhum orçamento encontrado para '{category_filter}' este mês." if category_filter else "Nenhum orçamento definido para este mês."
            await update.message.reply_text(reply)
            return

        reply_message = "*Resumo dos Orçamentos do Mês:*\n\n"
        
        for budget_doc in budgets_docs:
            budget = budget_doc.to_dict()
            category_name = budget['categoryName']
            budget_amount = budget['amount']

            start_of_month = datetime(current_year, current_month, 1, tzinfo=timezone.utc)
            expenses_query = db.collection('transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).where(filter=FieldFilter('category', '==', category_name)).where(filter=FieldFilter('createdAt', '>=', start_of_month)).stream()
            total_spent = sum(doc.to_dict().get('amount', 0) for doc in expenses_query)
            
            remaining_budget = budget_amount - total_spent
            total_days_in_month = calendar.monthrange(current_year, current_month)[1]
            days_remaining = total_days_in_month - today.day + 1
            daily_avg = remaining_budget / days_remaining if days_remaining > 0 else 0
            weekly_avg = daily_avg * 7

            reply_message += f"*{category_name.capitalize()}:*\n"
            reply_message += f"  - Saldo: R$ {remaining_budget:.2f} / R$ {budget_amount:.2f}\n"
            reply_message += f"  - Média Diária Segura: R$ {daily_avg:.2f}\n"
            reply_message += f"  - Média Semanal Segura: R$ {weekly_avg:.2f}\n\n"

        await update.message.reply_text(reply_message, parse_mode='Markdown')

    except Exception as e:
        print(f"Erro ao listar orçamentos: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao buscar seus orçamentos.")

async def report_today_spending(update: Update, context: ContextTypes.DEFAULT_TYPE, firebase_uid: str, parts: list):
    """Informa o total gasto hoje, de forma geral ou por categoria."""
    try:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        q = db.collection('transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).where(filter=FieldFilter('createdAt', '>=', today_start))
        
        docs = q.stream()
        
        total_spent_today = 0
        by_category = {}
        
        for doc in docs:
            transaction = doc.to_dict()
            amount = transaction.get('amount', 0)
            category = transaction.get('category', 'Outros')
            total_spent_today += amount
            by_category[category] = by_category.get(category, 0) + amount

        if total_spent_today == 0:
            await update.message.reply_text("🎉 Nenhum gasto registrado hoje!")
            return

        categorized = 'categorizado' in parts or 'categoria' in parts
        
        reply_message = f"*Total gasto hoje: R$ {total_spent_today:.2f}*\n"
        if categorized:
            reply_message += "\n*Detalhes por categoria:*\n"
            for category, amount in sorted(by_category.items()):
                reply_message += f"- {category.capitalize()}: R$ {amount:.2f}\n"

        await update.message.reply_text(reply_message, parse_mode='Markdown')
        
    except Exception as e:
        print(f"Erro ao reportar gastos: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao buscar os gastos de hoje.")

async def report_daily_allowance(update: Update, context: ContextTypes.DEFAULT_TYPE, firebase_uid: str, parts: list):
    """Informa quanto ainda pode ser gasto hoje com base nos orçamentos."""
    try:
        # Reutiliza a lógica de 'list_budgets' para os cálculos
        # (Em um projeto maior, essa lógica seria movida para uma função auxiliar separada)
        today = datetime.now()
        current_month = today.month
        current_year = today.year

        q_budget = db.collection('budgets').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('month', '==', current_month)).where(filter=FieldFilter('year', '==', current_year)).where(filter=FieldFilter('amount', '>', 0))
        
        category_filter = " ".join(parts).strip().lower()
        if category_filter:
            q_budget = q_budget.where(filter=FieldFilter('categoryName', '==', category_filter))

        budgets_docs = list(q_budget.stream())

        if not budgets_docs:
            await update.message.reply_text("Nenhum orçamento ativo encontrado para hoje.")
            return

        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        q_expenses = db.collection('transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).where(filter=FieldFilter('createdAt', '>=', today_start))
        today_expenses_docs = list(q_expenses.stream())
        
        spent_today_by_cat = {}
        for doc in today_expenses_docs:
            transaction = doc.to_dict()
            cat = transaction.get('category')
            spent_today_by_cat[cat] = spent_today_by_cat.get(cat, 0) + transaction.get('amount', 0)

        reply_message = "*Balanço de Hoje com Base nos Orçamentos:*\n\n"
        
        for budget_doc in budgets_docs:
            budget = budget_doc.to_dict()
            category_name = budget['categoryName']
            budget_amount = budget['amount']

            start_of_month = datetime(current_year, current_month, 1)
            expenses_query = db.collection('transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).where(filter=FieldFilter('category', '==', category_name)).where(filter=FieldFilter('createdAt', '>=', start_of_month)).stream()
            total_spent_month = sum(doc.to_dict().get('amount', 0) for doc in expenses_query)
            
            remaining_budget_month = budget_amount - total_spent_month
            total_days_in_month = calendar.monthrange(current_year, current_month)[1]
            days_remaining = total_days_in_month - today.day + 1
            daily_allowance = remaining_budget_month / days_remaining if days_remaining > 0 else 0
            
            spent_today = spent_today_by_cat.get(category_name, 0)
            remaining_for_today = daily_allowance - spent_today

            reply_message += f"*{category_name.capitalize()}:*\n"
            reply_message += f"  - Meta Diária: R$ {daily_allowance:.2f}\n"
            reply_message += f"  - Gasto Hoje: R$ {spent_today:.2f}\n"
            if remaining_for_today >= 0:
                reply_message += f"  - *Disponível Hoje: R$ {remaining_for_today:.2f}*\n\n"
            else:
                reply_message += f"  - *Excedido em: R$ {abs(remaining_for_today):.2f}*\n\n"

        await update.message.reply_text(reply_message, parse_mode='Markdown')

    except Exception as e:
        print(f"Erro ao reportar allowance: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao calcular o saldo de hoje.")

async def cancel_conversation(update: Update, context: ContextTypes.DEFAULT_TYPE, firebase_uid: str):
    """Limpa o estado da conversa."""
    context.user_data.pop('state', None)
    await update.message.reply_text("Ok, cancelado.")
    
# --- 5. ORQUESTRADOR PRINCIPAL ---
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    firebase_uid = await get_firebase_user_id(chat_id)

    if not firebase_uid:
        if context.user_data.get('state') != 'awaiting_email':
            context.user_data['state'] = 'awaiting_email'
            await update.message.reply_text(
                "👋 Olá! Bem-vindo(a) ao Oikonomos.\n\n"
                "Para começar, por favor, envie o **mesmo e-mail** que você usou para se cadastrar no nosso site."
            )
        else:
            await register_user(update, context)
        return

    text = update.message.text.strip()
    text_lower = text.lower()
    parts = text.split()
    command = parts[0].lower()
    
    if text_lower == 'sair':
        await cancel_conversation(update, context, firebase_uid)
        return

    # --- MÁQUINA DE ESTADOS: Verifica se o bot está esperando uma resposta ---
    current_state = context.user_data.get('state')
    if current_state == 'awaiting_budget_specifier':
        context.user_data.pop('state', None)
        if text_lower in ['geral', 'todos', 'total']:
            await list_budgets(update, context, firebase_uid, [])
        else:
            await list_budgets(update, context, firebase_uid, parts)
        return
    # Adicione aqui outros estados se criarmos mais conversas no futuro

    # --- PROCESSAMENTO DE NOVOS COMANDOS ---
    if command in ['?', 'ajuda']:
        await send_manual(update, context, firebase_uid)
    
    elif command == 'ver':
        if len(parts) < 2:
            await update.message.reply_text("Comando `ver` incompleto. Use `?` para ver as opções.", parse_mode='Markdown')
            return
        
        sub_command = parts[1].lower()
        args = parts[2:]
        
        if sub_command in ['orçamento', 'orçamentos']:
            context.user_data['state'] = 'awaiting_budget_specifier'
            # MENSAGEM ESTILIZADA AQUI
            await update.message.reply_text(
                "*Ver Orçamento*\n\n"
                "Você quer ver o resumo geral de todos os orçamentos ou de uma categoria específica?\n\n"
                "Envie `geral` ou o nome da categoria. (Digite 'sair' para cancelar)",
                parse_mode='Markdown'
            )
        elif sub_command == 'categorias':
            await list_categories(update, context, firebase_uid, args)
        elif sub_command == 'contas':
            await list_scheduled_transactions(update, context, firebase_uid, args)
        elif sub_command == 'gastos' and len(parts) > 2 and parts[2].lower() == 'hoje':
            await report_today_spending(update, context, firebase_uid, parts[3:])
        elif sub_command == 'hoje':
            await report_daily_allowance(update, context, firebase_uid, args)
        else:
            await update.message.reply_text(f"Não reconheci o comando `ver {sub_command}`. Use `?` para ver as opções.", parse_mode='Markdown')

    elif command.startswith('+'):
        await process_income(update, context, [command.lstrip('+')] + parts[1:], firebase_uid)
    elif command == 'guardar':
        await process_saving(update, context, parts[1:], firebase_uid)
    elif command == 'sacar':
        await process_withdrawal(update, context, parts[1:], firebase_uid)
    elif command == 'pagar':
        await process_payment(update, context, parts[1:], firebase_uid)
    elif command == 'renda':
        await process_income(update, context, parts[1:], firebase_uid)
    else:
        await process_expense(update, context, parts, firebase_uid)

# --- 6. SERVIDOR WEB E WEBHOOK ---
app = Flask(__name__)
ptb_app = Application.builder().token(TELEGRAM_TOKEN).build()
ptb_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

@app.route("/")
def index():
    return "Servidor do Oikonomos Bot (Multiusuário) está online!"

@app.route("/api/bot", methods=['POST'])
def webhook():
    async def handle_update():
        update = Update.de_json(request.get_json(), ptb_app.bot)
        await ptb_app.initialize()
        await ptb_app.process_update(update)
        await ptb_app.shutdown()
    try:
        asyncio.run(handle_update())
        return "ok", 200
    except Exception as e:
        print(f"Erro no webhook: {e}")
        return "error", 500
    
@app.route('/favicon.ico')
def favicon():
    # Retorna uma resposta '204 No Content', que diz ao navegador
    # "Eu recebi seu pedido, mas não tenho um ícone para te dar."
    return '', 204

# --- 7. FUNÇÃO AGENDADA (CRON JOB) ATUALIZADA ---
@app.route("/api/cron", methods=['GET'])
def run_recurrence_check():
    auth_header = request.headers.get('Authorization')
    if auth_header != f'Bearer {CRON_SECRET}':
        return "Unauthorized", 401

    print("Iniciando verificação de recorrência para TODOS os usuários...")
    try:
        all_users = db.collection('telegram_users').stream()
        total_created_count = 0
        
        for user_doc in all_users:
            firebase_uid = user_doc.to_dict().get('firebase_uid')
            if not firebase_uid: continue

            print(f"Verificando recorrências para o usuário: {firebase_uid}")
            today = datetime.now(timezone.utc)
            query = db.collection('scheduled_transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('isRecurring', '==', True)).where(filter=FieldFilter('status', '==', 'paid')).stream()            
            
            user_created_count = 0
            for paid_doc in query:
                paid_data = paid_doc.to_dict()
                last_due_date = paid_data['dueDate']
                next_due_date = last_due_date + relativedelta(months=1)
                
                if next_due_date.tzinfo is None: next_due_date = next_due_date.replace(tzinfo=timezone.utc)
                while next_due_date < today: next_due_date += relativedelta(months=1)

                next_month_start = next_due_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                next_month_query = db.collection('scheduled_transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('description', '==', paid_data['description'])).where(filter=FieldFilter('categoryName', '==', paid_data['categoryName'])).where(filter=FieldFilter('dueDate', '>=', next_month_start)).limit(1).stream()                
                
                if not next(next_month_query, None):
                    new_scheduled_transaction = {"userId": firebase_uid, "description": paid_data['description'],"amount": paid_data['amount'],"categoryName": paid_data['categoryName'],"dueDate": next_due_date,"status": "pending","isRecurring": True}
                    db.collection('scheduled_transactions').add(new_scheduled_transaction)
                    user_created_count += 1
            
            if user_created_count > 0:
                print(f"Criadas {user_created_count} novas contas para o usuário {firebase_uid}")
            total_created_count += user_created_count

        final_message = f"OK. {total_created_count} novas contas criadas no total."
        print(final_message)
        return final_message, 200

    except Exception as e:
        print(f"Erro no Cron Job: {e}")
        return f"Erro: {e}", 500

# --- 8. EXECUÇÃO LOCAL (Opcional) ---
if __name__ == '__main__':
    print("Iniciando servidor Flask local para desenvolvimento em http://127.0.0.1:8000 ...")
    app.run(debug=True, port=8000)