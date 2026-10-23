import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AuthUser } from '../services/api';
import { clearStoredToken, setStoredToken } from './tokenStorage';

interface AuthContextValue {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: AuthUser | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<AuthUser | null>(null);
    const navigate = useNavigate();

    const logout = useCallback(async () => {
        await api.logout().catch(() => undefined);
        clearStoredToken();
        setIsAuthenticated(false);
        setUser(null);
        navigate('/login', { replace: true });
    }, [navigate]);

    useEffect(() => {
        api.setUnauthorizedHandler(() => {
            clearStoredToken();
            setIsAuthenticated(false);
            setUser(null);
            navigate('/login', { replace: true });
        });
    }, [navigate]);

    useEffect(() => {
        let cancelled = false;

        const verify = async () => {
            try {
                const refreshedUser = await api.refresh();
                if (!cancelled && refreshedUser) {
                    setUser(refreshedUser);
                    setIsAuthenticated(true);
                }
            } catch {
                clearStoredToken();
                if (!cancelled) setIsAuthenticated(false);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        void verify();
        return () => {
            cancelled = true;
        };
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const { accessToken, user: loggedUser } = await api.login(email, password);
        setStoredToken(accessToken);
        setUser(loggedUser);
        setIsAuthenticated(true);
    }, []);

    const value = useMemo(
        () => ({ isAuthenticated, isLoading, user, login, logout }),
        [isAuthenticated, isLoading, user, login, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Contexto e hook permanecem juntos para manter a API de autenticação coesa.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
