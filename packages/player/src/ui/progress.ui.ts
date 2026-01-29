import { state } from '../core/state';
import { formatTime } from '../utils/format.utils';
import { dom } from './dom-elements';
import { timelineService } from '../services/timeline.service';

export function updateVirtualProgress(): void {
    // ✅ ADICIONAR: Não atualizar se estiver seeking
    if (state.isSeekingVirtual) return;

    const virtualTime = timelineService.getVirtualTime();
    const percent = state.virtualTotalDuration > 0 ? (virtualTime / state.virtualTotalDuration) * 100 : 0;

    dom.progressFilled.style.width = `${percent}%`;
    dom.progressHandle.style.left = `${percent}%`;

    dom.currentTimeSpan.textContent = formatTime(virtualTime);
    dom.totalTimeSpan.textContent = formatTime(state.virtualTotalDuration);
    dom.virtualTimeSpan.textContent = `${formatTime(virtualTime)} / ${formatTime(state.virtualTotalDuration)}`;
}

export function handleProgressBarClick(e: MouseEvent): void {
    const rect = dom.progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const virtualTime = percent * state.virtualTotalDuration;

    timelineService.seekToVirtualTime(virtualTime);
}

export function startDraggingProgress(e: MouseEvent): void {
    e.preventDefault();

    const handleMouseMove = (e: MouseEvent) => {
        const rect = dom.progressBar.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));

        const virtualTime = percent * state.virtualTotalDuration;

        dom.progressFilled.style.width = `${percent * 100}%`;
        dom.progressHandle.style.left = `${percent * 100}%`;
        dom.currentTimeSpan.textContent = formatTime(virtualTime);
    };

    const handleMouseUp = (e: MouseEvent) => {
        const rect = dom.progressBar.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));

        const virtualTime = percent * state.virtualTotalDuration;
        timelineService.seekToVirtualTime(virtualTime);

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}
