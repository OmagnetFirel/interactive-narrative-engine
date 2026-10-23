import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api';

export default function AcceptInvitePage() {
  const { token = '' } = useParams();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getInvite(token).then((invite) => setEmail(invite.email)).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Convite inválido');
    });
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.acceptInvite(token, name, password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a conta');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-xl font-semibold mb-2">Aceitar convite</h1>
        {done ? (
          <>
            <p className="text-text-secondary mb-6">Sua conta foi criada.</p>
            <Link to="/login" className="btn-primary inline-block">Entrar</Link>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <p className="text-sm text-text-secondary">{email || 'Validando convite…'}</p>
            <div>
              <label htmlFor="name" className="field-label">Nome</label>
              <input id="name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </div>
            <div>
              <label htmlFor="new-password" className="field-label">Senha</label>
              <input id="new-password" type="password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={submitting || !email}>
              {submitting ? 'Criando…' : 'Criar conta'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
