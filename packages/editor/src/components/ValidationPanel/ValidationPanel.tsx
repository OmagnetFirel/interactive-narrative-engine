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
        <h3 className="text-lg font-semibold text-gray-900">
          🔍 Validação do Grafo
        </h3>
        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
          validation.valid 
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
        }`}>
          {validation.valid ? '✓ Válido' : '✗ Inválido'}
        </div>
      </div>

      <div className="text-sm text-gray-600">
        {summary}
      </div>

      {/* Erros */}
      {validation.errors.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-red-700">
            ❌ Erros ({validation.errors.length})
          </div>
          <div className="space-y-2">
            {validation.errors.map((error, index) => (
              <div 
                key={index}
                className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm"
              >
                <div className="font-medium text-red-800">
                  {error.type.replace(/_/g, ' ')}
                </div>
                <div className="text-red-700 mt-1">
                  {error.message}
                </div>
                {error.nodeId && (
                  <div className="text-xs text-red-600 mt-1">
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
          <div className="text-sm font-semibold text-yellow-700">
            ⚠️ Avisos ({validation.warnings.length})
          </div>
          <div className="space-y-2">
            {validation.warnings.map((warning, index) => (
              <div 
                key={index}
                className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm"
              >
                <div className="font-medium text-yellow-800">
                  {warning.type.replace(/_/g, ' ')}
                </div>
                <div className="text-yellow-700 mt-1">
                  {warning.message}
                </div>
                {warning.nodeId && (
                  <div className="text-xs text-yellow-600 mt-1">
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
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-sm font-medium text-green-800">
            Grafo perfeito!
          </div>
          <div className="text-xs text-green-700 mt-1">
            Sem erros ou avisos detectados
          </div>
        </div>
      )}
    </div>
  );
}
