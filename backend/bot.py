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
async def send_manual(update: Update, context: ContextTypes.DEFAULT_TYPE, firebase_uid: str):
    """Envia uma mensagem de ajuda com todos os comandos disponíveis."""
    manual_text = """
    *Manual de Comandos Oikonomos* 📖

        Aqui estão todos os comandos que eu entendo. Lembre-se que as categorias, origens e metas devem ser cadastradas primeiro no seu dashboard web!

        ---

        *Para registrar um GASTO:*
        Use a palavra-chave `gasto` ou simplesmente comece com o valor.

        `gasto <valor> <categoria> [descrição]`
        _ou_
        `<valor> <categoria> [descrição]`

        *Exemplos:*
        `gasto 55,30 alimentação compras do mês`
        `12 café`

        ---

        *Para registrar uma RENDA:*
        Use as palavras-chave `renda` ou `saldo`.

        `renda <valor> <origem>`
        _ou_
        `saldo <valor> <origem>`

        *Exemplo:*
        `renda 3000 salário`

        ---

        *Para GUARDAR dinheiro em uma META:*
        Use a palavra-chave `guardar`.

        `guardar <valor> <nome da meta>`

        *Exemplo:*
        `guardar 150 viagem de férias`

        ---

        *Para SACAR dinheiro de uma META:*
        Use a palavra-chave `sacar`. O valor sacado será adicionado como uma renda na categoria de renda que você especificar.

        `sacar <valor> <nome da meta> para <categoria de renda>`

        *Exemplo:*
        `sacar 50 fundo de emergencia para outras rendas`

        ---

        *Para ver este manual novamente:*
        Basta enviar `?` a qualquer momento.
    """
    await update.message.reply_text(manual_text.strip(), parse_mode='Markdown')

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
    """Processa e salva uma renda, validando contra categorias do tipo 'income'."""
    try:
        # --- MUDANÇA CRUCIAL: Adicionado filtro por 'type' ---
        categories_ref = db.collection('categories').where(filter=FieldFilter('userId', '==', firebase_uid)).where(filter=FieldFilter('type', '==', 'income')).stream()
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
        
        income_data = { 'type': 'income', 'amount': amount, 'category': correct_source_name, 'description': None, 'createdAt': firestore.SERVER_TIMESTAMP, 'userId': firebase_uid }
        db.collection('transactions').add(income_data)
        await update.message.reply_text(f"💰 Renda de R$ {amount:.2f} da origem '{correct_source_name}' registrada!")

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
        
        
# --- 5. ORQUESTRADOR PRINCIPAL ---
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Função principal que recebe todas as mensagens e decide o que fazer."""
    chat_id = update.effective_chat.id
    
    if context.user_data.get('state') == 'awaiting_email':
        await register_user(update, context)
        return

    firebase_uid = await get_firebase_user_id(chat_id)
    
    if firebase_uid:
        text = update.message.text.strip()
        parts = text.split()
        command = parts[0].lower()

        if command == '?':
            await send_manual(update, context, firebase_uid)
        elif command in ['saldo', 'renda', 'ganhei']:
            await process_income(update, context, parts[1:], firebase_uid)
        elif command == 'gasto':
            await process_expense(update, context, parts[1:], firebase_uid)
        elif command == 'guardar':
            await process_saving(update, context, parts[1:], firebase_uid)
        elif command == 'sacar': # <<< NOVA CONDIÇÃO AQUI
            await process_withdrawal(update, context, parts[1:], firebase_uid)
        else:
            await process_expense(update, context, parts, firebase_uid)
    else:
        context.user_data['state'] = 'awaiting_email'
        await update.message.reply_text(
            "👋 Olá! Bem-vindo(a) ao Oikonomos.\n\n"
            "Parece que é sua primeira vez aqui. Para começar, por favor, envie o **mesmo e-mail** que você usou para se cadastrar no nosso site."
        )

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