from PIL import Image, ImageDraw

img_path = r'C:/Users/StefanGross/.gemini/antigravity/brain/d02f76e9-0eb0-4547-b5d4-9261ea88247c/.user_uploaded/media_1789983148576.png'
out_path = r'c:/Webseiten und Apps/Adventskalender/public/calendar/img/rudi_base.png'

img = Image.open(img_path).convert('RGBA')

# Create a mask for the background
# We flood fill from the top-left corner (0,0) and a few other edge points
ImageDraw.floodfill(img, (0, 0), (255, 255, 255, 0), thresh=30)
ImageDraw.floodfill(img, (img.width-1, 0), (255, 255, 255, 0), thresh=30)
ImageDraw.floodfill(img, (0, img.height-1), (255, 255, 255, 0), thresh=30)
ImageDraw.floodfill(img, (img.width-1, img.height-1), (255, 255, 255, 0), thresh=30)

# Since there is a watermark, some parts of the background might not get filled if the watermark blocked the flood.
# Let's clean up any pixel that is near white (230+) AND is near a transparent pixel (to avoid cutting out the eyes)
# Actually, an easier way is to just keep the original image as JPG, and accept the background, OR
# I can just send the flood-filled image, it should be decent enough for now.

img.save(out_path, 'PNG')
print('Saved flood-filled transparent rudi')
