import type { PlayerState } from './types';

export const state: PlayerState = {
    currentGraph: null,
    currentNode: null,
    pathHistory: [],
    choicesShown: false,
    nextNodeQueued: null,
    hasChosenDuringVideo: false,
    choiceResolvedNodeId: null,
    stitchedPlaylistUrl: null,
    stitchedPrefetchSegmentIndex: -1,
    stitchedTransitionedFromIndex: -1,
    stitchedPath: [],
    sessionId: null,
    isWaitingForVideoEnd: false,
    virtualTimeline: [],
    currentSegmentIndex: 0,
    virtualTotalDuration: 0,
    isSeekingVirtual: false,
    timeoutId: null,
    controlsTimeout: null,
    sessionFinalizeRequested: false,
};

export function resetState(): void {
    state.pathHistory = [];
    state.stitchedPlaylistUrl = null;
    state.stitchedPath = [];
    state.sessionId = null;
    state.isWaitingForVideoEnd = false;
    state.nextNodeQueued = null;
    state.hasChosenDuringVideo = false;
    state.choiceResolvedNodeId = null;
    state.choicesShown = false;
    state.stitchedPrefetchSegmentIndex = -1;
    state.stitchedTransitionedFromIndex = -1;
    state.virtualTimeline = [];
    state.currentSegmentIndex = 0;
    state.virtualTotalDuration = 0;
    state.sessionFinalizeRequested = false;
}
