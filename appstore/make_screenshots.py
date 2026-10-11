"""Regenerate the App Store screenshots (1290x2796, 6.9" display).
Usage: from the repo root run `python3 -m http.server 8765`, then `python3 appstore/make_screenshots.py`.
Needs: pip install playwright pillow && playwright install chromium. Uses the ?debug hook in game.js."""
import asyncio, json, pathlib
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont, ImageFilter

URL = "http://localhost:8765/index.html?debug"
OUT = pathlib.Path(__file__).parent / "screenshots"; OUT.mkdir(exist_ok=True)
SAVE = {"unlocked": True, "stars": 86, "food": 2, "fed": 14, "stage": 1, "wesley": True, "catfood": 1, "catfed": 6,
        "wstage": 0, "sunStage": 2, "maxLv": 18, "shield": 2, "bomb": 1, "levelsSinceSleep": 1, "nest": True, "hat": True,
        "equipHat": True, "lastFedB": 9e12, "lastFedW": 9e12, "lastBreakfast": "x"}

async def raw():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 430, "height": 932}, device_scale_factor=3, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        await pg.goto(URL)
        await pg.evaluate(f"localStorage.setItem('birdie-pet-v1', JSON.stringify({json.dumps(SAVE)}));localStorage.setItem('hedgehog-ui-v1', JSON.stringify({{sound:true,seenTips:['drag','skull','bow','tools','sling','clamp','run','time','dark','key','boss']}}))")
        await pg.reload(); await pg.wait_for_timeout(900)
        await pg.screenshot(path=str(OUT / "raw-1-home.png"))
        # gameplay, cave 3 (arrows + slingshots), opened through the real Cave Map
        await pg.evaluate("document.getElementById('mapBtn').click()")
        await pg.wait_for_timeout(300)
        await pg.evaluate("[...document.querySelectorAll('#lvGrid .node')].find(n=>n.textContent==='3').click()")
        await pg.wait_for_timeout(300)
        await pg.evaluate("document.getElementById('startBtn').click()")
        await pg.evaluate("""(()=>{const G=__hr.getG();const s=G.level.stars[3];
          G.hed.x=G.hed.tx=s.x-30;G.hed.y=G.hed.ty=s.y+20;G.level.stars[0].got=G.level.stars[1].got=G.level.stars[2].got=true;G.starGot=3;
          document.getElementById('warn').classList.remove('show');})()""")
        await pg.wait_for_timeout(1700)
        await pg.evaluate("document.getElementById('warn').classList.remove('show')")
        await pg.screenshot(path=str(OUT / "raw-2-play.png"))
        # cave cleared
        await pg.evaluate("(()=>{const G=__hr.getG();G.starGot=8;G.sMax=G.level.path.len;})()")
        await pg.wait_for_timeout(2600)
        await pg.screenshot(path=str(OUT / "raw-3-clear.png"))
        # pet hollow
        await pg.evaluate("document.getElementById('clearPetBtn').click()")
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=str(OUT / "raw-4-pets.png"))
        # map
        await pg.evaluate("document.getElementById('petBackBtn').click();document.getElementById('mapBtn').click()")
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=str(OUT / "raw-5-map.png"))
        await b.close()

CAPS = [("1-home", "Tiny paws.\nBig adventures."), ("2-play", "Drag, dodge\nand discover."),
        ("3-clear", "Collect stars.\nUnlock surprises."), ("4-pets", "Meet your new\nbesties."), ("5-map", "100 cozy caves\nto explore.")]

def frame():
    W, H = 1290, 2796
    fb = ImageFont.truetype("/usr/share/fonts/truetype/inter/Inter-ExtraBold.ttf", 118) if pathlib.Path("/usr/share/fonts/truetype/inter/Inter-ExtraBold.ttf").exists() else None
    if fb is None:
        import subprocess
        path = subprocess.run(["fc-match", "-f", "%{file}", "Inter:extrabold"], capture_output=True, text=True).stdout
        fb = ImageFont.truetype(path, 118)
    for name, cap in CAPS:
        bg = Image.new("RGB", (W, H), "#FFF1C9")
        d = ImageDraw.Draw(bg)
        # soft blobs
        blob = Image.new("RGBA", (W, H), (0, 0, 0, 0)); bd = ImageDraw.Draw(blob)
        bd.ellipse((-300, -200, 700, 700), fill=(255, 214, 107, 150)); bd.ellipse((800, 1900, 1700, 3000), fill=(168, 220, 203, 170))
        bg.paste(blob.filter(ImageFilter.GaussianBlur(120)), (0, 0), blob.filter(ImageFilter.GaussianBlur(120)))
        d = ImageDraw.Draw(bg)
        d.multiline_text((W // 2, 300), cap, font=fb, fill="#49342C", anchor="mm", align="center", spacing=18)
        shot = Image.open(OUT / f"raw-{name}.png").convert("RGB")
        sw = 1010; sh = int(shot.height * sw / shot.width)
        shot = shot.resize((sw, sh), Image.LANCZOS)
        x, y = (W - sw) // 2, 560
        mask = Image.new("L", (sw, sh), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw, sh), 90, fill=255)
        sh_img = Image.new("RGBA", (sw + 120, sh + 120), (0, 0, 0, 0))
        ImageDraw.Draw(sh_img).rounded_rectangle((60, 75, sw + 60, sh + 75), 90, fill=(73, 52, 44, 70))
        sh_img = sh_img.filter(ImageFilter.GaussianBlur(28))
        bg.paste(sh_img, (x - 60, y - 60), sh_img)
        border = Image.new("RGB", (sw + 28, sh + 28), "#49342C"); bm = Image.new("L", border.size, 0)
        ImageDraw.Draw(bm).rounded_rectangle((0, 0, sw + 27, sh + 27), 104, fill=255)
        bg.paste(border, (x - 14, y - 14), bm)
        bg.paste(shot, (x, y), mask)
        bg.save(OUT / f"appstore-6.9in-{name}.png")

asyncio.run(raw()); frame(); print("ok")
