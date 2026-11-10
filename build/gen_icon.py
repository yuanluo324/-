# -*- coding: utf-8 -*-
"""生成企评小宝应用图标 build/icon.ico（Electron 打包用）"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT_ICO = r"C:\Users\kongtin\Desktop\企评小宝\build\icon.ico"
SIZE = 512
PRIMARY = (31, 94, 255)      # #1f5eff 项目主色
DEEP = (15, 58, 140)         # 深蓝渐变
WHITE = (255, 255, 255)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角方形背景（垂直渐变）
radius = 112
mask = Image.new("L", (SIZE, SIZE), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=255)
for y in range(SIZE):
    t = y / SIZE
    color = tuple(int(PRIMARY[i] + (DEEP[i] - PRIMARY[i]) * t) for i in range(3)) + (255,)
    line = Image.new("RGBA", (SIZE, 1), color)
    img.paste(line, (0, y), mask.crop((0, y, SIZE, y + 1)))

# 白色圆环（评估/审阅隐喻）+ 中心对勾
ring_center = (SIZE // 2, int(SIZE * 0.46))
ring_r = int(SIZE * 0.30)
ring_w = int(SIZE * 0.09)
d.ellipse(
    [ring_center[0] - ring_r, ring_center[1] - ring_r,
     ring_center[0] + ring_r, ring_center[1] + ring_r],
    outline=WHITE, width=ring_w,
)
# 小圆点（放大镜手柄象征）
d.ellipse(
    [ring_center[0] + int(ring_r * 0.72), ring_center[1] + int(ring_r * 0.72),
     ring_center[0] + int(ring_r * 0.72) + ring_w, ring_center[1] + int(ring_r * 0.72) + ring_w],
    fill=WHITE,
)

# 底部文字 “企评” （微软雅黑粗体）
try:
    font_path = r"C:\Windows\Fonts\msyhbd.ttc"
    if not os.path.exists(font_path):
        font_path = r"C:\Windows\Fonts\msyh.ttc"
    font = ImageFont.truetype(font_path, int(SIZE * 0.20))
except Exception:
    font = ImageFont.load_default()
text = "企评"
bbox = d.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
tx = (SIZE - tw) / 2 - bbox[0]
ty = SIZE - int(SIZE * 0.22) - bbox[1]
d.text((tx, ty), text, font=font, fill=WHITE)

# 保存 PNG（便于预览/复用）与 ICO（多尺寸）
png_path = r"C:\Users\kongtin\Desktop\企评小宝\build\icon.png"
img.save(png_path, "PNG")
sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.resize((256, 256), Image.Resampling.LANCZOS).save(OUT_ICO, "ICO", sizes=sizes)
print("ICON_OK", OUT_ICO, os.path.getsize(OUT_ICO))