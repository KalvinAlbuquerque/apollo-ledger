// src/App.jsx
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebaseClient'; // <-- 1. IMPORTE O 'db'
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore'; // <-- 2. IMPORTE AS FUNÇÕES DO FIRESTORE
import { Toaster } from 'react-hot-toast';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';

// ... (resto das importações)
import MyAccountPage from './pages/MyAccountPage';
import MainLayout from './components/MainLayout';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ReportsPage from './pages/ReportsPage';
import ForecastPage from './pages/ForecastPage';
import ManagementPage from './pages/ManagementPage';
import HelpPage from './pages/HelpPage';

const ProtectedLayout = () => (
  <MainLayout>
    <Outlet />
  </MainLayout>
);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null); // <-- 3. CRIE UM ESTADO PARA O PERFIL

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => { // <-- 4. ADICIONE 'async'
      if (currentUser) {
        setUser(currentUser);
        // Busca os dados do perfil no Firestore
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUserProfile(userDocSnap.data()); // Salva o perfil completo no estado
        }
      } else {
        setUser(null);
        setUserProfile(null); // Limpa o perfil ao fazer logout
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div style={{ color: 'white', textAlign: 'center', paddingTop: '50px' }}>Carregando Apollo...</div>;
  }

  return (
    <Router>
      <Toaster position="top-right" toastOptions={{ style: { background: '#333', color: '#fff' } }} />
      <Routes>
        <Route path="/" element={!user ? <Login /> : <Navigate to="/dashboard" />} />

        {user && (
          <Route element={<ProtectedLayout />}>
            {/* 5. PASSE O PERFIL E O USUÁRIO PARA O DASHBOARD */}
            <Route path="/dashboard" element={<Dashboard user={user} userProfile={userProfile} />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route path="/management" element={<ManagementPage user={user} />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/my-account" element={<MyAccountPage />} />
          </Route>
        )}

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;