import { useState, useRef } from 'react';
import { uploadVideo, processVideo, waitForProcessing, type VideoStatus } from '../../services/videoApi';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onVideoReady: (hlsUrl: string, videoId: string, metadata: any) => void;
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
      console.log('📤 Iniciando upload...');
      const { videoId, metadata } = await uploadVideo(file, (progress) => {
        setUploadProgress(progress.percent);
      });

      console.log(`✅ Upload concluído: ${videoId}`);
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

      console.log('✅ Processamento concluído:', finalStatus);
      
      if (finalStatus.hlsUrl) {
        setProcessingStatus('Concluído!');
        onVideoReady(
          `http://localhost:3001${finalStatus.hlsUrl}`,
          videoId,
          metadata
        );
        
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            📹 Upload de Vídeo
          </h2>
          <button
            onClick={handleClose}
            disabled={isUploading || isProcessing}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Área de drop/seleção */}
          {!file && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <div className="text-4xl mb-3">🎬</div>
              <div className="text-sm font-medium text-gray-700 mb-1">
                Clique para selecionar um vídeo
              </div>
              <div className="text-xs text-gray-500">
                MP4, MOV, AVI ou WebM • Máximo 500MB
              </div>
            </div>
          )}

          {/* Arquivo selecionado */}
          {file && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-sm">
                    {file.name}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {formatFileSize(file.size)} • {file.type}
                  </div>
                </div>
                {!isUploading && !isProcessing && (
                  <button
                    onClick={() => setFile(null)}
                    className="text-gray-400 hover:text-gray-600 ml-2"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Progresso de Upload */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700 font-medium">Enviando...</span>
                <span className="text-blue-600 font-semibold">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status de Processamento */}
          {isProcessing && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="animate-spin text-2xl">⚙️</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    Processando HLS
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {processingStatus}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500 text-center">
                Isso pode levar alguns minutos dependendo do tamanho do vídeo
              </div>
            </div>
          )}

          {/* Erro */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-red-600">⚠️</span>
                <div className="flex-1 text-sm text-red-700">
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
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isUploading || isProcessing}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            onClick={handleUploadAndProcess}
            disabled={!file || isUploading || isProcessing}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading && '⏳'}
            {isProcessing && '⚙️'}
            {!isUploading && !isProcessing && '🚀'}
            {isUploading ? 'Enviando...' : isProcessing ? 'Processando...' : 'Enviar e Processar'}
          </button>
        </div>
      </div>
    </div>
  );
}
