import os

paths = [
    'middleware/src/routes/estatisticas.js',
    'middleware/src/routes/ranking.js',
    'middleware/src/routes/clientes.js'
]

for p in paths:
    with open(p, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace("v.TRIM(status)", "TRIM(v.status)")
    
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content)

print("Fixed v.TRIM.")
