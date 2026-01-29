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
      const data = selectedNode.data;
      setLocalLabel(data.label || '');
      
      if (selectedNode.type === 'video') {
        const videoData = data as VideoNodeData;
        setLocalVideoUrl(videoData.videoUrl || '');
        setLocalDuration(videoData.duration?.toString() || '');
        setLocalDescription(videoData.description || '');
        setLocalChoiceBeforeEnd(videoData.choiceBeforeEnd?.toString() || '7'); // ✅ NOVO
      } else if (selectedNode.type === 'choice') {
        const choiceData = data as ChoiceNodeData;
        setLocalTimeout(choiceData.timeout?.toString() || '');
        setLocalDescription(choiceData.description || '');
        setLocalVideoUrl(choiceData.videoUrl || ''); // ✅ Escolha pode ter vídeo
        setLocalDuration(choiceData.duration?.toString() || '');
      } else if (selectedNode.type === 'end') {
        const endData = data as EndNodeData;
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
        duration: localDuration ? Number(localDuration) : undefined 
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
        timeout: localTimeout ? Number(localTimeout) : undefined 
      });
    }
  };

  // ✅ NOVO: Handler para choiceBeforeEnd
  const handleChoiceBeforeEndBlur = () => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, { 
        choiceBeforeEnd: localChoiceBeforeEnd ? Number(localChoiceBeforeEnd) : 7 
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

  const handleVideoUploadComplete = (hlsUrl: string, videoId: string, metadata: any) => {
    if (selectedNode) {
      setLocalVideoUrl(hlsUrl);
      setLocalDuration(metadata.duration?.toString() || '');
      onUpdateNode(selectedNode.id, {
        videoUrl: hlsUrl,
        duration: metadata.duration
      });
    }
    setIsUploadModalOpen(false);
  };

  // Se nada está selecionado
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="p-6 text-center text-gray-500">
        <div className="text-4xl mb-3">👆</div>
        <div className="text-sm font-medium">Nenhum elemento selecionado</div>
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
          <h3 className="text-lg font-semibold text-gray-900">
            {nodeType === 'video' && '🎥 Nó de Vídeo'}
            {nodeType === 'choice' && '🔀 Nó de Escolha'}
            {nodeType === 'end' && '🏁 Nó Final'}
          </h3>
          <button
            onClick={() => onDeleteNode(selectedNode.id)}
            className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            🗑 Deletar
          </button>
        </div>

        {/* Label (comum a todos) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Nome do Nó
          </label>
          <input
            type="text"
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            onBlur={handleLabelBlur}
            className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                       focus:border-blue-500 focus:outline-none transition-colors"
            placeholder="Digite o nome..."
          />
        </div>

        {/* Campos específicos para NÓ DE VÍDEO */}
        {nodeType === 'video' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                URL do Vídeo
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={localVideoUrl}
                  onChange={(e) => setLocalVideoUrl(e.target.value)}
                  onBlur={handleVideoUrlBlur}
                  className="flex-1 px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                             focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="https://example.com/video.m3u8"
                />
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-1"
                  title="Upload de vídeo"
                >
                  📤
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Cole a URL HLS ou faça upload de um novo vídeo
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Duração (segundos)
              </label>
              <input
                type="number"
                value={localDuration}
                onChange={(e) => setLocalDuration(e.target.value)}
                onBlur={handleDurationBlur}
                className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                           focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="60"
                min="0"
              />
            </div>

            {/* ✅ NOVO: Campo choiceBeforeEnd */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mostrar Escolhas (segundos antes do fim)
              </label>
              <input
                type="number"
                value={localChoiceBeforeEnd}
                onChange={(e) => setLocalChoiceBeforeEnd(e.target.value)}
                onBlur={handleChoiceBeforeEndBlur}
                className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                           focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="7"
                min="0"
              />
              <p className="text-xs text-gray-500 mt-1">
                Padrão: 7 segundos antes do vídeo terminar
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Descrição
              </label>
              <textarea
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                rows={3}
                className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                           focus:border-blue-500 focus:outline-none transition-colors resize-none"
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Vídeo de Transição (Opcional)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={localVideoUrl}
                  onChange={(e) => setLocalVideoUrl(e.target.value)}
                  onBlur={handleVideoUrlBlur}
                  className="flex-1 px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                             focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="URL do vídeo de pergunta/transição"
                />
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-1"
                  title="Upload de vídeo"
                >
                  📤
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Vídeo curto (5-10s) mostrando a pergunta/narrador
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Duração (segundos)
              </label>
              <input
                type="number"
                value={localDuration}
                onChange={(e) => setLocalDuration(e.target.value)}
                onBlur={handleDurationBlur}
                className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                           focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="10"
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Timeout (segundos)
              </label>
              <input
                type="number"
                value={localTimeout}
                onChange={(e) => setLocalTimeout(e.target.value)}
                onBlur={handleTimeoutBlur}
                className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                           focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="10"
                min="0"
              />
              <p className="text-xs text-gray-500 mt-1">
                Tempo para escolha automática (0 = sem timeout)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Descrição
              </label>
              <textarea
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                rows={2}
                className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                           focus:border-blue-500 focus:outline-none transition-colors resize-none"
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Vídeo Final (Opcional)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={localVideoUrl}
                  onChange={(e) => setLocalVideoUrl(e.target.value)}
                  onBlur={handleVideoUrlBlur}
                  className="flex-1 px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                             focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="URL do vídeo de encerramento"
                />
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-1"
                  title="Upload de vídeo"
                >
                  📤
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Vídeo de encerramento ou créditos
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tipo de Final
              </label>
              <select
                value={localEndingType}
                onChange={(e) => handleEndingTypeChange(e.target.value as 'good' | 'bad' | 'neutral')}
                className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                           focus:border-blue-500 focus:outline-none transition-colors"
              >
                <option value="good">✓ Final Feliz</option>
                <option value="bad">✗ Final Triste</option>
                <option value="neutral">— Final Neutro</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mensagem de Encerramento
              </label>
              <textarea
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                rows={3}
                className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                           focus:border-blue-500 focus:outline-none transition-colors resize-none"
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
        <div className="pt-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 space-y-1">
            <div><strong>ID:</strong> {selectedNode.id}</div>
            <div><strong>Tipo:</strong> {nodeType}</div>
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
          <h3 className="text-lg font-semibold text-gray-900">
            🔗 Conexão
          </h3>
          <button
            onClick={() => onDeleteEdge(selectedEdge.id)}
            className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            🗑 Deletar
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Label da Conexão
          </label>
          <input
            type="text"
            value={localEdgeLabel}
            onChange={(e) => setLocalEdgeLabel(e.target.value)}
            onBlur={handleEdgeLabelBlur}
            className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg
                       focus:border-blue-500 focus:outline-none transition-colors"
            placeholder="Ex: Escolher caminho A"
          />
        </div>

        <div className="pt-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 space-y-1">
            <div><strong>De:</strong> {selectedEdge.source}</div>
            <div><strong>Para:</strong> {selectedEdge.target}</div>
            <div><strong>ID:</strong> {selectedEdge.id}</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
