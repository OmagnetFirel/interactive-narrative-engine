# Chronoshift Empire Design System

## Visão Geral

Chronoshift Empire é um tema inspirado na combinação entre:

* Ekko (League of Legends)
* Qiyana (League of Legends)

A proposta é unir:

* Tecnologia
* Velocidade
* Inovação
* Sofisticação
* Poder
* Exclusividade

O objetivo NÃO é criar uma interface gamer.

O objetivo é criar uma experiência visual que pareça uma ferramenta premium de tecnologia, semelhante ao posicionamento de produtos como Linear, Stripe, Vercel e Raycast, porém com identidade própria.

---

# Personalidade da Marca

## Palavras-chave

* Futurista
* Premium
* Elegante
* Tecnológica
* Confiável
* Ágil
* Moderna

## O que evitar

* RGB exagerado
* Visual neon cyberpunk extremo
* Visual medieval
* Excesso de gradientes
* Ouro em excesso
* Aparência de dashboard gamer
* Interfaces muito coloridas

---

# Paleta de Cores

## Background

```css
--bg: #0B1018;
```

Uso:

* Fundo principal da aplicação
* Layout geral
* Áreas externas aos componentes

---

## Surface

```css
--surface: #141C26;
```

Uso:

* Cards
* Modais
* Sidebars
* Header
* Containers

---

## Surface Hover

```css
--surface-hover: #1B2430;
```

Uso:

* Hover de cards
* Hover de menus
* Hover de tabelas

---

## Cor Primária (Ekko)

```css
--primary: #00D4FF;
```

Representa:

* Tecnologia
* Inovação
* Movimento

Uso:

* Botões principais
* Links
* Elementos ativos
* Métricas importantes
* Indicadores de foco

---

## Cor Secundária (Qiyana)

```css
--secondary: #00C896;
```

Representa:

* Crescimento
* Sucesso
* Sofisticação

Uso:

* Estados positivos
* Crescimento
* Elementos secundários
* Tags

---

## Accent Premium

```css
--accent: #D4AF37;
```

Representa:

* Luxo
* Exclusividade
* Prestígio

Uso restrito:

* Plano Enterprise
* Badges Premium
* Destaques especiais
* Conquistas
* Rankings

Nunca usar como cor principal.

---

## Texto

```css
--text: #F8FAFC;
```

Texto principal.

---

## Texto Secundário

```css
--text-secondary: #94A3B8;
```

Uso:

* Descrições
* Labels
* Informações auxiliares

---

# Distribuição das Cores

A proporção ideal da interface é:

```text
50% Ciano (Ekko)
35% Tons escuros
10% Verde (Qiyana)
5% Ouro Premium
```

Isso garante equilíbrio visual e evita excesso de informação.

---

# Componentes

## Botão Primário

Objetivo:

* Chamada principal para ação

Exemplos:

* Criar Projeto
* Salvar
* Publicar
* Continuar

Estilo:

```css
background: linear-gradient(
  135deg,
  #00D4FF,
  #00C896
);
```

Características:

* Alto contraste
* Visual moderno
* Deve chamar atenção

---

## Botão Secundário

Objetivo:

Ações complementares.

Exemplos:

* Cancelar
* Voltar
* Ver Detalhes

Estilo:

```css
background: transparent;
border: 1px solid var(--primary);
```

---

## Cards

Objetivo:

Agrupar informações.

Exemplos:

* Estatísticas
* Projetos
* Usuários
* Relatórios

Estilo:

```css
background: var(--surface);
border: 1px solid rgba(0,212,255,.08);
```

Hover:

```css
border-color: var(--primary);
transform: translateY(-2px);
```

---

## Inputs

Objetivo:

Coleta de dados.

Estilo:

```css
background: var(--surface);
border: 1px solid rgba(255,255,255,.08);
```

Focus:

```css
border-color: var(--primary);
box-shadow: 0 0 0 4px rgba(0,212,255,.15);
```

---

# Métricas

## Métrica Principal

Exemplo:

```text
12.482
Usuários
```

Cor:

```css
color: var(--primary);
```

---

## Métrica Positiva

Exemplo:

```text
+24%
```

Cor:

```css
color: var(--secondary);
```

---

## Métrica Crítica

Exemplo:

```text
-15%
```

Cor:

```css
color: var(--danger);
```

---

# Badges

## Standard

Utilizar:

```css
background: rgba(0,212,255,.1);
color: var(--primary);
```

---

## Premium

Utilizar:

```css
background: rgba(212,175,55,.15);
color: var(--accent);
```

Exemplos:

* Enterprise
* Pro
* Elite
* Founder

---

# Navegação

## Header

Deve transmitir:

* Estabilidade
* Organização
* Sofisticação

Estrutura:

```text
Logo | Navegação | Ações | Usuário
```

Altura recomendada:

```css
72px
```

---

## Sidebar

Deve usar:

* Fundo escuro
* Indicador ativo em ciano
* Ícones minimalistas

Item ativo:

```css
background: rgba(0,212,255,.1);
border-left: 3px solid var(--primary);
```

---

# Tabelas

Linhas:

```css
border-bottom:
1px solid rgba(255,255,255,.05);
```

Hover:

```css
background: var(--surface-hover);
```

---

# Gráficos

Linha principal:

```css
var(--primary)
```

Linha secundária:

```css
var(--secondary)
```

Metas ou benchmarks:

```css
var(--accent)
```

---

# Espaçamento

Utilizar escala:

```text
4
8
12
16
24
32
48
64
```

Evitar valores aleatórios.

---

# Bordas

Pequenos elementos:

```css
8px
```

Cards:

```css
16px
```

Modais:

```css
20px
```

---

# Sombras

Sempre suaves.

Exemplo:

```css
box-shadow:
0 10px 30px rgba(0,0,0,.25);
```

Evitar sombras pesadas.

---

# Sensação Final

Ao abrir a aplicação, o usuário deve sentir:

"Estou usando uma ferramenta tecnológica premium, moderna e extremamente bem construída."

A experiência deve lembrar:

* Futuro (Ekko)
* Elegância (Qiyana)
* Performance
* Exclusividade

Sem parecer um jogo.
