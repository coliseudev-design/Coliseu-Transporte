"""Verificador robusto de imports JSX/TSX.

Detecta componentes usados no JSX que não estão importados nem definidos localmente.
"""
import re
import sys
from pathlib import Path

IGNORAR = {
    'React', 'Fragment', 'Set', 'Map', 'Promise', 'Array', 'Record', 'Partial',
    'Icon', 'Legend', 'Range', 'Omit', 'TData', 'Date', 'IDBDatabase',
    'ItemLoteBoleto', 'CedenteItem', 'UseQueryOptions', 'BiApiResponse',
}


def identificadores_importados(content: str) -> set:
    """Extrai todos os identificadores trazidos por import statements."""
    ids = set()
    # import { a, b as c } from 'x'  (pode ter várias linhas)
    for m in re.finditer(r'\{(.*?)\}\s*from', content, re.S):
        for parte in m.group(1).split(','):
            parte = parte.strip()
            if parte and re.match(r'^[A-Za-z_$][\w$]*$', parte):
                ids.add(parte.split(' as ')[-1].strip())
    # import X, { ... } from 'y'  e  import X from 'y'
    for m in re.finditer(r'import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from', content, re.S):
        ids.add(m.group(1))
    # import * as X from
    for m in re.finditer(r'import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from', content):
        ids.add(m.group(1))
    return ids


def definidos_localmente(content: str) -> set:
    return set(re.findall(r'(?:const|let|function|interface|type|enum|class)\s+([A-Za-z_$][\w$]*)', content))


def main():
    raiz = Path('frontend/src')
    arquivos = list(raiz.rglob('*.tsx')) + list(raiz.rglob('*.ts'))
    problemas = []

    for f in arquivos:
        content = f.read_text(encoding='utf-8')
        importados = identificadores_importados(content)
        locais = definidos_localmente(content)

        for tag in sorted(set(re.findall(r'<([A-Z][A-Za-z0-9]*)', content))):
            if tag in IGNORAR or tag.startswith('HTML'):
                continue
            if tag in importados or tag in locais:
                continue
            problemas.append(f'{f}: <{tag}> não importado')

    if problemas:
        print(f'❌ {len(problemas)} problema(s):')
        for p in problemas:
            print('  ', p)
        sys.exit(1)

    print(f'✅ {len(arquivos)} arquivos verificados — nenhum componente faltando.')


if __name__ == '__main__':
    main()
