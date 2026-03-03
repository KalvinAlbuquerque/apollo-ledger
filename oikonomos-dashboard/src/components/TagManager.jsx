import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../firebaseClient';
import { collection, query, where, orderBy, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { showConfirmationToast } from '../utils/toastUtils.jsx';
import styles from './TagManager.module.css';

function TagManager({ onDataChanged }) {
    const [tags, setTags] = useState([]);
    const [newTagName, setNewTagName] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all', 'active', 'archived'
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const user = auth.currentUser;

    const fetchTags = async () => {
        if (!user) return;
        setLoading(true);
        const q = query(collection(db, "tags"), where("userId", "==", user.uid), orderBy("name"));
        const querySnapshot = await getDocs(q);
        const userTags = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTags(userTags);
        setLoading(false);
    };

    useEffect(() => {
        fetchTags();
    }, [user]);

    const handleAddTag = async (e) => {
        e.preventDefault();
        if (newTagName.trim() === '') return;

        // Converte para minúsculas e remove espaços
        const formattedName = newTagName.trim().toLowerCase().replace(/\s+/g, '');

        if (tags.some(t => t.name === formattedName)) {
            toast.error("Esta tag já existe.");
            return;
        }

        try {
            await addDoc(collection(db, "tags"), {
                name: formattedName,
                userId: user.uid,
                isActive: true,
            });
            setNewTagName('');
            toast.success("Tag adicionada!");
            fetchTags();
            if (onDataChanged) onDataChanged();
        } catch (error) {
            toast.error("Erro ao adicionar tag.");
            console.error("Erro ao adicionar tag:", error);
        }
    };

    const handleDeleteTag = (tagId) => {
        const deleteAction = async () => {
            try {
                await updateDoc(doc(db, "tags", tagId), { isActive: false });
                // Use soft delete by setting isActive to false
                toast.success("Tag arquivada com sucesso!");
                fetchTags();
                if (onDataChanged) onDataChanged();
            } catch (error) {
                console.error("Erro ao arquivar tag:", error);
                toast.error("Falha ao arquivar tag.");
            }
        };
        showConfirmationToast(deleteAction, "Arquivar esta tag?");
    };

    const handleRestoreTag = async (tagId) => {
        try {
            await updateDoc(doc(db, "tags", tagId), { isActive: true });
            toast.success("Tag restaurada com sucesso!");
            fetchTags();
            if (onDataChanged) onDataChanged();
        } catch (error) {
            console.error("Erro ao restaurar tag:", error);
            toast.error("Falha ao restaurar tag.");
        }
    };

    const filteredTags = useMemo(() => {
        return tags
            .filter(tag => {
                if (filterType === 'all') return true;
                if (filterType === 'active') return tag.isActive !== false;
                if (filterType === 'archived') return tag.isActive === false;
                return true;
            })
            .filter(tag => {
                return tag.name.toLowerCase().includes(searchTerm.toLowerCase());
            });
    }, [tags, filterType, searchTerm]);

    if (loading) return <p>Carregando tags...</p>;

    return (
        <div className={styles.container}>
            <h2>Gerenciar Tags</h2>
            <form onSubmit={handleAddTag} className={styles.form}>
                <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Nome da nova tag (ex: viagem)"
                    className={styles.inputName}
                    required
                />
                <button type="submit" className={styles.addButton}>Adicionar</button>
            </form>

            <div className={styles.filterGroup}>
                <input
                    type="text"
                    placeholder="Pesquisar tag..."
                    className={styles.searchInput}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className={styles.filterTabs}>
                    <button onClick={() => setFilterType('all')} className={`${styles.filterButton} ${filterType === 'all' ? styles.activeFilter : ''}`}>
                        Todas
                    </button>
                    <button onClick={() => setFilterType('active')} className={`${styles.filterButton} ${filterType === 'active' ? styles.activeFilter : ''}`}>
                        Ativas
                    </button>
                    <button onClick={() => setFilterType('archived')} className={`${styles.filterButton} ${filterType === 'archived' ? styles.activeFilter : ''}`}>
                        Arquivadas
                    </button>
                </div>
            </div>

            <ul className={styles.tagList}>
                {filteredTags.map(tag => (
                    <li key={tag.id} className={styles.tagItem} style={{ opacity: tag.isActive === false ? 0.6 : 1 }}>
                        <span style={{ textDecoration: tag.isActive === false ? 'line-through' : 'none', color: tag.isActive === false ? 'gray' : 'inherit' }}>
                            #{tag.name} {tag.isActive === false && <span style={{ fontSize: '0.8em', fontStyle: 'italic', marginLeft: '5px' }}>(Arquivada)</span>}
                        </span>
                        <div className={styles.actionButtons}>
                            {tag.isActive === false ? (
                                <button onClick={() => handleRestoreTag(tag.id)} className={styles.editButton} style={{ backgroundColor: '#4CAF50', color: 'white' }}>Restaurar</button>
                            ) : (
                                <button title="Arquivar" onClick={() => handleDeleteTag(tag.id)} className={styles.deleteButton}>&times;</button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default TagManager;
