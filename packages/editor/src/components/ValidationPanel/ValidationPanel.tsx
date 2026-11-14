import { useMemo } from 'react';
import { IconAlertCircle, IconAlertTriangle, IconCircleCheck, IconListCheck } from '@tabler/icons-react';
import type { GraphNode, GraphEdge, ValidationError, ValidationWarning } from '@ine/shared';
import { validateGraph, getBlockingErrors } from '@ine/shared';

interface ValidationPanelProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Títulos legíveis para cada tipo de problema (os tipos são identificadores internos). */
const TITLES: Record<ValidationError['type'] | ValidationWarning['type'], string> = {
  empty_graph: 'Projeto vazio',
  missing_start: 'Sem cena inicial',
  orphan_node: 'Cena isolada',
  unreachable_node: 'Cena inalcançável',
  invalid_edge: 'Conexão inválida',
  no_branch: 'Sem bifurcação',
  multiple_starts: 'Mais de uma cena inicial',
  missing_video: 'Cena sem vídeo',
  missing_label: 'Escolha sem texto',
  no_reachable_end: 'Nenhum final alcançável',
  cycle: 'Ciclo entre cenas',
  choice_timing: 'Escolhas cedo demais',
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function ValidationPanel({ nodes, edges }: ValidationPanelProps) {
  const validation = useMemo(() => validateGraph(nodes, edges), [nodes, edges]);
  const blocking = getBlockingErrors(validation);
  const errorCount = validation.errors.length;
  const warningCount = validation.warnings.length;

  const summary =
    errorCount === 0 && warningCount === 0
      ? 'Nenhum problema encontrado.'
      : [
          errorCount > 0 ? plural(errorCount, 'erro', 'erros') : null,
          warningCount > 0 ? plural(warningCount, 'aviso', 'avisos') : null,
        ]
          .filter(Boolean)
          .join(' e ') + (blocking.length > 0 ? ' · o projeto ainda não pode ser salvo.' : '.');

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text flex items-center gap-2">
          <IconListCheck size={20} stroke={1.75} aria-hidden="true" />
          Validação
        </h3>
        <div className={`badge ${validation.valid ? 'badge-success' : 'badge-danger'}`}>
          {validation.valid ? 'Válido' : 'Com erros'}
        </div>
      </div>

      <div className="text-sm text-text-secondary">{summary}</div>

      {errorCount > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-danger flex items-center gap-1.5">
            <IconAlertCircle size={16} stroke={2} aria-hidden="true" />
            Erros ({errorCount})
          </div>
          {validation.errors.map((error, index) => (
            <div key={index} className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm">
              <div className="font-medium text-danger">{TITLES[error.type] ?? error.type}</div>
              <div className="text-text-secondary mt-1">{error.message}</div>
            </div>
          ))}
        </div>
      )}

      {warningCount > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-accent flex items-center gap-1.5">
            <IconAlertTriangle size={16} stroke={2} aria-hidden="true" />
            Avisos ({warningCount})
          </div>
          {validation.warnings.map((warning, index) => (
            <div key={index} className="p-3 bg-accent/10 border border-accent/30 rounded-lg text-sm">
              <div className="font-medium text-accent">{TITLES[warning.type] ?? warning.type}</div>
              <div className="text-text-secondary mt-1">{warning.message}</div>
            </div>
          ))}
        </div>
      )}

      {validation.valid && warningCount === 0 && (
        <div className="p-4 bg-secondary/10 border border-secondary/30 rounded-lg text-center">
          <IconCircleCheck size={36} stroke={1.5} className="mx-auto mb-2 text-secondary" aria-hidden="true" />
          <div className="text-sm font-medium text-secondary">Tudo certo</div>
          <div className="text-xs text-text-secondary mt-1">A aula está pronta para ser salva e compartilhada.</div>
        </div>
      )}
    </div>
  );
}
