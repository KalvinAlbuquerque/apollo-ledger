# backend/bot.py

import os
import re
import asyncio
import json
import firebase_admin
from dotenv import load_dotenv
from flask import Flask, request

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

async def handle_expense(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update): return

    text = update.message.text
    match = re.match(r"^\s*(\d+[\.,]?\d*)\s+([\w\sáàâãéèêíïóôõöúçñ]+?)(?:\s+(.+))?$", text)

    if not match:
        await update.message.reply_text("Formato inválido. Use: <valor> <categoria> [descrição]")
        return

    try:
        categories_ref = db.collection('categories').where('userId', '==', FIREBASE_USER_ID).stream()
        valid_categories = [doc.to_dict()['name'] for doc in categories_ref]

        if not valid_categories:
            await update.message.reply_text("Nenhuma categoria cadastrada. Adicione no dashboard web.")
            return

        value_str, category_name, description = match.groups()
        category_name = category_name.strip().lower()

        if category_name not in valid_categories:
            available_cats_text = "\n- ".join(valid_categories)
            error_message = (
                f"❌ Categoria '{category_name}' não encontrada.\n\n"
                f"Categorias disponíveis:\n- {available_cats_text}"
            )
            await update.message.reply_text(error_message)
            return

        amount = float(value_str.replace(',', '.'))
        description = description.strip() if description else None
        expense_data = {
            'amount': amount, 'category': category_name, 'description': description,
            'createdAt': firestore.SERVER_TIMESTAMP, 'userId': FIREBASE_USER_ID
        }
        db.collection('transactions').add(expense_data)
        await update.message.reply_text(f"✅ Despesa de R$ {amount:.2f} na categoria '{category_name}' registrada!")

    except Exception as e:
        print(f"Erro ao processar despesa: {e}")
        await update.message.reply_text("❌ Ocorreu um erro interno.")

# --- 3. CONFIGURAÇÃO DO SERVIDOR WEB (FLASK) PARA DEPLOY ---

app = Flask(__name__)
ptb_app = Application.builder().token(TELEGRAM_TOKEN).build()
ptb_app.add_handler(CommandHandler("start", start))
ptb_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_expense))

@app.route("/")
def index():
    return "Servidor do Oikonomos Bot está online!"

@app.route("/api/bot", methods=['POST'])
def webhook():
    try:
        update_data = request.get_json()
        update = Update.de_json(update_data, ptb_app.bot)
        asyncio.run(ptb_app.process_update(update))
        return {"status": "ok"}, 200
    except Exception as e:
        print(f"Erro no webhook: {e}")
        return {"status": "error"}, 500

# --- 4. BLOCO DE EXECUÇÃO LOCAL ---

if __name__ == '__main__':
    # Este bloco só roda quando você executa o script diretamente (python bot.py)
    # Ele NÃO roda quando a Vercel importa o arquivo.
    # O 'debug=True' ajuda a ver erros e recarrega o servidor automaticamente.
    print("Iniciando servidor Flask local para desenvolvimento em http://127.0.0.1:8000 ...")
    app.run(debug=True, port=8000)