# 🎬 Arquitetura do Interactive Narrative Engine

## 📋 Índice
1. [Visão Geral](#visão-geral)
2. [Arquitetura de Componentes](#arquitetura-de-componentes)
3. [Fluxo de Processamento de Vídeo](#fluxo-de-processamento-de-vídeo)
4. [Tecnologia HLS (HTTP Live Streaming)](#tecnologia-hls)
5. [FFmpeg no Servidor](#ffmpeg-no-servidor)
6. [Estrutura de Dados](#estrutura-de-dados)
7. [Fluxos de Uso](#fluxos-de-uso)

---

## 🎯 Visão Geral

O **Interactive Narrative Engine** é um sistema completo para criação e reprodução de narrativas interativas baseadas em vídeo. O projeto utiliza uma arquitetura **monorepo** com 4 pacotes principais:

```
┌─────────────────────────────────────────────────────────────┐
│                   INTERACTIVE NARRATIVE ENGINE               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  EDITOR  │  │   API    │  │  PLAYER  │  │  SHARED  │   │
│  │ (React)  │  │ (Express)│  │(Vanilla) │  │  (Types) │   │
│  │  :5173   │  │  :3001   │  │  :5174   │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│       │             │              │              │         │
│       └─────────────┴──────────────┴──────────────┘         │
│                          │                                   │
│                    TypeScript                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Arquitetura de Componentes

### 1. **Editor (packages/editor)** 
**Frontend React + ReactFlow + Vite**

```
┌─────────────────────────────────────────────────────┐
│                    EDITOR UI                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌───────────────────────────┐  │
│  │   Toolbar    │  │     Canvas (ReactFlow)     │  │
│  │              │  │                            │  │
│  │ - New Node   │  │  ┌──────┐    ┌──────┐    │  │
│  │ - Save       │  │  │Video │───▶│Choice│    │  │
│  │ - Validate   │  │  │ Node │    │ Node │    │  │
│  │ - Upload     │  │  └──────┘    └──────┘    │  │
│  └──────────────┘  │       │          │        │  │
│                    │       ▼          ▼        │  │
│  ┌──────────────┐  │  ┌──────┐    ┌──────┐   │  │
│  │ Properties   │  │  │Video │    │ End  │    │  │
│  │   Panel      │  │  │ Node │    │ Node │    │  │
│  │              │  │  └──────┘    └──────┘    │  │
│  │ - Node Data  │  │                           │  │
│  │ - Video URL  │  └───────────────────────────┘  │
│  │ - Choices    │                                 │
│  └──────────────┘  ┌───────────────────────────┐  │
│                    │   VideoUpload Component    │  │
│  ┌──────────────┐  │                           │  │
│  │ Validation   │  │  1. Select File           │  │
│  │   Panel      │  │  2. Upload (Progress)     │  │
│  │              │  │  3. Process HLS           │  │
│  │ - Errors     │  │  4. Get URL               │  │
│  │ - Warnings   │  └───────────────────────────┘  │
│  └──────────────┘                                 │
└─────────────────────────────────────────────────────┘
           │
           │ HTTP REST API
           ▼
    ┌──────────────┐
    │   API :3001  │
    └──────────────┘
```

**Componentes Principais:**
- **Canvas**: Baseado em ReactFlow para edição visual do grafo
- **Nodes**: VideoNode, ChoiceNode, EndNode
- **VideoUpload**: Componente de upload com progresso
- **ValidationPanel**: Valida estrutura do grafo
- **PropertiesPanel**: Edita dados dos nós

---

### 2. **API (packages/api)**
**Backend Node.js + Express + FFmpeg**

```
┌────────────────────────────────────────────────────────────┐
│                      API SERVER :3001                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  📥 UPLOAD ENDPOINTS                                       │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ POST /api/videos/upload                              │ │
│  │  ├─ Multer (receives file)                           │ │
│  │  ├─ Save to /uploads/temp/{uuid}.mp4                 │ │
│  │  ├─ Extract metadata (ffprobe)                       │ │
│  │  └─ Return videoId                                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  🎬 PROCESSING ENDPOINTS                                   │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ POST /api/videos/{videoId}/process                   │ │
│  │  ├─ Start HLS conversion (async)                     │ │
│  │  ├─ Return 202 Accepted immediately                  │ │
│  │  └─ Process in background                            │ │
│  │                                                       │ │
│  │ GET /api/videos/{videoId}/status                     │ │
│  │  └─ Return current status (polling)                  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  📊 PROJECT ENDPOINTS                                      │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ GET /api/projects                                    │ │
│  │ POST /api/projects                                   │ │
│  │ GET /api/projects/{id}                               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  📁 STATIC FILES                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ /hls → serves /uploads/hls/                          │ │
│  │ /videos → serves /uploads/videos/                    │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  🔧 SERVICES                                               │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ffmpegService.ts                                     │ │
│  │  ├─ getVideoMetadata()                               │ │
│  │  ├─ convertToHLS()                                   │ │
│  │  ├─ generateThumbnail()                              │ │
│  │  └─ processResolution()                              │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

**Persistência (atende RNF09):**

Os endpoints de projetos e vídeos passam por uma camada de repositório (`packages/api/src/repositories/`) que, quando `DATABASE_URL` está definido, lê e escreve nas tabelas `projects` e `videos` do PostgreSQL (schema em `docker/init.sql`). Quando o banco não está disponível (uso de `pnpm dev` puro, sem Compose), a mesma interface cai automaticamente em um `Map` em memória — útil para iterar localmente, **mas o estado não sobrevive a reinícios da API**.

```typescript
// packages/api/src/repositories/projectsRepo.ts
const repo = getProjectsRepository(); // 'postgres' ou 'memory'
await repo.upsert(graph);             // INSERT ... ON CONFLICT (id) DO UPDATE
await repo.list();                    // SELECT ... ORDER BY updated_at DESC
```

Eventos de analítica (`analytics_events`) continuam sendo persistidos em PostgreSQL exclusivamente — não há fallback em memória, e a API responde `503` se o banco estiver indisponível.

---

### 3. **Player (packages/player)**
**Frontend Vanilla TS + HLS.js**

```
┌─────────────────────────────────────────────────┐
│              PLAYER UI :5174                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │      Project Selector                     │ │
│  │  [Load Projects] [Select Project ▼]      │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │                                           │ │
│  │         <video> HLS Player                │ │
│  │                                           │ │
│  │         (HLS.js + native player)          │ │
│  │                                           │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │         Choices Container                 │ │
│  │  [ Choice 1 ]  [ Choice 2 ]  [ Choice 3 ]│ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  📊 Info Panel                                  │
└─────────────────────────────────────────────────┘
```

---

### 4. **Shared (packages/shared)**
**TypeScript Types & Utils**

```typescript
// Tipos compartilhados entre todos os pacotes
export interface InteractiveGraph {
  id: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {...}
}

export interface GraphNode {
  id: string;
  type: 'video' | 'choice' | 'end';
  data: NodeData;
  position: {x, y};
}
```

---

## 🎥 Fluxo de Processamento de Vídeo

### **Fluxo Completo: Do Upload ao HLS**

```
┌──────────────────────────────────────────────────────────────────┐
│                    UPLOAD & PROCESSING FLOW                      │
└──────────────────────────────────────────────────────────────────┘

1. UPLOAD (Editor → API)
   ═══════════════════════
   
   Editor                          API
   ┌──────┐                    ┌─────────┐
   │ User │ selects video      │ Multer  │
   │      │ ─────────────────▶ │         │
   └──────┘                    └─────────┘
                                    │
                                    ▼
                           ┌─────────────────────┐
                           │ Save to temp/       │
                           │ {uuid}.mp4          │
                           └─────────────────────┘
                                    │
                                    ▼
                           ┌─────────────────────┐
                           │ FFprobe extracts    │
                           │ metadata:           │
                           │  - duration         │
                           │  - resolution       │
                           │  - bitrate          │
                           │  - fps              │
                           └─────────────────────┘
                                    │
                                    ▼
                           ┌─────────────────────┐
                           │ Return to Editor:   │
                           │ {                   │
                           │   videoId,          │
                           │   metadata          │
                           │ }                   │
                           └─────────────────────┘


2. PROCESSING REQUEST (Editor → API)
   ═══════════════════════════════════
   
   Editor                          API
   ┌──────┐                    ┌─────────┐
   │ User │ clicks "Process"   │ Express │
   │      │ ─────────────────▶ │ Handler │
   └──────┘                    └─────────┘
                                    │
                                    ▼
                           ┌─────────────────────┐
                           │ Set status:         │
                           │ "processing"        │
                           └─────────────────────┘
                                    │
                                    ▼
                           ┌─────────────────────┐
                           │ Return 202 Accepted │
                           │ (non-blocking)      │
                           └─────────────────────┘
                                    │
                                    ▼
                           ┌─────────────────────┐
                           │ Start background    │
                           │ HLS conversion      │
                           └─────────────────────┘


3. HLS CONVERSION (Background Process)
   ════════════════════════════════════
   
   ┌───────────────────────────────────────────────────────┐
   │                 convertToHLS()                        │
   └───────────────────────────────────────────────────────┘
                        │
                        ▼
          ┌──────────────────────────────┐
          │ Create output directory:     │
          │ /uploads/hls/{videoId}/      │
          └──────────────────────────────┘
                        │
                        ▼
          ┌──────────────────────────────┐
          │ Analyze video with ffprobe   │
          │ Determine optimal resolutions│
          └──────────────────────────────┘
                        │
                        ▼
          ┌──────────────────────────────┐
          │ Original: 1920x1080          │
          │ Generate resolutions:        │
          │  ├─ 360p (640x360)           │
          │  ├─ 480p (854x480)           │
          │  ├─ 720p (1280x720)          │
          │  └─ 1080p (1920x1080)        │
          └──────────────────────────────┘
                        │
                        ▼
          ┌──────────────────────────────┐
          │ Process in PARALLEL:         │
          │ ┌──────────────────────────┐ │
          │ │ 360p  │ 480p │ 720p│1080p│ │
          │ └──────────────────────────┘ │
          └──────────────────────────────┘
                        │
            ┌───────────┼───────────┬───────────┐
            ▼           ▼           ▼           ▼
       FFmpeg 1    FFmpeg 2    FFmpeg 3    FFmpeg 4
       (360p)      (480p)      (720p)      (1080p)
            │           │           │           │
            └───────────┴───────────┴───────────┘
                        │
                        ▼
          ┌──────────────────────────────┐
          │ Create master playlist       │
          │ {videoId}.m3u8               │
          └──────────────────────────────┘
                        │
                        ▼
          ┌──────────────────────────────┐
          │ Generate thumbnail           │
          │ {videoId}_thumb.jpg          │
          └──────────────────────────────┘
                        │
                        ▼
          ┌──────────────────────────────┐
          │ Update video status:         │
          │ "ready"                      │
          │ hlsUrl: /hls/{id}/{id}.m3u8  │
          └──────────────────────────────┘
                        │
                        ▼
          ┌──────────────────────────────┐
          │ Delete temp file             │
          │ /uploads/temp/{uuid}.mp4     │
          └──────────────────────────────┘


4. STATUS POLLING (Editor → API)
   ══════════════════════════════
   
   Editor                          API
   ┌──────┐                    ┌─────────┐
   │      │  GET /status       │         │
   │      │ ◀────────────────▶ │         │
   │ Poll │  every 2s          │ Returns │
   │      │                    │ status  │
   └──────┘                    └─────────┘
      │                             │
      │  status: "processing"       │
      │ ◀───────────────────────────┘
      │
      │  (wait 2s)
      │
      │  status: "processing"       
      │ ◀───────────────────────────
      │
      │  (wait 2s)
      │
      │  status: "ready"            
      │  hlsUrl: "/hls/..."
      │ ◀───────────────────────────
      │
      ▼
   ✅ Done!
```

---

## 📡 Tecnologia HLS (HTTP Live Streaming)

### **O que é HLS?**

HLS (HTTP Live Streaming) é um protocolo de streaming desenvolvido pela Apple que:
- Divide vídeo em **pequenos segmentos** (.ts files)
- Usa **playlists** (.m3u8) para indexar segmentos
- Permite **adaptive bitrate** (troca automática de qualidade)
- Funciona sobre **HTTP comum** (não precisa de servidor especial)

### **Estrutura HLS Gerada**

```
/uploads/hls/{videoId}/
├── {videoId}.m3u8                    ← MASTER PLAYLIST
├── {videoId}_360p.m3u8               ← Variant Playlist 360p
├── {videoId}_360p_000.ts             ← Segmento 0 (4s)
├── {videoId}_360p_001.ts             ← Segmento 1 (4s)
├── {videoId}_360p_002.ts             ← Segmento 2 (4s)
├── ...
├── {videoId}_720p.m3u8               ← Variant Playlist 720p
├── {videoId}_720p_000.ts
├── {videoId}_720p_001.ts
├── ...
├── {videoId}_1080p.m3u8              ← Variant Playlist 1080p
├── {videoId}_1080p_000.ts
├── {videoId}_1080p_001.ts
└── {videoId}_thumb.jpg               ← Thumbnail
```

### **Master Playlist (.m3u8)**

```m3u8
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
{videoId}_360p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480
{videoId}_480p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
{videoId}_720p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
{videoId}_1080p.m3u8
```

### **Variant Playlist (ex: 720p.m3u8)**

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD

#EXTINF:4.0,
{videoId}_720p_000.ts
#EXTINF:4.0,
{videoId}_720p_001.ts
#EXTINF:4.0,
{videoId}_720p_002.ts
#EXT-X-ENDLIST
```

### **Como funciona no Player?**

```javascript
// Player detecta conexão e resolução
const hls = new Hls();
hls.loadSource('/hls/{videoId}/{videoId}.m3u8');
hls.attachMedia(videoElement);

// HLS.js automaticamente:
// 1. Lê master playlist
// 2. Escolhe melhor qualidade baseado em largura de banda
// 3. Baixa segmentos .ts em sequência
// 4. Troca qualidade dinamicamente se conexão mudar
```

---

## ⚙️ FFmpeg no Servidor

### **O que o FFmpeg faz?**

O **FFmpeg** é uma ferramenta de linha de comando que converte e processa vídeo/áudio.

### **Processo de Conversão para cada Resolução**

```bash
ffmpeg \
  # INPUT
  -i /uploads/temp/{uuid}.mp4 \
  
  # VIDEO ENCODING
  -c:v libx264 \              # Codec H.264
  -preset medium \            # Velocidade/qualidade
  -profile:v main \           # Perfil de compatibilidade
  -level 4.0 \
  
  # RESOLUTION & BITRATE
  -s 1280x720 \               # Resolução 720p
  -b:v 2800k \                # Bitrate de vídeo
  -maxrate 3360k \            # Bitrate máximo (1.2x)
  -bufsize 5600k \            # Buffer (2x bitrate)
  
  # AUDIO ENCODING
  -c:a aac \                  # Codec AAC
  -b:a 128k \                 # Bitrate de áudio
  -ac 2 \                     # Stereo
  
  # KEYFRAMES (importante para seek)
  -g 48 \                     # Keyframe a cada 48 frames
  -keyint_min 48 \
  -sc_threshold 0 \
  
  # HLS SETTINGS
  -f hls \                    # Formato HLS
  -hls_time 4 \               # Segmentos de 4 segundos
  -hls_playlist_type vod \    # Video On Demand
  -hls_segment_type mpegts \  # Tipo MPEG-TS
  -hls_segment_filename /hls/{id}/{id}_720p_%03d.ts \
  
  # OUTPUT
  -y \                        # Overwrite
  /hls/{id}/{id}_720p.m3u8    # Playlist de saída
```

### **FFprobe - Extração de Metadados**

```bash
ffprobe \
  -v error \
  -show_entries format=duration,bit_rate:stream=width,height,r_frame_rate \
  -of json \
  /uploads/temp/{uuid}.mp4
```

**Output:**
```json
{
  "format": {
    "duration": "120.5",
    "bit_rate": "5000000"
  },
  "streams": [
    {
      "codec_type": "video",
      "width": 1920,
      "height": 1080,
      "r_frame_rate": "30000/1001"
    }
  ]
}
```

---

## 📊 Estrutura de Dados

### **Graph Node (Video)**

```typescript
{
  id: "node-1",
  type: "video",
  data: {
    label: "Cena de Abertura",
    title: "Início da Jornada",
    videoUrl: "/hls/abc123/abc123.m3u8",
    duration: 45.5,
    thumbnail: "/hls/abc123/abc123_thumb.jpg",
    description: "O herói acorda..."
  },
  position: { x: 100, y: 100 }
}
```

### **Graph Edge (Connection)**

```typescript
{
  id: "edge-1-2",
  source: "node-1",
  target: "node-2",
  label: "Ir para a floresta",
  data: {
    condition: undefined,
    timeout: undefined
  }
}
```

### **Video Status**

```typescript
{
  videoId: "abc-123",
  status: "ready" | "processing" | "uploaded" | "error",
  hlsUrl: "/hls/abc123/abc123.m3u8",
  thumbnailUrl: "/hls/abc123/abc123_thumb.jpg",
  metadata: {
    duration: 120.5,
    width: 1920,
    height: 1080,
    size: 52428800
  }
}
```

---

## 🔄 Fluxos de Uso

### **Fluxo 1: Criação de Projeto**

```
User (Editor)
     │
     ├─ 1. Create new project
     │   └─ InteractiveGraph with empty nodes[]
     │
     ├─ 2. Add Video Node
     │   ├─ Click "Upload Video"
     │   ├─ Select file
     │   ├─ Upload (shows progress)
     │   ├─ Process HLS (auto-polling)
     │   └─ Get HLS URL → assign to node.data.videoUrl
     │
     ├─ 3. Add Choice Node
     │   └─ Connect to video node
     │
     ├─ 4. Add more Video Nodes
     │   └─ Connect choices to videos
     │
     ├─ 5. Add End Node
     │   └─ Final choice destination
     │
     ├─ 6. Validate Graph
     │   └─ Check for errors (orphan nodes, no start, etc)
     │
     └─ 7. Save Project
         └─ POST /api/projects → upsert em PostgreSQL (fallback in-memory sem DATABASE_URL)
```

### **Fluxo 2: Reprodução (Player)**

```
User (Player)
     │
     ├─ 1. Load Projects
     │   └─ GET /api/projects
     │
     ├─ 2. Select Project
     │   └─ GET /api/projects/{id}
     │
     ├─ 3. Start Playback
     │   ├─ Find start node (type: 'video', first in list)
     │   ├─ Load HLS stream
     │   └─ HLS.js starts downloading segments
     │
     ├─ 4. Video Plays
     │   ├─ HLS.js adaptively streams
     │   └─ User watches
     │
     ├─ 5. Video Ends (or reaches choice point)
     │   ├─ Find outgoing edges
     │   ├─ Show choice buttons
     │   └─ Wait for user input
     │
     ├─ 6. User Makes Choice
     │   ├─ Navigate to target node
     │   ├─ Load new video HLS
     │   └─ Repeat from step 4
     │
     └─ 7. Reach End Node
         └─ Show ending screen
```

### **Fluxo 3: Video Processing (Detailed)**

```
┌────────────────────────────────────────────────┐
│          VIDEO PROCESSING TIMELINE             │
└────────────────────────────────────────────────┘

T+0s     Upload starts
         │
T+5s     Upload complete (100MB file)
         │
T+5s     FFprobe extracts metadata (instant)
         │
T+5s     Return videoId to Editor
         │
         [User clicks "Process"]
         │
T+6s     POST /process → Return 202 Accepted
         │
T+6s     Background: Start FFmpeg processes
         │
         ┌─────────┬─────────┬─────────┬─────────┐
         │ 360p    │ 480p    │ 720p    │ 1080p   │
         │ FFmpeg  │ FFmpeg  │ FFmpeg  │ FFmpeg  │
         └─────────┴─────────┴─────────┴─────────┘
         │         │         │         │
T+30s    ✓ Done    │         │         │
T+45s              ✓ Done    │         │
T+70s                        ✓ Done    │
T+120s                                 ✓ Done
         │
T+120s   Create master playlist
         │
T+121s   Generate thumbnail
         │
T+122s   Set status = "ready"
         │
T+122s   Editor polls → receives "ready" + HLS URL
         │
         ✅ COMPLETE
```

---

## 🗂️ Estrutura de Arquivos no Servidor

```
/uploads/
├── temp/                              ← Arquivos temporários
│   ├── 5ff7376a-...-9a2e69754097.mp4 ← Original (deletado após HLS)
│   └── abc123-...-def456.mp4
│
├── hls/                               ← HLS processado
│   ├── 0e7eda27-2266-4f40-8b73-bd7de37e6398/
│   │   ├── 0e7eda27-..._1080p.m3u8   ← Variant playlist
│   │   ├── 0e7eda27-..._1080p_000.ts ← Segmento 0 (4s)
│   │   ├── 0e7eda27-..._1080p_001.ts
│   │   ├── 0e7eda27-..._1080p_002.ts
│   │   ├── 0e7eda27-..._720p.m3u8
│   │   ├── 0e7eda27-..._720p_000.ts
│   │   ├── 0e7eda27-..._360p.m3u8
│   │   ├── 0e7eda27-..._360p_000.ts
│   │   ├── 0e7eda27-...m3u8          ← MASTER playlist
│   │   └── 0e7eda27-..._thumb.jpg    ← Thumbnail
│   │
│   └── 5ff7376a-4703-4961-b6d8-9a2e69754097/
│       └── (same structure)
│
└── videos/                            ← (Reserved for future use)
```

---

## 🚀 Performance & Otimizações

### **Processamento Paralelo**
- Todas as resoluções (360p, 480p, 720p, 1080p) são processadas **simultaneamente**
- Usa `Promise.all()` para executar FFmpeg em paralelo
- Reduz tempo total de processamento

### **Streaming Adaptativo**
- HLS.js escolhe automaticamente a melhor qualidade
- Troca de qualidade sem interrupção (seamless)
- Otimizado para diferentes velocidades de conexão

### **Segmentação Inteligente**
- Segmentos de 4 segundos (bom equilíbrio)
- Permite seek rápido
- Buffer mínimo necessário

### **Keyframes Regulares**
- Keyframe a cada 48 frames (~1.6s em 30fps)
- Permite seek preciso
- Melhor para narrativas interativas

---

## 🔮 Próximos Passos

### **Player Completo**
- [ ] Implementar engine de navegação do grafo
- [ ] Sistema de escolhas com timeout
- [ ] Transições suaves entre vídeos
- [ ] Analytics de sessão

### **Persistência**
- [x] Banco de dados PostgreSQL (projetos, vídeos e eventos de analítica, via `docker/init.sql` e camada de repositórios)
- [ ] File storage compatível com S3/MinIO para mídia
- [ ] Cache de metadados / fila de jobs de transcodificação

### **Features Avançadas**
- [ ] Pré-loading de próximos vídeos
- [ ] Gravação de sessões
- [ ] Estatísticas de caminhos tomados
- [ ] Editor colaborativo em tempo real

---

## 📚 Referências Técnicas

- **HLS Specification**: [RFC 8216](https://tools.ietf.org/html/rfc8216)
- **FFmpeg Documentation**: [ffmpeg.org/documentation.html](https://ffmpeg.org/documentation.html)
- **HLS.js**: [github.com/video-dev/hls.js](https://github.com/video-dev/hls.js)
- **ReactFlow**: [reactflow.dev](https://reactflow.dev)

---

**Última atualização**: Janeiro 2026  
**Versão do Documento**: 1.0
