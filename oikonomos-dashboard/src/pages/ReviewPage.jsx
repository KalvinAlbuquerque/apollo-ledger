import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseClient';
import toast from 'react-hot-toast';
import styles from './ReviewPage.module.css';

const STATUS_LABEL = {
  approved: { label: 'Auto', color: '#39FF14' },
  review:   { label: 'Revisar', color: '#f5a623' },
  pending:  { label: 'Baixa confiança', color: '#ff6b6b' },
  rejected: { label: 'Duplicata', color: '#555' },
};

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 85 ? '#39FF14' : pct >= 50 ? '#f5a623' : '#ff6b6b';
  return (
    <div className={styles.confBar}>
      <div className={styles.confFill} style={{ width: `${pct}%`, background: color }} />
      <span className={styles.confLabel}>{pct}%</span>
    </div>
  );
}

export default function ReviewPage({ user }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);

  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [filter, setFilter] = useState('all');

  // per-transaction state: checked & edited category
  const [checked, setChecked] = useState({});
  const [categories, setCategories] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        const token = await user.getIdToken();

        const [sessionRes, accountsSnap] = await Promise.all([
          fetch(`/api/apollo/session/${sessionId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          getDocs(query(collection(db, 'accounts'), where('userId', '==', user.uid))),
        ]);

        const sessionData = await sessionRes.json();
        if (!sessionRes.ok) {
          setError(sessionData.error || 'Sessão não encontrada ou expirada.');
          return;
        }

        const accs = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAccounts(accs);
        const defaultAcc = accs.find(a => a.isDefault) || accs[0];
        if (defaultAcc) setSelectedAccount(defaultAcc.id);

        setSession(sessionData);

        const initChecked = {};
        const initCats = {};
        for (const t of sessionData.transactions || []) {
          initChecked[t.tempId] = !t.isDuplicate;
          initCats[t.tempId] = t.suggestedCategory || '';
        }
        setChecked(initChecked);
        setCategories(initCats);
      } catch (e) {
        setError('Erro ao carregar sessão. Tente novamente.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionId, user]);

  const visibleTransactions = (session?.transactions || []).filter(t => {
    if (filter === 'review') return !t.isDuplicate && t.status !== 'approved';
    if (filter === 'approved') return t.status === 'approved';
    if (filter === 'duplicates') return t.isDuplicate;
    return true;
  });

  const checkedCount = Object.values(checked).filter(Boolean).length;

  const handleConfirm = async () => {
    if (!selectedAccount) {
      toast.error('Selecione uma conta para importar as transações.');
      return;
    }
    if (checkedCount === 0) {
      toast.error('Selecione ao menos uma transação para importar.');
      return;
    }

    setConfirming(true);
    try {
      const token = await user.getIdToken();
      const toImport = (session.transactions || [])
        .filter(t => checked[t.tempId])
        .map(t => ({
          ...t,
          suggestedCategory: categories[t.tempId] || t.suggestedCategory || 'Outros',
          status: 'approved',
        }));

      const res = await fetch(`/api/apollo/import/${sessionId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accountId: selectedAccount, transactions: toImport }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Erro ao confirmar importação.');
        return;
      }

      toast.success(
        `${data.criadas} transações importadas com sucesso!` +
        (data.categorias_novas?.length ? ` ${data.categorias_novas.length} categorias criadas.` : '')
      );
      navigate('/dashboard');
    } catch {
      toast.error('Erro de conexão. Tente novamente.');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.centered}>
        <div className={styles.spinner} />
        <p>Carregando extrato...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centered}>
        <p className={styles.errorMsg}>{error}</p>
        <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>
          Voltar ao Dashboard
        </button>
      </div>
    );
  }

  const { summary, sourceFile } = session;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Revisão de Importação</h1>
          <span className={styles.filename}>📄 {sourceFile}</span>
        </div>
        <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>
          ← Voltar
        </button>
      </div>

      {/* Summary */}
      <div className={styles.summaryCards}>
        <div className={styles.card}>
          <span className={styles.cardValue}>{summary.total}</span>
          <span className={styles.cardLabel}>Total</span>
        </div>
        <div className={`${styles.card} ${styles.cardGreen}`}>
          <span className={styles.cardValue}>{summary.approved}</span>
          <span className={styles.cardLabel}>Aprovadas</span>
        </div>
        <div className={`${styles.card} ${styles.cardOrange}`}>
          <span className={styles.cardValue}>{summary.pendingReview}</span>
          <span className={styles.cardLabel}>Para revisar</span>
        </div>
        <div className={`${styles.card} ${styles.cardGray}`}>
          <span className={styles.cardValue}>{summary.duplicates}</span>
          <span className={styles.cardLabel}>Duplicatas</span>
        </div>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.filterGroup}>
          {[
            { key: 'all', label: 'Todas' },
            { key: 'review', label: 'Para revisar' },
            { key: 'approved', label: 'Aprovadas' },
            { key: 'duplicates', label: 'Duplicatas' },
          ].map(f => (
            <button
              key={f.key}
              className={`${styles.filterBtn} ${filter === f.key ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className={styles.accountSelect}>
          <label className={styles.accountLabel}>Importar para:</label>
          <select
            className={styles.select}
            value={selectedAccount}
            onChange={e => setSelectedAccount(e.target.value)}
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.accountName} {a.isDefault ? '(padrão)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCheck}>
                <input
                  type="checkbox"
                  checked={visibleTransactions.every(t => checked[t.tempId])}
                  onChange={e => {
                    const next = { ...checked };
                    visibleTransactions.forEach(t => { next[t.tempId] = e.target.checked; });
                    setChecked(next);
                  }}
                />
              </th>
              <th>Data</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Tipo</th>
              <th>Categoria</th>
              <th>Confiança</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleTransactions.map(t => {
              const isChecked = !!checked[t.tempId];
              const st = STATUS_LABEL[t.status] || STATUS_LABEL.pending;
              return (
                <tr
                  key={t.tempId}
                  className={`${t.isDuplicate ? styles.rowDuplicate : ''} ${!isChecked ? styles.rowUnchecked : ''}`}
                >
                  <td className={styles.tdCheck}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={t.isDuplicate}
                      onChange={e => setChecked(prev => ({ ...prev, [t.tempId]: e.target.checked }))}
                    />
                  </td>
                  <td className={styles.tdDate}>{t.date}</td>
                  <td className={styles.tdDesc} title={t.description}>{t.description}</td>
                  <td className={t.type === 'income' ? styles.tdIncome : styles.tdExpense}>
                    {t.type === 'expense' ? '−' : '+'}
                    {' R$ '}
                    {(t.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span className={`${styles.typeBadge} ${t.type === 'income' ? styles.badgeIncome : styles.badgeExpense}`}>
                      {t.type === 'income' ? 'Renda' : 'Despesa'}
                    </span>
                  </td>
                  <td className={styles.tdCat}>
                    <input
                      className={styles.catInput}
                      value={categories[t.tempId] || ''}
                      onChange={e => setCategories(prev => ({ ...prev, [t.tempId]: e.target.value }))}
                      disabled={t.isDuplicate || !isChecked}
                      placeholder="Categoria"
                    />
                    {t.isNewCategory && (
                      <span className={styles.newCatBadge} title="Nova categoria será criada">✦ nova</span>
                    )}
                  </td>
                  <td>
                    {t.isDuplicate ? '—' : <ConfidenceBar value={t.confidence} />}
                  </td>
                  <td>
                    <span className={styles.statusBadge} style={{ color: st.color, borderColor: st.color }}>
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleTransactions.length === 0 && (
          <p className={styles.emptyState}>Nenhuma transação neste filtro.</p>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.selectedCount}>
          {checkedCount} de {(session.transactions || []).filter(t => !t.isDuplicate).length} transações selecionadas
        </span>
        <button
          className={styles.confirmBtn}
          onClick={handleConfirm}
          disabled={confirming || checkedCount === 0}
        >
          {confirming ? 'Importando...' : `Confirmar importação (${checkedCount})`}
        </button>
      </div>
    </div>
  );
}
