import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('public/icons', exist_ok=True)

def create_scanpro_icon(size):
    # Create high-res image
    img = Image.new('RGBA', (size, size), (9, 13, 22, 255))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background
    pad = int(size * 0.08)
    corner = int(size * 0.22)
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=corner, fill=(15, 23, 42, 255), outline=(16, 185, 129, 255), width=int(size * 0.025))

    # Document shape inside
    doc_left = int(size * 0.28)
    doc_top = int(size * 0.22)
    doc_right = int(size * 0.72)
    doc_bottom = int(size * 0.78)
    doc_radius = int(size * 0.06)
    
    # White/Cyan document sheet
    draw.rounded_rectangle([doc_left, doc_top, doc_right, doc_bottom], radius=doc_radius, fill=(241, 245, 249, 255))
    
    # Text lines on document
    line_x1 = doc_left + int(size * 0.08)
    line_x2 = doc_right - int(size * 0.08)
    for i, y_ratio in enumerate([0.38, 0.48, 0.58]):
        y = int(size * y_ratio)
        lw = int(size * 0.025)
        # 3rd line shorter
        lx2 = line_x2 - int(size * 0.12) if i == 2 else line_x2
        draw.line([line_x1, y, lx2, y], fill=(100, 116, 139, 255), width=lw)

    # Laser scanner line (glowing emerald beam)
    beam_y = int(size * 0.52)
    draw.line([int(size * 0.2), beam_y, int(size * 0.8), beam_y], fill=(16, 185, 129, 255), width=int(size * 0.035))
    draw.line([int(size * 0.22), beam_y], fill=(52, 211, 153, 255), width=int(size * 0.02))

    # Corner scanner brackets
    bracket_len = int(size * 0.12)
    b_thick = int(size * 0.035)
    b_color = (52, 211, 153, 255)

    # Top-Left
    bx1 = int(size * 0.22)
    by1 = int(size * 0.16)
    draw.line([bx1, by1, bx1 + bracket_len, by1], fill=b_color, width=b_thick)
    draw.line([bx1, by1, bx1, by1 + bracket_len], fill=b_color, width=b_thick)

    # Top-Right
    bx2 = int(size * 0.78)
    by2 = int(size * 0.16)
    draw.line([bx2, by2, bx2 - bracket_len, by2], fill=b_color, width=b_thick)
    draw.line([bx2, by2, bx2, by2 + bracket_len], fill=b_color, width=b_thick)

    # Bottom-Left
    bx3 = int(size * 0.22)
    by3 = int(size * 0.84)
    draw.line([bx3, by3, bx3 + bracket_len, by3], fill=b_color, width=b_thick)
    draw.line([bx3, by3, bx3, by3 - bracket_len], fill=b_color, width=b_thick)

    # Bottom-Right
    bx4 = int(size * 0.78)
    by4 = int(size * 0.84)
    draw.line([bx4, by4, bx4 - bracket_len, by4], fill=b_color, width=b_thick)
    draw.line([bx4, by4, bx4, by4 - bracket_len], fill=b_color, width=b_thick)

    return img

icon_192 = create_scanpro_icon(192)
icon_192.save('public/icons/icon-192x192.png')

icon_512 = create_scanpro_icon(512)
icon_512.save('public/icons/icon-512x512.png')
icon_512.save('public/apple-touch-icon.png')

print("Icons generated successfully!")
