import './style.css';
import { state } from './core/state';
import { dom } from './ui/dom-elements';
import { apiService } from './services/api.service';
import { setupCustomControls } from './controllers/controls.controller';
import { findInitialNode, navigateToNode, handleTimeUpdate, handleVideoEnded, handleRestart } from './controllers/navigation.controller';
import { updateVirtualProgress } from './ui/progress.ui';
import { analytics } from './services/analytics.service';
import { hlsService } from './services/hls.service';
import { preloadService } from './services/preload.service';
import { timelineService } from './services/timeline.service';

async function init() {
  console.log('🚀 Inicializando Interactive Narrative Player (Refatorado)');

  await loadProjects();

  // Event listeners
  dom.loadProjectBtn.addEventListener('click', handleLoadProject);
  dom.restartButton.addEventListener('click', handleRestart);
  dom.video.addEventListener('timeupdate', onTimeUpdate);
  dom.video.addEventListener('ended', handleVideoEnded);
  dom.reloadProjectListBtn.addEventListener('click', loadProjects);

  // ✅ NOVO: Botão de voltar para home
  dom.backToHomeBtn.addEventListener('click', handleBackToHome);

  // Setup controles customizados
  setupCustomControls();

  // ✅ Inicializar HLS Service
  hlsService.init();

  // ✅ Adicionar painel de debug/analytics (apenas em desenvolvimento)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setupDebugPanel();
  }
}

async function loadProjects() {
  try {
    const projects = await apiService.getProjects();

    dom.projectList.innerHTML = '<option value="">-- Selecione --</option>';

    projects.forEach((project) => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = `${project.name} (${project.nodes.length} nós)`;
      dom.projectList.appendChild(option);
    });

    console.log(`✅ ${projects.length} projetos carregados`);
  } catch (error) {
    console.error('❌ Erro ao carregar projetos:', error);
    alert('Erro ao conectar com a API');
  }
}

async function handleLoadProject() {
  const projectId = dom.projectList.value;

  if (!projectId) {
    alert('Selecione um projeto');
    return;
  }

  try {
    state.currentGraph = await apiService.getProject(projectId);

    console.log('📊 Projeto carregado:', state.currentGraph);

    const initialNode = findInitialNode(state.currentGraph);

    if (!initialNode) {
      alert('Erro: Nenhum nó inicial encontrado no projeto');
      return;
    }

    dom.projectSelector.style.display = 'none';
    dom.playerContainer.style.display = 'block';

    state.pathHistory = [];

    // ✅ Resetar analytics ao carregar novo projeto
    analytics.reset();
    preloadService.clearAll();

    navigateToNode(initialNode);

  } catch (error) {
    console.error('❌ Erro ao carregar projeto:', error);
    alert('Erro ao carregar projeto');
  }
}

function onTimeUpdate() {
  handleTimeUpdate();

  // ✅ NOVO: Atualizar segmento atual em modo stitched
  if (state.stitchedPlaylistUrl && state.stitchedPath.length > 0) {
    const currentTime = dom.video.currentTime;
    timelineService.updateCurrentSegmentByTime(currentTime);
  }

  // Atualizar progress bar virtual
  if (!state.isSeekingVirtual) {
    updateVirtualProgress();
  }
}

/**
 * ✅ Setup painel de debug/analytics
 */
function setupDebugPanel() {
  const debugPanel = document.createElement('div');
  debugPanel.id = 'debug-panel-dev';
  debugPanel.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.85);
    color: #0f0;
    padding: 12px;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    z-index: 9999;
    max-width: 280px;
    backdrop-filter: blur(4px);
    border: 1px solid rgba(0, 255, 0, 0.3);
  `;

  debugPanel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid rgba(0, 255, 0, 0.3); padding-bottom: 6px;">
      <strong style="color: #0ff;">📊 DEBUG PANEL</strong>
      <button id="toggle-debug" style="background: transparent; border: 1px solid #0f0; color: #0f0; padding: 2px 6px; cursor: pointer; border-radius: 3px; font-size: 10px;">−</button>
    </div>
    <div id="debug-content">
      <div style="margin-bottom: 6px;">
        <div style="color: #0ff; font-weight: bold; margin-bottom: 2px;">HLS Info:</div>
        <div id="hls-level" style="margin-left: 8px;">Level: -</div>
        <div id="hls-bitrate" style="margin-left: 8px;">Bitrate: -</div>
      </div>
      
      <div style="margin-bottom: 6px;">
        <div style="color: #0ff; font-weight: bold; margin-bottom: 2px;">Buffer:</div>
        <div id="buffer-length" style="margin-left: 8px;">Length: -</div>
        <div id="buffer-health" style="margin-left: 8px;">Health: -</div>
      </div>
      
      <div style="margin-bottom: 6px;">
        <div style="color: #0ff; font-weight: bold; margin-bottom: 2px;">Preload Cache:</div>
        <div id="preload-status" style="margin-left: 8px;">0 / 3</div>
      </div>
      
      <div style="margin-bottom: 6px;">
        <div style="color: #0ff; font-weight: bold; margin-bottom: 2px;">Analytics:</div>
        <div id="analytics-events" style="margin-left: 8px;">Events: 0</div>
        <div id="analytics-errors" style="margin-left: 8px;">Errors: 0</div>
      </div>
      
      <button id="show-analytics-summary" style="width: 100%; margin-top: 8px; padding: 6px; background: rgba(0, 255, 0, 0.1); border: 1px solid #0f0; color: #0f0; cursor: pointer; border-radius: 3px; font-size: 10px;">
        View Summary
      </button>
    </div>
  `;

  document.body.appendChild(debugPanel);

  // Toggle minimize
  let isMinimized = false;
  const toggleBtn = document.getElementById('toggle-debug')!;
  const content = document.getElementById('debug-content')!;

  toggleBtn.addEventListener('click', () => {
    isMinimized = !isMinimized;
    content.style.display = isMinimized ? 'none' : 'block';
    toggleBtn.textContent = isMinimized ? '+' : '−';
  });

  // Botão de summary
  document.getElementById('show-analytics-summary')!.addEventListener('click', () => {
    const summary = analytics.getSummary();
    console.log('📊 Analytics Summary:', summary);
    alert(JSON.stringify(summary, null, 2));
  });

  // Atualizar painel a cada 2 segundos
  setInterval(updateDebugPanel, 2000);
}

/**
 * ✅ NOVO: Voltar para seleção de projetos
 */
function handleBackToHome() {
  // Parar vídeo atual
  dom.video.pause();

  // Limpar estado
  analytics.flush();
  preloadService.clearAll();
  hlsService.destroy();

  // Voltar para seleção
  dom.playerContainer.style.display = 'none';
  dom.projectSelector.style.display = 'block';

  console.log('🏠 Voltando para home...');
}

/**
 * ✅ Atualizar informações do painel de debug
 */
function updateDebugPanel() {
  const hls = hlsService.getHls();

  // HLS Info
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

  // Buffer Info
  const video = dom.video;
  if (video && video.buffered.length > 0) {
    const currentTime = video.currentTime;
    const bufferEnd = video.buffered.end(video.buffered.length - 1);
    const bufferLength = (bufferEnd - currentTime).toFixed(2);

    document.getElementById('buffer-length')!.textContent = `Length: ${bufferLength}s`;

    const bufferMetrics = analytics.getBufferMetrics();
    const health = bufferMetrics.averageBufferLength > 2 ? '✅ Good' : '⚠️ Low';
    document.getElementById('buffer-health')!.textContent = `Health: ${health}`;
  }

  // Preload Cache
  const cacheStatus = preloadService.getCacheStatus();
  document.getElementById('preload-status')!.textContent =
    `${cacheStatus.size} / ${cacheStatus.maxSize} videos`;

  // Analytics
  const summary = analytics.getSummary();
  document.getElementById('analytics-events')!.textContent = `Events: ${summary.totalEvents}`;
  document.getElementById('analytics-errors')!.textContent = `Errors: ${summary.errors}`;
}

init();
