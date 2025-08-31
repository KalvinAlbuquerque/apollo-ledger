import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebaseClient';
import {
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import styles from './MyAccountPage.module.css';

function MyAccountPage() {
    const user = auth.currentUser;

    // Estados para os campos do formulário
    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [nickname, setNickname] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');

    // Efeito para buscar o apelido do Firestore quando a página carrega
    useEffect(() => {
        const fetchNickname = async () => {
            if (user) {
                const userDocRef = doc(db, 'users', user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    setNickname(userDocSnap.data().apelido || '');
                }
            }
        };
        fetchNickname();
    }, [user]);

    // Função para salvar as alterações do perfil (Nome e Apelido)
    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        if (!user) return;

        // Promessa para atualizar o nome no Firebase Auth
        const profileUpdatePromise = updateProfile(user, { displayName });

        // Promessa para salvar/atualizar o apelido no Firestore
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

    // Função para validar a força da nova senha
    const validatePassword = (password) => {
        if (password.length < 8) return "A senha deve ter no mínimo 8 caracteres.";
        if (!/[A-Z]/.test(password)) return "A senha deve conter uma letra maiúscula.";
        if (!/[a-z]/.test(password)) return "A senha deve conter uma letra minúscula.";
        if (!/[0-9]/.test(password)) return "A senha deve conter um número.";
        if (!/[^A-Za-z0-9]/.test(password)) return "A senha deve conter um caractere especial.";
        return "";
    };

    // Função para lidar com a alteração de senha
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
            toast.error("Usuário ou e-mail não encontrado.");
            return;
        }

        const credential = EmailAuthProvider.credential(user.email, currentPassword);

        // O Firebase exige reautenticação para alterar a senha
        const changePasswordPromise = reauthenticateWithCredential(user, credential)
            .then(() => {
                return updatePassword(user, newPassword);
            });

        toast.promise(changePasswordPromise, {
            loading: 'Atualizando senha...',
            success: () => {
                // Limpa os campos após o sucesso
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                return 'Senha atualizada com sucesso!';
            },
            error: (err) => {
                if (err.code === 'auth/wrong-password') {
                    return 'A senha atual está incorreta.';
                }
                return 'Falha ao atualizar a senha.';
            },
        });
    };

    return (
        <div className={styles.page}>
            <h1>Minha Conta</h1>

            <div className={styles.grid}>
                {/* Card de Informações do Usuário */}
                <div className={styles.card}>
                    <h2>Informações do Perfil</h2>
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
                        <div className={styles.formGroup}>
                            <label>Email</label>
                            <input type="email" value={user?.email || ''} disabled />
                        </div>
                        <button type="submit" className={styles.saveButton}>Salvar Alterações</button>
                    </form>
                </div>

                {/* Card de Alteração de Senha */}
                <div className={styles.card}>
                    <h2>Alterar Senha</h2>
                    <form onSubmit={handlePasswordChange}>
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

                        {passwordError && <p className={styles.errorText}>{passwordError}</p>}
                        
                        <ul className={styles.passwordRules}>
                            <li>Mínimo 8 caracteres</li>
                            <li>Letras maiúsculas e minúsculas</li>
                            <li>Números e caracteres especiais</li>
                        </ul>
                        
                        <button type="submit" className={styles.saveButton}>Salvar Nova Senha</button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default MyAccountPage;