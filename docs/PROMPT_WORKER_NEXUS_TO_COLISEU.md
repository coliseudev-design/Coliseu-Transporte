# PROMPT DE IMPLEMENTAÇÃO: Sincronização de Clientes e Títulos (Nexus -> ERP Coliseu / Firebird)

> **Instruções para a IA / Desenvolvedor:**
> Você é um Engenheiro de Software especialista em C# / .NET, Dapper/ADO.NET e Firebird SQL responsável pelo Worker local de sincronização do ERP Coliseu.
> Implemente a funcionalidade descrita abaixo no projeto do Worker seguindo rigorosamente as especificações, contratos de API e comandos SQL.

---

## 1. CONTEXTO E OBJETIVO

Atualmente o Worker já realiza:
1. Envio de dados da retaguarda do ERP Coliseu (Firebird) para o Nexus (clientes, títulos, vendas).
2. Busca de quitações realizadas no Nexus/Asaas (`GET /api/sync/pending-payments`) e baixa no Firebird.

**Novo Requisito Obrigatório:**
Implementar a via inversa: **Clientes cadastrados** e **Títulos lançados** diretamente no Nexus Web/Mobile devem ser consumidos pelo Worker e inseridos no banco Firebird do ERP Coliseu.
Após a inserção bem-sucedida no Firebird, o Worker deve notificar a API do Nexus informando o `id_firebird` gerado para manter os IDs sincronizados entre as duas pontas.

---

## 2. CONTRATOS DA API DO NEXUS (MIDDLEWARE)

### Endpoint 1: Buscar Operações Pendentes do Nexus
- **Método:** `GET`
- **Rota:** `/api/sync/pending-operations`
- **Headers Obrigatórios:**
  - `X-Tenant-Id`: `{TenantId}`
  - `X-Internal-Key`: `{InternalApiKey}` (ou `Authorization: Bearer {Token}`)
- **Exemplo de Resposta JSON:**
```json
{
  "operations": [
    {
      "id": 101,
      "tabela": "CLIENTES",
      "operacao": "INSERT",
      "payload": {
        "id_nexus": 50,
        "nome": "AGROPECUARIA PANTANAL LTDA",
        "razao_social": "AGROPECUARIA PANTANAL LTDA",
        "nome_fantasia": "PANTANAL AGRO",
        "documento": "12345678000199",
        "email": "financeiro@pantanal.com.br",
        "email_financeiro": "financeiro@pantanal.com.br",
        "telefone": "6733334444",
        "celular_secundario": "67999998888",
        "cidade": "CAMPO GRANDE",
        "estado": "MS",
        "endereco_completo": "AV AFONSO PENA, 1500 - CENTRO",
        "origem": "NEXUS",
        "criado_em": "2026-09-05T12:00:00.000Z"
      },
      "status": "PENDENTE",
      "created_at": "2026-09-05T12:00:00.000Z"
    },
    {
      "id": 102,
      "tabela": "LANCTO_FINANCEIRO",
      "operacao": "INSERT",
      "payload": {
        "id_nexus": 800,
        "grupo_id": "GRP-800",
        "tipo": "RECEBER",
        "cliente_id": 50,
        "cliente_id_firebird": 2045,
        "cliente_documento": "12345678000199",
        "cliente_nome": "AGROPECUARIA PANTANAL LTDA",
        "descricao": "MENSALIDADE SISTEMA 09/2026",
        "data_emissao": "2026-09-05",
        "data_vencimento": "2026-09-25",
        "valor": 250.00,
        "portador_id": 1,
        "portador_nome": "CARTEIRA",
        "especie_id": 2,
        "especie_nome": "DUPLICATA",
        "plano_contas_id": 1,
        "plano_contas_nome": "MENSALIDADE / SERVIÇO",
        "centro_custo_id": 6,
        "centro_custo": "COLISEU RECEITAS",
        "numero_parcela": 1,
        "total_parcelas": 1,
        "ndoc": "FT-800",
        "observacoes": "Lançado via Nexus Financeiro",
        "origem": "NEXUS",
        "criado_em": "2026-09-05T12:00:00.000Z"
      },
      "status": "PENDENTE",
      "created_at": "2026-09-05T12:00:00.000Z"
    }
  ],
  "count": 2
}
```

---

### Endpoint 2: Confirmar Processamento da Operação
- **Método:** `POST`
- **Rota:** `/api/sync/confirm-operation`
- **Headers Obrigatórios:**
  - `X-Tenant-Id`: `{TenantId}`
  - `X-Internal-Key`: `{InternalApiKey}`
  - `Content-Type`: `application/json`

- **Payload em caso de Sucesso:**
```json
{
  "id": 101,
  "id_firebird": 2045,
  "success": true
}
```
*(Ao receber `success: true` com o `id_firebird`, o Nexus atualiza o registro correspondente em `dash_clientes` ou `dash_financeiro` e altera o status da operação para `CONCLUIDO`).*

- **Payload em caso de Erro:**
```json
{
  "id": 101,
  "success": false,
  "error": "Descrição detalhada do erro gerado pelo Firebird"
}
```

---

## 3. LÓGICA DE PROCESSAMENTO NO FIREBIRD

### Caso 1: Operação `CLIENTES` (INSERT)
1. **Limpeza de Documento:** Remover pontuações (`.`, `-`, `/`) do CPF/CNPJ.
2. **Verificação de Duplicidade:**
   ```sql
   SELECT FIRST 1 ID_CLIENTE 
   FROM CLIENTES 
   WHERE REPLACE(REPLACE(REPLACE(COALESCE(CPF_CNPJ, ''), '.', ''), '-', ''), '/', '') = @DocumentoLimpo;
   ```
   - **Se o cliente já existir no Firebird:**
     Recupere o `ID_CLIENTE` existente e envie a confirmação ao Nexus (`success: true`, `id_firebird: idExistente`). Não gere duplicidade.
   - **Se o cliente NÃO existir:**
     Gere um novo ID pelo Generator do Firebird:
     ```sql
     SELECT GEN_ID(GEN_CLIENTES_ID, 1) FROM RDB$DATABASE;
     ```
     Execute o INSERT na tabela `CLIENTES` (ajuste os campos conforme a tabela do Coliseu):
     ```sql
     INSERT INTO CLIENTES (
         ID_CLIENTE, NOME, RAZAO_SOCIAL, FANTASIA, CPF_CNPJ,
         EMAIL, TELEFONE, CELULAR, CIDADE, UF, ENDERECO,
         ATIVO, DATA_CADASTRO
     ) VALUES (
         @IdCliente, @Nome, @RazaoSocial, @Fantasia, @Documento,
         @Email, @Telefone, @Celular, @Cidade, @Uf, @Endereco,
         'S', CURRENT_TIMESTAMP
     );
     ```
     Confirme no Nexus com o `IdCliente` gerado.

---

### Caso 2: Operação `LANCTO_FINANCEIRO` (INSERT)
1. **Identificação do Cliente:**
   - Se `payload.cliente_id_firebird` for válido (> 0), use-o diretamente.
   - Se estiver nulo ou zerado, busque no Firebird pelo documento (`payload.cliente_documento`):
     ```sql
     SELECT FIRST 1 ID_CLIENTE FROM CLIENTES WHERE CPF_CNPJ = @Documento;
     ```
   - Se ainda assim não encontrar, vincule ao Cliente Padrão / Balcão configurado no ERP.
2. **Obtenção do Novo ID do Título:**
   - Use o Generator correspondente para contas a receber:
     ```sql
     SELECT GEN_ID(GEN_RECEBER_ID, 1) FROM RDB$DATABASE;
     ```
3. **Gravação do Título a Receber:**
   Execute the INSERT (exemplo de estrutura padrão de contas a receber do Coliseu):
   ```sql
    INSERT INTO RECEBER (
        ID_RECEBER,
        ID_CLIENTE,
        DOCUMENTO,
        NUMERO_DOC,
        DESCRICAO,
        DATA_EMISSAO,
        DATA_VENCIMENTO,
        VALOR_NOMINAL,
        VALOR_SALDO,
        PARCELA,
        PORTADOR,
        ESPECIE,
        CENTRO_CUSTO,
        PLANO_CONTAS,
        STATUS,
        ORIGEM
    ) VALUES (
        @IdReceber,
        @IdCliente,
        @Documento,
        @NDoc,
        @Descricao,
        @DataEmissao,
        @DataVencimento,
        @Valor,
        @Valor,
        @NumeroParcela,
        @Portador,
        @Especie,
        @CentroCusto,
        @PlanoContas,
        'A',
        'NEXUS'
    );
    ```
    *(Nota: Se o ERP utilizar chaves numéricas `ID_CC` e `ID_PLANO_CONTAS`, utilize `payload.centro_custo_id` e `payload.plano_contas_id`).*
4. **Confirmação:**
   Chame `POST /api/sync/confirm-operation` com `{ id: op.id, id_firebird: idReceberGerado, success: true }`.

---

## 4. EXEMPLO DE IMPLEMENTAÇÃO EM C# (.NET)

Crie o arquivo `SyncPendingOperationsJob.cs` no projeto do Worker:

```csharp
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using FirebirdSql.Data.FirebirdClient;

public class SyncPendingOperationsJob
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string _connectionString;
    private readonly ILogger<SyncPendingOperationsJob> _logger;

    public SyncPendingOperationsJob(
        IHttpClientFactory httpClientFactory, 
        string connectionString, 
        ILogger<SyncPendingOperationsJob> logger)
    {
        _httpClientFactory = httpClientFactory;
        _connectionString = connectionString;
        _logger = logger;
    }

    public async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var client = _httpClientFactory.CreateClient("DashboardApiClient");
        
        try
        {
            var response = await client.GetFromJsonAsync<PendingOperationsResponse>("/api/sync/pending-operations", stoppingToken);
            if (response == null || response.Operations == null || response.Operations.Count == 0)
                return;

            _logger.LogInformation("[NexusSync] {Count} operações pendentes recebidas do Nexus.", response.Operations.Count);

            using var conn = new FbConnection(_connectionString);
            await conn.OpenAsync(stoppingToken);

            foreach (var op in response.Operations)
            {
                if (stoppingToken.IsCancellationRequested) break;

                using var tx = conn.BeginTransaction();
                try
                {
                    int? idFirebirdGerado = null;

                    if (op.Tabela.Equals("CLIENTES", StringComparison.OrdinalIgnoreCase))
                    {
                        idFirebirdGerado = ProcessarCliente(conn, tx, op.Payload, op.Operacao);
                    }
                    else if (op.Tabela.Equals("LANCTO_FINANCEIRO", StringComparison.OrdinalIgnoreCase))
                    {
                        idFirebirdGerado = ProcessarTituloFinanceiro(conn, tx, op.Payload);
                    }
                    else if (op.Tabela.Equals("ALTERACAO_TITULO", StringComparison.OrdinalIgnoreCase))
                    {
                        idFirebirdGerado = ProcessarAlteracaoTitulo(conn, tx, op.Payload);
                    }

                    tx.Commit();

                    // Notifica sucesso ao Nexus com o ID gerado no Firebird
                    await client.PostAsJsonAsync("/api/sync/confirm-operation", new
                    {
                        id = op.Id,
                        id_firebird = idFirebirdGerado,
                        success = true
                    }, stoppingToken);

                    _logger.LogInformation("[NexusSync] Operação #{Id} ({Tabela}) concluída com ID_FIREBIRD={FbId}.", op.Id, op.Tabela, idFirebirdGerado);
                }
                catch (Exception ex)
                {
                    tx.Rollback();
                    _logger.LogError(ex, "[NexusSync] Erro ao processar operação #{Id} no Firebird.", op.Id);

                    // Notifica falha ao Nexus
                    await client.PostAsJsonAsync("/api/sync/confirm-operation", new
                    {
                        id = op.Id,
                        success = false,
                        error = ex.Message
                    }, stoppingToken);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[NexusSync] Falha ao consultar pending-operations na API.");
        }
    }

    private int ProcessarCliente(FbConnection conn, FbTransaction tx, JsonElement payload, string operacao = "INSERT")
    {
        string doc = GetStringSafe(payload, "documento");
        string cleanDoc = System.Text.RegularExpressions.Regex.Replace(doc, @"[^\d]", "");

        // Formata CPF/CNPJ com pontuação oficial para compatibilidade com os campos/máscaras Delphi do Coliseu
        string formattedDoc = doc;
        if (cleanDoc.Length == 14)
        {
            formattedDoc = Convert.ToUInt64(cleanDoc).ToString(@"00\.000\.000\/0000\-00");
        }
        else if (cleanDoc.Length == 11)
        {
            formattedDoc = Convert.ToUInt64(cleanDoc).ToString(@"000\.000\.000\-00");
        }

        int idFb = GetInt32Safe(payload, "id_firebird");

        // 1. Verifica se já existe por documento
        if (idFb <= 0 && !string.IsNullOrWhiteSpace(cleanDoc))
        {
            using var cmdCheck = new FbCommand(
                "SELECT FIRST 1 ID_CLIENTE FROM CLIENTES WHERE REPLACE(REPLACE(REPLACE(COALESCE(CPF_CNPJ, ''), '.', ''), '-', ''), '/', '') = @DOC", conn, tx);
            cmdCheck.Parameters.AddWithValue("@DOC", cleanDoc);
            var existingId = cmdCheck.ExecuteScalar();
            if (existingId != null && existingId != DBNull.Value)
                idFb = Convert.ToInt32(existingId);
        }

        string nome = GetStringSafe(payload, "nome", "CLIENTE NEXUS");
        string razao = GetStringSafe(payload, "razao_social", nome);
        string fone = GetStringSafe(payload, "telefone");
        string email = GetStringSafe(payload, "email");
        string cidade = GetStringSafe(payload, "cidade");
        string uf = GetStringSafe(payload, "estado");

        if (idFb > 0)
        {
            // Atualiza cliente existente no Firebird
            using var cmdUpd = new FbCommand(@"
                UPDATE CLIENTES 
                SET NOME = @NOME, RAZAO_SOCIAL = @RAZAO, CPF_CNPJ = @DOC, TELEFONE = @FONE, EMAIL = @EMAIL, CIDADE = @CIDADE, UF = @UF
                WHERE ID_CLIENTE = @ID", conn, tx);
            cmdUpd.Parameters.AddWithValue("@ID", idFb);
            cmdUpd.Parameters.AddWithValue("@NOME", Truncate(nome, 60));
            cmdUpd.Parameters.AddWithValue("@RAZAO", Truncate(razao, 60));
            cmdUpd.Parameters.AddWithValue("@DOC", Truncate(formattedDoc, 20));
            cmdUpd.Parameters.AddWithValue("@FONE", Truncate(fone, 20));
            cmdUpd.Parameters.AddWithValue("@EMAIL", Truncate(email, 100));
            cmdUpd.Parameters.AddWithValue("@CIDADE", Truncate(cidade, 40));
            cmdUpd.Parameters.AddWithValue("@UF", Truncate(uf, 2));
            cmdUpd.ExecuteNonQuery();
            return idFb;
        }

        // 2. Gera novo ID
        int novoId;
        using (var cmdGen = new FbCommand("SELECT GEN_ID(GEN_CLIENTES_ID, 1) FROM RDB$DATABASE", conn, tx))
        {
            novoId = Convert.ToInt32(cmdGen.ExecuteScalar());
        }

        // 3. Insere no Firebird com máscara completa no CPF/CNPJ
        using (var cmdIns = new FbCommand(@"
            INSERT INTO CLIENTES (ID_CLIENTE, NOME, RAZAO_SOCIAL, CPF_CNPJ, TELEFONE, EMAIL, CIDADE, UF, ATIVO, DATA_CADASTRO)
            VALUES (@ID, @NOME, @RAZAO, @DOC, @FONE, @EMAIL, @CIDADE, @UF, 'S', CURRENT_TIMESTAMP)", conn, tx))
        {
            cmdIns.Parameters.AddWithValue("@ID", novoId);
            cmdIns.Parameters.AddWithValue("@NOME", Truncate(nome, 60));
            cmdIns.Parameters.AddWithValue("@RAZAO", Truncate(razao, 60));
            cmdIns.Parameters.AddWithValue("@DOC", Truncate(formattedDoc, 20));
            cmdIns.Parameters.AddWithValue("@FONE", Truncate(fone, 20));
            cmdIns.Parameters.AddWithValue("@EMAIL", Truncate(email, 100));
            cmdIns.Parameters.AddWithValue("@CIDADE", Truncate(cidade, 40));
            cmdIns.Parameters.AddWithValue("@UF", Truncate(uf, 2));
            cmdIns.ExecuteNonQuery();
            return novoId;
        }
    }

    private int ProcessarTituloFinanceiro(FbConnection conn, FbTransaction tx, JsonElement payload)
    {
        // 1. Resolve ID_CLIENTE no Firebird
        int idCliente = GetInt32Safe(payload, "cliente_id_firebird");
        if (idCliente <= 0)
        {
            string cleanDoc = System.Text.RegularExpressions.Regex.Replace(GetStringSafe(payload, "cliente_documento"), @"[^\d]", "");
            if (!string.IsNullOrEmpty(cleanDoc))
            {
                using var cmdFind = new FbCommand(
                    "SELECT FIRST 1 ID_CLIENTE FROM CLIENTES WHERE REPLACE(REPLACE(REPLACE(COALESCE(CPF_CNPJ, ''), '.', ''), '-', ''), '/', '') = @DOC", conn, tx);
                cmdFind.Parameters.AddWithValue("@DOC", cleanDoc);
                var found = cmdFind.ExecuteScalar();
                if (found != null && found != DBNull.Value) idCliente = Convert.ToInt32(found);
            }
        }

        if (idCliente <= 0)
        {
            throw new Exception($"Cliente não localizado no Firebird pelo documento ({GetStringSafe(payload, "cliente_documento")}) nem pelo ID_FIREBIRD.");
        }

        // 2. Gera ID_RECEBER via Generator do Firebird
        int novoIdTitulo;
        using (var cmdGen = new FbCommand("SELECT GEN_ID(GEN_RECEBER_ID, 1) FROM RDB$DATABASE", conn, tx))
        {
            novoIdTitulo = Convert.ToInt32(cmdGen.ExecuteScalar());
        }

        // 3. Extrai dados do título de forma segura contra tipos String/Number
        string desc = GetStringSafe(payload, "descricao", "TITULO NEXUS");
        string ndoc = GetStringSafe(payload, "ndoc", $"NX-{novoIdTitulo}");
        decimal valor = GetDecimalSafe(payload, "valor", 0m);
        string dtVencStr = GetStringSafe(payload, "data_vencimento");
        DateTime vencto = !string.IsNullOrEmpty(dtVencStr) && DateTime.TryParse(dtVencStr, out var dtv) ? dtv : DateTime.Today;
        string dtEmisStr = GetStringSafe(payload, "data_emissao");
        DateTime emissao = !string.IsNullOrEmpty(dtEmisStr) && DateTime.TryParse(dtEmisStr, out var dte) ? dte : DateTime.Today;
        string portador = GetStringSafe(payload, "portador_nome", "CARTEIRA");
        string especie = GetStringSafe(payload, "especie_nome", "DUPLICATA");
        int parcela = GetInt32Safe(payload, "numero_parcela", 1);
        string moeda = GetStringSafe(payload, "moeda", "REAL");

        int centroCustoId = GetInt32Safe(payload, "centro_custo_id", 6);
        string centroCustoNome = GetStringSafe(payload, "centro_custo", "COLISEU RECEITAS");

        int planoContasId = GetInt32Safe(payload, "plano_contas_id", 1);
        if (planoContasId <= 0) planoContasId = 1;
        string planoContasNome = GetStringSafe(payload, "plano_contas_nome", "MENSALIDADE / SERVIÇO");

        // 4. Insere no Firebird
        // (Ajuste os nomes das colunas conforme a tabela RECEBER do seu Coliseu)
        using (var cmdIns = new FbCommand(@"
            INSERT INTO RECEBER (
                ID_RECEBER, ID_CLIENTE, DESCRICAO, NUMERO_DOC, DATA_EMISSAO, 
                DATA_VENCIMENTO, VALOR_NOMINAL, VALOR_SALDO, PARCELA, PORTADOR, ESPECIE, 
                CENTRO_CUSTO, PLANO_CONTAS, MOEDA, STATUS, OBSERVACAO
            ) VALUES (
                @ID, @ID_CLI, @DESC, @NDOC, @EMIS,
                @VENC, @VAL, @VAL, @PARC, @PORT, @ESP, 
                @CC, @PLANO, @MOEDA, 'A', 'Lançado via Nexus Financeiro'
            )", conn, tx))
        {
            cmdIns.Parameters.AddWithValue("@ID", novoIdTitulo);
            cmdIns.Parameters.AddWithValue("@ID_CLI", idCliente);
            cmdIns.Parameters.AddWithValue("@DESC", Truncate(desc, 60));
            cmdIns.Parameters.AddWithValue("@NDOC", Truncate(ndoc, 20));
            cmdIns.Parameters.AddWithValue("@EMIS", emissao);
            cmdIns.Parameters.AddWithValue("@VENC", vencto);
            cmdIns.Parameters.AddWithValue("@VAL", valor);
            cmdIns.Parameters.AddWithValue("@PARC", parcela);
            cmdIns.Parameters.AddWithValue("@PORT", Truncate(portador, 20));
            cmdIns.Parameters.AddWithValue("@ESP", Truncate(especie, 20));
            cmdIns.Parameters.AddWithValue("@CC", Truncate(centroCustoNome, 30));
            cmdIns.Parameters.AddWithValue("@PLANO", Truncate(planoContasNome, 40));
            cmdIns.Parameters.AddWithValue("@MOEDA", Truncate(moeda, 10));
            cmdIns.ExecuteNonQuery();
        }

        return novoIdTitulo;
    }

    private int ProcessarAlteracaoTitulo(FbConnection conn, FbTransaction tx, JsonElement payload)
    {
        int idFb = GetInt32Safe(payload, "id_firebird");
        if (idFb <= 0) return 0;

        string desc = GetStringSafe(payload, "descricao");
        string dtVencStr = GetStringSafe(payload, "data_vencimento");
        DateTime? vencto = !string.IsNullOrEmpty(dtVencStr) && DateTime.TryParse(dtVencStr, out var dtv) ? dtv : null;
        decimal valor = GetDecimalSafe(payload, "valor", 0m);
        string moeda = GetStringSafe(payload, "moeda", "REAL");
        string cc = GetStringSafe(payload, "centro_custo", "COLISEU RECEITAS");
        string plano = GetStringSafe(payload, "plano_contas", "MENSALIDADE / SERVIÇO");

        using var cmdUpd = new FbCommand(@"
            UPDATE RECEBER
            SET CENTRO_CUSTO = COALESCE(NULLIF(@CC, ''), CENTRO_CUSTO),
                PLANO_CONTAS = COALESCE(NULLIF(@PLANO, ''), PLANO_CONTAS),
                MOEDA = COALESCE(NULLIF(@MOEDA, ''), MOEDA)
            WHERE ID_RECEBER = @ID", conn, tx);
        cmdUpd.Parameters.AddWithValue("@ID", idFb);
        cmdUpd.Parameters.AddWithValue("@CC", Truncate(cc, 30));
        cmdUpd.Parameters.AddWithValue("@PLANO", Truncate(plano, 40));
        cmdUpd.Parameters.AddWithValue("@MOEDA", Truncate(moeda, 10));
        cmdUpd.ExecuteNonQuery();

        return idFb;
    }

    private static decimal GetDecimalSafe(JsonElement el, string propName, decimal defaultVal = 0m)
    {
        if (!el.TryGetProperty(propName, out var p)) return defaultVal;
        if (p.ValueKind == JsonValueKind.Number && p.TryGetDecimal(out var d)) return d;
        if (p.ValueKind == JsonValueKind.String && decimal.TryParse(p.GetString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var ds)) return ds;
        return defaultVal;
    }

    private static int GetInt32Safe(JsonElement el, string propName, int defaultVal = 0)
    {
        if (!el.TryGetProperty(propName, out var p)) return defaultVal;
        if (p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var i)) return i;
        if (p.ValueKind == JsonValueKind.String && int.TryParse(p.GetString(), out var is_)) return is_;
        return defaultVal;
    }

    private static string GetStringSafe(JsonElement el, string propName, string defaultVal = "")
    {
        if (!el.TryGetProperty(propName, out var p)) return defaultVal;
        if (p.ValueKind == JsonValueKind.String) return p.GetString() ?? defaultVal;
        return p.ToString();
    }

    private static string Truncate(string val, int maxLen)
    {
        if (string.IsNullOrEmpty(val)) return "";
        return val.Length <= maxLen ? val : val.Substring(0, maxLen);
    }
}

public class PendingOperationsResponse
{
    public List<PendingOperationItem> Operations { get; set; } = new();
    public int Count { get; set; }
}

public class PendingOperationItem
{
    public int Id { get; set; }
    public string Tabela { get; set; } = "";
    public string Operacao { get; set; } = "";
    public JsonElement Payload { get; set; }
    public string Status { get; set; } = "";
}
```

---

## 5. PREVENÇÃO RIGOROSA CONTRA DUPLICAÇÃO DE DADOS (ANTI-LOOP REVERSO)

> ⚠️ **ATENÇÃO MÁXIMA:** Um título ou cliente lançado no Nexus vai para o Coliseu Firebird. **Ele NÃO pode voltar para o Nexus como um novo registro duplicado.**

### Como a arquitetura garante que NÃO ocorra duplicação:

1. **A Chave Mestra é o `id_firebird`:**
   - No Nexus, a tabela `dash_financeiro` e a tabela `dash_clientes` possuem restrição única: `UNIQUE(tenant_id, id_firebird)`.
   - Ao lançar no Nexus, o registro nasce com `id_firebird = NULL`.
   - O Worker insere o registro no Firebird, obtém o Generator gerado (ex: `ID_RECEBER = 9999`) e **imediatamente** chama `POST /api/sync/confirm-operation` informando `id_firebird: 9999`.
   - O Nexus grava `id_firebird = 9999` no título original do Nexus.
   - Quando o Worker executa a rotina comum de exportação do Coliseu para o Nexus (`POST /api/sync/financials`), o payload conterá `id_firebird: 9999`. Ao receber, o Nexus executa `ON CONFLICT (tenant_id, id_firebird) DO UPDATE`. **Nenhum registro novo é criado**, ocorrendo apenas a atualização dos dados.

2. **Blindagem contra Concorrência (Sync Regular rodar antes do Confirm):**
   - Se a rotina regular de exportação do Firebird enviar os dados para o Nexus antes do `confirm-operation` responder:
     - **Para Clientes:** O Nexus localiza clientes com o mesmo CPF/CNPJ limpo onde `id_firebird IS NULL` e faz o vínculo automático do `id_firebird`, evitando criar um segundo cliente.
     - **Para Títulos:** O Nexus busca títulos locais com o mesmo cliente, valor e data de vencimento onde `id_firebird IS NULL` e faz o vínculo automático, impedindo a duplicação do título.

3. **Preservação de Dados Nativos do Nexus:**
   - A sincronização vinda do Coliseu **NÃO apaga** dados gerados no Nexus:
     - O campo `origem = 'NEXUS'` é preservado.
     - Dados de boletos/PIX gerados no Nexus (`asaas_bank_slip_url`, `asaas_linha_digitavel`, `asaas_bar_code`, `pix_qrcode`) **não são sobrescritos**.
     - Se o título já foi pago no Nexus/Asaas (`status_pagamento = 'PAGO'`), o sync do ERP não reverte o status para `'ABERTO'`.

4. **Boas Práticas na Query de Exportação do Worker (Coliseu -> Nexus):**
   - Ao inserir títulos no Firebird, mantenha no campo `OBSERVACAO` a menção `'Lançado via Nexus Financeiro'` e no campo `DOCUMENTO` o número `NDOC` do Nexus.
   - Opcionalmente, na query que exporta `RECEBER` para o Nexus, se você já possui controle de `DATA_ALTERACAO` ou `STATUS_SYNC`, apenas envie os títulos que realmente foram alterados localmente no ERP.

---

## 6. AGENDAMENTO NO WORKERSERVICE (`WorkerService.cs`)

No loop de execução do Worker (`WorkerService.cs`), adicione a chamada do novo Job no intervalo desejado (ex: a cada 30 segundos):

```csharp
// No loop do WorkerService:
try
{
    // 1. Baixas de pagamentos (já existente)
    await _syncPaymentsJob.ExecuteAsync(stoppingToken);

    // 2. Operações pendentes vindas do Nexus (NOVO)
    await _syncPendingOperationsJob.ExecuteAsync(stoppingToken);
}
catch (Exception ex)
{
    _logger.LogError(ex, "Erro no loop de sincronização do Worker Coliseu.");
}
```

---

## 7. CRITÉRIOS DE ACEITE E TESTES

1. **Cadastrar um cliente novo no Nexus:**
   - O Worker consome a operação via `GET /api/sync/pending-operations`.
   - Se o CPF/CNPJ já existir no Firebird, reaproveita o código existente; se não existir, insere e gera novo ID.
   - Responde com `POST /api/sync/confirm-operation` contendo `id_firebird`.
   - Quando o Worker rodar a exportação de clientes para o Nexus, **o cliente NÃO deve ser duplicado**.
2. **Lançar um título financeiro no Nexus:**
   - O Worker insere o registro na tabela `RECEBER` do Firebird vinculado ao cliente e responde com o `id_firebird`.
   - No Nexus, o título original é atualizado com o `id_firebird`.
   - Quando o Worker rodar a exportação de títulos do Coliseu para o Nexus (`/financials`), o título **NÃO deve ser duplicado** e os dados de boleto/Pix/origem do Nexus permanecem intactos.
3. **Resiliência a Erros:**
   - Erros de integridade (ex: banco Firebird inacessível ou dados truncados) devem ser capturados no `catch` e enviados no `/confirm-operation` com `success: false` / `error: "mensagem"` sem interromper a execução do Worker.
