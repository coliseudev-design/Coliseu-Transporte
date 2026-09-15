import re

with open('middleware/src/routes/bi.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace any CASE block matching this pattern
pattern_v = r"CASE\s+WHEN\s+upper\(v\.natureza_operacao\).*?THEN\s+-abs\(v\.valor_total\)\s+ELSE\s+v\.valor_total\s+END"
content = re.sub(pattern_v, "v.valor_total", content, flags=re.DOTALL | re.IGNORECASE)

pattern_vi = r"CASE\s+WHEN\s+upper\(v\.natureza_operacao\).*?THEN\s+-abs\(vi\.valor_total\)\s+ELSE\s+vi\.valor_total\s+END"
content = re.sub(pattern_vi, "vi.valor_total", content, flags=re.DOTALL | re.IGNORECASE)

with open('middleware/src/routes/bi.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
