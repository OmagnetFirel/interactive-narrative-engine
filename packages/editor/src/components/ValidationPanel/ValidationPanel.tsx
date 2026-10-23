import { useMemo } from 'react';
import type { GraphNode, GraphEdge } from '@ine/shared';
import { validateGraph, getValidationSummary } from '@ine/shared';

interface ValidationPanelProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function ValidationPanel({ nodes, edges }: ValidationPanelProps) {
  const validation = useMemo(() => {
    return validateGraph(nodes, edges);
  }, [nodes, edges]);

  const summary = getValidationSummary(validation);

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text">
          🔍 Validação do Grafo
        </h3>
        <div className={`badge ${validation.valid ? 'badge-success' : 'badge-danger'}`}>
          {validation.valid ? '✓ Válido' : '✗ Inválido'}
        </div>
      </div>

      <div className="text-sm text-text-secondary">
        {summary}
      </div>

      {/* Erros */}
      {validation.errors.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-danger">
            ❌ Erros ({validation.errors.length})
          </div>
          <div className="space-y-2">
            {validation.errors.map((error, index) => (
              <div
                key={index}
                className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm"
              >
                <div className="font-medium text-danger">
                  {error.type.replace(/_/g, ' ')}
                </div>
                <div className="text-text-secondary mt-1">
                  {error.message}
                </div>
                {error.nodeId && (
                  <div className="text-xs text-text-secondary/80 mt-1">
                    ID: {error.nodeId}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Avisos */}
      {validation.warnings.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-accent">
            ⚠️ Avisos ({validation.warnings.length})
          </div>
          <div className="space-y-2">
            {validation.warnings.map((warning, index) => (
              <div
                key={index}
                className="p-3 bg-accent/10 border border-accent/30 rounded-lg text-sm"
              >
                <div className="font-medium text-accent">
                  {warning.type.replace(/_/g, ' ')}
                </div>
                <div className="text-text-secondary mt-1">
                  {warning.message}
                </div>
                {warning.nodeId && (
                  <div className="text-xs text-text-secondary/80 mt-1">
                    ID: {warning.nodeId}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sucesso */}
      {validation.valid && validation.warnings.length === 0 && (
        <div className="p-4 bg-secondary/10 border border-secondary/30 rounded-lg text-center">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-sm font-medium text-secondary">
            Grafo perfeito!
          </div>
          <div className="text-xs text-text-secondary mt-1">
            Sem erros ou avisos detectados
          </div>
        </div>
      )}
    </div>
  );
}
