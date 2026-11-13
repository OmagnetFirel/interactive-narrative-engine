import type Hls from 'hls.js';
import { CONTROLS_HIDE_TIMEOUT } from '../core/config';
import { state } from '../core/state';
import { dom } from '../ui/dom-elements';
import { hlsService } from '../services/hls.service';

// ✅ NOVO: Estado do controle de qualidade
let manualLevel: number | null = null;     // null = Auto; >=0 = idx fixado pelo usuário
let preferredHeight: number | null = null; // mantém a preferência entre cenas

// ✅ Ícones SVG (temáticos) para os controles do player
const svg = (paths: string) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;

const ICON_PLAY = svg('<path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.79-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14z"/>');
const ICON_PAUSE = svg('<path d="M8 5h3.2v14H8zM12.8 5H16v14h-3.2z"/>');

const ICON_VOLUME_HIGH = svg('<path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>');
const ICON_VOLUME_LOW = svg('<path d="M5 10v4h4l5 5V5L9 10H5zm11.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>');
const ICON_VOLUME_MUTED = svg('<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>');

// Ícones de qualidade/velocidade são estáticos e ficam embutidos no index.html

const ICON_FULLSCREEN = svg('<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>');
const ICON_FULLSCREEN_EXIT = svg('<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>');

/** Atualiza apenas o texto (rótulo) de um botão que tem ícone + label. */
function setControlLabel(btn: HTMLElement, text: string): void {
    const label = btn.querySelector('.ctrl-label');
    if (label) label.textContent = text;
}

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

    // Seekbar estilo live (somente leitura) — atualizada em progress.ui.ts via rAF

    // ✅ Estado inicial dos ícones
    updatePlayPauseButton();
    updateMuteButton();
    updateFullscreenButton();

    // Sincronizar ícone de fullscreen ao entrar/sair (inclusive via tecla Esc/F11)
    document.addEventListener('fullscreenchange', updateFullscreenButton);

    // ✅ NOVO: Controle de qualidade
    setupQualityControl();

    // ✅ NOVO: Controle de velocidade
    setupSpeedControl();

    // Atualizar UI do vídeo
    dom.video.addEventListener('play', updatePlayPauseButton);
    dom.video.addEventListener('pause', updatePlayPauseButton);
    dom.video.addEventListener('volumechange', updateMuteButton);

    // Controles temporários (header + barra inferior)
    const showPlayerChrome = () => showControlsTemporarily();
    dom.videoWrapper.addEventListener('mousemove', showPlayerChrome);
    dom.video.addEventListener('mousemove', showPlayerChrome);
    dom.video.addEventListener('play', () => showControlsTemporarily());
    dom.video.addEventListener('pause', () => {
        dom.customControls.classList.add('always-visible');
        dom.playerHeader.classList.add('visible');
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
            setControlLabel(dom.speedBtn, label);

            // Fechar menu
            isMenuOpen = false;
            dom.speedMenu.classList.add('hidden');

        });
    });
}

/**
 * ✅ NOVO: Setup controle de qualidade (espelha setupSpeedControl)
 */
function setupQualityControl(): void {
    let isMenuOpen = false;

    function closeMenu(): void {
        isMenuOpen = false;
        dom.qualityMenu.classList.add('hidden');
    }

    function updateActiveOption(): void {
        const activeLevel = manualLevel ?? -1;
        dom.qualityMenu.querySelectorAll('.quality-option').forEach((option) => {
            const optionLevel = Number((option as HTMLElement).dataset.level);
            option.classList.toggle('active', optionLevel === activeLevel);
        });
    }

    function updateQualityLabel(): void {
        if (manualLevel !== null) {
            const level = hlsService.getHls()?.levels[manualLevel];
            setControlLabel(dom.qualityBtn, level ? `${level.height}p` : 'Auto');
        } else {
            setControlLabel(dom.qualityBtn, 'Auto');
        }
    }

    function selectQuality(idx: number): void {
        const hls = hlsService.getHls();

        if (idx === -1) {
            manualLevel = null;
            preferredHeight = null;
            if (hls) hls.currentLevel = -1;
        } else {
            const level = hls?.levels[idx];
            manualLevel = idx;
            preferredHeight = level?.height ?? null;
            if (hls) hls.currentLevel = idx;
        }

        updateQualityLabel();
        updateActiveOption();
        closeMenu();
    }

    function createOption(label: string, levelIdx: number): HTMLButtonElement {
        const button = document.createElement('button');
        button.className = 'quality-option';
        button.dataset.level = String(levelIdx);
        button.textContent = label;
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            selectQuality(levelIdx);
        });
        return button;
    }

    function renderQualityMenu(levels: Hls['levels']): void {
        dom.qualityMenu.innerHTML = '';
        dom.qualityMenu.appendChild(createOption('Auto', -1));

        // Maior height primeiro; desempate por bandwidth
        const sorted = levels
            .map((level, idx) => ({ level, idx }))
            .sort((a, b) =>
                (b.level.height - a.level.height) || (b.level.bitrate - a.level.bitrate)
            );

        sorted.forEach(({ level, idx }) => {
            dom.qualityMenu.appendChild(createOption(`${level.height}p`, idx));
        });
    }

    // Estado inicial (antes do primeiro MANIFEST_PARSED): só Auto
    renderQualityMenu([]);
    updateActiveOption();
    updateQualityLabel();

    // Toggle menu ao clicar no botão
    dom.qualityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMenuOpen = !isMenuOpen;
        dom.qualityMenu.classList.toggle('hidden', !isMenuOpen);
    });

    // Fechar menu ao clicar fora
    document.addEventListener('click', () => {
        if (isMenuOpen) {
            closeMenu();
        }
    });

    // Repopular menu a cada novo manifest (nova cena / nova instância de Hls)
    hlsService.onManifestParsed((levels) => {
        renderQualityMenu(levels);

        const hls = hlsService.getHls();
        const preferredIdx = preferredHeight !== null
            ? levels.findIndex(level => level.height === preferredHeight)
            : -1;

        if (preferredIdx >= 0) {
            // Preferência manual existe na nova cena: preservar
            manualLevel = preferredIdx;
            if (hls) hls.currentLevel = preferredIdx;
        } else {
            // Sem preferência aplicável: voltar para Auto (ABR)
            manualLevel = null;
            if (hls) hls.currentLevel = -1;
        }

        updateActiveOption();
        updateQualityLabel();
    });

    // Em modo Auto, refletir a rendition em uso no label
    hlsService.onLevelSwitched((idx) => {
        if (manualLevel !== null) return;

        const level = hlsService.getHls()?.levels[idx];
        if (level) {
            setControlLabel(dom.qualityBtn, `Auto (${level.height}p)`);
        }
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
    const paused = dom.video.paused;
    dom.playPauseBtn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    dom.playPauseBtn.classList.toggle('is-paused', paused);
    dom.playPauseBtn.setAttribute('aria-label', paused ? 'Reproduzir' : 'Pausar');
}

function toggleMute(): void {
    dom.video.muted = !dom.video.muted;
    updateMuteButton();
}

function updateMuteButton(): void {
    if (dom.video.muted || dom.video.volume === 0) {
        dom.muteBtn.innerHTML = ICON_VOLUME_MUTED;
        dom.muteBtn.setAttribute('aria-label', 'Ativar som');
    } else if (dom.video.volume < 0.5) {
        dom.muteBtn.innerHTML = ICON_VOLUME_LOW;
        dom.muteBtn.setAttribute('aria-label', 'Volume');
    } else {
        dom.muteBtn.innerHTML = ICON_VOLUME_HIGH;
        dom.muteBtn.setAttribute('aria-label', 'Silenciar');
    }
    dom.volumeSlider.value = String(dom.video.volume * 100);
}

function toggleFullscreen(): void {
    if (!document.fullscreenElement) {
        dom.playerContainer.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function updateFullscreenButton(): void {
    dom.fullscreenBtn.innerHTML = document.fullscreenElement ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN;
    dom.fullscreenBtn.setAttribute('aria-label', document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia');
}

function showControlsTemporarily(): void {
    dom.customControls.classList.add('always-visible');
    dom.playerHeader.classList.add('visible');

    if (state.controlsTimeout) {
        clearTimeout(state.controlsTimeout);
    }

    state.controlsTimeout = window.setTimeout(() => {
        if (!dom.video.paused) {
            dom.customControls.classList.remove('always-visible');
            dom.playerHeader.classList.remove('visible');
        }
    }, CONTROLS_HIDE_TIMEOUT);
}
