import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './ApolloChat.module.css';

export default function ApolloChat({ user, apelido }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'apollo',
      text: `À disposição, ${apelido || 'senhor'}. Como posso ajudá-lo hoje?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const getToken = useCallback(() => user.getIdToken(), [user]);

  const addMessage = (role, text, extra = {}) =>
    setMessages(prev => [...prev, { role, text, ...extra }]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    addMessage('user', trimmed);
    setInput('');
    setIsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/apollo/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: trimmed, channel: 'web' }),
      });
      const data = await res.json();
      addMessage('apollo', data.reply || 'Não consegui processar sua mensagem. Tente novamente.');
    } catch {
      addMessage('apollo', 'Erro de conexão. Verifique sua rede e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    addMessage('user', `📎 ${file.name}`);
    setIsLoading(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/apollo/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.error) {
        addMessage('apollo', `Erro ao processar extrato: ${data.error}`);
      } else {
        const { summary, sessionId } = data;
        addMessage(
          'apollo',
          `Extrato processado.\n\n` +
          `📊 ${summary.total} transações encontradas\n` +
          `✅ ${summary.approved} aprovadas automaticamente\n` +
          `🔍 ${summary.pendingReview} aguardando revisão\n` +
          `⏭️ ${summary.duplicates} duplicatas ignoradas\n\n` +
          `Acesse a página de revisão para confirmar a importação.`,
          { reviewSessionId: sessionId }
        );
      }
    } catch {
      addMessage('apollo', 'Erro ao processar extrato. Tente novamente.');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {isOpen && (
        <div className={styles.chatWindow}>
          <div className={styles.header}>
            <div className={styles.headerInfo}>
              <div className={styles.avatar}>A</div>
              <div className={styles.headerText}>
                <span className={styles.name}>Apollo</span>
                <span className={styles.subtitle}>assistente financeiro</span>
              </div>
            </div>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)} title="Fechar">
              ✕
            </button>
          </div>

          <div className={styles.messages}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.apolloBubble}`}
              >
                <span className={styles.bubbleText}>{msg.text}</span>
                {msg.reviewSessionId && (
                  <button
                    className={styles.reviewBtn}
                    onClick={() => {
                      setIsOpen(false);
                      navigate(`/review/${msg.reviewSessionId}`);
                    }}
                  >
                    Revisar importação →
                  </button>
                )}
              </div>
            ))}
            {isLoading && (
              <div className={`${styles.bubble} ${styles.apolloBubble}`}>
                <span className={styles.typing}>
                  <span /><span /><span />
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.inputArea}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".ofx,.csv,.pdf"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
            <button
              className={styles.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
              title="Enviar extrato bancário (.ofx, .csv, .pdf)"
              disabled={isLoading}
            >
              📎
            </button>
            <input
              className={styles.textInput}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte ao Apollo..."
              disabled={isLoading}
            />
            <button
              className={styles.sendBtn}
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              title="Enviar"
            >
              ➤
            </button>
          </div>
        </div>
      )}

      <button
        className={`${styles.floatBtn} ${isOpen ? styles.floatBtnOpen : ''}`}
        onClick={() => setIsOpen(o => !o)}
        title="Apollo — assistente financeiro"
      >
        {isOpen ? '✕' : 'A'}
      </button>
    </>
  );
}
