// src/App.jsx
import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseClient'; // Ajuste o caminho se necessário
import { onAuthStateChanged } from 'firebase/auth';
import { Toaster } from 'react-hot-toast';

import Login from './components/Login';
import Dashboard from './components/Dashboard'; // Importe o novo componente

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div>Carregando Oikonomos...</div>;
  }

  return (
    <div className="App">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#333',
            color: '#fff',
          },
        }}
      />
      {user ? <Dashboard user={user} /> : <Login />}
    </div>
  );
}

export default App;