export const dom = {
    landingPanel: document.getElementById('landing-panel')!,
    loadingPanel: document.getElementById('loading-panel')!,
    noticePanel: document.getElementById('notice-panel')!,
    noticeOkBtn: document.getElementById('notice-ok-btn')!,
    errorPanel: document.getElementById('error-panel')!,
    errorMessage: document.getElementById('error-message')!,

    playerContainer: document.getElementById('player-container')!,

    playerHeader: document.getElementById('player-header')!,
    videoWrapper: document.getElementById('video-wrapper')!,
    backToHomeBtn: document.getElementById('back-to-home-btn')!,

    video: document.getElementById('video-player') as HTMLVideoElement,

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

    customControls: document.getElementById('custom-controls')!,
    progressBar: document.getElementById('progress-bar')!,
    progressAvailable: document.getElementById('progress-available')!,
    progressFilled: document.getElementById('progress-filled')!,
    progressHandle: document.getElementById('progress-handle')!,
    currentTimeSpan: document.getElementById('current-time')!,
    totalTimeSpan: document.getElementById('total-time')!,
    playPauseBtn: document.getElementById('play-pause-btn')!,
    muteBtn: document.getElementById('mute-btn')!,
    volumeSlider: document.getElementById('volume-slider') as HTMLInputElement,
    fullscreenBtn: document.getElementById('fullscreen-btn')!,

    speedBtn: document.getElementById('speed-btn')!,
    speedMenu: document.getElementById('speed-menu')!,

    qualityBtn: document.getElementById('quality-btn')!,
    qualityMenu: document.getElementById('quality-menu')!,
};
