import type { GraphEdge, GraphNode } from '../core/types';
import { state } from '../core/state';
import { dom } from '../ui/dom-elements';
import { hideChoices } from '../ui/overlay.ui';
import { timelineService } from '../services/timeline.service';
import { hlsService } from '../services/hls.service';
import { analytics } from '../services/analytics.service';

export function showChoicesDuringVideo(edges: GraphEdge[]): void {
    if (edges.length === 0) return;

    state.choicesShown = true;

    console.log(`🔀 Mostrando ${edges.length} escolhas`);

    dom.choicesButtons.innerHTML = '';

    edges.forEach((edge) => {
        const button = document.createElement('button');
        button.className = 'choice-button';
        button.textContent = edge.label || edge.data?.label || 'Continuar';
        button.addEventListener('click', () => handleChoiceDuringVideo(edge));
        dom.choicesButtons.appendChild(button);
    });

    dom.choicesTitle.textContent = 'Faça sua escolha:';
    dom.choicesOverlay.classList.remove('hidden');

    const timeRemaining = dom.video.duration - dom.video.currentTime;
    const timeout = Math.min(timeRemaining - 0.5, (state.currentNode?.data as any)?.timeout || timeRemaining);

    if (timeout > 0) {
        startTimeoutDuringVideo(timeout, edges[0]);
    }
}

function startTimeoutDuringVideo(seconds: number, defaultEdge: GraphEdge): void {
    dom.timeoutBar.classList.remove('hidden');
    dom.timeoutProgress.style.transition = `width ${seconds}s linear`;

    setTimeout(() => {
        dom.timeoutProgress.style.width = '0%';
    }, 50);

    state.timeoutId = window.setTimeout(() => {
        if (!state.hasChosenDuringVideo) {
            console.log(`⏰ Timeout! Escolha automática`);
            handleChoiceDuringVideo(defaultEdge);
        }
    }, seconds * 1000);
}

/**
 * ✅ NOVO: Estilo Netflix Bandersnatch - expandir timeline sem interrupção
 */
async function handleChoiceDuringVideo(edge: GraphEdge): Promise<void> {
    console.log(`\n✅ ===== ESCOLHA FEITA: ${edge.label || edge.id} =====`);

    state.hasChosenDuringVideo = true;
    hideChoices();

    // Limpar timeout se existir
    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
    }

    // ✅ Rastrear escolha no analytics
    analytics.track({
        type: 'choice',
        choiceId: edge.id,
        nodeId: state.currentNode?.id,
        metadata: {
            choiceLabel: edge.label,
            targetNode: edge.target,
            wasAutomatic: false
        }
    });

    const nextNode = state.currentGraph!.nodes.find(n => n.id === edge.target);

    if (!nextNode) {
        console.error('❌ Nó alvo não encontrado:', edge.target);
        return;
    }

    console.log(`📦 Próximo nó: ${nextNode.data.label}`);

    // ✅ NOVO: Calcular caminho completo a partir da escolha
    const pathFromChoice = await calculatePathToNextChoice(nextNode);

    if (pathFromChoice.length === 0) {
        console.warn('⚠️ Nenhum vídeo no caminho escolhido');
        return;
    }

    // ✅ NOVO: Expandir timeline dinamicamente (estilo Bandersnatch)
    console.log(`🎬 Expandindo timeline com ${pathFromChoice.length} vídeos...`);

    // Adicionar novos nós à timeline virtual
    timelineService.appendToTimeline(pathFromChoice);

    // ✅ NOVO: Solicitar ao servidor para expandir a playlist HLS atual
    await hlsService.appendToCurrentPlaylist(pathFromChoice);

    // Atualizar próximo nó
    state.nextNodeQueued = nextNode;

    console.log(`✅ Timeline expandida! Reprodução continua sem interrupção.`);
}

/**
 * Calcular caminho completo até a próxima escolha ou fim
 */
async function calculatePathToNextChoice(startNode: GraphNode): Promise<GraphNode[]> {
    const path: GraphNode[] = [];
    let currentNode = startNode;

    const addNodeIfHasVideo = (node: GraphNode) => {
        const videoUrl = (node.data as any).videoUrl;
        if (videoUrl && videoUrl.trim()) {
            console.log(`  ✅ Nó com vídeo: ${node.data.label}`);
            path.push(node);
        } else {
            console.log(`  ⚠️ Nó SEM vídeo (pulando): ${node.data.label}`);
        }
    };

    addNodeIfHasVideo(startNode);

    while (currentNode && state.currentGraph) {
        const outgoingEdges = state.currentGraph.edges.filter(edge => edge.source === currentNode.id);

        if (outgoingEdges.length === 0) {
            console.log(`  🏁 Fim do caminho (nó final ou deadlock)`);
            break;
        }

        if (outgoingEdges.length > 1) {
            console.log(`  🔀 Próximo ponto de escolha encontrado`);
            break;
        }

        const nextNode = state.currentGraph.nodes.find(n => n.id === outgoingEdges[0].target);
        if (!nextNode) break;

        addNodeIfHasVideo(nextNode);
        currentNode = nextNode;

        if (currentNode.type === 'end') {
            console.log(`  🏁 Nó final encontrado: ${currentNode.data.label}`);
            break;
        }
    }

    console.log(`📦 Caminho calculado: ${path.length} nó(s) com vídeo`);
    return path;
}
