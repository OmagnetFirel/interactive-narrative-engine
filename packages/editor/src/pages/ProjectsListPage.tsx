import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InteractiveGraph } from '@ine/shared';
import { api } from '../services/api';
import { useAuth } from '../auth/AuthContext';

type LoadState = 'loading' | 'ready' | 'error';

function visibilityLabel(v: InteractiveGraph['visibility']): string {
  return v === 'public' ? 'Público' : 'Privado';
}

function visibilityClass(v: InteractiveGraph['visibility']): string {
  return v === 'public'
    ? 'bg-copper/10 text-primary border-copper/30'
    : 'bg-bg text-text-secondary border-border';
}

export default function ProjectsListPage() {
  const { logout, user } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [projects, setProjects] = useState<InteractiveGraph[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteError, setInviteError] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    setErrorMessage(null);
    try {
      const list = await api.getProjectsList();
      setProjects(list);
      setState('ready');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Falha ao carregar projetos');
      setState('error');
    }
  }, []);

  useEffect(() => {
    // A carga é disparada uma vez por alteração da função memoizada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="chrome border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 h-[72px] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-lg bg-copper shrink-0" />
            <div>
              <h1 className="text-lg font-semibold text-text">Projetos</h1>
              <p className="text-sm text-text-secondary">
                Escolha um projeto para editar ou crie um novo.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void logout()} className="btn-secondary">
              Sair
            </button>
            <Link to="/editor" className="btn-primary">
              + Novo projeto
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {user?.role === 'admin' && (
          <form
            className="card p-4 mb-6 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setInviteError('');
              void api.createInvite(inviteEmail)
                .then((invite) => setInviteUrl(invite.url))
                .catch((e: unknown) => setInviteError(e instanceof Error ? e.message : 'Falha ao criar convite'));
            }}
          >
            <div className="flex-1 min-w-52">
              <label htmlFor="invite-email" className="field-label">Convidar usuário</label>
              <input id="invite-email" type="email" className="field-input" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="usuario@exemplo.com" required />
            </div>
            <button type="submit" className="btn-secondary">Gerar convite</button>
            {inviteUrl && <input className="field-input w-full font-mono text-xs" value={inviteUrl} readOnly onFocus={(e) => e.currentTarget.select()} />}
            {inviteError && <p className="text-sm text-danger w-full">{inviteError}</p>}
          </form>
        )}
        {state === 'loading' && (
          <p className="text-sm text-text-secondary animate-pulse">Carregando projetos…</p>
        )}

        {state === 'error' && (
          <div className="card border-danger/30 p-6">
            <p className="text-danger font-medium mb-4">{errorMessage}</p>
            <button type="button" onClick={() => void load()} className="btn-secondary">
              Tentar novamente
            </button>
          </div>
        )}

        {state === 'ready' && projects.length === 0 && (
          <div className="card p-10 text-center">
            <p className="text-text">Nenhum projeto na API ainda.</p>
            <p className="text-sm text-text-secondary mt-2">
              Crie narrativas no editor e use &quot;Salvar&quot; para aparecerem aqui.
            </p>
            <Link
              to="/editor"
              className="inline-block mt-6 text-sm font-medium text-primary hover:text-secondary transition-colors"
            >
              Abrir editor vazio →
            </Link>
          </div>
        )}

        {state === 'ready' && projects.length > 0 && (
          <ul className="space-y-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/editor/${encodeURIComponent(p.id)}`}
                  className="card card-interactive block p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-text">{p.name}</h2>
                      <p className="text-xs text-text-secondary font-mono mt-1 break-all">{p.id}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span
                        className={`badge border ${visibilityClass(p.visibility)}`}
                      >
                        {visibilityLabel(p.visibility)}
                      </span>
                      <span className="badge">
                        {p.nodes?.length ?? 0} nós · {p.edges?.length ?? 0} conexões
                      </span>
                    </div>
                  </div>
                  {p.metadata?.updatedAt && (
                    <p className="text-xs text-text-secondary/70 mt-2">
                      Atualizado em{' '}
                      {new Date(p.metadata.updatedAt).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
