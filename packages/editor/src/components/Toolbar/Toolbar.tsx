interface ToolbarProps {
  onAddNode: (type: 'video' | 'choice' | 'end') => void;
}

export function Toolbar({ onAddNode }: ToolbarProps) {
  return (
    <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-gray-200 p-3 z-10">
      <div className="text-sm font-semibold text-gray-700 mb-3 px-2">
        ➕ Adicionar Nó
      </div>
      
      <div className="flex flex-col gap-2">
        {/* Botão Vídeo */}
        <button
          onClick={() => onAddNode('video')}
          className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-blue-200 
                     bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-all group"
        >
          <div className="w-8 h-8 flex items-center justify-center bg-node-video rounded-lg text-xl
                          group-hover:scale-110 transition-transform">
            🎥
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-gray-900">Vídeo</div>
            <div className="text-xs text-gray-600">Cena com vídeo</div>
          </div>
        </button>

        {/* Botão Escolha */}
        <button
          onClick={() => onAddNode('choice')}
          className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-orange-200 
                     bg-orange-50 hover:bg-orange-100 hover:border-orange-400 transition-all group"
        >
          <div className="w-8 h-8 flex items-center justify-center bg-node-choice rounded-lg text-xl
                          group-hover:scale-110 transition-transform">
            🔀
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-gray-900">Escolha</div>
            <div className="text-xs text-gray-600">Ponto de decisão</div>
          </div>
        </button>

        {/* Botão Final */}
        <button
          onClick={() => onAddNode('end')}
          className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-red-200 
                     bg-red-50 hover:bg-red-100 hover:border-red-400 transition-all group"
        >
          <div className="w-8 h-8 flex items-center justify-center bg-node-end rounded-lg text-xl
                          group-hover:scale-110 transition-transform">
            🏁
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-gray-900">Final</div>
            <div className="text-xs text-gray-600">Final da história</div>
          </div>
        </button>
      </div>
    </div>
  );
}
