import { Handle, Position } from '@xyflow/react';
import type { VideoNodeData } from '@ine/shared';


interface VideoNodeProps {
  data: VideoNodeData;
  selected?: boolean;
}

export function VideoNode({ data, selected }: VideoNodeProps) {
  return (
    <div className={`
      rounded-xl p-4 min-w-[180px] transition-all duration-200 bg-surface border
      ${selected
        ? 'border-danger shadow-node-selected'
        : 'border-border shadow-node'
      }
    `}>
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 flex items-center justify-center rounded-lg text-xl ${
          selected ? 'bg-danger/10' : 'bg-copper/12'
        }`}>
          🎥
        </div>
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${
          selected ? 'text-danger' : 'text-primary'
        }`}>
          Vídeo
        </div>
      </div>

      <div className="text-sm font-semibold text-text mb-1">
        {data.label}
      </div>

      {data.videoUrl && (
        <div className="text-[11px] text-primary mt-1.5 px-2 py-1 bg-copper/10 rounded inline-block">
          ✓ Vídeo configurado
        </div>
      )}

      {data.duration && (
        <div className="text-[11px] text-text-secondary mt-1">
          ⏱ {data.duration}s
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
