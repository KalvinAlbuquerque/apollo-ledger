// src/App.jsx (Versão Final com Layout)
import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';

// Layout
import MainLayout from './components/MainLayout';

// Páginas
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ReportsPage from './pages/ReportsPage';
import ForecastPage from './pages/ForecastPage';
import ManagementPage from './pages/ManagementPage';
import HelpPage from './pages/HelpPage'; // Importe a nova página

// Componente para rotas protegidas
const ProtectedLayout = () => (
  <MainLayout>
    <Outlet /> {/* Renderiza a rota filha (Dashboard, Reports, etc.) */}
  </MainLayout>
);

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
      <Toaster position="top-right" toastOptions={{ style: { background: '#333', color: '#fff' } }} />
      <Routes>
        <Route path="/" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        
        {/* Rotas que usam o MainLayout */}
        {user && (
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<Dashboard user={user} />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route path="/management" element={<ManagementPage user={user} />} />
            <Route path="/help" element={<HelpPage />} />
          </Route>
        )}

        {/* Rota de fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;