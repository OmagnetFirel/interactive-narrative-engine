import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
    const { isAuthenticated, isLoading, login } = useAuth();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

    if (!isLoading && isAuthenticated) {
        return <Navigate to={from} replace />;
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await login(email, password);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao entrar');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-bg text-text flex items-center justify-center px-4">
            <div className="card w-full max-w-md p-8">
                <div className="flex items-center gap-3 mb-6">
                    <span className="h-10 w-10 rounded-lg bg-copper shrink-0" />
                    <div>
                        <h1 className="text-xl font-semibold">Editor INE</h1>
                        <p className="text-sm text-text-secondary">Entre na sua conta</p>
                    </div>
                </div>

                <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="field-label">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="field-input"
                            placeholder="voce@exemplo.com"
                            autoComplete="email"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="field-label">
                            Senha
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="field-input"
                            placeholder="Digite sua senha"
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    {error && <p className="text-sm text-danger">{error}</p>}

                    <button type="submit" disabled={submitting} className="btn-primary w-full">
                        {submitting ? 'Entrando…' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
