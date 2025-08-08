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

async def process_expense(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list):
    """Processa e salva uma despesa."""
    try:
        # Busca categorias válidas (lógica que já tínhamos)
        categories_ref = db.collection('categories').where('userId', '==', FIREBASE_USER_ID).stream()
        valid_categories = [doc.to_dict()['name'] for doc in categories_ref]

        if not valid_categories:
            await update.message.reply_text("Cadastre categorias no dashboard web primeiro.")
            return

        # Monta a string para o regex a partir das partes do texto
        expense_text = " ".join(text_parts)
        match = re.match(r"^\s*(\d+[\.,]?\d*)\s+([\w\sáàâãéèêíïóôõöúçñ]+?)(?:\s+(.+))?$", expense_text)

        if not match:
            await update.message.reply_text("Formato de gasto inválido. Use: [gasto] <valor> <categoria> [descrição]")
            return

        value_str, category_name, description = match.groups()
        category_name = category_name.strip().lower()

        if category_name not in valid_categories:
            available_cats_text = "\n- ".join(valid_categories)
            error_message = f"❌ Categoria de gasto '{category_name}' não encontrada.\n\nCategorias disponíveis:\n- {available_cats_text}"
            await update.message.reply_text(error_message)
            return

        amount = float(value_str.replace(',', '.'))
        description = description.strip() if description else None
        
        expense_data = {
            'type': 'expense', # <<< NOVO CAMPO!
            'amount': amount,
            'category': category_name,
            'description': description,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'userId': FIREBASE_USER_ID
        }
        db.collection('transactions').add(expense_data)
        await update.message.reply_text(f"💸 Gasto de R$ {amount:.2f} na categoria '{category_name}' registrado!")

    except Exception as e:
        print(f"Erro ao processar despesa: {e}")
        await update.message.reply_text("❌ Ocorreu um erro interno ao processar o gasto.")

async def process_income(update: Update, context: ContextTypes.DEFAULT_TYPE, text_parts: list):
    """Processa e salva uma renda, validando sua origem contra a lista de categorias."""
    try:
        # <<< 1. BUSCA AS CATEGORIAS VÁLIDAS (MESMA LÓGICA DO GASTO)
        categories_ref = db.collection('categories').where('userId', '==', FIREBASE_USER_ID).stream()
        valid_categories = [doc.to_dict()['name'] for doc in categories_ref]

        if not valid_categories:
            await update.message.reply_text("Você ainda não cadastrou nenhuma categoria. Adicione categorias no dashboard web primeiro.")
            return
            
        if len(text_parts) < 2:
            await update.message.reply_text("Formato de renda inválido. Use: <saldo/renda> <valor> <origem>")
            return
            
        value_str = text_parts[0]
        source = " ".join(text_parts[1:]).strip().lower() # Pega a origem e já formata

        # <<< 2. VALIDA SE A ORIGEM EXISTE NA LISTA DE CATEGORIAS
        if source not in valid_categories:
            available_cats_text = "\n- ".join(valid_categories)
            error_message = (
                f"❌ Origem de renda '{source}' não encontrada.\n\n"
                f"As origens devem ser uma de suas categorias cadastradas:\n- {available_cats_text}"
            )
            await update.message.reply_text(error_message)
            return

        # <<< 3. SE FOR VÁLIDO, PROSSEGUE NORMALMENTE
        amount = float(value_str.replace(',', '.'))
        
        income_data = {
            'type': 'income',
            'amount': amount,
            'category': source, # Salva a origem (que é uma categoria válida)
            'description': None,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'userId': FIREBASE_USER_ID
        }
        db.collection('transactions').add(income_data)
        await update.message.reply_text(f"💰 Renda de R$ {amount:.2f} da origem '{source}' registrada!")

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