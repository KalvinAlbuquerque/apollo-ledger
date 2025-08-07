# backend/bot.py

import os
import re
import asyncio
import firebase_admin
from dotenv import load_dotenv
from flask import Flask, request

from firebase_admin import credentials, firestore
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- 1. CONFIGURAÇÃO INICIAL ---

# Carrega as variáveis de ambiente do arquivo .env
# Certifique-se que o arquivo .env está na mesma pasta que este script.
load_dotenv()

# Pega as credenciais do ambiente
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
ADMIN_CHAT_ID = int(os.getenv("TELEGRAM_ADMIN_CHAT_ID"))
FIREBASE_USER_ID = os.getenv("FIREBASE_USER_ID") # UID do seu usuário no Firebase Auth

# Validação para garantir que as variáveis foram carregadas
if not all([TELEGRAM_TOKEN, ADMIN_CHAT_ID, FIREBASE_USER_ID]):
    raise ValueError("Uma ou mais variáveis de ambiente (TELEGRAM_TOKEN, ADMIN_CHAT_ID, FIREBASE_USER_ID) não foram definidas.")

# Inicializa o Firebase Admin SDK
# Certifique-se que o arquivo firebase-credentials.json está na mesma pasta.
cred = credentials.Certificate("firebase-credentials.json")
firebase_admin.initialize_app(cred)
db = firestore.client()


# --- 2. FUNÇÕES DO BOT ---

def is_admin(update: Update) -> bool:
    """Verifica se a mensagem vem do administrador do bot."""
    return update.effective_chat.id == ADMIN_CHAT_ID

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Envia uma mensagem de boas-vindas quando o comando /start é emitido."""
    if not is_admin(update):
        return  # Ignora silenciosamente usuários não autorizados
    
    welcome_message = (
        "Olá! Sou seu bot de finanças, Oikonomos.\n\n"
        "Envie despesas no formato:\n"
        "<valor> <categoria> [descrição opcional]\n\n"
        "Exemplos:\n"
        "55,30 supermercado Compras do mês\n"
        "12 café Padaria"
    )
    await update.message.reply_text(welcome_message)

async def handle_expense(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Processa mensagens de texto para registrar despesas."""
    if not is_admin(update):
        print(f"Acesso negado para o chat ID: {update.effective_chat.id}")
        return

    text = update.message.text
    # Regex melhorado para capturar nomes de categoria com espaços
    match = re.match(r"^\s*(\d+[\.,]?\d*)\s+([\w\sáàâãéèêíïóôõöúçñ]+?)(?:\s+(.+))?$", text)

    if not match:
        await update.message.reply_text("Formato inválido. Use: <valor> <categoria> [descrição]")
        return

    value_str, category_name, description = match.groups()
    
    try:
        # Converte o valor para float, aceitando tanto ponto quanto vírgula
        amount = float(value_str.replace(',', '.'))
        category_name = category_name.strip().lower()
        description = description.strip() if description else None

        # Monta o objeto da despesa
        expense_data = {
            'amount': amount,
            'category': category_name,
            'description': description,
            'createdAt': firestore.SERVER_TIMESTAMP,  # Usa a hora do servidor do Firebase
            'userId': FIREBASE_USER_ID # Associa a despesa ao seu usuário
        }
        
        # Adiciona o novo documento à coleção 'transactions'
        db.collection('transactions').add(expense_data)
        
        await update.message.reply_text(f"✅ Despesa de R$ {amount:.2f} na categoria '{category_name}' registrada!")

    except Exception as e:
        print(f"Erro ao processar despesa ou inserir no Firebase: {e}")
        await update.message.reply_text("❌ Ocorreu um erro ao salvar sua despesa.")


# --- 3. CONFIGURAÇÃO DO SERVIDOR WEB (FLASK) PARA DEPLOY ---

# Inicializa o servidor Flask
app = Flask(__name__)

# Configura a aplicação do bot
ptb_app = Application.builder().token(TELEGRAM_TOKEN).build()
ptb_app.add_handler(CommandHandler("start", start))
ptb_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_expense))


@app.route("/")
def index():
    """Rota simples para verificar se o servidor está no ar."""
    return "Servidor do Oikonomos Bot está online!"

@app.route("/api/bot", methods=['POST'])
def webhook():
    """Esta é a rota que o Telegram chamará. Ela processa as atualizações."""
    try:
        update_data = request.get_json()
        update = Update.de_json(update_data, ptb_app.bot)
        
        # O processamento da atualização é assíncrono, então usamos asyncio.run()
        asyncio.run(ptb_app.process_update(update))

        return {"status": "ok"}, 200
    except Exception as e:
        print(f"Erro no webhook: {e}")
        return {"status": "error"}, 500