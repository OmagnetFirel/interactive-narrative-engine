import './style.css';
import { state } from './core/state';
import { dom } from './ui/dom-elements';
import { apiService } from './services/api.service';
import { setupCustomControls } from './controllers/controls.controller';
import { findInitialNode, navigateToNode, handleTimeUpdate, handleVideoEnded, handleRestart } from './controllers/navigation.controller';
import { resetState } from './core/state';
import { resetProgressDisplay, startProgressLoop, stopProgressLoop } from './ui/progress.ui';
import { hlsService } from './services/hls.service';
import { preloadService } from './services/preload.service';
import { timelineService } from './services/timeline.service';

type ViewState = 'landing' | 'loading' | 'error' | 'playing';

let currentShareToken: string | null = null;

function parseShareTokenFromPath(): string | null {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const playIndex = parts.indexOf('play');
  if (playIndex >= 0 && parts[playIndex + 1]) {
    return decodeURIComponent(parts[playIndex + 1]);
  }
  return null;
}

function showView(view: ViewState, errorMessage?: string): void {
  dom.landingPanel.style.display = view === 'landing' ? 'block' : 'none';
  dom.loadingPanel.style.display = view === 'loading' ? 'block' : 'none';
  dom.errorPanel.style.display = view === 'error' ? 'block' : 'none';
  dom.playerContainer.style.display = view === 'playing' ? 'block' : 'none';

  if (view === 'error' && errorMessage) {
    dom.errorMessage.textContent = errorMessage;
  }
}

async function startProject(graph: Awaited<ReturnType<typeof apiService.getProjectByShareToken>>): Promise<void> {
  state.currentGraph = graph;

  const initialNode = findInitialNode(state.currentGraph);
  if (!initialNode) {
    showView('error', 'Nenhum nó inicial encontrado nesta narrativa.');
    return;
  }

  showView('playing');
  state.pathHistory = [];
  preloadService.clearAll();
  navigateToNode(initialNode);
}

async function loadProjectByShareToken(token: string): Promise<void> {
  currentShareToken = token;
  showView('loading');

  try {
    const graph = await apiService.getProjectByShareToken(token);
    console.log('📊 Projeto carregado via share token:', graph.name);
    await startProject(graph);
  } catch (error: unknown) {
    console.error('❌ Erro ao carregar projeto:', error);
    const is404 = axiosIs404(error);
    showView(
      'error',
      is404
        ? 'Link inválido ou projeto não encontrado.'
        : 'Não foi possível carregar a narrativa. Tente novamente mais tarde.'
    );
  }
}

function axiosIs404(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 404
  );
}

async function init() {
  console.log('🚀 Inicializando Interactive Narrative Player (Refatorado)');

  dom.restartButton.addEventListener('click', handleRestart);
  dom.video.addEventListener('timeupdate', onTimeUpdate);
  dom.video.addEventListener('ended', handleVideoEnded);
  dom.backToHomeBtn.addEventListener('click', handleBackToHome);

  setupCustomControls();
  startProgressLoop();
  hlsService.init();

  const shareToken = parseShareTokenFromPath();
  if (shareToken) {
    await loadProjectByShareToken(shareToken);
  } else {
    showView('landing');
  }

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setupDebugPanel();
  }
}

function onTimeUpdate() {
  handleTimeUpdate();
}

function setupDebugPanel() {
  const debugPanel = document.createElement('div');
  debugPanel.id = 'debug-panel-dev';
  debugPanel.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(58, 36, 24, 0.94);
    color: #faf8f4;
    padding: 12px;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    z-index: 9999;
    max-width: 280px;
    border: 1px solid rgba(184, 115, 51, 0.45);
  `;

  debugPanel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid rgba(231, 216, 202, 0.25); padding-bottom: 6px;">
      <strong style="color: #D99A5B;">📊 DEBUG PANEL</strong>
      <button id="toggle-debug" style="background: transparent; border: 1px solid #D99A5B; color: #D99A5B; padding: 2px 6px; cursor: pointer; border-radius: 3px; font-size: 10px;">−</button>
    </div>
    <div id="debug-content">
      <div style="margin-bottom: 6px;">
        <div style="color: #D99A5B; font-weight: bold; margin-bottom: 2px;">HLS Info:</div>
        <div id="hls-level" style="margin-left: 8px;">Level: -</div>
        <div id="hls-bitrate" style="margin-left: 8px;">Bitrate: -</div>
      </div>
      
      <div style="margin-bottom: 6px;">
        <div style="color: #D99A5B; font-weight: bold; margin-bottom: 2px;">Buffer:</div>
        <div id="buffer-length" style="margin-left: 8px;">Length: -</div>
        <div id="buffer-health" style="margin-left: 8px;">Health: -</div>
      </div>
      
      <div style="margin-bottom: 6px;">
        <div style="color: #D99A5B; font-weight: bold; margin-bottom: 2px;">Preload Cache:</div>
        <div id="preload-status" style="margin-left: 8px;">0 / 3</div>
      </div>
    </div>
  `;

  document.body.appendChild(debugPanel);

  let isMinimized = false;
  const toggleBtn = document.getElementById('toggle-debug')!;
  const content = document.getElementById('debug-content')!;

  toggleBtn.addEventListener('click', () => {
    isMinimized = !isMinimized;
    content.style.display = isMinimized ? 'none' : 'block';
    toggleBtn.textContent = isMinimized ? '+' : '−';
  });

  setInterval(updateDebugPanel, 2000);
}

function handleBackToHome() {
  dom.video.pause();

  preloadService.clearAll();
  hlsService.destroy();
  stopProgressLoop();
  resetProgressDisplay();
  resetState();
  timelineService.resetTimeline();

  dom.playerHeader.classList.remove('visible');
  startProgressLoop();

  if (currentShareToken) {
    void loadProjectByShareToken(currentShareToken);
  } else {
    showView('landing');
  }

  console.log('🏠 Voltando ao início da narrativa...');
}

function updateDebugPanel() {
  const hls = hlsService.getHls();

  if (hls && hls.levels && hls.levels.length > 0) {
    const levelInfo = hls.currentLevel === -1
      ? `Auto (${hls.levels[hls.loadLevel]?.height || '-'}p)`
      : `${hls.levels[hls.currentLevel]?.height || '-'}p`;

    document.getElementById('hls-level')!.textContent = `Level: ${levelInfo}`;

    const level = hls.levels[hls.loadLevel] || hls.levels[0];
    if (level) {
      const bitrate = (level.bitrate / 1000).toFixed(0);
      document.getElementById('hls-bitrate')!.textContent = `Bitrate: ${bitrate} kbps`;
    }
  }

  const video = dom.video;
  if (video && video.buffered.length > 0) {
    const currentTime = video.currentTime;
    const bufferEnd = video.buffered.end(video.buffered.length - 1);
    const bufferLength = bufferEnd - currentTime;

    document.getElementById('buffer-length')!.textContent = `Length: ${bufferLength.toFixed(2)}s`;
    document.getElementById('buffer-health')!.textContent =
      `Health: ${bufferLength > 2 ? '✅ Good' : '⚠️ Low'}`;
  }

  const cacheStatus = preloadService.getCacheStatus();
  document.getElementById('preload-status')!.textContent =
    `${cacheStatus.size} / ${cacheStatus.maxSize} videos`;
}

init();
