import sys, os, glob
from PIL import Image, ImageDraw
root = 'out'
for d in sorted(glob.glob(root + '/*/')):
    fs = sorted(glob.glob(d + 'f*.png'))
    if not fs: continue
    ims = [Image.open(f).convert('RGB').resize((400, 260)) for f in fs]
    cols = 4; rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 400, rows * 260))
    dr = ImageDraw.Draw(sheet)
    for i, im in enumerate(ims):
        sheet.paste(im, ((i % cols) * 400, (i // cols) * 260))
        dr.text(((i % cols) * 400 + 6, (i // cols) * 260 + 4), os.path.basename(fs[i]), fill=(255, 255, 0))
    sheet.save(d.rstrip('/') + '_sheet.png')
    print(d)
