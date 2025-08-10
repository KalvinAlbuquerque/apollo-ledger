# backend/bot.py (Versão Final com Teclado Interativo)

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
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, MessageHandler, filters, ContextTypes, CallbackQueryHandler, CommandHandler

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
> *Renda:* `+ <valor> <origem> [descrição]`
> *Guardar:* `guardar <valor> <meta>`
> *Sacar:* `sacar <valor> <meta> para <categoria de renda>`
> *Pagar Conta:* `pagar <descrição da conta>`
> *Transferir:* `transferir <valor> da <conta> para <conta>`

---
*📊 CONSULTAR INFORMAÇÕES*
---
> *Use o comando `ver` seguido do que deseja consultar.*

> *`ver categorias`*
> _Lista todas as suas categorias de renda e despesa._

> *`ver orçamentos`*
> _Mostra o resumo de todos os seus orçamentos do mês._

> *`ver orçamento <categoria>`*
> _Mostra o detalhe para uma categoria específica._

> *`ver contas`*
> _Lista suas contas do mês. Adicione `pagas` ou `pendentes` para filtrar._

> *`ver gastos hoje`*
> _Mostra o total gasto hoje. Adicione `categorizado` para ver detalhes._

> *`ver hoje`*
> _Mostra o que você ainda pode gastar hoje com base nos seus orçamentos._

---
> *Para ver este manual novamente:*
> `?` ou `ajuda`
    """
    await update.message.reply_text(manual_text.strip(), parse_mode='Markdown')

# Em: backend/bot.py

async def process_transfer(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Processa uma transferência entre contas de forma completa."""
    # Envia uma mensagem de feedback inicial que será editada depois
    sent_message = await update.message.reply_text("⏳ A processar transferência...")

    try:
        if 'da' not in text_parts or 'para' not in text_parts:
            await sent_message.edit_message_text("Formato inválido. Use: `transferir <valor> da <conta origem> para <conta destino>`", parse_mode='Markdown')
            return

        valor_str = text_parts[0]
        da_index = text_parts.index('da')
        para_index = text_parts.index('para')

        origem_str = " ".join(text_parts[da_index + 1:para_index])
        destino_str = " ".join(text_parts[para_index + 1:])
        amount = float(valor_str.replace(',', '.'))

        if not all([origem_str, destino_str, amount > 0]):
            await sent_message.edit_message_text("Formato inválido. Faltam informações.")
            return

        # Busca todas as contas do usuário de uma vez
        accounts_query = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
        accounts = {acc.id: acc.to_dict() for acc in accounts_query}

        from_account_tuple = next(((acc_id, acc) for acc_id, acc in accounts.items() if normalize_text(acc.get('accountName')) == normalize_text(origem_str)), None)
        to_account_tuple = next(((acc_id, acc) for acc_id, acc in accounts.items() if normalize_text(acc.get('accountName')) == normalize_text(destino_str)), None)

        if not from_account_tuple or not to_account_tuple:
            await sent_message.edit_message_text("❌ Uma ou ambas as contas não foram encontradas. Verifique os nomes e tente novamente.")
            return
        
        from_account_id, from_account = from_account_tuple
        to_account_id, to_account = to_account_tuple

        if from_account.get('balance', 0) < amount:
            await sent_message.edit_message_text(f"❌ Saldo insuficiente na conta de origem '{from_account.get('accountName')}'.")
            return
        
        # Inicia um lote para garantir que todas as operações funcionem ou falhem juntas
        batch = db.batch()
        
        # Cria a transação de despesa (saída)
        batch.set(db.collection("transactions").document(), {'userId': firebase_uid, 'type': 'expense', 'amount': amount, 'category': 'transferência', 'description': f"Para: {to_account.get('accountName')}", 'createdAt': firestore.SERVER_TIMESTAMP, 'accountId': from_account_id})
        
        # Cria a transação de renda (entrada)
        batch.set(db.collection("transactions").document(), {'userId': firebase_uid, 'type': 'income', 'amount': amount, 'category': 'transferência', 'description': f"De: {from_account.get('accountName')}", 'createdAt': firestore.SERVER_TIMESTAMP, 'accountId': to_account_id})
        
        # Atualiza os saldos das contas
        batch.update(db.collection('accounts').document(from_account_id), {'balance': firestore.firestore.Increment(-amount)})
        batch.update(db.collection('accounts').document(to_account_id), {'balance': firestore.firestore.Increment(amount)})
        
        # Executa todas as operações no banco de dados
        batch.commit()
        
        await sent_message.edit_message_text(text=f"✅ Transferência de R$ {amount:.2f} de '{from_account.get('accountName')}' para '{to_account.get('accountName')}' realizada com sucesso!")

    except ValueError:
        await sent_message.edit_message_text(f"O valor '{valor_str}' é inválido.")
    except Exception as e:
        print(f"Erro ao processar transferência: {e}")
        await sent_message.edit_message_text("❌ Ocorreu um erro inesperado ao processar a transferência.")
        
async def process_payment(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Valida uma conta a pagar e inicia a conversa para seleção de conta."""
    try:
        if not text_parts:
            await update.message.reply_text("Formato inválido. Use: `pagar <descrição da conta>`", parse_mode='Markdown')
            return

        description_input = " ".join(text_parts).strip()
        description_normalized = normalize_text(description_input)
        
        q = db.collection('scheduled_transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('status', '==', 'pending'))
        pending_debts_docs = list(q.stream())
        found_debt = next((d for d in pending_debts_docs if normalize_text(d.to_dict().get('description', '')) == description_normalized), None)
        
        if not found_debt:
            await update.message.reply_text(f"❌ Conta pendente '{description_input}' não encontrada.")
            return

        accounts_query = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
        accounts = list(accounts_query)
        if not accounts:
            await update.message.reply_text("Você precisa de criar uma conta no dashboard primeiro.")
            return

        # Guarda a intenção na memória
        context.user_data['pending_transaction'] = {
            'type': 'payment',
            'debt_doc': found_debt.to_dict(),
            'debt_id': found_debt.id
        }
        
        # Cria e envia o teclado com as contas
        keyboard = [[InlineKeyboardButton(acc.to_dict()['accountName'], callback_data=f"pay_{acc.id}")] for acc in accounts]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(f"Pagar '{found_debt.to_dict()['description']}' a partir de qual conta?", reply_markup=reply_markup)

    except Exception as e:
        print(f"Erro ao iniciar pagamento: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao processar o seu pedido.")
        
async def process_expense(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Valida uma despesa e inicia a conversa para seleção de conta."""
    try:
        # --- Validação da Categoria (lógica que já tínhamos) ---
        categories_ref = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).stream()
        original_categories = [doc.to_dict()['name'] for doc in categories_ref]
        valid_categories_normalized = [normalize_text(name) for name in original_categories]

        if not original_categories:
            await update.message.reply_text("Você não tem nenhuma categoria de DESPESA cadastrada.")
            return
        
        expense_text = " ".join(text_parts)
        match = re.match(r"^\s*(\d+[\.,]?\d*)\s+([\w\sáàâãéèêíïóôõöúçñ]+?)(?:\s+(.+))?$", expense_text)

        if not match:
            await update.message.reply_text("Formato de gasto inválido. Use: <valor> <categoria> [descrição]")
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
        
        # --- Lógica de Conversa ---
        # 1. Busca as contas do usuário
        accounts_query = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
        accounts = list(accounts_query)

        if not accounts:
            await update.message.reply_text("Você precisa criar uma conta no dashboard primeiro antes de registrar uma transação.")
            return

        # 2. Guarda os detalhes da transação na "memória" do usuário
        context.user_data['pending_transaction'] = {
            'type': 'expense',
            'amount': amount,
            'category': correct_category_name,
            'description': description
        }
        
        # 3. Cria os botões para cada conta
        keyboard = []
        for acc_doc in accounts:
            acc = acc_doc.to_dict()
            button_text = f"{acc.get('accountName')} (R$ {acc.get('balance', 0):.2f})"
            button = InlineKeyboardButton(button_text, callback_data=f"account_{acc_doc.id}")
            keyboard.append([button])

        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text("De qual conta deseja debitar este gasto?", reply_markup=reply_markup)

    except Exception as e:
        print(f"Erro ao iniciar processamento de despesa: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao processar sua despesa.")
        
async def process_income(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Valida uma renda e inicia a conversa para seleção de conta."""
    try:
        # --- Validação da Categoria de Renda (lógica que já tínhamos) ---
        categories_ref = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'income')).stream()
        original_categories = [doc.to_dict()['name'] for doc in categories_ref]
        valid_categories_normalized = [normalize_text(name) for name in original_categories]

        if not original_categories:
            await update.message.reply_text("Você não tem nenhuma categoria de RENDA cadastrada.")
            return
            
        if len(text_parts) < 2:
            await update.message.reply_text("Formato de renda inválido. Use: + <valor> <origem> [descrição]")
            return
            
        value_str = text_parts[0]
        potential_source_and_desc = text_parts[1:]

        found_category_original = None
        category_word_count = 0

        for i in range(len(potential_source_and_desc), 0, -1):
            potential_category_input = " ".join(potential_source_and_desc[:i])
            potential_category_normalized = normalize_text(potential_category_input)
            
            if potential_category_normalized in valid_categories_normalized:
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

        description = " ".join(potential_source_and_desc[category_word_count:]).strip() or None
        amount = float(value_str.replace(',', '.'))
        
        # --- Lógica de Conversa ---
        accounts_query = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
        accounts = list(accounts_query)

        if not accounts:
            await update.message.reply_text("Você precisa criar uma conta no dashboard primeiro antes de registrar uma transação.")
            return

        context.user_data['pending_transaction'] = {
            'type': 'income',
            'amount': amount,
            'category': found_category_original,
            'description': description
        }
        
        keyboard = []
        for acc_doc in accounts:
            acc = acc_doc.to_dict()
            button_text = f"{acc.get('accountName')} (R$ {acc.get('balance', 0):.2f})"
            button = InlineKeyboardButton(button_text, callback_data=f"account_{acc_doc.id}")
            keyboard.append([button])

        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text("Em qual conta deseja registrar esta renda?", reply_markup=reply_markup)

    except Exception as e:
        print(f"Erro ao iniciar processamento de renda: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao processar sua renda.")

# Em: backend/bot.py

async def handle_account_selection(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Finaliza uma transação pendente (despesa, renda ou pagamento) após um clique de botão.
    """
    chat_id = update.effective_chat.id
    firebase_uid = await get_firebase_user_id(chat_id)
    if not firebase_uid: return

    query = update.callback_query
    await query.answer()
    message_to_edit = query.message

    try:
        pending_transaction = context.user_data.get('pending_transaction')
        if not pending_transaction:
            await message_to_edit.edit_message_text(text="Parece que a operação expirou. Por favor, tente novamente.")
            return
            
        transaction_type = pending_transaction.get('type')
        batch = db.batch()
        
        accounts_query = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
        accounts = {acc.id: acc.to_dict() for acc in accounts_query}

        # --- LÓGICA PARA TRANSAÇÕES DE RENDA OU DESPESA ---
        if transaction_type in ['income', 'expense']:
            selected_account_id = query.data.split('_')[1]
            account_doc_ref = db.collection('accounts').document(selected_account_id)
            new_trans_ref = db.collection("transactions").document()
            
            # Remove o 'type' que já está no objeto antes de salvar
            transaction_data = pending_transaction.copy()
            transaction_data.update({'accountId': selected_account_id, 'userId': firebase_uid, 'createdAt': firestore.SERVER_TIMESTAMP})
            batch.set(new_trans_ref, transaction_data)
            
            amount_to_update = transaction_data['amount'] if transaction_type == 'income' else -transaction_data['amount']
            batch.update(account_doc_ref, {'balance': firestore.firestore.Increment(amount_to_update)})
            
            account_name = accounts.get(selected_account_id, {}).get('accountName', 'desconhecida')
            await message_to_edit.edit_message_text(text=f"✅ Transação registada com sucesso na conta '{account_name}'!")

        # --- LÓGICA PARA PAGAMENTOS ---
        elif transaction_type == 'payment':
            selected_account_id = query.data.split('_')[1]
            debt = pending_transaction['debt_doc']
            debt_id = pending_transaction['debt_id']
            source_account = accounts.get(selected_account_id)

            if not source_account or source_account.get('balance', 0) < debt.get('amount', 0):
                await message_to_edit.edit_message_text(text=f"❌ Saldo insuficiente na conta '{source_account.get('accountName')}'.")
                return

            desc = f"Pagamento de: {debt.get('description')}"
            if source_account.get('isReserve'):
                desc += f" (c/ {source_account.get('accountName')})"
            
            batch.set(db.collection("transactions").document(), {'userId': firebase_uid, 'amount': debt.get('amount'), 'category': debt.get('categoryName'), 'description': desc, 'createdAt': firestore.SERVER_TIMESTAMP, 'type': 'expense', 'accountId': selected_account_id})
            batch.update(db.collection('scheduled_transactions').document(debt_id), {'status': 'paid'})
            batch.update(db.collection('accounts').document(selected_account_id), {'balance': firestore.firestore.Increment(-debt.get('amount', 0))})

            if source_account.get('isReserve'):
                payback_ref = db.collection("scheduled_transactions").document()
                batch.set(payback_ref, {'userId': firebase_uid, 'description': f"Reposição para: {source_account.get('accountName')}", 'amount': debt.get('amount'), 'categoryName': 'reservas', 'dueDate': datetime.now(timezone.utc) + relativedelta(months=1), 'status': 'pending', 'isRecurring': False})

            await message_to_edit.edit_message_text(text=f"✅ Pagamento de '{debt.get('description')}' registado a partir de '{source_account.get('accountName')}'!")
        
        # O commit é síncrono, não precisa de await
        batch.commit()
    
    except Exception as e:
        print(f"Erro ao finalizar transação: {e}")
        await message_to_edit.edit_message_text(text="❌ Ocorreu um erro ao salvar sua transação.")
    finally:
        # Limpa a memória para a próxima operação
        context.user_data.pop('pending_transaction', None)

async def process_saving(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list,firebase_uid: str):
    """Processa uma contribuição para uma meta de poupança."""
    sent_message = await context.bot.send_message(chat_id=update.effective_chat.id, text="⏳ Guardando dinheiro na meta...")
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
        await context.bot.edit_message_text(chat_id=update.effective_chat.id, message_id=sent_message.message_id, text=reply_message, parse_mode='Markdown')
    except ValueError:
        await context.bot.edit_message_text(chat_id=update.effective_chat.id, message_id=sent_message.message_id, text=f"Valor inválido: '{value_str}'.")
    except Exception as e:
        print(f"Erro ao processar poupança: {e}")
        await context.bot.edit_message_text(chat_id=update.effective_chat.id, message_id=sent_message.message_id, text="❌ Ocorreu um erro interno ao processar a contribuição.")
        
        
        
        
async def process_withdrawal(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Processa um saque de uma meta de poupança, transferindo o valor para uma categoria de renda."""
    sent_message = await context.bot.send_message(chat_id=update.effective_chat.id, text="⏳ Processando saque...")
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

        await context.bot.edit_message_text(
            chat_id=update.effective_chat.id,
            message_id=sent_message.message_id,
            text=f"✅ Saque de R$ {amount:.2f} da meta '{found_goal.to_dict().get('goalName')}' realizado e adicionado à renda '{found_income_category.to_dict().get('name')}'."
        )

    except ValueError:
        await update.message.reply_text(f"Valor inválido: '{value_str}'. O valor deve ser um número.")
    except Exception as e:
        print(f"Erro ao processar saque: {e}")
        await context.bot.edit_message_text(
            chat_id=update.effective_chat.id,
            message_id=sent_message.message_id,
            text="❌ Ocorreu um erro interno ao processar o saque."
        )

        
 
async def list_categories(update: Update, context: ContextTypes.DEFAULT_TYPE, firebase_uid: str):
    """Lista todas as categorias de renda e despesa."""
    try:
        q = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid))
        docs = list(q.stream())
        
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

        reply_message = "*Categorias de Renda:*\n"
        reply_message += "- " + "\n- ".join(sorted(income_cats)) if income_cats else "_Nenhuma cadastrada._\n"
        reply_message += "\n"
        reply_message += "*Categorias de Despesa:*\n"
        reply_message += "- " + "\n- ".join(sorted(expense_cats)) if expense_cats else "_Nenhuma cadastrada._\n"
            
        await update.message.reply_text(reply_message.strip(), parse_mode='Markdown')
        
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
    """Função principal que recebe todas as mensagens e decide o que fazer."""
    chat_id = update.effective_chat.id
    firebase_uid = await get_firebase_user_id(chat_id)

    if not firebase_uid:
        # ... (lógica de novo usuário sem alterações)
        return

    text = update.message.text.strip()
    parts = text.split()
    command = parts[0].lower()

    if command in ['?', 'ajuda']:
        await send_manual(update, context, firebase_uid)
    
    elif command == 'ver':
        if len(parts) < 2:
            await update.message.reply_text("Comando 'ver' incompleto. Use '?' para ver as opções.")
            return
        
        sub_command = parts[1].lower()
        args = parts[2:]
        
        if sub_command in ['orçamento', 'orçamentos']:
            await list_budgets(update, context, firebase_uid, args)
        elif sub_command == 'categorias':
            await list_categories(update, context, firebase_uid) # Não passa mais 'args'
        elif sub_command == 'contas':
            await list_scheduled_transactions(update, context, firebase_uid, args)
        elif sub_command == 'gastos' and len(parts) > 2 and parts[2].lower() == 'hoje':
            await report_today_spending(update, context, firebase_uid, parts[3:])
        elif sub_command == 'hoje':
            await report_daily_allowance(update, context, firebase_uid, args)
        else:
            await update.message.reply_text(f"Não reconheci o comando 'ver {sub_command}'. Use '?' para ver as opções.")


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
    elif command == 'transferir':
        await process_transfer(update, context, parts[1:], firebase_uid)
    else:
        await process_expense(update, context, parts, firebase_uid)

# --- 6. SERVIDOR WEB E WEBHOOK ---
app = Flask(__name__)
ptb_app = Application.builder().token(TELEGRAM_TOKEN).build()
ptb_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
ptb_app.add_handler(CallbackQueryHandler(handle_account_selection))

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

@app.route("/api/monthly-closing", methods=['GET'])
def run_monthly_closing():
    # 1. Proteção: Verifica a senha secreta
    auth_header = request.headers.get('Authorization')
    cron_secret = os.getenv("CRON_SECRET")
    if auth_header != f'Bearer {cron_secret}':
        return "Unauthorized", 401

    print("Iniciando processo de fecho de mês para todos os usuários...")
    try:
        # 2. Busca todos os usuários cadastrados
        all_users = db.collection('telegram_users').stream()
        
        today = datetime.now(timezone.utc)
        # Calcula o primeiro e o último dia do MÊS PASSADO
        first_day_of_current_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_day_of_previous_month = first_day_of_current_month - relativedelta(seconds=1)
        first_day_of_previous_month = last_day_of_previous_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        processed_users = 0
        # 3. Itera sobre cada usuário para fazer o fecho individual
        for user_doc in all_users:
            firebase_uid = user_doc.to_dict().get('firebase_uid')
            if not firebase_uid:
                continue

            print(f"Processando fecho para o usuário: {firebase_uid}")
            
            # Busca todas as transações do usuário no mês anterior
            q = db.collection('transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('createdAt', '>=', first_day_of_previous_month)).where(filter=FieldFilter('createdAt', '<=', last_day_of_previous_month))
            transactions_prev_month = list(q.stream())

            # Se não houver transações, pula para o próximo usuário
            if not transactions_prev_month:
                print(f"Nenhuma transação encontrada para o usuário {firebase_uid} no mês anterior. Pulando.")
                continue

            # Calcula o balanço do mês anterior
            total_income = sum(doc.to_dict().get('amount', 0) for doc in transactions_prev_month if doc.to_dict().get('type') == 'income')
            total_expense = sum(doc.to_dict().get('amount', 0) for doc in transactions_prev_month if doc.to_dict().get('type') == 'expense')
            balance = total_income - total_expense
            
            # 4. Cria a nova transação de balanço para o início do mês atual
            closing_transaction_data = {
                "userId": firebase_uid,
                "createdAt": first_day_of_current_month, # Data de 1º do mês atual
            }
            if balance >= 0:
                closing_transaction_data['type'] = 'income'
                closing_transaction_data['amount'] = balance
                closing_transaction_data['category'] = 'saldo anterior'
                closing_transaction_data['description'] = f"Saldo positivo de {last_day_of_previous_month.strftime('%B de %Y')}"
            else: # Saldo negativo
                closing_transaction_data['type'] = 'expense'
                closing_transaction_data['amount'] = abs(balance)
                closing_transaction_data['category'] = 'dívida anterior'
                closing_transaction_data['description'] = f"Saldo negativo de {last_day_of_previous_month.strftime('%B de %Y')}"

            # Adiciona a transação ao banco de dados
            db.collection('transactions').add(closing_transaction_data)
            print(f"Transação de fecho de R$ {balance:.2f} criada para o usuário {firebase_uid}.")
            processed_users += 1

        final_message = f"OK. Fecho de mês processado para {processed_users} usuário(s)."
        print(final_message)
        return final_message, 200

    except Exception as e:
        print(f"Erro no Cron Job de fecho de mês: {e}")
        return f"Erro: {e}", 500


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