import { Handle, Position } from '@xyflow/react';
import type { VideoNodeData } from '@ine/shared';


interface VideoNodeProps {
  data: VideoNodeData;
  selected?: boolean;
}

export function VideoNode({ data, selected }: VideoNodeProps) {
  return (
    <div className={`
      rounded-xl p-4 min-w-[180px] transition-all duration-200
      ${selected 
        ? 'bg-white border-2 border-node-video shadow-node-selected' 
        : 'bg-blue-50 border-2 border-node-video shadow-node'
      }
    `}>
      <Handle type="target" position={Position.Top} />
      
      {/* Ícone e tipo */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 flex items-center justify-center bg-node-video rounded-lg text-xl">
          🎥
        </div>
        <div className="text-[11px] text-gray-600 font-semibold uppercase tracking-wider">
          Vídeo
        </div>
      </div>

      {/* Label */}
      <div className="text-sm font-semibold text-gray-900 mb-1">
        {data.label}
      </div>

      {/* Info adicional */}
      {data.videoUrl && (
        <div className="text-[11px] text-green-700 mt-1.5 px-2 py-1 bg-green-100 rounded inline-block">
          ✓ Vídeo configurado
        </div>
      )}

      {data.duration && (
        <div className="text-[11px] text-gray-600 mt-1">
          ⏱ {data.duration}s
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
