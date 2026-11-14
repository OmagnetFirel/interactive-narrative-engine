import { useEffect, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  useStore,
  type EdgeProps,
} from '@xyflow/react';
import { IconPencil } from '@tabler/icons-react';

/**
 * Conexão entre cenas. Quando sai de uma bifurcação, o rótulo é o texto da
 * escolha que o aluno vê no player e pode ser editado direto aqui
 * (duplo clique, Enter salva, Esc cancela). Saídas únicas seguem sem botão,
 * então não mostram rótulo.
 */
export function ChoiceEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const isChoice = useStore((s) => s.edges.filter((e) => e.source === source).length > 1);
  const [editing, setEditing] = useState(false);
  const text = typeof label === 'string' ? label : '';
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    setDraft(text);
    setEditing(true);
  };

  const commit = () => {
    const value = draft.trim();
    setEdges((eds) =>
      eds.map((e) => (e.id === id ? { ...e, label: value, data: { ...e.data, label: value } } : e))
    );
    setEditing(false);
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {isChoice && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute pointer-events-auto"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditing(false);
                  e.stopPropagation();
                }}
                placeholder="Texto da escolha"
                className="choice-edge-input"
                maxLength={80}
              />
            ) : (
              <button
                type="button"
                onDoubleClick={startEditing}
                className={`choice-edge-label ${text ? '' : 'is-empty'} ${selected ? 'is-selected' : ''}`}
                title="Duplo clique para editar o texto da escolha"
              >
                {text || (
                  <span className="inline-flex items-center gap-1">
                    <IconPencil size={12} stroke={2} aria-hidden="true" />
                    texto da escolha
                  </span>
                )}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
