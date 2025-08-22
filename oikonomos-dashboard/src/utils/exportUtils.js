import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Função para exportar os dados para CSV
export const exportToCSV = (transactions, summary, accounts) => {
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

  let csvContent = "data:text/csv;charset=utf-8,"
    + headers.join(",") + "\n"
    + rows.map(e => e.join(",")).join("\n") + "\n";

  // --- Resumo de Despesas por Categoria (ORDENADO) ---
  const expenseSummaryHeader = ['\n"Resumo de Despesas por Categoria"\n"Categoria","Total (R$)"'];
  const expenseDataSorted = summary.expenseChartData.labels
    .map((label, index) => ({
      label,
      amount: summary.expenseChartData.datasets[0].data[index]
    }))
    .sort((a, b) => b.amount - a.amount); // Ordena do maior para o menor
  
  const expenseSummaryRows = expenseDataSorted.map(item => 
    `"${item.label}","${item.amount.toFixed(2)}"`
  );
  csvContent += expenseSummaryHeader.join("\n") + "\n" + expenseSummaryRows.join("\n") + "\n";
  
  // --- Resumo de Rendas por Categoria (ORDENADO) ---
  const incomeSummaryHeader = ['\n"Resumo de Rendas por Categoria"\n"Categoria","Total (R$)"'];
  const incomeDataSorted = summary.incomeChartData.labels
    .map((label, index) => ({
      label,
      amount: summary.incomeChartData.datasets[0].data[index]
    }))
    .sort((a, b) => b.amount - a.amount); // Ordena do maior para o menor
    
  const incomeSummaryRows = incomeDataSorted.map(item => 
    `"${item.label}","${item.amount.toFixed(2)}"`
  );
  csvContent += incomeSummaryHeader.join("\n") + "\n" + incomeSummaryRows.join("\n") + "\n";

  // Resumo final
  const finalSummaryRows = [
    [],
    ['', '', '', '"Total de Rendas:"', `"${summary.totalIncome.toFixed(2)}"`],
    ['', '', '', '"Total de Despesas:"', `"${summary.totalExpense.toFixed(2)}"`],
    ['', '', '', '"Saldo:"', `"${summary.balance.toFixed(2)}"`]
  ];
  csvContent += finalSummaryRows.map(e => e.join(",")).join("\n");

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
  const validAccounts = Array.isArray(accounts) ? accounts : [];
  const accountMap = new Map(validAccounts.map(acc => [acc.id, acc.accountName]));
  const doc = new jsPDF();
  
  // Tabela principal de transações
  const tableColumn = ['Data', 'Categoria', 'Descrição', 'Conta', 'Valor (R$)'];
  const tableRows = transactions.map(tx => [
    tx.createdAt ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : '-',
    tx.category,
    tx.description || '-',
    accountMap.get(tx.accountId) || tx.accountId,
    `${tx.type === 'income' ? '+' : '-'} ${tx.amount.toFixed(2)}`
  ]);

  doc.text('Balanço Geral Financeiro', 14, 15);
  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: 20,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
  });

  let finalY = doc.lastAutoTable.finalY || 30;

  // --- Tabela de Despesas por Categoria (ORDENADA) ---
  const expenseSummaryBody = summary.expenseChartData.labels
    .map((label, index) => ({
      label,
      amount: summary.expenseChartData.datasets[0].data[index]
    }))
    .sort((a, b) => b.amount - a.amount)
    .map(item => [item.label, `R$ ${item.amount.toFixed(2)}`]);

  doc.text('Resumo de Despesas por Categoria', 14, finalY + 15);
  doc.autoTable({
      head: [['Categoria', 'Total Gasto']],
      body: expenseSummaryBody,
      startY: finalY + 20,
      theme: 'grid'
  });
  finalY = doc.lastAutoTable.finalY;

  // --- Tabela de Rendas por Categoria (ORDENADA) ---
  const incomeSummaryBody = summary.incomeChartData.labels
    .map((label, index) => ({
      label,
      amount: summary.incomeChartData.datasets[0].data[index]
    }))
    .sort((a, b) => b.amount - a.amount)
    .map(item => [item.label, `R$ ${item.amount.toFixed(2)}`]);
    
  doc.text('Resumo de Rendas por Categoria', 14, finalY + 15);
  doc.autoTable({
      head: [['Categoria', 'Total Recebido']],
      body: incomeSummaryBody,
      startY: finalY + 20,
      theme: 'grid'
  });
  finalY = doc.lastAutoTable.finalY;

  // Resumo final
  doc.setFontSize(12);
  doc.text('Resumo do Período', 14, finalY + 15);
  doc.setFontSize(10);
  doc.text(`Total de Rendas: R$ ${summary.totalIncome.toFixed(2)}`, 14, finalY + 22);
  doc.text(`Total de Despesas: R$ ${summary.totalExpense.toFixed(2)}`, 14, finalY + 27);
  doc.setFont('helvetica', 'bold');
  doc.text(`Saldo Final: R$ ${summary.balance.toFixed(2)}`, 14, finalY + 32);

  doc.save('balanco_financeiro.pdf');
};