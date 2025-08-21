// oikonomos-dashboard/src/utils/exportUtils.js
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Função para exportar os dados para CSV
export const exportToCSV = (transactions, summary, accounts) => {
  // Garante que 'accounts' seja um array para evitar erros
  const validAccounts = Array.isArray(accounts) ? accounts : [];
  const accountMap = new Map(validAccounts.map(acc => [acc.id, acc.accountName]));
  const headers = ['Data', 'Categoria', 'Descrição', 'Conta', 'Valor (R$)'];
  const rows = transactions.map(tx => [
    `"${tx.createdAt ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : '-'}"`,
    `"${tx.category}"`,
    `"${tx.description || '-'}"`,
    `"${accountMap.get(tx.accountId) || tx.accountId}"`,
    `"${tx.type === 'income' ? '+' : '-'} ${tx.amount.toFixed(2)}"`
  ]);

  const summaryRows = [
    [],
    ['', '', '', '"Total de Rendas:"', `"${summary.totalIncome.toFixed(2)}"`],
    ['', '', '', '"Total de Despesas:"', `"${summary.totalExpense.toFixed(2)}"`],
    ['', '', '', '"Saldo:"', `"${summary.balance.toFixed(2)}"`]
  ];

  let csvContent = "data:text/csv;charset=utf-8,"
    + headers.join(",") + "\n"
    + rows.map(e => e.join(",")).join("\n")
    + "\n"
    + summaryRows.map(e => e.join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "balanco_financeiro.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Função para exportar os dados para PDF
export const exportToPDF = (transactions, summary, accounts) => {
  // Garante que 'accounts' seja um array para evitar erros
  const validAccounts = Array.isArray(accounts) ? accounts : [];
  const accountMap = new Map(validAccounts.map(acc => [acc.id, acc.accountName]));
  const doc = new jsPDF();
  const tableColumn = ['Data', 'Categoria', 'Descrição', 'Conta', 'Valor (R$)'];
  const tableRows = [];

  transactions.forEach(tx => {
    const transactionData = [
      tx.createdAt ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : '-',
      tx.category,
      tx.description || '-',
      accountMap.get(tx.accountId) || tx.accountId,
      `${tx.type === 'income' ? '+' : '-'} ${tx.amount.toFixed(2)}`
    ];
    tableRows.push(transactionData);
  });

  doc.text('Balanço Geral Financeiro', 14, 15);
  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: 20,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
  });

  const finalY = doc.lastAutoTable.finalY || 30;
  doc.setFontSize(12);
  doc.text('Resumo do Período', 14, finalY + 15);
  doc.setFontSize(10);
  doc.text(`Total de Rendas: R$ ${summary.totalIncome.toFixed(2)}`, 14, finalY + 22);
  doc.text(`Total de Despesas: R$ ${summary.totalExpense.toFixed(2)}`, 14, finalY + 27);
  doc.setFont('helvetica', 'bold');
  doc.text(`Saldo Final: R$ ${summary.balance.toFixed(2)}`, 14, finalY + 32);

  doc.save('balanco_financeiro.pdf');
};