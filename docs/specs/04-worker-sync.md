# Especificação: 04 - Worker .NET Integration

**Agente Responsável:** `csharp-developer` ou `backend-specialist` (com experiência .NET)
**Projeto Alvo:** O repositório `Nexus_Sales` local (`C:\Users\rober\.gemini\antigravity\scratch\Nexus_Sales\worker`)

## Objetivo
Adicionar as engrenagens ao Worker local do Nexus Sales para que ele alimente de forma assíncrona o Dashboard API. Seguir 100% o padrão do AutoCenter (Job específico, HttpClientFactory e Options config).

## Requisitos Técnicos

1. **Configuração Options (`worker/Config/DashboardApiOptions.cs`):**
   - Criar class para mapear `"DashboardApi"` no appsettings.
   - Keys: `Enabled` (bool), `BaseUrl`, `InternalApiKey`, `TimeoutSeconds`.
2. **Injeção de Dependência (`Program.cs`):**
   - Registrar `DashboardApiOptions` via `builder.Services.Configure<DashboardApiOptions>(...)`
   - Instanciar um Named HttpClient `"DashboardApiClient"` com Header padrão `X-Internal-Key` injetando o Option `InternalApiKey`.
3. **O Job Consolidado (`worker/Jobs/SyncDashboardDataJob.cs`):**
   - Criar `SyncDashboardDataJob` injetando `FirebirdService`, `IHttpClientFactory` e Options.
   - Extrair scripts SQL (ou os aproximados) direto do arquivo `c:\Users\rober\.gemini\antigravity\scratch\Nexus\python-agent\nexus_sync_agent.py` para C#. 
   - Exemplo (Clientes): `$ SELECT ID_CLIENTE, NOME, CPF_CNPJ FROM CLIENTES...`
   - Mapear para DTO. (Pode criar DTOs internos parecidos com a extração Python).
   - Fazer chunks (Batching 500) e postar via `PostAsJsonAsync` na rota `/internal/sync/clientes` do Middleware. Repetir o processo para Produtos, Vendedores, Vendas (com itens), Financeiro.
   - Adicionar o header `X-Tenant-Id` no Client na hora do post (obtido do `IdentityApiOptions.TenantId`).
4. **Agendamento (`WorkerService.cs`):**
   - Injetar o novo job e adicionar sua chamada `SafeRunAsync` junto ao timing desejado (ex: sincronização de 10 em 10 minutos ou agregada ao `catalogTimer` ou timer próprio).

## Critério de Aceite
Se o usuário configurar `"Enabled": true` no appsettings.json e apontar URLs, o Worker roda os comandos SQL no banco local Firebird e posta para o Dashboard (similar à implementação do AutoCenter Catalog Job). Nenhuma quebra de ciclo de vida do worker pré-existente (não travar threads/timer).
