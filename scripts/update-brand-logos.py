from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

assets = Path(r"C:\Users\Sachin Ughade\.cursor\projects\d-fastbillings-com\assets")
light = Image.open(
    assets
    / "c__Users_Sachin_Ughade_AppData_Roaming_Cursor_User_workspaceStorage_0c91c2a225761f8158fda00edd721556_images_Untitled__3696_x_1152_px___4_-fb881330-e471-4677-b6a8-91d3f2787c05.png"
).convert("RGBA")
dark = Image.open(
    assets
    / "c__Users_Sachin_Ughade_AppData_Roaming_Cursor_User_workspaceStorage_0c91c2a225761f8158fda00edd721556_images_Untitled__3696_x_1152_px___5_-a0738f11-1ca1-491c-ae4f-6c3b98832478.png"
).convert("RGBA")
iconish = Image.open(
    assets
    / "c__Users_Sachin_Ughade_AppData_Roaming_Cursor_User_workspaceStorage_0c91c2a225761f8158fda00edd721556_images_Untitled__3696_x_1152_px___1_-1f3a1b84-e327-421a-b3a5-d05b24607982.png"
).convert("RGBA")

print("light", light.size, "dark", dark.size, "icon", iconish.size)

frontend_brand = Path(r"d:\fastbillings.com\fastbillings-frontend\public\brand")
admin_brand = Path(r"d:\fastbillings.com\fastbillings-admin\public\brand")
inv_dir = Path(r"d:\fastbillings.com\fastbillings-frontend\src\assets\invoices")
frontend_brand.mkdir(parents=True, exist_ok=True)
admin_brand.mkdir(parents=True, exist_ok=True)


def trim_light(img, bg_threshold=245):
    px = img.load()
    w, h = img.size
    minx, miny, maxx, maxy = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            if r > bg_threshold and g > bg_threshold and b > bg_threshold:
                continue
            found = True
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)
    if not found:
        return img
    pad = 8
    return img.crop(
        (max(0, minx - pad), max(0, miny - pad), min(w, maxx + 1 + pad), min(h, maxy + 1 + pad))
    )


def trim_dark(img):
    px = img.load()
    w, h = img.size
    minx, miny, maxx, maxy = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            if r < 25 and g < 35 and b < 50:
                continue
            found = True
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)
    if not found:
        return img
    pad = 8
    return img.crop(
        (max(0, minx - pad), max(0, miny - pad), min(w, maxx + 1 + pad), min(h, maxy + 1 + pad))
    )


light_t = trim_light(light)
dark_t = trim_dark(dark)
icon_t = trim_dark(iconish)
print("trimmed light", light_t.size, "dark", dark_t.size, "icon", icon_t.size)

cw, ch = light_t.size
compact = light_t.crop((0, 0, cw, int(ch * 0.62)))
compact = trim_light(compact)
print("compact", compact.size)

iw = int(compact.size[0] * 0.28)
mark = trim_light(compact.crop((0, 0, iw, compact.size[1])))
print("mark", mark.size)


def save(img, path):
    img.convert("RGBA").save(path)
    print("saved", path, img.size)


save(light_t, frontend_brand / "fastbillings-logo-light.png")
save(dark_t, frontend_brand / "fastbillings-logo-dark.png")
save(compact, frontend_brand / "fastbillings-logo-compact.png")
save(icon_t, frontend_brand / "fastbillings-logo-icon.png")

fs = 256
favicon = Image.new("RGBA", (fs, fs), (255, 255, 255, 0))
mark_r = mark.copy()
mark_r.thumbnail((fs - 24, fs - 24), Image.Resampling.LANCZOS)
favicon.paste(mark_r, ((fs - mark_r.size[0]) // 2, (fs - mark_r.size[1]) // 2), mark_r)
favicon.save(frontend_brand / "favicon.png")
print("favicon saved")

for name in [
    "fastbillings-logo-light.png",
    "fastbillings-logo-dark.png",
    "fastbillings-logo-compact.png",
    "fastbillings-logo-icon.png",
    "favicon.png",
]:
    (admin_brand / name).write_bytes((frontend_brand / name).read_bytes())

Path(r"d:\fastbillings.com\fastbillings-frontend\src\assets\images\logo.png").write_bytes(
    (frontend_brand / "fastbillings-logo-light.png").read_bytes()
)
Path(r"d:\fastbillings.com\fastbillings-frontend\public\landing\assets\img\logo.png").write_bytes(
    (frontend_brand / "fastbillings-logo-light.png").read_bytes()
)


def patch_invoice(path: Path, is_dark=False):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    draw = ImageDraw.Draw(img)
    max_w = int(w * 0.22)
    lx, ly = int(w * 0.05), int(h * 0.045)

    if is_dark:
        draw.rectangle([int(w * 0.04), int(h * 0.04), int(w * 0.30), int(h * 0.12)], fill=(31, 41, 55, 255))
        inv_logo = dark_t.copy()
    else:
        draw.rectangle(
            [int(w * 0.04), int(h * 0.035), int(w * 0.30), int(h * 0.12)], fill=(255, 255, 255, 255)
        )
        inv_logo = compact.copy()
        for box in [
            (int(w * 0.72), int(h * 0.12), int(w * 0.95), int(h * 0.155)),
            (int(w * 0.38), int(h * 0.155), int(w * 0.55), int(h * 0.185)),
            (int(w * 0.70), int(h * 0.78), int(w * 0.88), int(h * 0.805)),
        ]:
            draw.rectangle(list(box), fill=(255, 255, 255, 255))
        try:
            font = ImageFont.truetype("arial.ttf", max(12, int(h * 0.018)))
            font_sm = ImageFont.truetype("arial.ttf", max(10, int(h * 0.014)))
        except Exception:
            font = ImageFont.load_default()
            font_sm = font
        draw.text((int(w * 0.72), int(h * 0.12)), "FastBillings", fill=(0, 102, 255, 255), font=font)
        draw.text((int(w * 0.38), int(h * 0.155)), "FastBillings", fill=(17, 24, 39, 255), font=font_sm)
        draw.text((int(w * 0.70), int(h * 0.78)), "For FastBillings", fill=(55, 65, 81, 255), font=font_sm)

    inv_logo.thumbnail((max_w, int(max_w * 0.4)), Image.Resampling.LANCZOS)
    img.paste(inv_logo, (lx, ly), inv_logo)
    img.convert("RGB").save(path, quality=92)
    print("patched", path.name, img.size)


for i in range(1, 5):
    patch_invoice(inv_dir / f"invoice-{i}.png", is_dark=False)
patch_invoice(inv_dir / "invoice-5.png", is_dark=True)

doc_img = Path(r"d:\fastbillings.com\fastbillings-frontend\public\documentation\assets\img")
for name in ["invoice_1.png", "invoice_2.png", "invoice_3.png"]:
    p = doc_img / name
    if p.exists():
        patch_invoice(p, is_dark=False)
logo_doc = doc_img / "logo" / "logo.png"
if logo_doc.exists():
    logo_doc.write_bytes((frontend_brand / "fastbillings-logo-light.png").read_bytes())
    print("replaced doc logo")

# landing svg references may stay SVG - replace png only done
# also documentation mobile
mob = Path(r"d:\fastbillings.com\fastbillings-frontend\public\documentation\mobile\assets\img\logo\logo.png")
if mob.exists():
    mob.write_bytes((frontend_brand / "fastbillings-logo-light.png").read_bytes())
    print("replaced mobile doc logo")

print("DONE")
