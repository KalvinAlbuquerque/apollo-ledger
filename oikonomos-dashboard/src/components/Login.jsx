// src/components/Login.jsx
import React, { useState } from 'react';
import { auth } from '../../firebaseClient';
import { signInWithEmailAndPassword } from 'firebase/auth';
import styles from './Login.module.css'; // <<< Importa o CSS
import toast from 'react-hot-toast'; // <<< Importa o toast para erros

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // O login bem-sucedido é gerenciado pelo App.jsx
    } catch (err) {
      toast.error("E-mail ou senha inválidos.");
      console.error(err);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginBox}>
        <img src="/Logo_arpa_cores_fortes.png" alt="Logo Apollo Ledger" className={styles.logo} />
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
      </div>
    </div>
  );
}

export default Login;