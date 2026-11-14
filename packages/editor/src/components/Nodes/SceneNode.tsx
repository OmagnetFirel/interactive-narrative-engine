import { Handle, Position, useNodeConnections, type NodeProps } from '@xyflow/react';
import type { SceneNodeData } from '@ine/shared';
import { VideoPreview } from '../VideoPreview/VideoPreview';
import { IconArrowsSplit2, IconFlag, IconPlayerPlay, IconVideoOff } from '@tabler/icons-react';

/**
 * Nó único do editor: a cena. Os selos Início / Bifurcação / Final são
 * calculados a partir das conexões, o autor não precisa marcá-los.
 */
export function SceneNode({ id, data, selected }: NodeProps) {
  const scene = data as unknown as SceneNodeData;
  const incoming = useNodeConnections({ handleType: 'target' });
  const outgoing = useNodeConnections({ handleType: 'source' });

  const isStart = incoming.length === 0;
  const isBranch = outgoing.length > 1;
  const isEnd = outgoing.length === 0;

  return (
    <div
      className={`rounded-xl p-3 w-[220px] transition-all duration-200 bg-surface border ${
        selected ? 'border-danger shadow-node-selected' : 'border-border shadow-node'
      }`}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex flex-wrap items-center gap-1 mb-2 min-h-[20px]">
        {isStart && <span className="scene-badge scene-badge-start"><IconPlayerPlay size={11} stroke={2.25} aria-hidden="true" />Início</span>}
        {isBranch && <span className="scene-badge scene-badge-branch"><IconArrowsSplit2 size={11} stroke={2.25} aria-hidden="true" />{outgoing.length} escolhas</span>}
        {isEnd && <span className="scene-badge scene-badge-end"><IconFlag size={11} stroke={2.25} aria-hidden="true" />Final</span>}
      </div>

      <div className="text-sm font-semibold text-text mb-2 leading-snug break-words">{scene.label}</div>

      {scene.videoUrl ? (
        <VideoPreview id={id} videoUrl={scene.videoUrl} thumbnail={scene.thumbnail} duration={scene.duration} />
      ) : (
        <div className="w-full aspect-video rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1 text-[11px] text-text-secondary text-center px-2">
          <IconVideoOff size={20} stroke={1.5} aria-hidden="true" />
          Sem vídeo — selecione a cena para enviar
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
