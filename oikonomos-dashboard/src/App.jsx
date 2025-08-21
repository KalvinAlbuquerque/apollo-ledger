// src/App.jsx (Versão com Rotas)
import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ForecastPage from './pages/ForecastPage';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ReportsPage from './pages/ReportsPage'

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
    return <div style={{ color: 'white', textAlign: 'center', paddingTop: '50px' }}>Carregando Oikonomos...</div>;
  }

  return (
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{ style: { background: '#333', color: '#fff' } }}
      />
      <Routes>
        <Route path="/" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} /> : <Navigate to="/" />} />
        <Route path="/reports" element={user ? <ReportsPage /> : <Navigate to="/" />} />
        <Route path="/forecast" element={user ? <ForecastPage /> : <Navigate to="/" />} /> 
        {/* Adicione esta linha */}      
      </Routes>
    </Router>
  );
}

export default App;