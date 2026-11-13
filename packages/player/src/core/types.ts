import type { InteractiveGraph, GraphNode, GraphEdge } from '@ine/shared';

export interface VideoSegment {
    node: GraphNode;
    startTime: number;
    duration: number;
}

export interface StitchedPlaylist {
    url: string;
    path: GraphNode[];
}

export interface PlayerState {
    currentGraph: InteractiveGraph | null;
    currentNode: GraphNode | null;
    pathHistory: string[];
    choicesShown: boolean;
    nextNodeQueued: GraphNode | null;
    hasChosenDuringVideo: boolean;
    /** Nó em que o espectador já confirmou escolha (evita overlay reaparecer no mesmo segmento). */
    choiceResolvedNodeId: string | null;
    stitchedPlaylistUrl: string | null;
    /** Índice do segmento para o qual já fizemos prefetch HLS. */
    stitchedPrefetchSegmentIndex: number;
    /** Índice do segmento a partir do qual já transicionamos antecipadamente. */
    stitchedTransitionedFromIndex: number;
    stitchedPath: GraphNode[];
    sessionId: string | null;
    isWaitingForVideoEnd: boolean;
    virtualTimeline: VideoSegment[];
    currentSegmentIndex: number;
    virtualTotalDuration: number;
    isSeekingVirtual: boolean;
    timeoutId: number | null;
    controlsTimeout: number | null;
    sessionFinalizeRequested: boolean;
    /** Escolhas na tela, vídeo pausado esperando o aluno. */
    waitingForChoice: boolean;
    /** Aula encerrada: nenhum play() deve retomar o vídeo. */
    playbackFinished: boolean;
}

export type { InteractiveGraph, GraphNode, GraphEdge };
