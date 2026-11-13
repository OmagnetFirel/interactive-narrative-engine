import type { GraphNode } from '../core/types';
import { state } from '../core/state';
import { dom } from './dom-elements';

export function showEndOverlay(node: GraphNode): void {
    const data = node.data as { endMessage?: string; description?: string };

    dom.endIcon.textContent = '🏁';
    dom.endTitle.textContent = 'Fim da aula';
    dom.endMessage.textContent = data.endMessage || 'Obrigado por assistir!';

    dom.endOverlay.classList.remove('hidden');
}

export function hideEnd(): void {
    dom.endOverlay.classList.add('hidden');
}

/** Vídeo pausado esperando o aluno: mostra o título e para a barra de tempo. */
export function showWaitingForChoice(): void {
    dom.choicesTitle.textContent = 'Escolha uma opção para continuar';
    dom.choicesTitle.classList.add('visible');
    dom.timeoutBar.classList.add('hidden');
}

export function hideChoices(): void {
    dom.choicesOverlay.classList.add('hidden');
    dom.choicesButtons.innerHTML = '';
    dom.timeoutBar.classList.add('hidden');
    dom.choicesTitle.classList.remove('visible');
    state.choicesShown = false;

    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
    }
}
