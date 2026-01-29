import type { PlayerState } from './types';

export const state: PlayerState = {
    currentGraph: null,
    currentNode: null,
    pathHistory: [],
    choicesShown: false,
    nextNodeQueued: null,
    hasChosenDuringVideo: false,
    stitchedPlaylistUrl: null,
    stitchedPath: [],
    isWaitingForVideoEnd: false,
    virtualTimeline: [],
    currentSegmentIndex: 0,
    virtualTotalDuration: 0,
    isSeekingVirtual: false,
    timeoutId: null,
    controlsTimeout: null,
};

export function resetState(): void {
    state.pathHistory = [];
    state.stitchedPlaylistUrl = null;
    state.stitchedPath = [];
    state.isWaitingForVideoEnd = false;
    state.nextNodeQueued = null;
    state.hasChosenDuringVideo = false;
    state.choicesShown = false;
    state.virtualTimeline = [];
    state.currentSegmentIndex = 0;
    state.virtualTotalDuration = 0;
}
