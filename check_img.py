from PIL import Image

img_path = r"C:\Users\rober\.gemini\antigravity\brain\f6271dc6-f3b5-4d36-9980-07596369317f\media__1777049914996.png"
out_path_png = r"c:\Users\rober\.gemini\antigravity\scratch\Nexus\frontend\public\favicon.png"

with Image.open(img_path) as img:
    img = img.convert("RGBA")
    
    # Do NOT crop. Do NOT remove background.
    # Just make it a square by padding it.
    width, height = img.size
    size = max(width, height)
    
    square_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    offset = ((size - width) // 2, (size - height) // 2)
    square_img.paste(img, offset)
    
    square_img.save(out_path_png, 'PNG')
    print("Success: Letterboxed original image to a square favicon.")
