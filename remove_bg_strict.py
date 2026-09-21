from PIL import Image

img_path = r'C:/Users/StefanGross/.gemini/antigravity/brain/d02f76e9-0eb0-4547-b5d4-9261ea88247c/.user_uploaded/media_1789983148576.png'
out_path = r'c:/Webseiten und Apps/Adventskalender/public/calendar/img/rudi_base.png'

img = Image.open(img_path).convert('RGBA')
data = img.load()
width, height = img.size

# Scarf and eyes bounding boxes (approximate based on image)
# Scarf: x in [70, 160], y in [140, 240]
# Eye: x in [70, 130], y in [50, 120]

def is_protected(x, y):
    if 70 <= x <= 170 and 140 <= y <= 240:
        return True
    if 60 <= x <= 130 and 50 <= y <= 120:
        return True
    return False

for y in range(height):
    for x in range(width):
        r, g, b, a = data[x, y]
        if r > 210 and g > 210 and b > 210:
            if not is_protected(x, y):
                data[x, y] = (255, 255, 255, 0)
        # Also clean up the watermark which is grayish
        elif r > 180 and g > 180 and b > 180 and abs(r-g)<10 and abs(g-b)<10:
             if not is_protected(x, y):
                data[x, y] = (255, 255, 255, 0)

img.save(out_path, 'PNG')
print('Saved clean rudi base')
