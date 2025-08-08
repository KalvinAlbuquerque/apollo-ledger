// src/components/Login.jsx
import React, { useState } from 'react';
import { auth } from '../../firebaseClient'; // Ajuste o caminho se necessário
import { signInWithEmailAndPassword } from 'firebase/auth';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // O login bem-sucedido será gerenciado pelo App.jsx
    } catch (err) {
      setError("Falha no login. Verifique seu e-mail e senha.");
      console.error(err);
    }
  };

  return (
    <div>
      <h2>Login - Oikonomos</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          required
        />
        <button type="submit">Entrar</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}

export default Login;