import { CONTROLS_HIDE_TIMEOUT } from '../core/config';
import { state } from '../core/state';
import { dom } from '../ui/dom-elements';
import { handleProgressBarClick, startDraggingProgress } from '../ui/progress.ui';

export function setupCustomControls(): void {
    // Play/Pause
    dom.playPauseBtn.addEventListener('click', togglePlayPause);
    dom.video.addEventListener('click', togglePlayPause);

    // Mute
    dom.muteBtn.addEventListener('click', toggleMute);

    // Volume
    dom.volumeSlider.addEventListener('input', (e) => {
        const value = Number((e.target as HTMLInputElement).value);
        dom.video.volume = value / 100;
        updateMuteButton();
    });

    // Fullscreen
    dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Progress bar
    dom.progressBar.addEventListener('click', handleProgressBarClick);
    dom.progressBar.addEventListener('mousedown', startDraggingProgress);

    // ✅ NOVO: Controle de velocidade
    setupSpeedControl();

    // Atualizar UI do vídeo
    dom.video.addEventListener('play', updatePlayPauseButton);
    dom.video.addEventListener('pause', updatePlayPauseButton);
    dom.video.addEventListener('volumechange', updateMuteButton);

    // Controles temporários
    dom.video.addEventListener('mousemove', showControlsTemporarily);
    dom.video.addEventListener('play', () => showControlsTemporarily());
    dom.video.addEventListener('pause', () => {
        dom.customControls.classList.add('always-visible');
        if (state.controlsTimeout) {
            clearTimeout(state.controlsTimeout);
        }
    });
}

/**
 * ✅ NOVO: Setup controle de velocidade
 */
function setupSpeedControl(): void {
    let isMenuOpen = false;

    // Toggle menu ao clicar no botão
    dom.speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMenuOpen = !isMenuOpen;
        dom.speedMenu.classList.toggle('hidden', !isMenuOpen);
    });

    // Fechar menu ao clicar fora
    document.addEventListener('click', () => {
        if (isMenuOpen) {
            isMenuOpen = false;
            dom.speedMenu.classList.add('hidden');
        }
    });

    // Selecionar velocidade
    const speedOptions = dom.speedMenu.querySelectorAll('.speed-option');
    speedOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const speed = Number((option as HTMLElement).dataset.speed);

            // Aplicar velocidade
            dom.video.playbackRate = speed;

            // Atualizar UI
            speedOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            // Atualizar botão
            const label = speed === 1 ? '1x' : `${speed}x`;
            dom.speedBtn.textContent = label;

            // Fechar menu
            isMenuOpen = false;
            dom.speedMenu.classList.add('hidden');

            console.log(`⚡ Velocidade alterada para ${speed}x`);
        });
    });
}

function togglePlayPause(): void {
    if (dom.video.paused) {
        dom.video.play();
    } else {
        dom.video.pause();
    }
}

function updatePlayPauseButton(): void {
    dom.playPauseBtn.textContent = dom.video.paused ? '▶️' : '⏸️';
}

function toggleMute(): void {
    dom.video.muted = !dom.video.muted;
    updateMuteButton();
}

function updateMuteButton(): void {
    if (dom.video.muted || dom.video.volume === 0) {
        dom.muteBtn.textContent = '🔇';
    } else if (dom.video.volume < 0.5) {
        dom.muteBtn.textContent = '🔉';
    } else {
        dom.muteBtn.textContent = '🔊';
    }
    dom.volumeSlider.value = String(dom.video.volume * 100);
}

function toggleFullscreen(): void {
    if (!document.fullscreenElement) {
        dom.playerContainer.requestFullscreen();
        dom.fullscreenBtn.textContent = '⛶';
    } else {
        document.exitFullscreen();
        dom.fullscreenBtn.textContent = '⛶';
    }
}

function showControlsTemporarily(): void {
    dom.customControls.classList.add('always-visible');

    if (state.controlsTimeout) {
        clearTimeout(state.controlsTimeout);
    }

    state.controlsTimeout = window.setTimeout(() => {
        if (!dom.video.paused) {
            dom.customControls.classList.remove('always-visible');
        }
    }, CONTROLS_HIDE_TIMEOUT);
}
