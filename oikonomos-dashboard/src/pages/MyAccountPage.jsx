// src/pages/MyAccountPage.jsx
import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebaseClient';
import {
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    getIdToken
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import styles from './MyAccountPage.module.css';

function MyAccountPage() {
    const user = auth.currentUser;

    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [nickname, setNickname] = useState('');
    const [apiKey, setApiKey] = useState(''); // Estado para a chave de API
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');

    useEffect(() => {
        const fetchUserData = async () => {
            if (user) {
                const userDocRef = doc(db, 'users', user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    setNickname(userData.apelido || '');
                    setApiKey(userData.apiKey || ''); // Busca a chave de API existente
                }
            }
        };
        fetchUserData();
    }, [user]);

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        if (!user) return;

        const profileUpdatePromise = updateProfile(user, { displayName });
        const firestoreUpdatePromise = setDoc(doc(db, 'users', user.uid), { apelido: nickname }, { merge: true });

        toast.promise(
            Promise.all([profileUpdatePromise, firestoreUpdatePromise]),
            {
                loading: 'Salvando perfil...',
                success: 'Perfil atualizado com sucesso!',
                error: 'Erro ao salvar o perfil.',
            }
        );
    };
    
    // --- NOVA FUNÇÃO PARA GERAR A CHAVE DE API ---
    const handleGenerateApiKey = async () => {
        if (!user) {
            toast.error("Utilizador não autenticado.");
            return;
        }

        const toastId = toast.loading('Gerando nova chave de API...');
        try {
            const token = await getIdToken(user);
            const response = await fetch('/api/generate-api-key', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha ao gerar a chave.');
            }

            const data = await response.json();
            setApiKey(data.apiKey);
            toast.success('Nova chave de API gerada com sucesso!', { id: toastId });

        } catch (error) {
            console.error("Erro ao gerar chave de API:", error);
            toast.error(error.message, { id: toastId });
        }
    };


    const validatePassword = (password) => {
        if (password.length < 8) return "A senha deve ter no mínimo 8 caracteres.";
        if (!/[A-Z]/.test(password)) return "A senha deve conter uma letra maiúscula.";
        if (!/[a-z]/.test(password)) return "A senha deve conter uma letra minúscula.";
        if (!/[0-9]/.test(password)) return "A senha deve conter um número.";
        if (!/[^A-Za-z0-9]/.test(password)) return "A senha deve conter um caractere especial.";
        return "";
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setPasswordError('');

        if (newPassword !== confirmPassword) {
            setPasswordError("As novas senhas não coincidem.");
            return;
        }

        const validationError = validatePassword(newPassword);
        if (validationError) {
            setPasswordError(validationError);
            return;
        }

        if (!user || !user.email) {
            toast.error("Utilizador ou e-mail não encontrado.");
            return;
        }

        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        const changePasswordPromise = reauthenticateWithCredential(user, credential)
            .then(() => updatePassword(user, newPassword));

        toast.promise(changePasswordPromise, {
            loading: 'Atualizando senha...',
            success: () => {
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                return 'Senha atualizada com sucesso!';
            },
            error: (err) => err.code === 'auth/wrong-password' ? 'A senha atual está incorreta.' : 'Falha ao atualizar a senha.',
        });
    };

    return (
        <div className={styles.page}>
            <h1>Minha Conta</h1>

            <div className={styles.grid}>
                <div className={styles.card}>
                    <h2>Informações do Perfil</h2>
                    <div className={styles.infoRow}>
                        <label>Nome Completo</label>
                        <span>{user?.displayName || 'Não definido'}</span>
                    </div>
                    <div className={styles.infoRow}>
                        <label>Apelido</label>
                        <span>{nickname || 'Não definido'}</span>
                    </div>
                    <div className={styles.infoRow}>
                        <label>Email</label>
                        <span>{user?.email}</span>
                    </div>
                     <div className={styles.infoRow}>
                        <label>UID do Utilizador</label>
                        <span className={styles.uid}>{user?.uid}</span>
                    </div>
                </div>

                <div className={styles.card}>
                    <h2>Editar Perfil</h2>
                    <form onSubmit={handleProfileUpdate}>
                        <div className={styles.formGroup}>
                            <label htmlFor="display-name">Nome Completo</label>
                            <input
                                type="text"
                                id="display-name"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Como você quer ser chamado?"
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="nickname">Apelido</label>
                            <input
                                type="text"
                                id="nickname"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                placeholder="Um nome curto ou apelido"
                            />
                        </div>
                        <button type="submit" className={styles.saveButton}>Salvar Alterações de Perfil</button>
                    </form>
                </div>
                
                {/* --- NOVA SEÇÃO DE INTEGRAÇÕES --- */}
                <div className={`${styles.card} ${styles.fullWidth}`}>
                    <h2>Integrações & API</h2>
                    <div className={styles.formGroup}>
                        <label htmlFor="api-key">Sua Chave de API Corvus</label>
                        <input
                            type="text"
                            id="api-key"
                            value={apiKey || 'Nenhuma chave gerada ainda.'}
                            readOnly
                            onClick={(e) => e.target.select()} // Seleciona o texto ao clicar
                        />
                        <p className={styles.helpText}>
                            Use esta chave para conectar o Corvus à sua conta Apollo. Não a partilhe com ninguém.
                        </p>
                    </div>
                    <button onClick={handleGenerateApiKey} className={styles.saveButton}>
                        {apiKey ? 'Gerar Nova Chave' : 'Gerar Chave de API'}
                    </button>
                </div>


                <div className={`${styles.card} ${styles.fullWidth}`}>
                    <h2>Alterar Senha</h2>
                    <form onSubmit={handlePasswordChange} className={styles.passwordForm}>
                        <div className={styles.formGroup}>
                            <label htmlFor="current-password">Senha Atual</label>
                            <input type="password" id="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="new-password">Nova Senha</label>
                            <input type="password" id="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="confirm-password">Confirmar Nova Senha</label>
                            <input type="password" id="confirm-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                        </div>
                        
                        <div className={styles.passwordValidation}>
                            {passwordError && <p className={styles.errorText}>{passwordError}</p>}
                            <ul className={styles.passwordRules}>
                                <li>Mínimo 8 caracteres</li>
                                <li>Letras maiúsculas e minúsculas</li>
                                <li>Números e caracteres especiais</li>
                            </ul>
                        </div>
                         <button type="submit" className={styles.saveButton}>Salvar Nova Senha</button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default MyAccountPage;