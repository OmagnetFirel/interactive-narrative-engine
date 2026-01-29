# 📁 Refatoração do Player - Estrutura Modular

## 🎯 Objetivo

Refatorar o player de narrativas interativas para uma arquitetura modular, organizada e manutenível, separando responsabilidades sem alterar a lógica existente.

## 📂 Nova Estrutura

```
src/
├── main.ts                          # Entry point - orquestra os módulos
├── core/                            # Núcleo da aplicação
│   ├── types.ts                     # Interfaces e tipos TypeScript
│   ├── state.ts                     # Estado global e gerenciamento
│   └── config.ts                    # Configurações (API_URL, HLS configs)
├── services/                        # Camada de serviços (lógica de negócio)
│   ├── api.service.ts              # Chamadas HTTP (axios)
│   ├── hls.service.ts              # Gerenciamento HLS.js
│   └── timeline.service.ts         # Timeline virtual (seeking, cálculos)
├── controllers/                     # Controladores (orquestração)
│   ├── navigation.controller.ts    # Navegação entre nós
│   ├── video.controller.ts         # Controle de vídeo
│   ├── choices.controller.ts       # Sistema de escolhas
│   └── controls.controller.ts      # Controles customizados do player
├── ui/                             # Camada de apresentação
│   ├── dom-elements.ts             # Referências DOM centralizadas
│   ├── overlay.ui.ts               # Overlays (escolhas, fim)
│   └── progress.ui.ts              # Barra de progresso
└── utils/                          # Utilitários
    └── format.utils.ts             # Funções auxiliares (formatTime, etc)
```

## 🔍 Descrição dos Módulos

### **Core** (Núcleo)

- **types.ts**: Todas as interfaces e tipos TypeScript centralizados
- **state.ts**: Estado global reativo da aplicação
- **config.ts**: Configurações estáticas (URLs, constantes)

### **Services** (Serviços)

- **api.service.ts**: Encapsula todas as chamadas à API (projetos, stitching)
- **hls.service.ts**: Gerencia instâncias HLS.js, reprodução de vídeos
- **timeline.service.ts**: Lógica de timeline virtual (construção, seeking, cálculos)

### **Controllers** (Controladores)

- **navigation.controller.ts**: Navegação entre nós, transições, histórico
- **video.controller.ts**: Reprodução de vídeos individuais
- **choices.controller.ts**: Sistema de escolhas, timeout, pré-carregamento
- **controls.controller.ts**: Controles do player (play, pause, volume, fullscreen)

### **UI** (Interface)

- **dom-elements.ts**: Referências centralizadas aos elementos DOM
- **overlay.ui.ts**: Gerenciamento de overlays visuais
- **progress.ui.ts**: Barra de progresso e interações

### **Utils** (Utilitários)

- **format.utils.ts**: Funções auxiliares reutilizáveis

## 📊 Fluxo de Dados

```
main.ts
  ↓
  ├─→ apiService.getProjects()
  ├─→ navigation.navigateToNode()
  │     ↓
  │     ├─→ video.playVideo()
  │     │     └─→ hlsService.loadVideo()
  │     ├─→ choices.showChoices()
  │     └─→ timeline.buildVirtualTimeline()
  │
  └─→ controls.setupCustomControls()
        └─→ progress.updateVirtualProgress()
              └─→ timeline.getVirtualTime()
```

## ✅ Vantagens da Nova Estrutura

### 1. **Separação de Responsabilidades**

Cada módulo tem uma responsabilidade clara e bem definida.

### 2. **Manutenibilidade**

Fácil de encontrar e modificar código específico.

### 3. **Testabilidade**

Módulos isolados facilitam testes unitários.

### 4. **Reutilização**

Serviços e utils podem ser importados em qualquer lugar.

### 5. **Escalabilidade**

Adicionar novos recursos é mais simples e organizado.

### 6. **Legibilidade**

Código mais limpo e auto-documentado.

## 🔧 Como Usar

### Importar Estado

```typescript
import { state } from "./core/state";

console.log(state.currentNode);
```

### Usar Serviços

```typescript
import { apiService } from "./services/api.service";

const projects = await apiService.getProjects();
```

### Navegar

```typescript
import { navigateToNode } from "./controllers/navigation.controller";

navigateToNode(nextNode);
```

### Atualizar UI

```typescript
import { updateVirtualProgress } from "./ui/progress.ui";

updateVirtualProgress();
```

## 🚀 Próximos Passos (Melhorias Futuras)

1. **Adicionar testes unitários** para cada módulo
2. **Implementar padrão Observer** para reatividade do estado
3. **Criar hooks/eventos** para extensibilidade
4. **Adicionar error boundaries** para tratamento de erros
5. **Implementar logging service** centralizado
6. **Cache de playlists stitched** para melhor performance

## 📝 Notas

- ✅ Toda a lógica original foi mantida
- ✅ Zero breaking changes
- ✅ Compatível com código existente
- ✅ TypeScript strict mode compliant
- ✅ Sem dependências circulares (usamos dynamic imports onde necessário)

## 🎓 Padrões Aplicados

- **Single Responsibility Principle**: Cada módulo faz uma coisa
- **Dependency Injection**: Services são singletons exportados
- **Facade Pattern**: Controllers abstraem complexidade
- **Module Pattern**: Encapsulamento claro
