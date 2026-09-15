import sys

def read_safe(path):
    for enc in ['utf-8', 'utf-16le', 'utf-16', 'latin-1']:
        try:
            with open(path, 'r', encoding=enc) as f:
                content = f.read()
                print(f"=== File {path} (Encoding: {enc}) ===")
                print(content[:5000]) # First 5000 chars
                return
        except Exception:
            pass
    print("Could not read file.")

if len(sys.argv) > 1:
    read_safe(sys.argv[1])
else:
    print("Please specify file path.")
