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
import { normalizeGraph } from '@ine/shared';
import { setupChoiceShortcuts } from './controllers/choices.controller';

type ViewState = 'landing' | 'loading' | 'error' | 'notice' | 'playing';

let currentShareToken: string | null = null;
/** O aviso aparece uma vez por carregamento da página (não a cada "voltar ao início"). */
let noticeAccepted = false;

/** Mostra o aviso de conteúdo gerado por IA e resolve quando o usuário clica em OK. */
function waitForNoticeAccepted(): Promise<void> {
  if (noticeAccepted) return Promise.resolve();
  showView('notice');
  dom.noticeOkBtn.focus();
  return new Promise((resolve) => {
    dom.noticeOkBtn.addEventListener(
      'click',
      () => {
        noticeAccepted = true;
        resolve();
      },
      { once: true }
    );
  });
}

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
  dom.noticePanel.style.display = view === 'notice' ? 'block' : 'none';
  dom.errorPanel.style.display = view === 'error' ? 'block' : 'none';
  dom.playerContainer.style.display = view === 'playing' ? 'block' : 'none';

  if (view === 'error' && errorMessage) {
    dom.errorMessage.textContent = errorMessage;
  }
}

async function startProject(graph: Awaited<ReturnType<typeof apiService.getProjectByShareToken>>): Promise<void> {
  // Projetos salvos no formato antigo (nós de escolha/fim) viram cenas.
  const normalized = normalizeGraph(graph.nodes, graph.edges);
  state.currentGraph = { ...graph, nodes: normalized.nodes, edges: normalized.edges };

  const initialNode = findInitialNode(state.currentGraph);
  if (!initialNode) {
    showView('error', 'Esta aula não tem uma cena inicial.');
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
    await waitForNoticeAccepted();
    await startProject(graph);
  } catch (error: unknown) {
    console.error('❌ Erro ao carregar projeto:', error);
    const is404 = axiosIs404(error);
    showView(
      'error',
      is404
        ? 'Link inválido ou projeto não encontrado.'
        : 'Não foi possível carregar a aula. Tente novamente mais tarde.'
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
  dom.restartButton.addEventListener('click', handleRestart);
  dom.video.addEventListener('timeupdate', onTimeUpdate);
  dom.video.addEventListener('ended', handleVideoEnded);
  // Rede de segurança: depois do fim da aula, nenhum play() atrasado (sessão HLS,
  // seek pendente) pode voltar a tocar o áudio atrás do overlay.
  dom.video.addEventListener('play', () => {
    if (state.playbackFinished) dom.video.pause();
  });
  dom.backToHomeBtn.addEventListener('click', handleBackToHome);

  setupCustomControls();
  setupChoiceShortcuts();
  startProgressLoop();
  hlsService.init();

  const shareToken = parseShareTokenFromPath();
  if (shareToken) {
    await loadProjectByShareToken(shareToken);
  } else {
    showView('landing');
  }
}

function onTimeUpdate() {
  handleTimeUpdate();
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

}

init();
