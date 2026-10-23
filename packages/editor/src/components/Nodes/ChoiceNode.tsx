import { Handle, Position } from '@xyflow/react';
import type { ChoiceNodeData } from '@ine/shared';


interface ChoiceNodeProps {
  data: ChoiceNodeData;
  selected?: boolean;
}

export function ChoiceNode({ data, selected }: ChoiceNodeProps) {
  return (
    <div className={`
      rounded-xl p-4 min-w-[160px] transition-all duration-200 bg-surface border
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
          🔀
        </div>
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${
          selected ? 'text-danger' : 'text-primary'
        }`}>
          Escolha
        </div>
      </div>

      <div className="text-sm font-semibold text-text">
        {data.label}
      </div>

      {data.timeout && (
        <div className="text-[11px] text-text-secondary mt-1">
          ⏱ Timeout: {data.timeout}s
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
