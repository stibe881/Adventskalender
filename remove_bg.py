from PIL import Image
import os

img_path = r'C:/Users/StefanGross/.gemini/antigravity/brain/d02f76e9-0eb0-4547-b5d4-9261ea88247c/.user_uploaded/media_1789983148576.png'
out_path = r'c:/Webseiten und Apps/Adventskalender/public/calendar/img/rudi_base.png'

os.makedirs(os.path.dirname(out_path), exist_ok=True)
img = Image.open(img_path).convert('RGBA')
data = img.getdata()

new_data = []
for item in data:
    # Remove white/light background and faint watermark
    if item[0] > 230 and item[1] > 230 and item[2] > 230:
        new_data.append((255, 255, 255, 0))
    else:
        new_data.append(item)

img.putdata(new_data)
img.save(out_path, 'PNG')
print('Saved transparent rudi to', out_path)
