"""Export the code-drawn ALM banner as a seamless eight-second GIF plus still PNG.
Requires Playwright, Chromium and FFmpeg. No source illustrations are modified.
"""
import os,base64,subprocess,tempfile,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];out=R/'public/assets/design'
html=(R/'scripts/retro-banner.html').read_text()
for token,file,mime in [('__LOGO__','anime-local-manager-logo.png','png'),('__GARDEN__','design/night-garden.webp','webp'),('__LIBRARY__','design/moon-library.webp','webp')]:
 html=html.replace(token,'data:image/'+mime+';base64,'+base64.b64encode((R/'public/assets'/file).read_bytes()).decode())
with tempfile.TemporaryDirectory(prefix='alm-banner-') as d,sync_playwright() as p:
 frames=Path(d);b=p.chromium.launch(executable_path=os.environ.get('ALM_CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':900,'height':280},device_scale_factor=1);page.set_content(html);page.evaluate('window.ready')
 for i in range(64):
  page.evaluate('t=>drawBanner(t)',i/8);page.screenshot(path=str(frames/f'{i:03d}.png'))
 b.close();shutil.copyfile(frames/'000.png',out/'alm-retro-banner.png')
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','8','-i',str(frames/'%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','0',str(out/'alm-retro-banner.gif')],check=True)
 print('ALM banner: 900 × 280, 64 frames, 8 s; static fallback saved.')
