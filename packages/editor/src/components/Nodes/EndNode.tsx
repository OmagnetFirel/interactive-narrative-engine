import { Handle, Position } from '@xyflow/react';
import type { EndNodeData } from '@ine/shared';


interface EndNodeProps {
  data: EndNodeData;
  selected?: boolean;
}

export function EndNode({ data, selected }: EndNodeProps) {
  const getEndingColor = () => {
    switch (data.endingType) {
      case 'good':
        return 'bg-copper/10 border border-copper/30 text-primary';
      case 'bad':
        return 'bg-danger/10 border border-danger/40 text-danger';
      default:
        return 'bg-bg border border-border text-text-secondary';
    }
  };

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
          🏁
        </div>
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${
          selected ? 'text-danger' : 'text-primary'
        }`}>
          Final
        </div>
      </div>

      <div className="text-sm font-semibold text-text mb-1">
        {data.label}
      </div>

      <div className={`text-[11px] mt-1.5 px-2 py-1 rounded inline-block font-semibold ${getEndingColor()}`}>
        {data.endingType === 'good' && '✓ FINAL FELIZ'}
        {data.endingType === 'bad' && '✗ FINAL TRISTE'}
        {!data.endingType && 'FINAL DA HISTÓRIA'}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="opacity-30"
      />
    </div>
  );
}
