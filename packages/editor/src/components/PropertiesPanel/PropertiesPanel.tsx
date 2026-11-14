import { useState, useEffect } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { DEFAULT_CHOICE_BEFORE_END, getSceneRoles, type SceneNodeData } from '@ine/shared';
import { VideoUploadModal, type UploadedVideoInfo } from '../VideoUpload/VideoUploadModal';
import { formatDuration } from '../../utils/media';
import { IconArrowsSplit2, IconTrash, IconFlag, IconPlayerPlay, IconPointer, IconRoute, IconUpload, IconVideo } from '@tabler/icons-react';

interface PropertiesPanelProps {
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  edges: Edge[];
  onUpdateNode: (nodeId: string, data: Partial<SceneNodeData>) => void;
  onUpdateEdge: (edgeId: string, label: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

export function PropertiesPanel({
  selectedNode,
  selectedEdge,
  edges,
  onUpdateNode,
  onUpdateEdge,
  onDeleteNode,
  onDeleteEdge,
}: PropertiesPanelProps) {
  const [localLabel, setLocalLabel] = useState('');
  const [localVideoUrl, setLocalVideoUrl] = useState('');
  const [localChoiceBeforeEnd, setLocalChoiceBeforeEnd] = useState('');
  const [localEndMessage, setLocalEndMessage] = useState('');
  const [localEdgeLabel, setLocalEdgeLabel] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Sincroniza o formulário local quando a seleção externa muda.
  useEffect(() => {
    if (selectedNode) {
      const data = selectedNode.data as unknown as SceneNodeData;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalLabel(data.label || '');
      setLocalVideoUrl(data.videoUrl || '');
      setLocalChoiceBeforeEnd(String(data.choiceBeforeEnd ?? DEFAULT_CHOICE_BEFORE_END));
      setLocalEndMessage(data.endMessage || '');
    } else if (selectedEdge) {
      setLocalEdgeLabel(String(selectedEdge.label || ''));
    }
  }, [selectedNode, selectedEdge]);

  if (!selectedNode && !selectedEdge) {
    return (
      <div className="p-6 text-center text-text-secondary">
        <IconPointer size={32} stroke={1.5} className="mx-auto mb-3 text-copper-light" aria-hidden="true" />
        <div className="text-sm font-medium text-text">Nenhum elemento selecionado</div>
        <div className="text-xs mt-1">Clique em uma cena para editar. Para mudar o texto de uma escolha, dê duplo clique nela.</div>
      </div>
    );
  }

  if (selectedNode) {
    const data = selectedNode.data as unknown as SceneNodeData;
    const roles = getSceneRoles(selectedNode.id, edges);
    const durationLabel = formatDuration(data.duration);

    const handleVideoUploadComplete = (info: UploadedVideoInfo) => {
      setLocalVideoUrl(info.hlsUrl);
      onUpdateNode(selectedNode.id, {
        videoUrl: info.hlsUrl,
        duration: info.duration,
        thumbnail: info.thumbnailUrl,
      });
      setIsUploadModalOpen(false);
    };

    return (
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text flex items-center gap-2"><IconVideo size={20} stroke={1.75} aria-hidden="true" />Cena</h3>
          <button
            onClick={() => onDeleteNode(selectedNode.id)}
            className="px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 rounded-lg transition-colors inline-flex items-center gap-1"
          >
            <IconTrash size={14} stroke={1.75} aria-hidden="true" />
            Deletar
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {roles.isStart && <span className="scene-badge scene-badge-start"><IconPlayerPlay size={11} stroke={2.25} aria-hidden="true" />Início</span>}
          {roles.isBranch && <span className="scene-badge scene-badge-branch"><IconArrowsSplit2 size={11} stroke={2.25} aria-hidden="true" />Bifurcação</span>}
          {roles.isEnd && <span className="scene-badge scene-badge-end"><IconFlag size={11} stroke={2.25} aria-hidden="true" />Final</span>}
        </div>

        <div>
          <label className="field-label">Nome da cena</label>
          <input
            type="text"
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            onBlur={() => onUpdateNode(selectedNode.id, { label: localLabel, title: localLabel })}
            className="field-input"
            placeholder="Ex.: Introdução"
          />
        </div>

        <div>
          <label className="field-label">Vídeo</label>
          <button type="button" onClick={() => setIsUploadModalOpen(true)} className="btn-secondary w-full inline-flex items-center justify-center gap-2">
            <IconUpload size={17} stroke={1.75} aria-hidden="true" />
            {data.videoUrl ? 'Trocar vídeo' : 'Enviar vídeo'}
          </button>
          <p className="text-xs text-text-secondary mt-1">
            {data.videoUrl
              ? `Vídeo configurado${durationLabel ? ` · duração ${durationLabel}` : ''}. A prévia aparece no próprio nó.`
              : 'A duração é lida automaticamente do arquivo enviado.'}
          </p>
          <details className="mt-2 text-xs text-text-secondary">
            <summary className="cursor-pointer select-none">Avançado: colar URL HLS</summary>
            <input
              type="url"
              value={localVideoUrl}
              onChange={(e) => setLocalVideoUrl(e.target.value)}
              onBlur={() => {
                if (localVideoUrl !== (data.videoUrl || '')) {
                  onUpdateNode(selectedNode.id, { videoUrl: localVideoUrl, thumbnail: undefined });
                }
              }}
              className="field-input mt-2"
              placeholder="https://exemplo.com/video.m3u8"
            />
          </details>
        </div>

        {roles.isBranch && (
          <div>
            <label className="field-label">Mostrar escolhas (segundos antes do fim)</label>
            <input
              type="number"
              value={localChoiceBeforeEnd}
              onChange={(e) => setLocalChoiceBeforeEnd(e.target.value)}
              onBlur={() => {
                const value = Number(localChoiceBeforeEnd);
                onUpdateNode(selectedNode.id, {
                  choiceBeforeEnd: Number.isFinite(value) && value > 0 ? value : DEFAULT_CHOICE_BEFORE_END,
                });
              }}
              className="field-input"
              min="1"
            />
            <p className="text-xs text-text-secondary mt-1">
              Se o aluno não escolher a tempo, o vídeo pausa no fim e espera a decisão.
            </p>
          </div>
        )}

        {roles.isEnd && (
          <div>
            <label className="field-label">Mensagem de encerramento (opcional)</label>
            <textarea
              value={localEndMessage}
              onChange={(e) => setLocalEndMessage(e.target.value)}
              onBlur={() => onUpdateNode(selectedNode.id, { endMessage: localEndMessage.trim() || undefined })}
              rows={3}
              className="field-input resize-none"
              placeholder="Ex.: Parabéns, você concluiu a aula!"
            />
          </div>
        )}

        {!roles.isBranch && !roles.isEnd && (
          <p className="text-xs text-text-secondary">
            Esta cena segue direto para a próxima. Ligue-a a duas ou mais cenas para criar uma escolha.
          </p>
        )}

        <VideoUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onVideoReady={handleVideoUploadComplete}
        />
      </div>
    );
  }

  if (selectedEdge) {
    const fromBranch = getSceneRoles(selectedEdge.source, edges).isBranch;
    return (
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text flex items-center gap-2"><IconRoute size={20} stroke={1.75} aria-hidden="true" />Conexão</h3>
          <button
            onClick={() => onDeleteEdge(selectedEdge.id)}
            className="px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 rounded-lg transition-colors inline-flex items-center gap-1"
          >
            <IconTrash size={14} stroke={1.75} aria-hidden="true" />
            Deletar
          </button>
        </div>

        {fromBranch ? (
          <div>
            <label className="field-label">Texto da escolha</label>
            <input
              type="text"
              value={localEdgeLabel}
              onChange={(e) => setLocalEdgeLabel(e.target.value)}
              onBlur={() => onUpdateEdge(selectedEdge.id, localEdgeLabel.trim())}
              className="field-input"
              placeholder="Ex.: Ver a explicação"
            />
            <p className="text-xs text-text-secondary mt-1">Dica: dá para editar com duplo clique direto na conexão.</p>
          </div>
        ) : (
          <p className="text-xs text-text-secondary">
            Esta é a única saída da cena, então o vídeo segue direto, sem botão de escolha.
          </p>
        )}
      </div>
    );
  }

  return null;
}
