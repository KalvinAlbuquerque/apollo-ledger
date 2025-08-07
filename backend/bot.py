# backend/bot.py

import os
import re
import asyncio
import json # Importante para ler as credenciais do Firebase
import firebase_admin
from dotenv import load_dotenv
from flask import Flask, request

from firebase_admin import credentials, firestore
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- 1. CONFIGURAÇÃO INICIAL ---

# Carrega as variáveis de ambiente (útil para desenvolvimento local)
load_dotenv()

# Pega as credenciais do ambiente
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
ADMIN_CHAT_ID = int(os.getenv("TELEGRAM_ADMIN_CHAT_ID"))
FIREBASE_USER_ID = os.getenv("FIREBASE_USER_ID")

# Validação para garantir que as variáveis foram carregadas
if not all([TELEGRAM_TOKEN, ADMIN_CHAT_ID, FIREBASE_USER_ID]):
    raise ValueError("Uma ou mais variáveis de ambiente (TELEGRAM_TOKEN, ADMIN_CHAT_ID, FIREBASE_USER_ID) não foram definidas.")

# --- INICIALIZAÇÃO CORRETA DO FIREBASE PARA DEPLOY ---
# Pega o CONTEÚDO do JSON da variável de ambiente
firebase_creds_json_str = os.getenv("FIREBASE_CREDENTIALS_JSON")
if not firebase_creds_json_str:
    # Se não encontrar a variável, tenta carregar do arquivo local (para desenvolvimento)
    try:
        cred = credentials.Certificate("firebase-credentials.json")
    except Exception as e:
        raise ValueError("Nem a variável FIREBASE_CREDENTIALS_JSON foi definida, nem o arquivo firebase-credentials.json foi encontrado.") from e
else:
    # Converte a string JSON em um dicionário Python
    firebase_creds_dict = json.loads(firebase_creds_json_str)
    # Inicializa o Firebase com o dicionário de credenciais
    cred = credentials.Certificate(firebase_creds_dict)

# Inicializa o app do Firebase, garantindo que não seja inicializado mais de uma vez
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()
# ---------------------------------------------------


# --- 2. FUNÇÕES DO BOT ---

def is_admin(update: Update) -> bool:
    """Verifica se a mensagem vem do administrador do bot."""
    return update.effective_chat.id == ADMIN_CHAT_ID

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Envia uma mensagem de boas-vindas quando o comando /start é emitido."""
    if not is_admin(update):
        return
    
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
    # Regex para capturar valor, categoria e descrição
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
            'createdAt': firestore.SERVER_TIMESTAMP,
            'userId': FIREBASE_USER_ID
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