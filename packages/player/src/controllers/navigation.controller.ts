import type { GraphNode, InteractiveGraph } from '../core/types';
import { state, resetState } from '../core/state';
import { DEFAULT_CHOICE_BEFORE_END } from '../core/config';
import { dom } from '../ui/dom-elements';
import { hideChoices, hideEnd, showEndOverlay } from '../ui/overlay.ui';
import { videoController } from './video.controller';
import { showChoicesDuringVideo } from './choices.controller';
import { hlsService } from '../services/hls.service';
import { timelineService } from '../services/timeline.service';
import { analytics } from '../services/analytics.service';

export function findInitialNode(graph: InteractiveGraph): GraphNode | null {
    for (const node of graph.nodes) {
        const hasIncoming = graph.edges.some(edge => edge.target === node.id);
        if (!hasIncoming && node.type === 'video') {
            return node;
        }
    }
    return graph.nodes[0] || null;
}

export function navigateToNode(node: GraphNode, seekToTime?: number): void {
    console.log(`\n📍 ===== NAVEGANDO PARA: ${node.data.label} ${seekToTime !== undefined ? `(seek: ${seekToTime})` : ''} =====`);
    console.log(`📊 Estado atual - Timeline length: ${state.virtualTimeline.length}, Stitched path: ${state.stitchedPath.length}`);

    state.currentNode = node;

    if (!state.isSeekingVirtual) {
        state.pathHistory.push(node.id);
    }

    state.choicesShown = false;

    if (seekToTime === undefined) {
        state.nextNodeQueued = null;
        state.hasChosenDuringVideo = false;
        state.isWaitingForVideoEnd = false;

        // ✅ CORREÇÃO: Sempre calcular caminho sequencial se for vídeo E não estiver em stitched mode
        if (node.type === 'video' && !state.stitchedPlaylistUrl) {
            console.log('🔍 Verificando se há caminho sequencial...');
            const sequentialPath = calculateSequentialPath(node);

            if (sequentialPath.length > 1) {
                console.log(`🎬 Detectado caminho sequencial com ${sequentialPath.length} vídeos, criando playlist stitched...`);
                loadSequentialVideos(sequentialPath);
                return; // ✅ IMPORTANTE: Não continuar execução normal
            } else {
                console.log(`📹 Apenas 1 vídeo no caminho, reprodução normal`);
                // Construir timeline com apenas este vídeo
                timelineService.buildVirtualTimeline([node]);
            }
        }
    }

    updateNodeInfo();
    hideChoices();
    hideEnd();

    if (node.type === 'video') {
        videoController.playVideo(node, seekToTime);
    } else if (node.type === 'choice') {
        handleChoiceNode(node);
    } else if (node.type === 'end') {
        handleEndNode(node);
    }

    if (seekToTime !== undefined) {
        state.isSeekingVirtual = false;
    }
}

/**
 * ✅ CORREÇÃO: Calcular caminho sequencial incluindo ESCOLHAS COM VÍDEO
 */
function calculateSequentialPath(startNode: GraphNode): GraphNode[] {
    const path: GraphNode[] = [];
    let currentNode = startNode;

    console.log('\n🔍 Calculando caminho sequencial...');

    while (currentNode && state.currentGraph) {
        // Adicionar nó atual se tiver vídeo
        const videoUrl = (currentNode.data as any).videoUrl;
        if (videoUrl && videoUrl.trim()) {
            console.log(`  ✅ Adicionando: ${currentNode.data.label} (${currentNode.type})`);
            path.push(currentNode);
        } else {
            console.log(`  ⚠️ Pulando (sem vídeo): ${currentNode.data.label}`);
        }

        // Buscar próximos nós
        const outgoingEdges = state.currentGraph.edges.filter(
            edge => edge.source === currentNode.id
        );

        // ✅ CORREÇÃO: Para apenas se:
        // 1. Não há edges (fim do caminho) 
        // 2. Nó final
        // 3. Múltiplas escolhas E o nó atual NÃO tem vídeo (escolha interativa real)

        if (outgoingEdges.length === 0 || currentNode.type === 'end') {
            console.log(`  🛑 Fim do caminho: ${currentNode.data.label}`);
            break;
        }

        // ✅ Se é nó de ESCOLHA COM vídeo, adiciona mas para aqui
        // (o vídeo vai tocar até o final e mostrar as escolhas)
        if (currentNode.type === 'choice' && videoUrl && videoUrl.trim()) {
            console.log(`  🔀 Nó de escolha COM vídeo, parando caminho sequencial`);
            break;
        }

        // ✅ Se tem múltiplas escolhas SEM vídeo, parar
        if (outgoingEdges.length > 1) {
            console.log(`  🔀 Múltiplas escolhas detectadas, parando`);
            break;
        }

        // Se só tem 1 edge, continuar seguindo
        const nextNode = state.currentGraph.nodes.find(n => n.id === outgoingEdges[0].target);
        if (!nextNode) break;

        currentNode = nextNode;
    }

    console.log(`📦 Caminho calculado: ${path.length} vídeo(s) em sequência`);
    return path;
}

/**
 * ✅ NOVO: Carregar vídeos sequenciais com stitching
 */
async function loadSequentialVideos(sequentialPath: GraphNode[]): Promise<void> {
    try {
        // Importar apiService dinamicamente para evitar circular dependency
        const { apiService } = await import('../services/api.service');

        // Criar playlist stitched
        const stitched = await apiService.preloadStitchedPlaylist(sequentialPath);

        if (stitched) {
            state.stitchedPlaylistUrl = stitched.url;
            state.stitchedPath = stitched.path;

            // Construir timeline com todos os vídeos
            timelineService.buildVirtualTimeline(state.stitchedPath);

            // Atualizar currentNode para o primeiro
            state.currentNode = state.stitchedPath[0];
            updateNodeInfo();

            // Carregar playlist stitched
            console.log(`🎬 Carregando playlist stitched com ${sequentialPath.length} vídeos...`);
            await hlsService.loadStitchedPlaylist(state.stitchedPlaylistUrl);

        } else {
            console.warn('⚠️ Falha ao criar playlist stitched, usando reprodução normal');
            timelineService.buildVirtualTimeline([sequentialPath[0]]);
            videoController.playVideo(sequentialPath[0]);
        }

    } catch (error) {
        console.error('❌ Erro ao carregar vídeos sequenciais:', error);
        // Fallback: reproduzir apenas o primeiro vídeo
        timelineService.buildVirtualTimeline([sequentialPath[0]]);
        videoController.playVideo(sequentialPath[0]);
    }
}

export function handleTimeUpdate(): void {
    if (!state.currentNode || !state.currentGraph || state.choicesShown) return;

    const currentTime = dom.video.currentTime;
    const duration = dom.video.duration;

    if (!duration || isNaN(duration)) return;

    const data = state.currentNode.data as any;
    const choiceBeforeEnd = data.choiceBeforeEnd || DEFAULT_CHOICE_BEFORE_END;
    const showChoicesAt = duration - choiceBeforeEnd;

    const outgoingEdges = state.currentGraph.edges.filter(
        edge => edge.source === state.currentNode!.id
    );

    if (outgoingEdges.length > 1 && currentTime >= showChoicesAt && !state.choicesShown) {
        console.log(`\n🕐 ===== MOMENTO DE ESCOLHA =====`);
        showChoicesDuringVideo(outgoingEdges);
    }
}

export function handleVideoEnded(): void {
    console.log(`\n🏁 ===== VÍDEO TERMINOU =====`);
    console.log(`📊 Estado: stitchedPath=${state.stitchedPath.length}, stitchedUrl=${!!state.stitchedPlaylistUrl}, currentSegment=${state.currentSegmentIndex}`);

    // ✅ Rastrear fim do vídeo
    analytics.track({
        type: 'ended',
        nodeId: state.currentNode?.id
    });

    // ✅ Em modo stitched (Bandersnatch-style), verificar se é fim real
    if (state.stitchedPath.length > 0 && state.stitchedPlaylistUrl) {
        const videoTime = dom.video.currentTime;
        const isRealEnd = videoTime >= state.virtualTotalDuration - 0.5;

        if (!isRealEnd) {
            // Ainda não acabou a playlist, continuar
            console.log(`⏩ Playlist ainda não terminou (${videoTime.toFixed(2)}s / ${state.virtualTotalDuration.toFixed(2)}s)`);

            if (dom.video.paused) {
                dom.video.play().catch(() => { });
            }
            return;
        }

        console.log('✅ Playlist stitched concluída');

        // Pegar último nó para verificar próximos passos
        const lastNode = state.virtualTimeline[state.virtualTimeline.length - 1]?.node || state.currentNode;

        // ✅ Verificar se há próximo nó após a playlist
        if (lastNode && state.currentGraph) {
            const outgoingEdges = state.currentGraph.edges.filter(
                edge => edge.source === lastNode.id
            );

            if (outgoingEdges.length > 1) {
                // Múltiplas escolhas - mostrar UI
                console.log('🔀 Múltiplas escolhas no fim da playlist');
                state.currentNode = lastNode;
                showChoicesDuringVideo(outgoingEdges);
                return;
            } else if (outgoingEdges.length === 1) {
                // Uma única saída - continuar automaticamente
                const nextNode = state.currentGraph.nodes.find(n => n.id === outgoingEdges[0].target);
                if (nextNode) {
                    console.log(`➡️ Continuando para: ${nextNode.data.label}`);
                    navigateToNode(nextNode);
                    return;
                }
            } else {
                // Fim da narrativa
                console.log('🏁 Fim da narrativa');
                handleEndNode(lastNode);
                return;
            }
        }
    }

    // ✅ Modo normal (sem stitching) - processar próximo nó
    if (!state.currentGraph || !state.currentNode) {
        console.log('⚠️ Sem grafo ou nó atual');
        return;
    }

    const outgoingEdges = state.currentGraph.edges.filter(
        edge => edge.source === state.currentNode?.id
    ) || [];

    console.log(`🔍 Processando próximo nó (${outgoingEdges.length} edges)`);

    if (outgoingEdges.length === 0) {
        console.log('🏁 Fim da narrativa (sem edges)');
        handleEndNode(state.currentNode);
    } else if (outgoingEdges.length === 1) {
        const nextNode = state.currentGraph.nodes.find(n => n.id === outgoingEdges[0].target);
        if (nextNode) {
            console.log(`➡️ Próximo nó: ${nextNode.data.label}`);
            navigateToNode(nextNode);
        }
    } else if (!state.hasChosenDuringVideo) {
        // Múltiplas escolhas mas usuário não escolheu - usar primeira
        console.log('🔀 Usando primeira opção (timeout)');
        const nextNode = state.currentGraph.nodes.find(n => n.id === outgoingEdges[0].target);
        if (nextNode) {
            navigateToNode(nextNode);
        }
    }
}

export function handleRestart(): void {
    if (state.currentGraph) {
        const initialNode = findInitialNode(state.currentGraph);
        if (initialNode) {
            resetState();
            navigateToNode(initialNode);
        }
    }
}

function handleChoiceNode(node: GraphNode): void {
    const videoUrl = (node.data as any).videoUrl;

    if (videoUrl && videoUrl.trim()) {
        // Tem vídeo de transição, reproduzir normalmente
        videoController.playVideo(node);
    } else {
        // ✅ CORREÇÃO: Sem vídeo de transição
        const outgoingEdges = state.currentGraph!.edges.filter(edge => edge.source === node.id);

        console.log(`🔀 Nó de escolha sem vídeo: ${node.data.label} (${outgoingEdges.length} opções)`);

        if (outgoingEdges.length === 0) {
            console.log('⚠️ Nó de escolha sem edges, tratando como fim');
            handleEndNode(node);
        } else if (outgoingEdges.length === 1) {
            // ✅ Apenas 1 opção: pular automaticamente para o próximo nó
            console.log('➡️ Apenas 1 opção, pulando automaticamente...');
            const nextNode = state.currentGraph!.nodes.find(n => n.id === outgoingEdges[0].target);
            if (nextNode) {
                navigateToNode(nextNode);
            }
        } else {
            // Múltiplas opções: mostrar escolhas imediatamente
            console.log('🔀 Múltiplas opções, mostrando escolhas');
            showChoicesDuringVideo(outgoingEdges);
        }
    }
}

function handleEndNode(node: GraphNode): void {
    const videoUrl = (node.data as any).videoUrl;

    if (videoUrl) {
        videoController.playVideo(node);
        dom.video.addEventListener('ended', () => showEndOverlay(node), { once: true });
    } else {
        dom.video.pause();
        showEndOverlay(node);
    }
}

function updateNodeInfo(): void {
    dom.currentNodeSpan.textContent = state.currentNode?.data.label || '';
    dom.pathHistorySpan.textContent = state.pathHistory
        .map(id => {
            const n = state.currentGraph?.nodes.find(n => n.id === id);
            return n?.data.label || id.slice(0, 8);
        })
        .join(' → ');
}
