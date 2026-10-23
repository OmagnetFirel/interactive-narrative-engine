interface ToolbarProps {
  onAddNode: (type: 'video' | 'choice' | 'end') => void;
}

const addButtonClass =
  'flex items-center gap-3 px-4 py-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-copper/70 transition-all group text-left';

export function Toolbar({ onAddNode }: ToolbarProps) {
  return (
    <div className="panel-floating p-3 w-[240px]">
      <div className="text-sm font-semibold text-text-secondary mb-3 px-2">
        ➕ Adicionar Nó
      </div>

      <div className="flex flex-col gap-2">
        <button onClick={() => onAddNode('video')} className={addButtonClass}>
          <div className="w-8 h-8 flex items-center justify-center bg-copper/20 rounded-lg text-xl group-hover:scale-105 transition-transform">
            🎥
          </div>
          <div>
            <div className="text-sm font-semibold text-text">Vídeo</div>
            <div className="text-xs text-text-secondary">Cena com vídeo</div>
          </div>
        </button>

        <button onClick={() => onAddNode('choice')} className={addButtonClass}>
          <div className="w-8 h-8 flex items-center justify-center bg-copper/20 rounded-lg text-xl group-hover:scale-105 transition-transform">
            🔀
          </div>
          <div>
            <div className="text-sm font-semibold text-text">Escolha</div>
            <div className="text-xs text-text-secondary">Ponto de decisão</div>
          </div>
        </button>

        <button onClick={() => onAddNode('end')} className={addButtonClass}>
          <div className="w-8 h-8 flex items-center justify-center bg-copper/20 rounded-lg text-xl group-hover:scale-105 transition-transform">
            🏁
          </div>
          <div>
            <div className="text-sm font-semibold text-text">Final</div>
            <div className="text-xs text-text-secondary">Final da história</div>
          </div>
        </button>
      </div>
    </div>
  );
}
