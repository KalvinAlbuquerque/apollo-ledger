import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import styles from './EntityManager.module.css';

function EntityManager() {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const user = auth.currentUser;

  const fetchMappings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'entity_mappings'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.count || 0) - (a.count || 0));
      setMappings(data);
    } catch (err) {
      toast.error('Erro ao carregar mapeamentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMappings(); }, []);

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'entity_mappings', id));
      setMappings(prev => prev.filter(m => m.id !== id));
      toast.success('Mapeamento removido.');
    } catch {
      toast.error('Erro ao remover mapeamento.');
    }
  };

  const handleEdit = (mapping) => {
    setEditingId(mapping.id);
    setEditCategory(mapping.category || '');
  };

  const handleSaveEdit = async (id) => {
    if (!editCategory.trim()) return;
    try {
      await updateDoc(doc(db, 'entity_mappings', id), { category: editCategory.trim() });
      setMappings(prev => prev.map(m => m.id === id ? { ...m, category: editCategory.trim() } : m));
      setEditingId(null);
      toast.success('Categoria atualizada.');
    } catch {
      toast.error('Erro ao salvar.');
    }
  };

  const filtered = mappings.filter(m =>
    !searchTerm || (m.displayName || m.entity || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className={styles.loading}>Carregando mapeamentos...</div>;

  return (
    <div className={styles.container}>
      <h2>Entidades Conhecidas</h2>
      <p className={styles.subtitle}>
        Estabelecimentos e pessoas que o Apollo aprendeu a categorizar automaticamente com base nos seus extratos confirmados. Quanto maior o contador, mais frequente a entidade.
      </p>

      {mappings.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhuma entidade cadastrada ainda.</p>
          <p className={styles.emptyHint}>Importe e confirme um extrato pelo Apollo para começar a construir seu histórico de entidades.</p>
        </div>
      ) : (
        <>
          <input
            className={styles.search}
            type="text"
            placeholder="Buscar entidade..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Entidade</th>
                  <th>Categoria</th>
                  <th>Tags</th>
                  <th>Usos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id}>
                    <td className={styles.entityCell}>
                      <span className={styles.displayName}>{m.displayName || m.entity}</span>
                      {m.displayName && <span className={styles.entityNorm}>{m.entity}</span>}
                    </td>
                    <td>
                      {editingId === m.id ? (
                        <div className={styles.editRow}>
                          <input
                            className={styles.editInput}
                            value={editCategory}
                            onChange={e => setEditCategory(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit(m.id)}
                            autoFocus
                          />
                          <button className={styles.saveBtn} onClick={() => handleSaveEdit(m.id)}>✓</button>
                          <button className={styles.cancelBtn} onClick={() => setEditingId(null)}>✕</button>
                        </div>
                      ) : (
                        <span className={styles.category}>{m.category || '—'}</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.tags}>
                        {(m.tags || []).length > 0
                          ? m.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)
                          : <span className={styles.noTags}>—</span>}
                      </div>
                    </td>
                    <td className={styles.count}>{m.count || 1}</td>
                    <td className={styles.actions}>
                      {editingId !== m.id && (
                        <button className={styles.editBtn} onClick={() => handleEdit(m)} title="Editar categoria">✎</button>
                      )}
                      <button className={styles.deleteBtn} onClick={() => handleDelete(m.id)} title="Remover">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default EntityManager;
