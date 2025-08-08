# backend/bot.py

import os
import re
import asyncio
import json
import firebase_admin
import unicodedata
import calendar
from dotenv import load_dotenv
from flask import Flask, request
from datetime import datetime
from firebase_admin import credentials, firestore
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- 1. CONFIGURAÇÃO INICIAL ---

load_dotenv()
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
ADMIN_CHAT_ID = int(os.getenv("TELEGRAM_ADMIN_CHAT_ID"))
FIREBASE_USER_ID = os.getenv("FIREBASE_USER_ID")

if not all([TELEGRAM_TOKEN, ADMIN_CHAT_ID, FIREBASE_USER_ID]):
    raise ValueError("Variáveis de ambiente não definidas.")

firebase_creds_json_str = os.getenv("FIREBASE_CREDENTIALS_JSON")
if not firebase_creds_json_str:
    try:
        cred = credentials.Certificate("firebase-credentials.json")
    except Exception as e:
        raise ValueError("Credenciais do Firebase não encontradas.") from e
else:
    firebase_creds_dict = json.loads(firebase_creds_json_str)
    cred = credentials.Certificate(firebase_creds_dict)

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()

# --- 2. FUNÇÕES DO BOT ---

def is_admin(update: Update) -> bool:
    return update.effective_chat.id == ADMIN_CHAT_ID

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update): return
    welcome_message = (
        "Olá! Sou seu bot de finanças, Oikonomos.\n\n"
        "Envie despesas no formato:\n"
        "<valor> <categoria> [descrição opcional]"
    )
    await update.message.reply_text(welcome_message)

async def process_expense(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list):
    """Processa e salva uma despesa, e retorna o status detalhado do orçamento."""
    try:
        # --- Parte 1: Validação da Categoria (continua igual) ---
        categories_ref = db.collection('categories').where('userId', '==', FIREBASE_USER_ID).where('type', '==', 'expense').stream()
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
        
        # --- Parte 2: Salvar a Transação (continua igual) ---
        expense_data = { 'type': 'expense', 'amount': amount, 'category': correct_category_name, 'description': description, 'createdAt': firestore.SERVER_TIMESTAMP, 'userId': FIREBASE_USER_ID }
        db.collection('transactions').add(expense_data)
        
        base_reply = f"💸 Gasto de R$ {amount:.2f} na categoria '{correct_category_name}' registrado!"
        
        # --- Parte 3: LÓGICA DE FEEDBACK DO ORÇAMENTO ATUALIZADA ---
        today = datetime.now()
        current_month = today.month
        current_year = today.year

        budget_query = db.collection('budgets').where('userId', '==', FIREBASE_USER_ID).where('categoryName', '==', correct_category_name).where('month', '==', current_month).where('year', '==', current_year).limit(1).stream()
        budget_doc = next(budget_query, None)
        
        if budget_doc:
            budget_amount = budget_doc.to_dict().get('amount', 0)
            if budget_amount > 0:
                start_of_month = datetime(current_year, current_month, 1)
                expenses_query = db.collection('transactions').where('userId', '==', FIREBASE_USER_ID).where('type', '==', 'expense').where('category', '==', correct_category_name).where('createdAt', '>=', start_of_month).stream()
                total_spent_this_month = sum(doc.to_dict().get('amount', 0) for doc in expenses_query)
                remaining_budget = budget_amount - total_spent_this_month
                
                budget_feedback = ""
                if remaining_budget >= 0:
                    budget_feedback += f"\n\nSaldo do orçamento: R$ {remaining_budget:.2f}"
                    
                    # <<< LÓGICA NOVA DE GASTO DIÁRIO/SEMANAL >>>
                    total_days_in_month = calendar.monthrange(current_year, current_month)[1]
                    days_remaining = total_days_in_month - today.day + 1
                    
                    if days_remaining > 0:
                        daily_allowance = remaining_budget / days_remaining
                        weekly_allowance = daily_allowance * 7
                        budget_feedback += f"\n- Média diária segura: R$ {daily_allowance:.2f}"
                        budget_feedback += f"\n- Média semanal segura: R$ {weekly_allowance:.2f}"

                else: # Se o orçamento já estourou
                    budget_feedback += f"\n\n🔴 Orçamento estourado em R$ {abs(remaining_budget):.2f}!"

                base_reply += budget_feedback

        await update.message.reply_text(base_reply)

    except Exception as e:
        print(f"Erro ao processar despesa: {e}")
        await update.message.reply_text("❌ Ocorreu um erro interno ao processar o gasto.")

async def process_income(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list):
    """Processa e salva uma renda, validando contra categorias do tipo 'income'."""
    try:
        # --- MUDANÇA CRUCIAL: Adicionado filtro por 'type' ---
        categories_ref = db.collection('categories').where('userId', '==', FIREBASE_USER_ID).where('type', '==', 'income').stream()

        original_categories = [doc.to_dict()['name'] for doc in categories_ref]
        valid_categories_normalized = [normalize_text(name) for name in original_categories]

        if not original_categories:
            await update.message.reply_text("Você não tem nenhuma categoria de RENDA cadastrada.")
            return
            
        if len(text_parts) < 2:
            await update.message.reply_text("Formato de renda inválido. Use: <saldo/renda> <valor> <origem>")
            return
            
        value_str = text_parts[0]
        source_input = " ".join(text_parts[1:]).strip()
        source_normalized = normalize_text(source_input)

        if source_normalized not in valid_categories_normalized:
            available_cats_text = "\n- ".join(original_categories)
            error_message = f"❌ Origem de RENDA '{source_input}' não encontrada.\n\nCategorias de renda disponíveis:\n- {available_cats_text}"
            await update.message.reply_text(error_message)
            return

        match_index = valid_categories_normalized.index(source_normalized)
        correct_source_name = original_categories[match_index]

        amount = float(value_str.replace(',', '.'))
        
        income_data = { 'type': 'income', 'amount': amount, 'category': correct_source_name, 'description': None, 'createdAt': firestore.SERVER_TIMESTAMP, 'userId': FIREBASE_USER_ID }
        db.collection('transactions').add(income_data)
        await update.message.reply_text(f"💰 Renda de R$ {amount:.2f} da origem '{correct_source_name}' registrada!")

    except ValueError:
        await update.message.reply_text(f"Valor inválido: '{value_str}'. O valor deve ser um número.")
    except Exception as e:
        print(f"Erro ao processar renda: {e}")
        await update.message.reply_text("❌ Ocorreu um erro interno ao processar a renda.")
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Função principal que recebe todas as mensagens e decide o que fazer."""
    if not is_admin(update): return

    text = update.message.text.strip()
    parts = text.split()
    command = parts[0].lower()

    if command in ['saldo', 'renda', 'ganhei']:
        # Se for uma renda, chama a função de renda
        await process_income(update, context, parts[1:])
    elif command == 'gasto':
        # Se for um gasto explícito, chama a função de gasto
        await process_expense(update, context, parts[1:])
    else:
        # Se não tiver comando, assume que é um gasto (comportamento antigo)
        await process_expense(update, context, parts)

def normalize_text(text: str) -> str:
    """Remove acentos e converte para minúsculas."""
    text = unicodedata.normalize('NFD', text)
    text = text.encode('ascii', 'ignore')
    text = text.decode("utf-8")
    return text.lower()

# --- 3. CONFIGURAÇÃO DO SERVIDOR WEB (FLASK) PARA DEPLOY ---

app = Flask(__name__)
ptb_app = Application.builder().token(TELEGRAM_TOKEN).build()
ptb_app.add_handler(CommandHandler("start", start))
ptb_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

@app.route("/")
def index():
    return "Servidor do Oikonomos Bot está online!"

@app.route("/api/bot", methods=['POST'])
def webhook():
    """Processa webhooks do Telegram com o ciclo de vida completo."""

    # Cria uma função interna assíncrona para lidar com o ciclo de vida
    async def handle_update():
        # Deserializa os dados da requisição para um objeto Update
        update = Update.de_json(request.get_json(), ptb_app.bot)
        
        # 1. LIGA o bot
        await ptb_app.initialize()
        # 2. PROCESSA a mensagem
        await ptb_app.process_update(update)
        # 3. DESLIGA o bot
        await ptb_app.shutdown()

    try:
        # Executa a função assíncrona completa
        asyncio.run(handle_update())
        return "ok", 200
    except Exception as e:
        # Captura qualquer erro que aconteça no processo
        print(f"Erro no webhook: {e}")
        return "error", 500

# --- 4. BLOCO DE EXECUÇÃO LOCAL ---

if __name__ == '__main__':
    # Este bloco só roda quando você executa o script diretamente (python bot.py)
    # Ele NÃO roda quando a Vercel importa o arquivo.
    # O 'debug=True' ajuda a ver erros e recarrega o servidor automaticamente.
    print("Iniciando servidor Flask local para desenvolvimento em http://127.0.0.1:8000 ...")
    app.run(debug=True, port=8000)