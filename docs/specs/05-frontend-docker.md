# Especificação: 05 - Frontend Adaptation & Docker

**Agente Responsáveis:** `frontend-specialist` & `devops-engineer`

## Objetivo
Configurar o ambiente final: adaptar o frontend para a nova arquitetura de login/api e empacotar o backend via Docker Compose para implantação no VPS (Coolify).

## Requisitos Técnicos

**Frontend (React/Vite):**
1. **Configuração de API:** Remover `baseURL` hardcoded no Axios (`src/services/api.ts`) e usar `import.meta.env.VITE_API_URL` com fallback lógico.
2. **Setup de Dev Server:** Atualizar `vite.config.ts` para servir React SPA puro, removendo os plugins do Cloudflare (`@hono/vite-build`, etc.). Direcionar proxy da API de dev para `localhost:3200`.
3. **Autenticação:** Substituir a verificação manual de credenciais em `Login.tsx`. Deve enviar o payload ao Identity Server (`https://identity.coliseusistemas.com.br/api/auth/login`).
4. **Token Handling:** O Identity retornará um JWT. Salvar o token e passá-lo como `Authorization: Bearer <token>` em toda request para o backend.
5. **Limpeza:** Remover `@hono` e `wrangler` do package.json.

**Docker & Infra (VPS):**
1. **Dockerfile do Middleware:** Criar no diretório `middleware/Dockerfile` uma build baseada no `node:20-alpine`, copiando o `package.json`, ignorando devDependencies, executando com `dumb-init` chamando o `src/index.js`.
2. **Docker Compose (`docker-compose.dashboard.yml`):**
   - Espelhe as regras do AutoCenter.
   - Definir ENV vars principais: `PORT=3200`, banco (`PG_DATABASE=nexus_dashboard`, HOST, USER, PASSWORD), chave JWT (`JWT_DEVICE_KEY`), Worker Key (`INTERNAL_API_KEY`).
   - Network externa obrigatoriamente ligada em `nexus_network`.
   - Adicionar healthcheck pingando a rota de liveness que o back-end providenciar.

## Critério de Aceite
A aplicação roda sob um build `npm run build` padrão e limpo (sem warnings de cloudflare hooks). Executando `docker compose -f docker-compose.dashboard.yml up` na VPS levanta o middleware perfeitamente encapsulado.
