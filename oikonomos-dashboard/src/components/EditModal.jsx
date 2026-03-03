import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebaseClient';
import { Timestamp, collection, doc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import styles from './EditModal.module.css';

function EditModal({ transaction, onSave, onCancel, categories }) {
  const [formData, setFormData] = useState({
    amount: '',
    category: '',
    description: '',
    createdAt: '', // Adicionamos a data ao estado do formulário
  });
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [availableTags, setAvailableTags] = useState([]);
  const user = auth?.currentUser;

  useEffect(() => {
    const fetchTags = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, "tags"), where("userId", "==", user.uid), where("isActive", "==", true));
        const querySnapshot = await getDocs(q);
        const fetchedTags = querySnapshot.docs.map(doc => doc.data().name);
        setAvailableTags(fetchedTags);
      } catch (error) {
        console.error("Erro ao buscar tags:", error);
      }
    };
    fetchTags();
  }, [user]);

  // Função para formatar a data do Firestore para o input (AAAA-MM-DD)
  const formatDateForInput = (timestamp) => {
    if (!timestamp) return '';
    return timestamp.toDate().toISOString().split('T')[0];
  };

  // Preenche o formulário quando o modal abre com uma nova transação
  useEffect(() => {
    if (transaction) {
      setFormData({
        amount: transaction.amount || '',
        category: transaction.category || '',
        description: transaction.description || '',
        createdAt: formatDateForInput(transaction.createdAt),
      });
      setTags(transaction.tags || []);
    }
  }, [transaction]);

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    let finalTags = [...tags];
    const pendingTag = tagInput.trim().toLowerCase().replace(/\s+/g, '');
    if (pendingTag && !finalTags.includes(pendingTag)) {
      finalTags.push(pendingTag);
    }

    // --- CORREÇÃO DE FUSO HORÁRIO ---
    // A string 'T12:00:00Z' define o horário como meio-dia em UTC,
    // garantindo que a data nunca seja "puxada" para o dia anterior pela conversão.
    const correctedDate = new Date(`${formData.createdAt}T12:00:00Z`);

    const updatedData = {
      amount: parseFloat(formData.amount),
      category: formData.category,
      description: formData.description,
      tags: finalTags,
      createdAt: Timestamp.fromDate(correctedDate), // Usa a data corrigida
    };
    onSave(updatedData);
  };

  if (!transaction) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Editar Transação</h2>
        <form onSubmit={handleSubmit}>
          <label>Data:</label>
          <input
            type="date"
            name="createdAt"
            value={formData.createdAt}
            onChange={handleChange}
            required
          />

          <label>Valor (R$):</label>
          <input
            type="number"
            name="amount"
            value={formData.amount}
            onChange={handleChange}
            required
            step="0.01"
          />

          <label>Categoria:</label>
          <select name="category" value={formData.category} onChange={handleChange} required>
            {categories
              .filter(cat => cat.type === transaction.type)
              .map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
          </select>

          <label>Tags:</label>
          <div className={styles.tagsInputContainer}>
            <div className={styles.tagsList}>
              {tags.map((tag, index) => (
                <span key={index} className={styles.tagPill}>
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className={styles.removeTagBtn}>&times;</button>
                </span>
              ))}
            </div>
            <input
              type="text"
              list="edit-tag-suggestions"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="Digite uma tag e aperte Enter ou Espaço"
              autoComplete="off"
            />
            <datalist id="edit-tag-suggestions">
              {availableTags.map((t, idx) => (
                <option key={idx} value={t} />
              ))}
            </datalist>
          </div>

          <label>Descrição:</label>
          <input
            type="text"
            name="description"
            value={formData.description}
            onChange={handleChange}
          />

          <div className={styles.buttonGroup}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>Cancelar</button>
            <button type="submit" className={styles.saveButton}>Salvar Alterações</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditModal;