/**
 * Versão compilada do Coliseu Transporte.
 * Formato: V.{n} até 999, depois V.{major}.{minor}
 *   V.1 → V.999, V.1.0 → V.1.999, V.2.0 → V.2.999, ...
 * Este arquivo é atualizado automaticamente a cada commit/build.
 */

const BUILD_NUMBER = 2581543;

/**
 * Formata o número de build no padrão de versão Coliseu Transporte.
 * Ex: 479 → "V.479" | 1000 → "V.1.0" | 1500 → "V.1.500"
 */
export function formatVersion(n: number): string {
  if (n < 1000) {
    return `V.${n}`;
  }
  const major = Math.floor((n - 1000) / 1000) + 1;
  const minor = (n - 1000) % 1000;
  return `V.${major}.${minor}`;
}

export const APP_BUILD = BUILD_NUMBER;
export const APP_VERSION = formatVersion(BUILD_NUMBER);
