/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { VideoNodeData, ChoiceNodeData, EndNodeData } from '@ine/shared';
import { VideoUploadModal } from '../VideoUpload/VideoUploadModal';

interface PropertiesPanelProps {
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  onUpdateNode: (nodeId: string, data: Partial<VideoNodeData | ChoiceNodeData | EndNodeData>) => void;
  onUpdateEdge: (edgeId: string, label: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

export function PropertiesPanel({
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onUpdateEdge,
  onDeleteNode,
  onDeleteEdge,
}: PropertiesPanelProps) {
  // Estados locais
  const [localLabel, setLocalLabel] = useState('');
  const [localVideoUrl, setLocalVideoUrl] = useState('');
  const [localDuration, setLocalDuration] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localTimeout, setLocalTimeout] = useState('');
  const [localEndingType, setLocalEndingType] = useState<'good' | 'bad' | 'neutral'>('neutral');
  const [localEdgeLabel, setLocalEdgeLabel] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // ✅ NOVO: Estado para choiceBeforeEnd
  const [localChoiceBeforeEnd, setLocalChoiceBeforeEnd] = useState('7');

  // Sincronizar com o nó selecionado
  useEffect(() => {
    if (selectedNode) {
      const data = selectedNode.data as Record<string, unknown>;
      // Sincroniza o formulário local quando a seleção externa muda.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalLabel((data.label as string) || '');

      if (selectedNode.type === 'video') {
        const videoData = data as unknown as VideoNodeData;
        setLocalVideoUrl(videoData.videoUrl || '');
        setLocalDuration(videoData.duration?.toString() || '');
        setLocalDescription(videoData.description || '');
        setLocalChoiceBeforeEnd(videoData.choiceBeforeEnd?.toString() || '7'); // ✅ NOVO
      } else if (selectedNode.type === 'choice') {
        const choiceData = data as unknown as ChoiceNodeData;
        setLocalTimeout(choiceData.timeout?.toString() || '');
        setLocalDescription(choiceData.description || '');
        setLocalVideoUrl(choiceData.videoUrl || ''); // ✅ Escolha pode ter vídeo
        setLocalDuration(choiceData.duration?.toString() || '');
        setLocalChoiceBeforeEnd(choiceData.choiceBeforeEnd?.toString() || '7'); // ✅ Escolha com vídeo também
      } else if (selectedNode.type === 'end') {
        const endData = data as unknown as EndNodeData;
        setLocalEndingType(endData.endingType || 'neutral');
        setLocalDescription(endData.description || '');
        setLocalVideoUrl(endData.videoUrl || ''); // ✅ Final pode ter vídeo
        setLocalDuration(endData.duration?.toString() || '');
      }
    } else if (selectedEdge) {
      setLocalEdgeLabel(String(selectedEdge.label || ''));
    }
  }, [selectedNode, selectedEdge]);

  // Handlers de blur
  const handleLabelBlur = () => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { label: localLabel });
    }
  };

  const handleVideoUrlBlur = () => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { videoUrl: localVideoUrl });
    }
  };

  const handleDurationBlur = () => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, {
        duration: localDuration ? Number(localDuration) : undefined,
      });
    }
  };

  const handleDescriptionBlur = () => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { description: localDescription });
    }
  };

  const handleTimeoutBlur = () => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, {
        timeout: localTimeout ? Number(localTimeout) : undefined,
      });
    }
  };

  // ✅ NOVO: Handler para choiceBeforeEnd
  const handleChoiceBeforeEndBlur = () => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, {
        choiceBeforeEnd: localChoiceBeforeEnd ? Number(localChoiceBeforeEnd) : 7,
      });
    }
  };

  const handleEndingTypeChange = (value: 'good' | 'bad' | 'neutral') => {
    setLocalEndingType(value);
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { endingType: value });
    }
  };

  const handleEdgeLabelBlur = () => {
    if (selectedEdge) {
      onUpdateEdge(selectedEdge.id, localEdgeLabel);
    }
  };

  const handleVideoUploadComplete = (hlsUrl: string, _videoId: string, metadata: any) => {
    if (selectedNode) {
      setLocalVideoUrl(hlsUrl);
      setLocalDuration(metadata.duration?.toString() || '');
      onUpdateNode(selectedNode.id, {
        videoUrl: hlsUrl,
        duration: metadata.duration,
      });
    }
    setIsUploadModalOpen(false);
  };

  // Se nada está selecionado
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="p-6 text-center text-text-secondary">
        <div className="text-4xl mb-3">👆</div>
        <div className="text-sm font-medium text-text">Nenhum elemento selecionado</div>
        <div className="text-xs mt-1">Clique em um nó ou conexão para editar</div>
      </div>
    );
  }

  // Se um NÓ está selecionado
  if (selectedNode) {
    const nodeType = selectedNode.type;

    return (
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text">
            {nodeType === 'video' && '🎥 Nó de Vídeo'}
            {nodeType === 'choice' && '🔀 Nó de Escolha'}
            {nodeType === 'end' && '🏁 Nó Final'}
          </h3>
          <button
            onClick={() => onDeleteNode(selectedNode.id)}
            className="px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 rounded-lg transition-colors"
          >
            🗑 Deletar
          </button>
        </div>

        {/* Label (comum a todos) */}
        <div>
          <label className="field-label">Nome do Nó</label>
          <input
            type="text"
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            onBlur={handleLabelBlur}
            className="field-input"
            placeholder="Digite o nome..."
          />
        </div>

        {/* Campos específicos para NÓ DE VÍDEO */}
        {nodeType === 'video' && (
          <>
            <div>
              <label className="field-label">URL do Vídeo</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={localVideoUrl}
                  onChange={(e) => setLocalVideoUrl(e.target.value)}
                  onBlur={handleVideoUrlBlur}
                  className="field-input flex-1"
                  placeholder="https://example.com/video.m3u8"
                />
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-3 py-2 text-sm font-medium text-primary bg-primary/15 hover:bg-primary/25 border border-primary/30 rounded-lg transition-colors flex items-center gap-1"
                  title="Upload de vídeo"
                >
                  📤
                </button>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Cole a URL HLS ou faça upload de um novo vídeo
              </p>
            </div>

            <div>
              <label className="field-label">Duração (segundos)</label>
              <input
                type="number"
                value={localDuration}
                onChange={(e) => setLocalDuration(e.target.value)}
                onBlur={handleDurationBlur}
                className="field-input"
                placeholder="60"
                min="0"
              />
            </div>

            {/* ✅ NOVO: Campo choiceBeforeEnd */}
            <div>
              <label className="field-label">Mostrar Escolhas (segundos antes do fim)</label>
              <input
                type="number"
                value={localChoiceBeforeEnd}
                onChange={(e) => setLocalChoiceBeforeEnd(e.target.value)}
                onBlur={handleChoiceBeforeEndBlur}
                className="field-input"
                placeholder="7"
                min="0"
              />
              <p className="text-xs text-text-secondary mt-1">
                Padrão: 7 segundos antes do vídeo terminar
              </p>
            </div>

            <div>
              <label className="field-label">Descrição</label>
              <textarea
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                rows={3}
                className="field-input resize-none"
                placeholder="Descreva esta cena..."
              />
            </div>

            {/* Modal de Upload */}
            <VideoUploadModal
              isOpen={isUploadModalOpen}
              onClose={() => setIsUploadModalOpen(false)}
              onVideoReady={handleVideoUploadComplete}
            />
          </>
        )}

        {/* Campos específicos para NÓ DE ESCOLHA */}
        {nodeType === 'choice' && (
          <>
            {/* Vídeo opcional para nó de escolha */}
            <div>
              <label className="field-label">Vídeo de Transição (Opcional)</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={localVideoUrl}
                  onChange={(e) => setLocalVideoUrl(e.target.value)}
                  onBlur={handleVideoUrlBlur}
                  className="field-input flex-1"
                  placeholder="URL do vídeo de pergunta/transição"
                />
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-3 py-2 text-sm font-medium text-primary bg-primary/15 hover:bg-primary/25 border border-primary/30 rounded-lg transition-colors flex items-center gap-1"
                  title="Upload de vídeo"
                >
                  📤
                </button>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Vídeo curto (5-10s) mostrando a pergunta/narrador
              </p>
            </div>

            <div>
              <label className="field-label">Duração (segundos)</label>
              <input
                type="number"
                value={localDuration}
                onChange={(e) => setLocalDuration(e.target.value)}
                onBlur={handleDurationBlur}
                className="field-input"
                placeholder="10"
                min="0"
              />
            </div>

            {/* ✅ choiceBeforeEnd para nós de escolha COM vídeo de transição */}
            {localVideoUrl.trim() !== '' && (
              <div>
                <label className="field-label">Mostrar Escolhas (segundos antes do fim)</label>
                <input
                  type="number"
                  value={localChoiceBeforeEnd}
                  onChange={(e) => setLocalChoiceBeforeEnd(e.target.value)}
                  onBlur={handleChoiceBeforeEndBlur}
                  className="field-input"
                  placeholder="7"
                  min="0"
                />
                <p className="text-xs text-text-secondary mt-1">
                  Antecipa as opções enquanto o vídeo de transição ainda toca (padrão: 7s)
                </p>
              </div>
            )}

            <div>
              <label className="field-label">Timeout (segundos)</label>
              <input
                type="number"
                value={localTimeout}
                onChange={(e) => setLocalTimeout(e.target.value)}
                onBlur={handleTimeoutBlur}
                className="field-input"
                placeholder="10"
                min="0"
              />
              <p className="text-xs text-text-secondary mt-1">
                Tempo para escolha automática (0 = sem timeout)
              </p>
            </div>

            <div>
              <label className="field-label">Descrição</label>
              <textarea
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                rows={2}
                className="field-input resize-none"
                placeholder="Contexto da escolha..."
              />
            </div>

            {/* Modal de Upload */}
            <VideoUploadModal
              isOpen={isUploadModalOpen}
              onClose={() => setIsUploadModalOpen(false)}
              onVideoReady={handleVideoUploadComplete}
            />
          </>
        )}

        {/* Campos específicos para NÓ FINAL */}
        {nodeType === 'end' && (
          <>
            {/* Vídeo opcional para final */}
            <div>
              <label className="field-label">Vídeo Final (Opcional)</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={localVideoUrl}
                  onChange={(e) => setLocalVideoUrl(e.target.value)}
                  onBlur={handleVideoUrlBlur}
                  className="field-input flex-1"
                  placeholder="URL do vídeo de encerramento"
                />
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-3 py-2 text-sm font-medium text-primary bg-primary/15 hover:bg-primary/25 border border-primary/30 rounded-lg transition-colors flex items-center gap-1"
                  title="Upload de vídeo"
                >
                  📤
                </button>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Vídeo de encerramento ou créditos
              </p>
            </div>

            <div>
              <label className="field-label">Tipo de Final</label>
              <select
                value={localEndingType}
                onChange={(e) => handleEndingTypeChange(e.target.value as 'good' | 'bad' | 'neutral')}
                className="field-input"
              >
                <option value="good">✓ Final Feliz</option>
                <option value="bad">✗ Final Triste</option>
                <option value="neutral">— Final Neutro</option>
              </select>
            </div>

            <div>
              <label className="field-label">Mensagem de Encerramento</label>
              <textarea
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                rows={3}
                className="field-input resize-none"
                placeholder="Mensagem exibida ao terminar"
              />
            </div>

            {/* Modal de Upload */}
            <VideoUploadModal
              isOpen={isUploadModalOpen}
              onClose={() => setIsUploadModalOpen(false)}
              onVideoReady={handleVideoUploadComplete}
            />
          </>
        )}

        {/* Info do nó */}
        <div className="pt-4 border-t border-white/10">
          <div className="text-xs text-text-secondary space-y-1">
            <div><strong className="text-text">ID:</strong> {selectedNode.id}</div>
            <div><strong className="text-text">Tipo:</strong> {nodeType}</div>
          </div>
        </div>
      </div>
    );
  }

  // Se uma EDGE está selecionada
  if (selectedEdge) {
    return (
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text">🔗 Conexão</h3>
          <button
            onClick={() => onDeleteEdge(selectedEdge.id)}
            className="px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 rounded-lg transition-colors"
          >
            🗑 Deletar
          </button>
        </div>

        <div>
          <label className="field-label">Label da Conexão</label>
          <input
            type="text"
            value={localEdgeLabel}
            onChange={(e) => setLocalEdgeLabel(e.target.value)}
            onBlur={handleEdgeLabelBlur}
            className="field-input"
            placeholder="Ex: Escolher caminho A"
          />
        </div>

        <div className="pt-4 border-t border-white/10">
          <div className="text-xs text-text-secondary space-y-1">
            <div><strong className="text-text">De:</strong> {selectedEdge.source}</div>
            <div><strong className="text-text">Para:</strong> {selectedEdge.target}</div>
            <div><strong className="text-text">ID:</strong> {selectedEdge.id}</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
