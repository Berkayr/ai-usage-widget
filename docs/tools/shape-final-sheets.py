"""Assemble the synthetic captures from shape-final-sheets.mjs without scaling."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path('gorevler/ss-sekil-final')
themes = ['system', 'brutalist', 'circular-rings', 'compact-strip', 'dot-matrix', 'frosted-glass', 'minimal-pace', 'reactor', 'retro-lcd', 'terminal']
shapes = ['portrait', 'landscape', 'square', 'circle', 'pill']

def sheet(items, columns, target):
    images = [(label, Image.open(path).convert('RGBA')) for label, path in items]
    width = max(img.width for _, img in images) + 24
    height = max(img.height for _, img in images) + 48
    result = Image.new('RGB', (columns * width, ((len(images)+columns-1)//columns)*height), '#141820')
    draw = ImageDraw.Draw(result)
    for index, (label, img) in enumerate(images):
        x, y = (index % columns)*width+12, (index//columns)*height+12
        draw.text((x, y), label, fill='#f4f5f7')
        result.paste(img, (x, y+24), img)
    result.save(target)

for shape in shapes:
    sheet([(theme, root / f'{shape}-{theme}-Medium.png') for theme in themes], 5, root / f'themes-{shape}.png')
    sheet([(size, root / f'{shape}-system-{size}.png') for size in ['Small', 'Medium', 'Large', 'X-Large']], 4, root / f'sizes-{shape}.png')
sheet([(shape, root / f'{shape}-system-Medium.png') for shape in shapes], 3, Path('docs/screenshots/shapes.png'))
print('10 review sheets and the shapes gallery assembled at original resolution')
