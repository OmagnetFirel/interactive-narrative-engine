import { dom } from '../ui/dom-elements';

export const transitionService = {
    /**
     * ✅ Fade out do vídeo
     */
    async fadeOut(duration: number = 400): Promise<void> {
        return new Promise(resolve => {
            dom.video.classList.add('fading-out');
            setTimeout(() => {
                dom.video.classList.remove('fading-out');
                resolve();
            }, duration);
        });
    },

    /**
     * ✅ Fade in do vídeo
     */
    fadeIn() {
        dom.video.classList.add('fading-in');
        setTimeout(() => {
            dom.video.classList.remove('fading-in');
        }, 400);
    },

    /**
     * ✅ Transição completa (fade out → ação → fade in)
     */
    async transition(action: () => Promise<void>): Promise<void> {
        await this.fadeOut(300);
        await action();
        this.fadeIn();
    }
};
