# backend/bot.py (Versão Final com Teclado Interativo)

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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
from flask_cors import CORS
import secrets
from flask import jsonify
from functools import wraps
from apollo import (
    ApolloAgent, validar_arquivo, TRIGGERS_APOLLO,
    carregar_historico, salvar_historico,
)

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
*⚡ TRANSAÇÕES RÁPIDAS (com conta padrão)*
---
> Use um `*` no início para usar sua conta padrão e pular a etapa de seleção de conta.

> *Gasto Rápido:* `* <valor> <categoria> [descrição]`
> *Renda Rápida:* `*+ <valor> <origem>` ou `*renda <valor> <origem>`

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

async def process_transfer(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Processa uma transferência entre contas de forma completa."""
    # Envia uma mensagem de feedback inicial que será editada depois
    sent_message = await update.message.reply_text("⏳ A processar transferência...")

    try:
        if 'da' not in text_parts or 'para' not in text_parts:
            await sent_message.edit_text("Formato inválido. Use: `transferir <valor> da <conta origem> para <conta destino>`", parse_mode='Markdown')
            return

        valor_str = text_parts[0]
        da_index = text_parts.index('da')
        para_index = text_parts.index('para')

        origem_str = " ".join(text_parts[da_index + 1:para_index])
        destino_str = " ".join(text_parts[para_index + 1:])
        amount = float(valor_str.replace(',', '.'))

        if not all([origem_str, destino_str, amount > 0]):
            await sent_message.edit_text("Formato inválido. Faltam informações.")
            return

        # Busca todas as contas do usuário de uma vez
        accounts_query = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
        accounts = {acc.id: acc.to_dict() for acc in accounts_query}

        from_account_tuple = next(((acc_id, acc) for acc_id, acc in accounts.items() if normalize_text(acc.get('accountName')) == normalize_text(origem_str)), None)
        to_account_tuple = next(((acc_id, acc) for acc_id, acc in accounts.items() if normalize_text(acc.get('accountName')) == normalize_text(destino_str)), None)

        if not from_account_tuple or not to_account_tuple:
            await sent_message.edit_text("❌ Uma ou ambas as contas não foram encontradas. Verifique os nomes e tente novamente.")
            return
        
        from_account_id, from_account = from_account_tuple
        to_account_id, to_account = to_account_tuple

        if from_account.get('balance', 0) < amount:
            await sent_message.edit_text(f"❌ Saldo insuficiente na conta de origem '{from_account.get('accountName')}'.")
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
        
        await sent_message.edit_text(text=f"✅ Transferência de R$ {amount:.2f} de '{from_account.get('accountName')}' para '{to_account.get('accountName')}' realizada com sucesso!")

    except ValueError:
        await sent_message.edit_text(f"O valor '{valor_str}' é inválido.")
    except Exception as e:
        print(f"Erro ao processar transferência: {e}")
        await sent_message.edit_text("❌ Ocorreu um erro inesperado ao processar a transferência.")
        
# Em: backend/bot.py

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

        # 1. Salva a intenção de pagamento no Firestore
        pending_data = {
            'type': 'payment',
            'debt_doc': found_debt.to_dict(),
            'debt_id': found_debt.id,
            'userId': firebase_uid,
            'createdAt': firestore.SERVER_TIMESTAMP
        }
        pending_ref = db.collection('pending_transactions').document()
        pending_ref.set(pending_data)
        
        # 2. Cria e envia o teclado com as contas e o ID pendente
        keyboard = []
        for acc in accounts:
            callback_data = f"pay_{acc.id}_{pending_ref.id}"
            keyboard.append([InlineKeyboardButton(acc.to_dict()['accountName'], callback_data=callback_data)])
            
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
        
        # LINHA CORRIGIDA ABAIXO
        original_categories = [doc.to_dict()['name'].strip() for doc in categories_ref]
        
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
        description = description.strip() if description else ""
        tags = [tag.lower() for tag in re.findall(r'#(\w+)', description)]
        description = re.sub(r'#\w+', '', description).strip() or None
        
        # --- Lógica de Conversa (NOVA) ---
        accounts_query = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
        accounts = list(accounts_query)

        if not accounts:
            await update.message.reply_text("Você precisa criar uma conta no dashboard primeiro antes de registrar uma transação.")
            return

        # 1. Salva a transação pendente e sincroniza tags no Firestore
        pending_data = {
            'type': 'expense',
            'amount': amount,
            'category': correct_category_name,
            'description': description,
            'tags': tags,
            'userId': firebase_uid,
            'createdAt': firestore.SERVER_TIMESTAMP 
        }
        batch = db.batch()
        
        if tags:
            existing_tags_query = db.collection('tags').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
            existing_tags = [doc.to_dict().get('name') for doc in existing_tags_query]
            for tag in tags:
                if tag not in existing_tags:
                    new_tag_ref = db.collection('tags').document()
                    batch.set(new_tag_ref, {'name': tag, 'userId': firebase_uid, 'isActive': True, 'createdAt': firestore.SERVER_TIMESTAMP})
                    existing_tags.append(tag)

        pending_ref = db.collection('pending_transactions').document()
        batch.set(pending_ref, pending_data)
        batch.commit()
        
        # 2. Cria os botões com o ID da transação pendente no callback_data
        keyboard = []
        for acc_doc in accounts:
            acc = acc_doc.to_dict()
            button_text = f"{acc.get('accountName')} (R$ {acc.get('balance', 0):.2f})"
            callback_data = f"account_{acc_doc.id}_{pending_ref.id}"
            button = InlineKeyboardButton(button_text, callback_data=callback_data)
            keyboard.append([button])

        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text("De qual conta deseja debitar este gasto?", reply_markup=reply_markup)

    except Exception as e:
        print(f"Erro ao iniciar processamento de despesa: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao processar sua despesa.")

        
# Em: backend/bot.py

async def process_income(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list, firebase_uid: str):
    """Valida uma renda e inicia a conversa para seleção de conta."""
    try:
        # --- Validação da Categoria de Renda (lógica que já tínhamos) ---
        categories_ref = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'income')).stream()
        
        # LINHA CORRIGIDA ABAIXO
        original_categories = [doc.to_dict()['name'].strip() for doc in categories_ref]
        
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

        description = " ".join(potential_source_and_desc[category_word_count:]).strip() or ""
        amount = float(value_str.replace(',', '.'))
        tags = [tag.lower() for tag in re.findall(r'#(\w+)', description)]
        description = re.sub(r'#\w+', '', description).strip() or None
        
        # --- Lógica de Conversa (NOVA) ---
        accounts_query = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
        accounts = list(accounts_query)

        if not accounts:
            await update.message.reply_text("Você precisa criar uma conta no dashboard primeiro antes de registrar uma transação.")
            return

        # 1. Salva a transação pendente e sincroniza tags no Firestore
        pending_data = {
            'type': 'income',
            'amount': amount,
            'category': found_category_original,
            'description': description,
            'tags': tags,
            'userId': firebase_uid,
            'createdAt': firestore.SERVER_TIMESTAMP
        }
        batch = db.batch()
        
        if tags:
            existing_tags_query = db.collection('tags').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
            existing_tags = [doc.to_dict().get('name') for doc in existing_tags_query]
            for tag in tags:
                if tag not in existing_tags:
                    new_tag_ref = db.collection('tags').document()
                    batch.set(new_tag_ref, {'name': tag, 'userId': firebase_uid, 'isActive': True, 'createdAt': firestore.SERVER_TIMESTAMP})
                    existing_tags.append(tag)

        pending_ref = db.collection('pending_transactions').document()
        batch.set(pending_ref, pending_data)
        batch.commit()
        
        # 2. Cria os botões com o ID da transação pendente no callback_data
        keyboard = []
        for acc_doc in accounts:
            acc = acc_doc.to_dict()
            button_text = f"{acc.get('accountName')} (R$ {acc.get('balance', 0):.2f})"
            callback_data = f"account_{acc_doc.id}_{pending_ref.id}"
            button = InlineKeyboardButton(button_text, callback_data=callback_data)
            keyboard.append([button])

        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text("Em qual conta deseja registrar esta renda?", reply_markup=reply_markup)

    except Exception as e:
        print(f"Erro ao iniciar processamento de renda: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao processar sua renda.")

# Em: backend/bot.py

async def handle_account_selection(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Finaliza uma transação pendente (despesa, renda ou pagamento) a partir de um clique de botão,
    lendo o estado do Firestore.
    """
    chat_id = update.effective_chat.id
    firebase_uid = await get_firebase_user_id(chat_id)
    if not firebase_uid: return

    query = update.callback_query
    await query.answer()
    message_to_edit = query.message

    pending_doc_ref = None
    try:
        callback_parts = query.data.split('_')
        action_prefix = callback_parts[0]
        selected_account_id = callback_parts[1]
        pending_transaction_id = callback_parts[2]

        pending_doc_ref = db.collection('pending_transactions').document(pending_transaction_id)
        pending_transaction_doc = pending_doc_ref.get()

        if not pending_transaction_doc.exists:
            await message_to_edit.edit_text(text="🤔 Esta operação já foi concluída ou expirou.")
            return

        pending_transaction = pending_transaction_doc.to_dict()

        if pending_transaction.get('userId') != firebase_uid:
            await query.answer("Este comando não foi iniciado por você.", show_alert=True)
            return

        transaction_type = pending_transaction.get('type')
        batch = db.batch()
        
        accounts_query = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
        accounts = {acc.id: acc.to_dict() for acc in accounts_query}

        if transaction_type in ['expense', 'income']:
            account_doc_ref = db.collection('accounts').document(selected_account_id)
            new_trans_ref = db.collection("transactions").document()

            final_transaction = {
                'userId': firebase_uid, 'createdAt': firestore.SERVER_TIMESTAMP, 'accountId': selected_account_id,
                'type': transaction_type, 'amount': pending_transaction['amount'], 'category': pending_transaction['category'],
                'description': pending_transaction.get('description'),
                'tags': pending_transaction.get('tags', [])
            }
            batch.set(new_trans_ref, final_transaction)
            
            if transaction_type == 'expense':
                batch.update(account_doc_ref, {'balance': firestore.firestore.Increment(-pending_transaction['amount'])})
            else:
                batch.update(account_doc_ref, {'balance': firestore.firestore.Increment(pending_transaction['amount'])})
            
            batch.commit()
            pending_doc_ref.delete()
            
            # --- CHAMADA DA NOVA FUNÇÃO DE FEEDBACK ---
            await send_budget_feedback(
                message_to_edit=message_to_edit,
                firebase_uid=firebase_uid,
                category_name=pending_transaction['category'],
                spent_amount=pending_transaction['amount']
            )
            # -----------------------------------------


        # --- LÓGICA PARA PAGAMENTOS ---
        elif transaction_type == 'payment':
            debt = pending_transaction['debt_doc']
            debt_id = pending_transaction['debt_id']
            source_account = accounts.get(selected_account_id)

            if not source_account or source_account.get('balance', 0) < debt.get('amount', 0):
                await message_to_edit.edit_text(text=f"❌ Saldo insuficiente na conta '{source_account.get('accountName')}'.")
                return

            desc = f"Pagamento de: {debt.get('description')}"
            batch.set(db.collection("transactions").document(), {'userId': firebase_uid, 'amount': debt.get('amount'), 'category': debt.get('categoryName'), 'description': desc, 'createdAt': firestore.SERVER_TIMESTAMP, 'type': 'expense', 'accountId': selected_account_id})
            batch.update(db.collection('scheduled_transactions').document(debt_id), {'status': 'paid'})
            batch.update(db.collection('accounts').document(selected_account_id), {'balance': firestore.firestore.Increment(-debt.get('amount', 0))})

            await message_to_edit.edit_text(text=f"✅ Pagamento de '{debt.get('description')}' registado a partir de '{source_account.get('accountName')}'!")

        # 4. Efetiva as mudanças e limpa a transação pendente
        batch.commit()
        pending_doc_ref.delete()
    
    except Exception as e:
        print(f"Erro ao finalizar transação: {e}")
        await message_to_edit.edit_text(text="❌ Ocorreu um erro ao salvar sua transação.")
        # Se deu erro, mas o documento pendente foi lido, tenta apagá-lo para não deixar lixo
        if pending_doc_ref:
            pending_doc_ref.delete()

# Substitua esta função em: backend/bot.py

# Substitua esta função em: backend/bot.py

async def process_default_transaction(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str, firebase_uid: str):
    """
    Processa uma transação rápida (iniciada com '*') usando a conta padrão do usuário.
    """
    sent_message = await update.message.reply_text("⏳ Processando transação rápida...")

    try:
        accounts_ref = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('isDefault', '==', True)).limit(1).stream()
        default_account_doc = next(accounts_ref, None)

        if not default_account_doc:
            await sent_message.edit_text("❌ Nenhuma conta padrão definida. Por favor, defina uma no seu dashboard web.")
            return

        default_account = default_account_doc.to_dict()
        default_account_id = default_account_doc.id

        text_after_star = text[1:].lstrip()
        is_income = text_after_star.startswith('+') or text_after_star.lower().startswith('renda')
        value_str = ''
        
        if is_income:
            # --- Lógica de Renda (sem alterações) ---
            transaction_type = 'income'
            if text_after_star.startswith('+'): clean_text = text_after_star[1:].strip()
            else: clean_text = text_after_star[len('renda'):].strip()
            
            parts = clean_text.split()
            error_format_msg = "Formato inválido. Use: `*+ <valor> <origem>` ou `*renda <valor> <origem>`"
            if len(parts) < 2:
                await sent_message.edit_text(error_format_msg, parse_mode='Markdown')
                return
            
            value_str = parts[0]
            amount = float(value_str.replace(',', '.'))
            potential_source_and_desc = parts[1:]
            
            categories_ref = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'income')).stream()
            original_categories = {normalize_text(cat.to_dict()['name'].strip()): cat.to_dict()['name'].strip() for cat in categories_ref}
                        
            found_category_original = None
            category_word_count = 0
            for i in range(len(potential_source_and_desc), 0, -1):
                potential_category_input = " ".join(potential_source_and_desc[:i])
                if normalize_text(potential_category_input) in original_categories:
                    found_category_original = original_categories[normalize_text(potential_category_input)]
                    category_word_count = i
                    break
            
            if not found_category_original:
                await sent_message.edit_text(f"❌ Origem de RENDA '{' '.join(potential_source_and_desc)}' não encontrada.")
                return
            correct_category_name = found_category_original
            description = " ".join(potential_source_and_desc[category_word_count:]).strip() or ""
            tags = [tag.lower() for tag in re.findall(r'#(\w+)', description)]
            description = re.sub(r'#\w+', '', description).strip() or None

            # Salva a transação de renda e sincroniza tags
            batch = db.batch()
            
            if tags:
                existing_tags_query = db.collection('tags').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
                existing_tags = [doc.to_dict().get('name') for doc in existing_tags_query]
                for tag in tags:
                    if tag not in existing_tags:
                        new_tag_ref = db.collection('tags').document()
                        batch.set(new_tag_ref, {'name': tag, 'userId': firebase_uid, 'isActive': True, 'createdAt': firestore.SERVER_TIMESTAMP})
                        existing_tags.append(tag)

            new_trans_ref = db.collection("transactions").document()
            batch.set(new_trans_ref, {'userId': firebase_uid, 'type': 'income', 'amount': amount, 'category': correct_category_name, 'description': description, 'tags': tags, 'createdAt': firestore.SERVER_TIMESTAMP, 'accountId': default_account_id})
            account_doc_ref = db.collection('accounts').document(default_account_id)
            batch.update(account_doc_ref, {'balance': firestore.firestore.Increment(amount)})
            batch.commit()
            
            await sent_message.edit_text(f"✅ Renda rápida registrada na sua conta padrão '{default_account.get('accountName')}'!")

        else: # É despesa
            transaction_type = 'expense'
            clean_text = text_after_star
            error_format_msg = "Formato de gasto inválido. Use: `*<valor> <categoria> [descrição]`"

            match = re.match(r"^\s*(\d+[\.,]?\d*)\s+([\w\sáàâãéèêíïóôõöúçñ]+?)(?:\s+(.+))?$", clean_text)
            if not match:
                await sent_message.edit_text(error_format_msg, parse_mode='Markdown')
                return
                
            value_str, category_name_input, description = match.groups()
            amount = float(value_str.replace(',', '.'))
            description = description.strip() if description else ""
            tags = [tag.lower() for tag in re.findall(r'#(\w+)', description)]
            description = re.sub(r'#\w+', '', description).strip() or None
            
            categories_ref = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).stream()
            
            # LINHA CORRIGIDA ABAIXO
            original_categories = {normalize_text(cat.to_dict()['name'].strip()): cat.to_dict()['name'].strip() for cat in categories_ref}
            
            category_name_normalized = normalize_text(category_name_input.strip())
            if category_name_normalized not in original_categories:
                await sent_message.edit_text(f"❌ Categoria de DESPESA '{category_name_input}' não encontrada.")
                return
            correct_category_name = original_categories[category_name_normalized]

            # Salva a transação de despesa e sincroniza tags
            batch = db.batch()
            
            if tags:
                existing_tags_query = db.collection('tags').where(filter=FieldFilter('userId', '==', firebase_uid)).stream()
                existing_tags = [doc.to_dict().get('name') for doc in existing_tags_query]
                for tag in tags:
                    if tag not in existing_tags:
                        new_tag_ref = db.collection('tags').document()
                        batch.set(new_tag_ref, {'name': tag, 'userId': firebase_uid, 'isActive': True, 'createdAt': firestore.SERVER_TIMESTAMP})
                        existing_tags.append(tag)

            new_trans_ref = db.collection("transactions").document()
            batch.set(new_trans_ref, {'userId': firebase_uid, 'type': 'expense', 'amount': amount, 'category': correct_category_name, 'description': description, 'tags': tags, 'createdAt': firestore.SERVER_TIMESTAMP, 'accountId': default_account_id})
            account_doc_ref = db.collection('accounts').document(default_account_id)
            batch.update(account_doc_ref, {'balance': firestore.firestore.Increment(-amount)})
            batch.commit()
            
            # --- CHAMADA DA NOVA FUNÇÃO DE FEEDBACK ---
            await send_budget_feedback(
                message_to_edit=sent_message,
                firebase_uid=firebase_uid,
                category_name=correct_category_name,
                spent_amount=amount
            )
            # -----------------------------------------

    except ValueError:
        await sent_message.edit_text(f"O valor '{value_str}' é inválido.")
    except Exception as e:
        print(f"Erro na transação rápida: {e}")
        await sent_message.edit_text("❌ Ocorreu um erro ao processar sua transação rápida.")

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
# Adicione esta nova função em: backend/bot.py

async def send_budget_feedback(message_to_edit, firebase_uid: str, category_name: str, spent_amount: float):
    """
    Calcula o status do orçamento para uma categoria e envia uma mensagem de feedback detalhada,
    editando uma mensagem anterior.
    """
    try:
        # --- 1. Obter o Orçamento da Categoria ---
        today = datetime.now(timezone.utc)
        current_month = today.month
        current_year = today.year

        # Busca o orçamento para a categoria específica no mês/ano corrente
        budget_query = db.collection('budgets').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('month', '==', current_month)).where(filter=FieldFilter('year', '==', current_year)).where(filter=FieldFilter('categoryName', '==', category_name)).limit(1).stream()
        budget_doc = next(budget_query, None)

        # Se não houver orçamento > 0, envia mensagem simples e encerra.
        if not budget_doc or budget_doc.to_dict().get('amount', 0) == 0:
            await message_to_edit.edit_text(f"💸 Gasto de R$ {spent_amount:.2f} na categoria '{category_name}' registrado com sucesso!")
            return

        budget_amount = budget_doc.to_dict().get('amount', 0)

        # --- 2. Calcular o Total Gasto no Mês (INCLUINDO o gasto atual) ---
        start_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        expenses_query = db.collection('transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).where(filter=FieldFilter('category', '==', category_name)).where(filter=FieldFilter('createdAt', '>=', start_of_month)).stream()
        total_spent_month = sum(doc.to_dict().get('amount', 0) for doc in expenses_query)

        # --- 3. Calcular a Meta Diária (ANTES do gasto atual) ---
        remaining_budget_before_this_expense = budget_amount - (total_spent_month - spent_amount)
        total_days_in_month = calendar.monthrange(current_year, current_month)[1]
        days_remaining_including_today = total_days_in_month - today.day + 1
        daily_allowance = remaining_budget_before_this_expense / days_remaining_including_today if days_remaining_including_today > 0 else 0

        # --- 4. Calcular o Total Gasto HOJE (INCLUINDO o gasto atual) ---
        today_start = today.replace(hour=0, minute=0, second=0, microsecond=0)
        today_expenses_query = db.collection('transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'expense')).where(filter=FieldFilter('category', '==', category_name)).where(filter=FieldFilter('createdAt', '>=', today_start)).stream()
        total_spent_today = sum(doc.to_dict().get('amount', 0) for doc in today_expenses_query)

        # --- 5. Montar a Mensagem de Feedback ---
        base_message = f"💸 Gasto de R$ {spent_amount:.2f} na categoria '{category_name}' registrado!\n"
        
        if total_spent_today > daily_allowance:
            # FLUXO 1: Ultrapassou a meta do dia
            overspent_amount = total_spent_today - daily_allowance
            new_remaining_budget = budget_amount - total_spent_month
            new_daily_avg = new_remaining_budget / days_remaining_including_today if days_remaining_including_today > 0 else 0
            new_weekly_avg = new_daily_avg * 7

            feedback_message = (
                f"\n*Resumo de Hoje ({category_name}):*\n"
                f"- Gasto de Hoje: R$ {total_spent_today:.2f}\n"
                f"- Meta do Dia: R$ {daily_allowance:.2f}\n"
                f"- Você ultrapassou a meta em R$ {overspent_amount:.2f}\n\n"
                f"🔴 *Orçamento Recalculado:*\n"
                f"- Saldo Mensal Restante: R$ {new_remaining_budget:.2f}\n"
                f"- Nova Média Diária: R$ {new_daily_avg:.2f}\n"
                f"- Nova Média Semanal: R$ {new_weekly_avg:.2f}"
            )
        else:
            # FLUXO 2: Ainda dentro da meta do dia
            remaining_for_today = daily_allowance - total_spent_today
            remaining_budget_month = budget_amount - total_spent_month
            weekly_avg = (remaining_budget_month / days_remaining_including_today * 7) if days_remaining_including_today > 0 else 0
            
            feedback_message = (
                f"\n*Resumo de Hoje ({category_name}):*\n"
                f"- Gasto de Hoje: R$ {total_spent_today:.2f}\n"
                f"- Meta do Dia: R$ {daily_allowance:.2f}\n"
                f"- Disponível para Hoje: R$ {remaining_for_today:.2f}\n\n"
                f"✅ *Orçamento Atualizado:*\n"
                f"- Saldo Mensal Restante: R$ {remaining_budget_month:.2f}\n"
                f"- Média Semanal Segura: R$ {weekly_avg:.2f}"
            )
            
        await message_to_edit.edit_text(base_message + feedback_message, parse_mode='Markdown')

    except Exception as e:
        print(f"Erro ao enviar feedback de orçamento: {e}")
        # Mensagem de fallback em caso de qualquer erro inesperado nos cálculos
        await message_to_edit.edit_text(f"💸 Gasto de R$ {spent_amount:.2f} na categoria '{category_name}' registrado com sucesso!")
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
# Substitua esta função em: backend/bot.py

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Função principal que recebe todas as mensagens e decide o que fazer."""
    chat_id = update.effective_chat.id
    firebase_uid = await get_firebase_user_id(chat_id)

    # Lógica de registro para novo usuário (sem alterações)
    if not firebase_uid:
        # Se o bot já estiver esperando um e-mail para registro
        if context.user_data.get('state') == 'awaiting_email':
            await register_user(update, context)
            return

        # Mensagem inicial para novos usuários
        await update.message.reply_text(
            "Olá! Bem-vindo ao Oikonomos Bot. Para começar, preciso vincular seu chat do Telegram à sua conta. "
            "Por favor, envie o mesmo e-mail que você usa para acessar o dashboard web."
        )
        context.user_data['state'] = 'awaiting_email'
        return

    text = update.message.text.strip()

    # --- APOLLO AI: triggers textuais e modo ativo ---
    if TRIGGERS_APOLLO.match(text):
        await handle_ai_command(update, context)
        return

    user_doc = db.collection('telegram_users').document(str(chat_id)).get()
    if user_doc.exists and user_doc.to_dict().get('ai_mode', False):
        await handle_apollo_message(update, context, firebase_uid)
        return
    # ------------------------------------------------

    # --- NOVA LÓGICA DE ROTEAMENTO ---
    if text.startswith('*'):
        await process_default_transaction(update, context, text, firebase_uid)
        return
    # --------------------------------

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
            await list_categories(update, context, firebase_uid)
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
    elif command == 'transferir':
        await process_transfer(update, context, parts[1:], firebase_uid)
    else:
        # Assume que é uma despesa como último recurso
        await process_expense(update, context, parts, firebase_uid)

# --- 5b. APOLLO AI — HANDLERS DO TELEGRAM ---

async def handle_ai_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Ativa o modo Apollo para o usuário."""
    chat_id = update.effective_chat.id
    firebase_uid = await get_firebase_user_id(chat_id)
    if not firebase_uid:
        await update.message.reply_text("Vincule sua conta primeiro enviando seu e-mail.")
        return
    db.collection('telegram_users').document(str(chat_id)).update({'ai_mode': True})
    await update.message.reply_text(
        "🤖 Apollo ativo, senhor.\n\n"
        "Pode me falar naturalmente sobre seus gastos, "
        "me enviar um extrato bancário (.ofx ou .csv) para importar, "
        "ou perguntar qualquer coisa sobre suas finanças.\n\n"
        "Para voltar ao modo de comandos, envie /sair"
    )


async def handle_exit_ai(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Desativa o modo Apollo."""
    chat_id = update.effective_chat.id
    db.collection('telegram_users').document(str(chat_id)).update({'ai_mode': False})
    await update.message.reply_text(
        "Modo normal ativado. Use '?' para ver os comandos disponíveis."
    )


async def handle_apollo_message(update: Update, context: ContextTypes.DEFAULT_TYPE, firebase_uid: str):
    """Processa mensagens de texto no modo Apollo."""
    chat_id = update.effective_chat.id
    mensagem = update.message.text.strip()

    user_doc = db.collection('users').document(firebase_uid).get()
    apelido = user_doc.to_dict().get('apelido', 'senhor') if user_doc.exists else 'senhor'

    aguardando = await update.message.reply_text("⏳ Pensando...")

    try:
        historico = carregar_historico(db, firebase_uid, 'telegram')
        agent = ApolloAgent(firebase_uid=firebase_uid, db=db, apelido=apelido)
        resposta, historico_novo = await asyncio.to_thread(agent.chat, mensagem, historico)
        salvar_historico(db, firebase_uid, 'telegram', historico_novo)
        await aguardando.edit_text(resposta)
    except Exception as e:
        print(f"Erro Apollo chat: {e}")
        await aguardando.edit_text("❌ Não consegui processar sua mensagem. Tente novamente.")


async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Recebe arquivos — processa como extrato se estiver no modo Apollo."""
    chat_id = update.effective_chat.id
    firebase_uid = await get_firebase_user_id(chat_id)
    if not firebase_uid:
        return

    user_doc = db.collection('telegram_users').document(str(chat_id)).get()
    ai_mode = user_doc.exists and user_doc.to_dict().get('ai_mode', False)

    if not ai_mode:
        await update.message.reply_text(
            "Envio de arquivos disponível apenas no modo Apollo. "
            "Diga 'Apollo' ou envie /ai para ativá-lo."
        )
        return

    documento = update.message.document
    filename = documento.file_name or "extrato"
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

    if ext not in ('ofx', 'csv', 'pdf'):
        await update.message.reply_text(
            "Formato não suportado, senhor. Envie um arquivo .ofx ou .csv do seu banco."
        )
        return

    aguardando = await update.message.reply_text("⏳ Analisando o extrato...")

    try:
        tg_file = await context.bot.get_file(documento.file_id)
        content = await tg_file.download_as_bytearray()
        content = bytes(content)
        validar_arquivo(filename, content)

        user_meta = db.collection('users').document(firebase_uid).get()
        apelido = user_meta.to_dict().get('apelido', 'senhor') if user_meta.exists else 'senhor'

        agent = ApolloAgent(firebase_uid=firebase_uid, db=db, apelido=apelido)
        resultado = await asyncio.to_thread(agent.processar_extrato, content, filename)

        # Salvar import_session no Firestore
        from datetime import timedelta
        session_ref = db.collection('import_sessions').document()
        session_ref.set({
            'userId': firebase_uid,
            'status': 'pending_review',
            'sourceFile': filename,
            'format': ext,
            'transactions': resultado['transactions'],
            'newCategories': resultado['newCategories'],
            'summary': resultado['summary'],
            'createdAt': firestore.SERVER_TIMESTAMP,
            'expiresAt': datetime.now(timezone.utc) + timedelta(hours=24),
        })
        session_id = session_ref.id

        summary = resultado['summary']
        novas_cats = resultado['newCategories']
        aprovadas = resultado['transactions']
        nao_duplicatas = [t for t in aprovadas if not t.get('isDuplicate')]

        msg_resumo = (
            f"📊 Analisei seu extrato, senhor.\n\n"
            f"• {summary['approved']} transações categorizadas automaticamente\n"
            f"• {summary['pendingReview']} aguardando sua revisão\n"
            f"• {summary['duplicates']} duplicata(s) ignorada(s)\n"
        )
        if novas_cats:
            msg_resumo += f"• Categorias novas sugeridas: {', '.join(novas_cats)}\n"

        # Para volumes pequenos: mostrar resumo inline
        if len(nao_duplicatas) <= 10:
            linhas = []
            for t in nao_duplicatas[:10]:
                icon = '✅' if t.get('status') == 'approved' else '⚠️' if t.get('status') == 'review' else '❓'
                cat_label = t.get('suggestedCategory', '?')
                if t.get('isNewCategory'):
                    cat_label += ' ⭐'
                linhas.append(
                    f"{icon} {t.get('date', '')[-5:].replace('-', '/')} | "
                    f"R$ {t.get('amount', 0):.2f} | {cat_label} | \"{t.get('description', '')[:30]}\""
                )

            msg_resumo += "\n📋 Revisão:\n" + "\n".join(linhas)
            if novas_cats:
                msg_resumo += f"\n\n⭐ Categorias novas a criar: {', '.join(novas_cats)}"

            keyboard = InlineKeyboardMarkup([[
                InlineKeyboardButton("✅ Confirmar tudo", callback_data=f"import_confirm_{session_id}"),
                InlineKeyboardButton("❌ Cancelar", callback_data=f"import_cancel_{session_id}"),
            ]])
            await aguardando.edit_text(msg_resumo, reply_markup=keyboard)
        else:
            msg_resumo += f"\n\nComo são {summary['total']} transações, prefiro que revise no dashboard.\nSession ID: `{session_id}`"
            await aguardando.edit_text(msg_resumo, parse_mode='Markdown')

    except ValueError as e:
        await aguardando.edit_text(f"❌ {e}")
    except Exception as e:
        print(f"Erro ao processar extrato: {e}")
        await aguardando.edit_text("❌ Ocorreu um erro ao processar o extrato. Tente novamente.")


async def handle_import_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Processa confirmação ou cancelamento de importação de extrato."""
    query = update.callback_query
    await query.answer()
    chat_id = update.effective_chat.id
    firebase_uid = await get_firebase_user_id(chat_id)
    if not firebase_uid:
        return

    data = query.data
    partes = data.split('_')
    acao = partes[1]           # 'confirm' ou 'cancel'
    session_id = partes[2]

    session_doc = db.collection('import_sessions').document(session_id).get()
    if not session_doc.exists:
        await query.message.edit_text("❌ Sessão expirada ou não encontrada.")
        return
    session_data = session_doc.to_dict()
    if session_data.get('userId') != firebase_uid:
        await query.answer("Esta operação não pertence a você.", show_alert=True)
        return

    if acao == 'cancel':
        db.collection('import_sessions').document(session_id).update({'status': 'cancelled'})
        await query.message.edit_text("Importação cancelada.")
        return

    # Confirmar
    try:
        # Usar conta padrão
        conta_ref = db.collection('accounts').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('isDefault', '==', True)).limit(1).stream()
        conta_doc = next(conta_ref, None)
        if not conta_doc:
            await query.message.edit_text("❌ Nenhuma conta padrão definida. Configure no dashboard.")
            return

        user_meta = db.collection('users').document(firebase_uid).get()
        apelido = user_meta.to_dict().get('apelido', 'senhor') if user_meta.exists else 'senhor'

        agent = ApolloAgent(firebase_uid=firebase_uid, db=db, apelido=apelido)
        resultado = await asyncio.to_thread(
            agent.confirmar_importacao,
            session_data['transactions'],
            conta_doc.id
        )
        db.collection('import_sessions').document(session_id).update({'status': 'confirmed'})

        msg = f"✅ Importação concluída! {resultado['criadas']} transação(ões) registrada(s)."
        if resultado.get('categorias_novas'):
            msg += f"\nCategorias criadas: {', '.join(resultado['categorias_novas'])}"
        await query.message.edit_text(msg)

    except Exception as e:
        print(f"Erro ao confirmar importação: {e}")
        await query.message.edit_text("❌ Erro ao gravar as transações. Tente novamente.")


# --- 6. SERVIDOR WEB E WEBHOOK ---
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
ptb_app = Application.builder().token(TELEGRAM_TOKEN).build()
ptb_app.add_handler(CommandHandler("ai", handle_ai_command))
ptb_app.add_handler(CommandHandler("sair", handle_exit_ai))
ptb_app.add_handler(MessageHandler(filters.Document.ALL, handle_document))
ptb_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
ptb_app.add_handler(CallbackQueryHandler(handle_import_callback, pattern=r"^import_"))
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

# Substitua esta função em: backend/bot.py

@app.route("/api/monthly-closing", methods=['GET'])
def run_monthly_closing():
    # 1. Proteção: Verifica a senha secreta (sem alterações)
    auth_header = request.headers.get('Authorization')
    cron_secret = os.getenv("CRON_SECRET")
    if auth_header != f'Bearer {cron_secret}':
        return "Unauthorized", 401

    print("Iniciando processo de fecho de mês para todos os usuários...")
    try:
        # --- Lógica de Data Aprimorada ---
        # Esta função é executada no dia 1º de cada mês (ex: 1º de Agosto).
        
        # 'today' será o primeiro dia do mês atual.
        today = datetime.now(timezone.utc)
        
        # Define explicitamente a data de lançamento para o primeiro instante do mês atual.
        # Ex: Se hoje é 1º de Agosto, a transação será registrada em 1º de Agosto, às 12:00:00.
        # É exatamente isso que você pediu!
        closing_transaction_date = today.replace(day=1, hour=12, minute=0, second=0, microsecond=0)
        
        # Agora, calculamos o intervalo do mês ANTERIOR para buscar as transações.
        # Ex: Se hoje é 1º de Agosto, o fim do mês anterior foi 31 de Julho.
        end_of_previous_month = closing_transaction_date - relativedelta(seconds=1)
        # E o início do mês anterior foi 1º de Julho.
        start_of_previous_month = end_of_previous_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # --- Fim da Lógica de Data ---

        all_users = db.collection('telegram_users').stream()
        processed_users = 0

        for user_doc in all_users:
            firebase_uid = user_doc.to_dict().get('firebase_uid')
            if not firebase_uid:
                continue

            print(f"Processando fecho para o usuário: {firebase_uid}")
            
            # Busca as transações do usuário DENTRO do intervalo do mês anterior.
            q = db.collection('transactions').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('createdAt', '>=', start_of_previous_month)).where(filter=FieldFilter('createdAt', '<=', end_of_previous_month))
            transactions_prev_month = list(q.stream())

            if not transactions_prev_month:
                print(f"Nenhuma transação encontrada para o usuário {firebase_uid} no mês anterior. Pulando.")
                continue

            # Calcula o balanço (sem alterações na lógica)
            total_income = sum(doc.to_dict().get('amount', 0) for doc in transactions_prev_month if doc.to_dict().get('type') == 'income')
            total_expense = sum(doc.to_dict().get('amount', 0) for doc in transactions_prev_month if doc.to_dict().get('type') == 'expense')
            balance = total_income - total_expense
            
            # Prepara a nova transação de balanço
            closing_transaction_data = {
                "userId": firebase_uid,
                # AQUI ESTÁ A CONFIRMAÇÃO: A data da transação é o 1º dia do mês ATUAL.
                "createdAt": closing_transaction_date, 
            }
            if balance >= 0:
                closing_transaction_data.update({
                    'type': 'income',
                    'amount': balance,
                    'category': 'saldo anterior',
                    'description': f"Saldo positivo de {end_of_previous_month.strftime('%B de %Y')}"
                })
            else:
                closing_transaction_data.update({
                    'type': 'expense',
                    'amount': abs(balance),
                    'category': 'dívida anterior',
                    'description': f"Saldo negativo de {end_of_previous_month.strftime('%B de %Y')}"
                })

            db.collection('transactions').add(closing_transaction_data)
            print(f"Transação de fecho de R$ {balance:.2f} criada para o usuário {firebase_uid} em {closing_transaction_date.strftime('%Y-%m-%d')}.")
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
    
@app.route("/api/generate-api-key", methods=['POST'])
def generate_api_key():
    """
    Gera uma nova chave de API para um utilizador autenticado.
    O frontend deve enviar o ID Token do Firebase no cabeçalho de autorização.
    """
    try:
        # 1. Obter o token do cabeçalho da requisição
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Cabeçalho de autorização em falta ou mal formatado"}), 401

        id_token = auth_header.split('Bearer ')[1]

        # 2. Verificar o token para obter os dados do utilizador (e o seu UID)
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']

        # 3. Gerar uma chave de API segura
        new_api_key = secrets.token_hex(32)

        # 4. Salvar a chave no documento do utilizador na coleção 'users'
        user_doc_ref = db.collection('users').document(uid)
        user_doc_ref.set({'apiKey': new_api_key}, merge=True)

        # 5. Retornar a nova chave para o frontend
        return jsonify({"apiKey": new_api_key}), 200

    except auth.InvalidIdTokenError:
        return jsonify({"error": "ID Token inválido"}), 403
    except Exception as e:
        print(f"Erro ao gerar chave de API: {e}")
        return jsonify({"error": "Ocorreu um erro interno"}), 500
    
    # --- DECORADOR DE AUTENTICAÇÃO VIA API KEY ---
def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        if not api_key:
            return jsonify({"error": "Chave de API em falta no cabeçalho X-API-Key"}), 401

        # Procura o utilizador que possui esta chave de API
        users_ref = db.collection('users').where(filter=FieldFilter('apiKey', '==', api_key)).limit(1).stream()
        user_doc = next(users_ref, None)

        if not user_doc:
            return jsonify({"error": "Chave de API inválida"}), 403

        # Passa o UID do utilizador para a função da rota
        uid = user_doc.id
        return f(uid, *args, **kwargs)
    return decorated_function

# --- ENDPOINTS DA API PARA O CORVUS ---

@app.route("/api/categories", methods=['GET'])
@require_api_key
def get_categories(uid):
    """
    Devolve as categorias de despesa de um utilizador, validado pela chave de API.
    """
    try:
        cats_ref = db.collection('categories').where(filter=FieldFilter('userId', '==', uid)).where(filter=FieldFilter('type', '==', 'expense')).stream()
        
        # --- CORREÇÃO AQUI ---
        categories = []
        for cat in cats_ref:
            cat_data = cat.to_dict()
            cat_data['id'] = cat.id  # Adiciona o ID do documento aos dados
            categories.append(cat_data)
        # --- FIM DA CORREÇÃO ---

        return jsonify(categories), 200
    except Exception as e:
        print(f"Erro ao buscar categorias via API: {e}")
        return jsonify({"error": "Não foi possível buscar as categorias"}), 500

@app.route("/api/transaction", methods=['POST'])
@require_api_key
def create_transaction(uid):
    """
    Cria uma transação de despesa na conta padrão do utilizador.
    """
    try:
        data = request.get_json()
        if not data or 'amount' not in data or 'category' not in data:
            return jsonify({"error": "Dados em falta. 'amount' e 'category' são obrigatórios."}), 400

        amount = float(data['amount'])
        category = data['category']
        description = data.get('description', 'Transação via Corvus API') # Descrição opcional

        if amount <= 0:
            return jsonify({"error": "O valor da transação deve ser positivo."}), 400

        # 1. Encontrar a conta padrão do utilizador
        accounts_ref = db.collection('accounts').where(filter=FieldFilter('userId', '==', uid)).where(filter=FieldFilter('isDefault', '==', True)).limit(1).stream()
        default_account_doc = next(accounts_ref, None)

        if not default_account_doc:
            # Fallback: se não houver conta padrão, pega a primeira que encontrar
            all_accounts_ref = db.collection('accounts').where(filter=FieldFilter('userId', '==', uid)).limit(1).stream()
            default_account_doc = next(all_accounts_ref, None)
            if not default_account_doc:
                return jsonify({"error": "Nenhuma conta encontrada para este utilizador no Apollo."}), 404
        
        default_account_id = default_account_doc.id

        # 2. Usar um batch para garantir a consistência dos dados
        batch = db.batch()

        # 3. Criar a nova transação
        new_transaction_ref = db.collection("transactions").document()
        batch.set(new_transaction_ref, {
            "userId": uid,
            "type": "expense",
            "amount": amount,
            "category": category,
            "description": description,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "accountId": default_account_id,
        })

        # 4. Atualizar o saldo da conta
        account_doc_ref = db.collection('accounts').document(default_account_id)
        batch.update(account_doc_ref, {'balance': firestore.firestore.Increment(-amount)})
        
        # 5. Executar as operações
        batch.commit()

        return jsonify({"success": True, "message": "Transação criada com sucesso"}), 201

    except Exception as e:
        print(f"Erro ao criar transação via API: {e}")
        return jsonify({"error": "Ocorreu um erro interno ao criar a transação"}), 500

# --- 8. ENDPOINTS APOLLO AI ---

def _verificar_firebase_token(request) -> str:
    """Verifica Firebase ID Token no header Authorization. Retorna firebase_uid ou lança exceção."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        raise PermissionError("Token de autorização ausente ou mal formatado")
    id_token = auth_header.split('Bearer ')[1]
    decoded = auth.verify_id_token(id_token)
    return decoded['uid']


def _get_apelido(uid: str) -> str:
    doc = db.collection('users').document(uid).get()
    return doc.to_dict().get('apelido', 'senhor') if doc.exists else 'senhor'


@app.route("/api/apollo/chat", methods=['POST'])
def apollo_chat():
    try:
        uid = _verificar_firebase_token(request)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 401
    except Exception:
        return jsonify({"error": "Token inválido"}), 403

    data = request.get_json()
    if not data or not data.get('message'):
        return jsonify({"error": "Campo 'message' obrigatório"}), 400

    mensagem = str(data['message'])[:2000]
    channel = data.get('channel', 'web')

    try:
        historico = carregar_historico(db, uid, channel)
        agent = ApolloAgent(firebase_uid=uid, db=db, apelido=_get_apelido(uid))
        resposta, historico_novo = agent.chat(mensagem, historico)
        salvar_historico(db, uid, channel, historico_novo)
        return jsonify({"reply": resposta}), 200
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"Erro apollo/chat: {e}")
        return jsonify({"error": "Erro interno ao processar mensagem"}), 500


@app.route("/api/apollo/import", methods=['POST'])
def apollo_import():
    try:
        uid = _verificar_firebase_token(request)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 401
    except Exception:
        return jsonify({"error": "Token inválido"}), 403

    arquivo = request.files.get('file')
    if not arquivo:
        return jsonify({"error": "Arquivo não enviado. Use multipart/form-data com campo 'file'"}), 400

    try:
        content = arquivo.read()
        filename = arquivo.filename or "extrato"
        validar_arquivo(filename, content)

        banco = request.form.get('banco', 'auto')
        agent = ApolloAgent(firebase_uid=uid, db=db, apelido=_get_apelido(uid))
        resultado = agent.processar_extrato(content, filename, banco=banco)

        from datetime import timedelta
        session_ref = db.collection('import_sessions').document()
        session_ref.set({
            'userId': uid,
            'status': 'pending_review',
            'sourceFile': filename,
            'format': os.path.splitext(filename)[1].lower().lstrip('.'),
            'transactions': resultado['transactions'],
            'newCategories': resultado['newCategories'],
            'summary': resultado['summary'],
            'createdAt': firestore.SERVER_TIMESTAMP,
            'expiresAt': datetime.now(timezone.utc) + timedelta(hours=24),
        })

        return jsonify({
            "sessionId": session_ref.id,
            "status": "pending_review",
            **resultado,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"Erro apollo/import: {e}")
        return jsonify({"error": "Erro interno ao processar extrato"}), 500


@app.route("/api/apollo/import/<session_id>/confirm", methods=['POST'])
def apollo_import_confirm(session_id):
    try:
        uid = _verificar_firebase_token(request)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 401
    except Exception:
        return jsonify({"error": "Token inválido"}), 403

    session_doc = db.collection('import_sessions').document(session_id).get()
    if not session_doc.exists:
        return jsonify({"error": "Sessão não encontrada ou expirada"}), 404
    if session_doc.to_dict().get('userId') != uid:
        return jsonify({"error": "Acesso negado"}), 403

    data = request.get_json() or {}
    transacoes = data.get('transactions', session_doc.to_dict().get('transactions', []))
    conta_id = data.get('accountId', 'default')

    # Resolver conta padrão se não especificada
    if conta_id == 'default':
        conta_ref = db.collection('accounts').where(filter=FieldFilter('userId', '==', uid)).where(filter=FieldFilter('isDefault', '==', True)).limit(1).stream()
        conta_doc = next(conta_ref, None)
        if not conta_doc:
            return jsonify({"error": "Nenhuma conta padrão definida"}), 400
        conta_id = conta_doc.id

    try:
        agent = ApolloAgent(firebase_uid=uid, db=db, apelido=_get_apelido(uid))
        resultado = agent.confirmar_importacao(transacoes, conta_id)
        db.collection('import_sessions').document(session_id).update({'status': 'confirmed'})
        return jsonify({"success": True, **resultado}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"Erro apollo/import/confirm: {e}")
        return jsonify({"error": "Erro interno ao gravar transações"}), 500


@app.route("/api/apollo/import/<session_id>/cancel", methods=['POST'])
def apollo_import_cancel(session_id):
    try:
        uid = _verificar_firebase_token(request)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 401
    except Exception:
        return jsonify({"error": "Token inválido"}), 403

    doc = db.collection('import_sessions').document(session_id).get()
    if not doc.exists:
        return jsonify({"error": "Sessão não encontrada"}), 404
    if doc.to_dict().get('userId') != uid:
        return jsonify({"error": "Acesso negado"}), 403

    db.collection('import_sessions').document(session_id).update({'status': 'cancelled'})
    return jsonify({"success": True}), 200


@app.route("/api/apollo/session/<session_id>", methods=['GET'])
def apollo_session(session_id):
    try:
        uid = _verificar_firebase_token(request)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 401
    except Exception:
        return jsonify({"error": "Token inválido"}), 403

    doc = db.collection('import_sessions').document(session_id).get()
    if not doc.exists:
        return jsonify({"error": "Sessão não encontrada ou expirada"}), 404
    data = doc.to_dict()
    if data.get('userId') != uid:
        return jsonify({"error": "Acesso negado"}), 403

    return jsonify({
        "sessionId": session_id,
        "status": data.get('status'),
        "sourceFile": data.get('sourceFile'),
        "transactions": data.get('transactions', []),
        "newCategories": data.get('newCategories', []),
        "summary": data.get('summary', {}),
    }), 200


# --- 9. EXECUÇÃO LOCAL (Opcional) ---
if __name__ == '__main__':
    print("Iniciando servidor Flask local para desenvolvimento em http://127.0.0.1:8000 ...")
    app.run(debug=True, port=8000)