import { Timestamp } from 'firebase/firestore';

/**
 * Normaliza um texto, convertendo para minúsculas e removendo acentos.
 * Ex: "Alimentação" -> "alimentacao"
 * @param {string} str O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
const normalizeString = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize("NFD") // Separa os acentos das letras (ex: 'é' vira 'e' + '´')
        .replace(/[\u0300-\u036f]/g, ""); // Remove os acentos
};

/**
 * Processa um texto CSV, valida as transações e as prepara para o Firestore.
 * @param {string} csvText - O conteúdo do ficheiro CSV.
 * @param {string} userId - O UID do utilizador atual.
 * @param {Array} userCategories - Array de objetos de categorias do utilizador.
 * @param {Array} userAccounts - Array de objetos de contas do utilizador.
 * @returns {Promise<{validTransactions: Array, errors: Array}>}
 */
export async function parseCSVAndValidate(csvText, userId, userCategories, userAccounts) {
    const validTransactions = [];
    const errors = [];

    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length <= 1) {
        return { validTransactions, errors: [{ line: 1, message: "Ficheiro CSV vazio ou contém apenas o cabeçalho." }] };
    }
    
    const headers = lines[0].split(',').map(h => normalizeString(h.trim()));
    
    // Mapeia nomes normalizados para os dados originais para validação flexível
    const categoryMap = new Map(userCategories.map(cat => [
        normalizeString(cat.name), 
        { originalName: cat.name, type: cat.type }
    ]));
    const accountMap = new Map(userAccounts.map(acc => [
        normalizeString(acc.accountName), 
        { id: acc.id, originalName: acc.accountName }
    ]));

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = headers.reduce((obj, header, index) => {
            obj[header] = values[index] ? values[index].trim() : '';
            return obj;
        }, {});

        const lineNumber = i + 1;

        // --- Validações com Normalização ---
        const date = new Date(row.data);
        if (isNaN(date.getTime())) {
            errors.push({ line: lineNumber, message: `Data inválida: '${row.data}'. Use o formato AAAA-MM-DD.` });
            continue;
        }

        const type = normalizeString(row.tipo);
        if (type !== 'renda' && type !== 'despesa') {
            errors.push({ line: lineNumber, message: `Tipo inválido: '${row.tipo}'. Use 'renda' ou 'despesa'.` });
            continue;
        }

        const amount = parseFloat(row.valor.replace(',', '.')); // Aceita ponto e vírgula como decimal
        if (isNaN(amount) || amount <= 0) {
            errors.push({ line: lineNumber, message: `Valor inválido ou zero: '${row.valor}'` });
            continue;
        }

        const categoryNameNormalized = normalizeString(row.categoria);
        const categoryData = categoryMap.get(categoryNameNormalized);
        if (!categoryData || categoryData.type !== (type === 'renda' ? 'income' : 'expense')) {
            errors.push({ line: lineNumber, message: `Categoria '${row.categoria}' não encontrada ou o tipo é incompatível.` });
            continue;
        }

        const accountNameNormalized = normalizeString(row.conta);
        const accountData = accountMap.get(accountNameNormalized);
        if (!accountData) {
            errors.push({ line: lineNumber, message: `Conta '${row.conta}' não encontrada.` });
            continue;
        }

        // Se tudo estiver OK, prepara o objeto com os nomes ORIGINAIS
        validTransactions.push({
            accountId: accountData.id,
            data: {
                userId: userId,
                amount: amount,
                category: categoryData.originalName, // Usa o nome original
                accountId: accountData.id,
                description: row.descricao || '',
                type: type === 'renda' ? 'income' : 'expense',
                createdAt: Timestamp.fromDate(date),
            }
        });
    }

    return { validTransactions, errors };
}