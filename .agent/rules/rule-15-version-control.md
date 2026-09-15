Rastreamento de Versão Obrigatório (Version Bump)
MOTIVO: Garantir que nenhuma funcionalidade nova ou correção de bug (fix) vá para a produção sem que o número da versão seja incrementado, evitando confusões sobre qual código está rodando no cliente ou na VPS.

GATILHO: Ativado sempre que o agente realizar alterações no código do aplicativo Mobile (Flutter) ou no Worker Configurator (.NET).

REGRAS DE IMPLEMENTACAO:

-   Mobile App (Flutter): Toda alteração no código dentro de `/mobile` exige a atualização imediata da chave `version:` no arquivo `/mobile/pubspec.yaml`, seguindo o Semantic Versioning (ex: de `1.0.0+1` para `1.0.1+2` se for fix, ou `1.1.0+3` se for feature).
-   Worker Configurator (.NET): Toda alteração no código dentro de `/NexusSales.Configurator` OU `/worker` exige a atualização imediata da tag `<Version>` no arquivo `/NexusSales.Configurator/NexusSales.Configurator.csproj` e `/worker/NexusSales.Worker.csproj`.
-   Fluxo de Compilação do Worker/Configurator: O Worker DEVE OBRIGATORIAMENTE ser embutido (embedded resource) dentro do Configurador. Sempre que for compilar:
    1. Primeiro, acesse a pasta `worker` e publique o projeto: `dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true`. Isso gerará o `.exe` do Worker.
    2. Segundo, acesse a pasta `NexusSales.Configurator` e publique o projeto: `dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true`. Isso fará com que o `.exe` fresco do Worker seja embutido no arquivo final do Configurador.
    3. NUNCA envie ou compacte os dois `.exe`s separadamente (por exemplo, em arquivos `.zip`). O único artefato final deve ser o executável do Configurador (`NexusSales.Configurator.exe`), que será responsável por extrair o Worker automaticamente.
-   Nomenclatura Obrigatória na Entrega: Toda vez que um **novo aplicativo** (APK) ou **novo configurador** (EXE) for gerado pelo agente para o cliente, informe a versão clara (ex: `NexusSales.Configurator.exe v1.0.1`). O artefato Windows deve continuar na pasta `publish` original ou ser copiado explicitamente para a raiz, sem ser colocado dentro de arquivos `.zip`.
-   Commits Claros: O commit que contiver a alteração de versão deve mencionar o número novo explicitamente (ex: `chore: bump version to 1.0.1`).
-   Caminhos Completos Obrigatórios: Após comitar e fazer push das versões, o agente DEVE exibir os caminhos absolutos completos de todos os artefatos gerados (APK e/ou EXE), sem truncamento, para que o usuário possa localizá-los imediatamente no sistema de arquivos.
-   Repositório GitHub Desktop Fixo: Todo push para o GitHub DEVE obrigatoriamente usar o repositório local do GitHub Desktop em `C:\Users\rober\OneDrive\Documentos\GitHub\NexusSales`. O fluxo de entrega é sempre: (1) commit no scratch (`C:\Users\rober\.gemini\antigravity\scratch\Nexus_Sales`), (2) copiar os arquivos alterados para `C:\Users\rober\OneDrive\Documentos\GitHub\NexusSales`, (3) commit e push nesse repositório. Nunca usar outro caminho.

EXEMPLO ERRADO:

O agente adiciona uma tela nova no Flutter e corrige um bug no serviço, mas deixa o `pubspec.yaml` intocado na versão `1.0.0+1`.

EXEMPLO CORRETO:

O agente finaliza a correção de um bug de sincronização no Flutter. Antes de sugerir o build ou finalizar, ele edita o `pubspec.yaml`:

```yaml
name: nexus_sales
description: Nexus Sales App
# version: 1.0.0+1  <- ANTIGO
version: 1.0.1+2   <- NOVO (Patch bump + Build bump)
```

No Configurator (.NET):
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <!-- <Version>1.0.0</Version> <- ANTIGO -->
    <Version>1.0.1</Version> <!-- NOVO -->
  </PropertyGroup>
...
```
