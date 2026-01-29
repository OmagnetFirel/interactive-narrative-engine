import type { GraphNode } from '../core/types';
import { state } from '../core/state';
import { dom } from './dom-elements';

export function showEndOverlay(node: GraphNode): void {
    const data = node.data as any;
    const endingType = data.endingType || 'neutral';

    const icons: Record<string, string> = {
        good: '🎉',
        bad: '😢',
        neutral: '🏁'
    };

    dom.endIcon.textContent = icons[endingType];
    dom.endTitle.textContent = data.label || 'Fim da História';
    dom.endMessage.textContent = data.description || data.message || 'Obrigado por jogar!';

    dom.endOverlay.classList.remove('hidden');
}

export function hideEnd(): void {
    dom.endOverlay.classList.add('hidden');
}

export function hideChoices(): void {
    dom.choicesOverlay.classList.add('hidden');
    dom.choicesButtons.innerHTML = '';
    dom.timeoutBar.classList.add('hidden');

    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
    }
}
