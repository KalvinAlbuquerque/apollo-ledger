import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebaseClient';
import { signOut } from 'firebase/auth';
import { collection, query, where, orderBy, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore'; 

// Componentes filhos
import ExpenseChart from './ExpenseChart';
import EditModal from './EditModal';

// Estilos
import styles from './Dashboard.module.css';

function Dashboard({ user }) {
  // Estados para os dados
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);

  // Estados para controlar o modal de edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);

  // Função principal para buscar todos os dados do Firestore
  const fetchData = async () => {
    if (!user) return;
    
    // Não reinicia o loading em re-fetches, apenas na carga inicial
    // setLoading(true); 

    try {
      // Busca transações
      const transQuery = query(collection(db, "transactions"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
      const transSnapshot = await getDocs(transQuery);
      const transData = transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(transData);
      processDataForChart(transData); // Processa os dados para o gráfico

      // Busca categorias (necessário para o <select> no modal de edição)
      const catQuery = query(collection(db, "categories"), where("userId", "==", user.uid));
      const catSnapshot = await getDocs(catQuery);
      const catData = catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(catData);

    } catch (error) {
      console.error("Erro ao buscar dados:", error);
      alert("Falha ao buscar dados do servidor.");
    } finally {
      setLoading(false);
    }
  };

  // Executa a busca de dados quando o componente é montado
  useEffect(() => {
    fetchData();
  }, [user]);

  // Função para processar os dados para o formato do Chart.js
  const processDataForChart = (transactions) => {
    const categoryTotals = {};
    transactions.forEach(tx => {
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
    });
    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);
    setChartData({
      labels: labels,
      datasets: [{
        label: 'Gastos R$',
        data: data,
        backgroundColor: [ '#4A90E2', '#50E3C2', '#B8E986', '#9013FE', '#F5A623', '#BD10E0', '#7ED321' ],
        borderColor: 'var(--cinza-elemento)',
        borderWidth: 2,
      }],
    });
  };

  // Funções de Ação
  const handleLogout = () => signOut(auth);

  const handleDelete = async (transactionId) => {
    if (!window.confirm("Tem certeza que deseja excluir esta transação? A ação não pode ser desfeita.")) {
      return;
    }
    try {
      const transactionDocRef = doc(db, "transactions", transactionId);
      await deleteDoc(transactionDocRef);
      fetchData(); // Re-busca os dados para atualizar a tela
    } catch (error) {
      console.error("Erro ao excluir transação:", error);
      alert("Ocorreu um erro ao excluir a transação.");
    }
  };

  const handleOpenEditModal = (transaction) => {
    setEditingTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTransaction(null);
  };

  const handleSaveTransaction = async (updatedData) => {
    if (!editingTransaction) return;
    try {
      const transactionDocRef = doc(db, "transactions", editingTransaction.id);
      await updateDoc(transactionDocRef, updatedData);
      handleCloseModal();
      fetchData(); // Re-busca os dados para atualizar a tela
    } catch (error) {
      console.error("Erro ao atualizar transação:", error);
      alert("Falha ao salvar as alterações.");
    }
  };

  if (loading) return <div>Carregando suas finanças...</div>;

  // Renderização do Componente
  return (
    <>
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div>
            <h1>Dashboard Oikonomos</h1>
            <p>Olá, {user.email}</p>
          </div>
          <button onClick={handleLogout} className={styles.logoutButton}>Sair</button>
        </header>

        <main className={styles.mainContent}>
          <div className={styles.chartContainer}>
            {chartData && transactions.length > 0 ? (
                <ExpenseChart chartData={chartData} />
            ) : <p>Sem dados para exibir o gráfico.</p>}
          </div>

          <div className={styles.transactionsContainer}>
            <h2>Suas Transações</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Categoria</th>
                  <th>Descrição</th>
                  <th>Valor (R$)</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length > 0 ? (
                  transactions.map(tx => (
                    <tr key={tx.id}>
                      <td>{tx.createdAt ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : '-'}</td>
                      <td>{tx.category}</td>
                      <td>{tx.description || '-'}</td>
                      <td>{tx.amount.toFixed(2)}</td>
                      <td>
                        <button onClick={() => handleOpenEditModal(tx)} className={styles.editButton}>
                          Editar
                        </button>
                        <button onClick={() => handleDelete(tx.id)} className={styles.deleteButton}>
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5">Nenhuma transação encontrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {isModalOpen && (
        <EditModal 
          transaction={editingTransaction}
          onSave={handleSaveTransaction}
          onCancel={handleCloseModal}
          categories={categories}
        />
      )}
    </>
  );
}

export default Dashboard;