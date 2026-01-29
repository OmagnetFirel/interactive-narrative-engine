import { Handle, Position } from '@xyflow/react';
import type { ChoiceNodeData } from '@ine/shared';


interface ChoiceNodeProps {
  data: ChoiceNodeData;
  selected?: boolean;
}

export function ChoiceNode({ data, selected }: ChoiceNodeProps) {
  return (
    <div className={`
      rounded-xl p-4 min-w-[160px] transition-all duration-200
      ${selected 
        ? 'bg-white border-2 border-node-choice shadow-[0_4px_20px_rgba(255,152,0,0.3)]' 
        : 'bg-orange-50 border-2 border-node-choice shadow-node'
      }
    `}>
      <Handle type="target" position={Position.Top} />
      
      {/* Ícone e tipo */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 flex items-center justify-center bg-node-choice rounded-lg text-xl">
          🔀
        </div>
        <div className="text-[11px] text-gray-600 font-semibold uppercase tracking-wider">
          Escolha
        </div>
      </div>

      {/* Label */}
      <div className="text-sm font-semibold text-gray-900">
        {data.label}
      </div>

      {data.timeout && (
        <div className="text-[11px] text-orange-600 mt-1">
          ⏱ Timeout: {data.timeout}s
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
