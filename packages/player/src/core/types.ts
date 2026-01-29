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
    stitchedPlaylistUrl: string | null;
    stitchedPath: GraphNode[];
    isWaitingForVideoEnd: boolean;
    virtualTimeline: VideoSegment[];
    currentSegmentIndex: number;
    virtualTotalDuration: number;
    isSeekingVirtual: boolean;
    timeoutId: number | null;
    controlsTimeout: number | null;
}

export type { InteractiveGraph, GraphNode, GraphEdge };
