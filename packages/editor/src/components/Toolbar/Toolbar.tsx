import { IconVideoPlus } from '@tabler/icons-react';

interface ToolbarProps {
  onAddNode: () => void;
}

export function Toolbar({ onAddNode }: ToolbarProps) {
  return (
    <div className="panel-floating p-3 w-[240px]">
      <button
        onClick={onAddNode}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-copper/70 transition-all group text-left"
      >
        <div className="w-9 h-9 flex items-center justify-center bg-copper/20 text-copper-light rounded-lg group-hover:scale-105 transition-transform">
          <IconVideoPlus size={20} stroke={1.75} aria-hidden="true" />
        </div>
        <div>
          <div className="text-sm font-semibold text-text">Adicionar cena</div>
          <div className="text-xs text-text-secondary">Um trecho de vídeo da aula</div>
        </div>
      </button>
      <p className="text-[11px] leading-snug text-text-secondary mt-3 px-1">
        Ligue as cenas arrastando da bolinha de baixo para a de cima. Duas ou mais saídas viram uma escolha.
      </p>
    </div>
  );
}
