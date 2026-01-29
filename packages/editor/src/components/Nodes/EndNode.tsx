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
        return 'bg-green-100 border-green-500 text-green-700';
      case 'bad':
        return 'bg-red-100 border-red-500 text-red-700';
      default:
        return 'bg-gray-100 border-gray-500 text-gray-700';
    }
  };

  return (
    <div className={`
      rounded-xl p-4 min-w-[160px] transition-all duration-200
      ${selected 
        ? 'bg-white border-2 border-node-end shadow-[0_4px_20px_rgba(244,67,54,0.3)]' 
        : 'bg-red-50 border-2 border-node-end shadow-node'
      }
    `}>
      <Handle type="target" position={Position.Top} />
      
      {/* Ícone e tipo */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 flex items-center justify-center bg-node-end rounded-lg text-xl">
          🏁
        </div>
        <div className="text-[11px] text-gray-600 font-semibold uppercase tracking-wider">
          Final
        </div>
      </div>

      {/* Label */}
      <div className="text-sm font-semibold text-gray-900 mb-1">
        {data.label}
      </div>

      {/* Badge de final */}
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
