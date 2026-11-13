# Deploy de produção

Configuração dimensionada para até cinco autores, uma transcodificação por vez
e aproximadamente dez espectadores simultâneos.

## Infraestrutura

- VPS Linux com 4 vCPU, 8 GB RAM e pelo menos 75 GB NVMe.
- Docker Engine com o plugin Compose.
- Domínio administrado pela Cloudflare.
- Portas públicas: somente 80 e 443. SSH deve ficar restrito por Tailscale.
- PostgreSQL e containers da aplicação não devem publicar portas no host.

Na Cloudflare, use proxy (nuvem laranja) para `editor`, `play` e `api`. Use
somente DNS (nuvem cinza) para `upload` e `media`: uploads podem exceder o
limite do proxy gratuito e vídeo externo não deve ser entregue pelo CDN
gratuito. A proteção anti-DDoS e o tráfego ilimitado da VPS continuam sendo
necessários para esses dois hosts.

## Preparação

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Substitua todos os valores de exemplo. Gere os segredos, por exemplo:

```bash
openssl rand -base64 48
```

Crie registros DNS para os cinco hosts apontando ao IPv4 da VPS. Antes de
subir a aplicação, confira se `.env.production` não está versionado.

## Inicialização

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

O primeiro usuário administrador é criado com `ADMIN_EMAIL` e
`ADMIN_PASSWORD`. Depois do login, ele pode gerar links de convite. Convites
são de uso único e expiram; não existe cadastro público.

Para uma instalação que já possua banco, aplique a migração antes de trocar a
versão da API:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres psql -U ine_user -d ine_database \
  < docker/migrations/002_multiuser_auth.sql

docker compose --env-file .env.production -f docker-compose.prod.yml   exec -T postgres psql -U ine_user -d ine_database   < docker/migrations/003_public_by_default.sql
```

A API também cria as estruturas ausentes ao iniciar, mas manter a migração
explícita facilita auditoria e recuperação.

## Firewall

Permita entrada TCP 80/443 e UDP 443. Não publique 5432, 3000, 3001, 5173 ou
8080. Instale Tailscale na VPS e use-o para SSH; após validar o acesso privado,
bloqueie a porta 22 na interface pública.

## Backups

O script abaixo salva PostgreSQL e o volume de mídia e remove cópias locais
com mais de sete dias:

```bash
chmod +x ops/backup.sh
./ops/backup.sh
```

Agende-o diariamente e copie ao menos uma cópia semanal para outro provedor
ou computador. O backup diário oferecido pela VPS não substitui `pg_dump`.
Teste periodicamente a restauração em uma stack separada.

## Checklist de validação

1. `/health` retorna `ok` e os containers aparecem saudáveis.
2. Login incorreto é limitado após cinco tentativas.
3. O administrador gera um convite e o convidado cria sua conta.
4. Dois usuários não conseguem listar ou abrir projetos e vídeos um do outro.
5. Projeto privado não abre no player; projeto público abre pelo share token.
6. Upload de vídeo, transcodificação e reprodução HLS funcionam.
7. Uma segunda transcodificação simultânea recebe HTTP 429.
8. Reiniciar os containers preserva banco e mídia.
9. CPU, memória e disco permanecem estáveis durante dez reproduções.
10. Um backup é restaurado com sucesso em ambiente separado.

Configure alerta de disco em 70% e alerta crítico em 85%. Remova projetos ou
amplie o volume antes de atingir o limite; FFmpeg precisa de espaço temporário
durante a transcodificação.
