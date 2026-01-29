export const dom = {
    // Containers
    projectSelector: document.getElementById('project-selector')!,
    playerContainer: document.getElementById('player-container')!,

    // Project selection
    projectList: document.getElementById('project-list') as HTMLSelectElement,
    loadProjectBtn: document.getElementById('load-project')!,

    // ✅ NOVO: Header e botão de voltar
    backToHomeBtn: document.getElementById('back-to-home-btn')!,
    projectTitle: document.getElementById('project-title')!,

    // Video
    video: document.getElementById('video-player') as HTMLVideoElement,

    // Overlays
    choicesOverlay: document.getElementById('choices-overlay')!,
    choicesTitle: document.getElementById('choices-title')!,
    choicesButtons: document.getElementById('choices-buttons')!,
    timeoutBar: document.getElementById('timeout-bar')!,
    timeoutProgress: document.getElementById('timeout-progress')!,
    endOverlay: document.getElementById('end-overlay')!,
    endIcon: document.getElementById('end-icon')!,
    endTitle: document.getElementById('end-title')!,
    endMessage: document.getElementById('end-message')!,
    restartButton: document.getElementById('restart-button')!,

    // Info
    currentNodeSpan: document.getElementById('current-node')!,
    pathHistorySpan: document.getElementById('path-history')!,

    // Controls
    customControls: document.getElementById('custom-controls')!,
    progressBar: document.getElementById('progress-bar')!,
    progressFilled: document.getElementById('progress-filled')!,
    progressHandle: document.getElementById('progress-handle')!,
    currentTimeSpan: document.getElementById('current-time')!,
    totalTimeSpan: document.getElementById('total-time')!,
    virtualTimeSpan: document.getElementById('virtual-time')!,
    playPauseBtn: document.getElementById('play-pause-btn')!,
    muteBtn: document.getElementById('mute-btn')!,
    volumeSlider: document.getElementById('volume-slider') as HTMLInputElement,
    fullscreenBtn: document.getElementById('fullscreen-btn')!,
    reloadProjectListBtn: document.getElementById('refresh-projects')!,

    // ✅ NOVO: Controle de velocidade
    speedBtn: document.getElementById('speed-btn')!,
    speedMenu: document.getElementById('speed-menu')!,
};
