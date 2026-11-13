import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Step {
  gif: string;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  {
    gif: '/tutorial/01-enviar-video.gif',
    title: 'Cenas e vídeos',
    text: 'A aula é feita de cenas. Cada cena é um trecho de vídeo: selecione a cena e clique em "Enviar vídeo". A duração é lida do arquivo e a prévia aparece no próprio nó.',
  },
  {
    gif: '/tutorial/02-ligar-cenas.gif',
    title: 'Ligar as cenas',
    text: 'Arraste da bolinha de baixo de uma cena até a bolinha de cima de outra. Uma saída segue direto; duas ou mais saídas viram uma escolha para o aluno. O editor marca sozinho o Início, as escolhas e os Finais.',
  },
  {
    gif: '/tutorial/03-escrever-escolhas.gif',
    title: 'Escrever as escolhas',
    text: 'O texto de cada conexão é o botão que o aluno vê. Dê duplo clique na conexão, escreva e aperte Enter.',
  },
  {
    gif: '/tutorial/04-validar-salvar.gif',
    title: 'Validar e salvar',
    text: 'A aba Validação aponta problemas no grafo. Só é possível salvar quando há pelo menos uma escolha, senão a aula seria um vídeo comum. Depois de salvar, copie o link para os alunos.',
  },
  {
    gif: '/tutorial/05-player-aluno.gif',
    title: 'O que o aluno vê',
    text: 'As escolhas aparecem alguns segundos antes do fim da cena. Se o aluno não escolher a tempo, o vídeo pausa e espera: não existe caminho automático.',
  },
];

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
}

export function TutorialModal({ open, onClose }: TutorialModalProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, STEPS.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const close = () => {
    setIndex(0);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        className="bg-surface border border-border rounded-[20px] shadow-soft w-full max-w-3xl max-h-[calc(100vh-32px)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-primary uppercase tracking-wider">
              Como usar · passo {index + 1} de {STEPS.length}
            </div>
            <h2 id="tutorial-title" className="text-xl font-semibold text-text">
              {step.title}
            </h2>
          </div>
          <button onClick={close} className="text-text-secondary hover:text-text transition-colors" aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <img
            key={step.gif}
            src={step.gif}
            alt={`Demonstração: ${step.title}`}
            className="w-full rounded-lg border border-border bg-bg"
          />
          <p className="text-sm text-text-secondary leading-relaxed">{step.text}</p>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((s, i) => (
              <button
                key={s.gif}
                onClick={() => setIndex(i)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${i === index ? 'bg-copper' : 'bg-border hover:bg-copper/50'}`}
                tabIndex={-1}
              />
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIndex((i) => i - 1)}
              disabled={index === 0}
              className="btn-ghost disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>
            {isLast ? (
              <button onClick={close} className="btn-primary">
                Começar a montar
              </button>
            ) : (
              <button onClick={() => setIndex((i) => i + 1)} className="btn-primary">
                Próximo →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
