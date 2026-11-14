import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { uploadVideo, processVideo, waitForProcessing, type VideoStatus } from '../../services/videoApi';
import { MEDIA_URL } from '../../services/api';
import { IconAlertTriangle, IconCloudUpload, IconLoader2, IconUpload, IconVideo, IconX } from '@tabler/icons-react';

export interface UploadedVideoInfo {
  hlsUrl: string;
  videoId: string;
  duration?: number;
  thumbnailUrl?: string;
}

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVideoReady: (info: UploadedVideoInfo) => void;
}

export function VideoUploadModal({ isOpen, onClose, onVideoReady }: VideoUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validar tamanho (500MB)
      if (selectedFile.size > 500 * 1024 * 1024) {
        setError('Arquivo muito grande. Máximo: 500MB');
        return;
      }

      // Validar tipo
      const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
      if (!validTypes.includes(selectedFile.type)) {
        setError('Formato não suportado. Use MP4, MOV, AVI ou WebM');
        return;
      }

      setFile(selectedFile);
      setError('');
      setUploadProgress(0);
      setProcessingStatus('');
    }
  };

  const handleUploadAndProcess = async () => {
    if (!file) return;

    try {
      setError('');
      setIsUploading(true);

      // 1. Upload
      const { videoId, metadata } = await uploadVideo(file, (progress) => {
        setUploadProgress(progress.percent);
      });

      setIsUploading(false);
      setIsProcessing(true);
      setProcessingStatus('Iniciando processamento...');

      // 2. Processar
      await processVideo(videoId);
      setProcessingStatus('Convertendo para HLS...');

      // 3. Aguardar conclusão
      const finalStatus = await waitForProcessing(videoId, (status: VideoStatus) => {
        if (status.status === 'processing') {
          setProcessingStatus('Processando vídeo (isso pode demorar alguns minutos)...');
        }
      });
      if (finalStatus.hlsUrl) {
        setProcessingStatus('Concluído!');
        onVideoReady({
          hlsUrl: `${MEDIA_URL}${finalStatus.hlsUrl}`,
          videoId,
          duration: finalStatus.metadata?.duration ?? metadata?.duration,
          thumbnailUrl: finalStatus.thumbnailUrl ? `${MEDIA_URL}${finalStatus.thumbnailUrl}` : undefined,
        });
        
        // Fechar modal após 1s
        setTimeout(() => {
          handleClose();
        }, 1000);
      }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('❌ Erro:', err);
      setError(err.message || 'Erro ao processar vídeo');
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setUploadProgress(0);
    setProcessingStatus('');
    setIsUploading(false);
    setIsProcessing(false);
    setError('');
    onClose();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Portal no <body>: dentro do painel escuro o modal herdava as cores de texto claras.
  return createPortal(
    <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-[20px] shadow-soft w-full max-w-lg mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text flex items-center gap-2">
            <IconVideo size={22} stroke={1.75} className="text-copper" aria-hidden="true" />
            Enviar vídeo
          </h2>
          <button
            onClick={handleClose}
            disabled={isUploading || isProcessing}
            className="text-text-secondary hover:text-text transition-colors disabled:opacity-50"
            aria-label="Fechar"
          >
            <IconX size={20} stroke={1.75} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Área de drop/seleção */}
          {!file && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-copper hover:bg-copper/5 transition-all"
            >
              <IconCloudUpload size={40} stroke={1.5} className="mx-auto mb-3 text-copper" aria-hidden="true" />
              <div className="text-sm font-medium text-text mb-1">
                Clique para selecionar um vídeo
              </div>
              <div className="text-xs text-text-secondary">
                MP4, MOV, AVI ou WebM • Máximo 500MB
              </div>
            </div>
          )}

          {/* Arquivo selecionado */}
          {file && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-text text-sm">
                    {file.name}
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    {formatFileSize(file.size)} • {file.type}
                  </div>
                </div>
                {!isUploading && !isProcessing && (
                  <button
                    onClick={() => setFile(null)}
                    className="text-text-secondary hover:text-text ml-2"
                    aria-label="Remover arquivo"
                  >
                    <IconX size={16} stroke={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Progresso de Upload */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text font-medium">Enviando...</span>
                <span className="text-primary font-semibold tabular-nums">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-surface-hover rounded-full h-2 overflow-hidden">
                <div
                  className="h-full transition-all duration-300 bg-copper"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status de Processamento */}
          {isProcessing && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <IconLoader2 size={26} stroke={1.75} className="animate-spin text-copper shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-text">
                    Processando HLS
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    {processingStatus}
                  </div>
                </div>
              </div>
              <div className="text-xs text-text-secondary text-center">
                Isso pode levar alguns minutos dependendo do tamanho do vídeo
              </div>
            </div>
          )}

          {/* Erro */}
          {error && (
            <div className="p-4 bg-danger/10 border border-danger/30 rounded-lg">
              <div className="flex items-start gap-2">
                <IconAlertTriangle size={18} stroke={1.75} className="text-danger shrink-0" aria-hidden="true" />
                <div className="flex-1 text-sm text-danger">
                  {error}
                </div>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isUploading || isProcessing}
            className="btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            onClick={handleUploadAndProcess}
            disabled={!file || isUploading || isProcessing}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="inline-flex items-center gap-2">
              {isUploading || isProcessing ? (
                <IconLoader2 size={17} stroke={2} className="animate-spin" aria-hidden="true" />
              ) : (
                <IconUpload size={17} stroke={1.75} aria-hidden="true" />
              )}
              {isUploading ? 'Enviando…' : isProcessing ? 'Processando…' : 'Enviar e processar'}
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
