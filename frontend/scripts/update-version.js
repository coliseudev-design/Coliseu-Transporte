import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Gera número de build incremental garantido.
 *
 * Estratégia (em ordem de prioridade):
 *  1. Tenta contar commits com git rev-list (funciona só em clone completo)
 *  2. Usa timestamp compacto: ddd (dia do ano 1-366) + hhmm -> número único por minuto
 *     Ex: build no dia 236, às 14:38 → 2361438 → nunca repete no mesmo ano
 *  3. Garante que o novo número seja SEMPRE maior que o atual no arquivo
 */
try {
  const versionFilePath = path.resolve(__dirname, '../src/version.ts');

  // Lê build atual do arquivo
  let currentBuild = 529;
  if (fs.existsSync(versionFilePath)) {
    const fileText = fs.readFileSync(versionFilePath, 'utf8');
    const match = fileText.match(/BUILD_NUMBER\s*=\s*(\d+)/);
    if (match) currentBuild = parseInt(match[1], 10);
  }

  let buildNumber = currentBuild;

  // 1. Tenta contar commits (clone completo)
  try {
    const gitCount = execSync('git rev-list --count HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const parsed = parseInt(gitCount, 10);
    if (!isNaN(parsed) && parsed > 1) {
      buildNumber = parsed;
    }
  } catch (_) {
    // clone raso ou sem git — usa estratégia de timestamp
  }

  // 2. Se o número resultante é igual ou menor que o atual
  //    (shallow clone retorna 1), usa timestamp compacto para garantir incremento
  if (buildNumber <= currentBuild) {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const dayOfYear = Math.floor(diff / 86400000); // 1–366
    const hhmm = now.getHours() * 100 + now.getMinutes(); // 0–2359
    const tsNum = dayOfYear * 10000 + hhmm; // ex: 2361438 para dia 236 às 14:38

    // Garante que é sempre maior que o atual
    buildNumber = Math.max(currentBuild + 1, tsNum);
  }

  const formatVersion = (n) => {
    if (n < 1000) return `V.${n}`;
    const major = Math.floor((n - 1000) / 1000) + 1;
    const minor = (n - 1000) % 1000;
    return `V.${major}.${minor}`;
  };

  const versionStr = formatVersion(buildNumber);

  const content = `/**
 * Versão compilada do Coliseu Transporte.
 * Formato: V.{n} até 999, depois V.{major}.{minor}
 *   V.1 → V.999, V.1.0 → V.1.999, V.2.0 → V.2.999, ...
 * Este arquivo é atualizado automaticamente a cada commit/build.
 */

const BUILD_NUMBER = ${buildNumber};

/**
 * Formata o número de build no padrão de versão Coliseu Transporte.
 * Ex: 479 → "V.479" | 1000 → "V.1.0" | 1500 → "V.1.500"
 */
export function formatVersion(n: number): string {
  if (n < 1000) {
    return \`V.\${n}\`;
  }
  const major = Math.floor((n - 1000) / 1000) + 1;
  const minor = (n - 1000) % 1000;
  return \`V.\${major}.\${minor}\`;
}

export const APP_BUILD = BUILD_NUMBER;
export const APP_VERSION = formatVersion(BUILD_NUMBER);
`;

  fs.writeFileSync(versionFilePath, content, 'utf8');
  console.log(`[Coliseu Build] ✅ Versão gerada: ${versionStr} (build #${buildNumber})`);
} catch (err) {
  console.error('[Coliseu Build Error] Falha ao atualizar versão:', err.message);
}
