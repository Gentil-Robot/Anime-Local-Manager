"""Optional real-browser regression for directional scroll controls; no network/API fixtures required."""
import json
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(os.environ.get('ALM_UI_EVIDENCE', str(ROOT / 'test-artifacts/scroll')))
OUTPUT.mkdir(parents=True, exist_ok=True)
HTML = '''<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body><main style="padding:32px;max-width:800px;margin:auto">
<h1>Défilement ALM — données de test</h1><p>Contrôle des flèches dans une page longue.</p>
<div id="longContent" style="height:3500px"></div></main>
<div id="newsArticleModalV2" class="hidden" style="position:fixed;inset:0;z-index:500">
<div class="news-reader-modal-box" style="position:absolute;inset:30px;background:#141c32">
<div class="news-reader-modal-body" style="height:100%;overflow:auto">
<h2 style="padding:30px">Lecture indépendante — données de test</h2>
<div style="height:2600px"></div></div></div></div>
<dialog id="testDialog">Réglages — données de test</dialog></body></html>'''

checks = []
errors = []
with sync_playwright() as runtime:
    browser = runtime.chromium.launch(
        executable_path=os.environ.get('ALM_CHROMIUM') or shutil.which('chromium') or shutil.which('google-chrome'),
        headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1100, 'height':720}, reduced_motion='reduce')
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content(HTML)
    for name in ['style.css', 'design.css', 'nocturne.css']:
        page.add_style_tag(content=(ROOT / 'public' / name).read_text())
    page.add_style_tag(content='body{background:#10182c;color:#eeeaff;margin:0}.hidden{display:none!important}')
    page.evaluate("window.testLanguage='fr';window.ALM_I18N={getLanguage:()=>window.testLanguage}")
    page.add_script_tag(content=(ROOT / 'public/scroll-progress.js').read_text())
    page.evaluate('window.ALM_SCROLL_PROGRESS.mount();window.ALM_SCROLL_PROGRESS.mount()')

    def settle():
        page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')

    def check(name, expression):
        settle()
        assert page.evaluate(expression), name
        checks.append(name)
        print('OK', name, flush=True)

    def scroll(fraction, reader=False):
        page.evaluate('''({fraction,reader})=>{
            const area=reader?document.querySelector('.news-reader-modal-body'):document.scrollingElement;
            area.scrollTo({top:(area.scrollHeight-area.clientHeight)*fraction,behavior:'instant'});
        }''', {'fraction':fraction, 'reader':reader})
        settle()

    check('mount is idempotent and short labels are accessible',
          "document.querySelectorAll('#scrollJumpControls').length===1&&document.getElementById('scrollJumpBottom').getAttribute('aria-label')==='Descendre tout en bas'")
    check('top of page offers descent with an empty ring',
          "scrollJumpTop.hidden&&!scrollJumpBottom.hidden&&scrollJumpBottom.dataset.progressActive==='true'&&Number(scrollJumpBottom.dataset.progress)===0")
    scroll(.55)
    check('descent places the only visible ring on the down arrow at 55%',
          "scrollJumpBottom.dataset.progressActive==='true'&&Math.abs(Number(scrollJumpBottom.dataset.progress)-55)<1&&getComputedStyle(scrollJumpTop.querySelector('svg')).display==='none'&&getComputedStyle(scrollJumpBottom.querySelector('svg')).display!=='none'")
    page.locator('#scrollJumpControls').screenshot(path=str(OUTPUT / 'scroll-descente.png'))
    scroll(.8)
    check('continued descent advances the down ring',
          "Math.abs(Number(scrollJumpBottom.dataset.progress)-80)<1&&scrollJumpBottom.dataset.progressActive==='true'")
    scroll(.4)
    check('reversing direction moves the ring to the up arrow and tracks progress toward the top',
          "scrollJumpTop.dataset.progressActive==='true'&&Math.abs(Number(scrollJumpTop.dataset.progress)-60)<1&&getComputedStyle(scrollJumpBottom.querySelector('svg')).display==='none'")
    page.locator('#scrollJumpControls').screenshot(path=str(OUTPUT / 'scroll-remontee.png'))
    page.set_viewport_size({'width':1100,'height':680})
    check('resize preserves the reading direction', "scrollJumpTop.dataset.progressActive==='true'")
    scroll(1)
    check('bottom of page offers ascent with an empty ring',
          "scrollJumpBottom.hidden&&!scrollJumpTop.hidden&&scrollJumpTop.dataset.progressActive==='true'&&Number(scrollJumpTop.dataset.progress)===0")
    scroll(.9)
    check('ascent from the bottom begins filling the up ring',
          "scrollJumpTop.dataset.progressActive==='true'&&Math.abs(Number(scrollJumpTop.dataset.progress)-10)<1")
    page.locator('#scrollJumpTop').focus()
    page.keyboard.press('Enter')
    check('keyboard jump to top respects system reduced motion', "document.scrollingElement.scrollTop===0")
    page.locator('#scrollJumpBottom').focus()
    page.keyboard.press('Space')
    check('keyboard jump to bottom respects system reduced motion',
          "document.scrollingElement.scrollTop===document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight")
    scroll(.45)
    page.evaluate("document.getElementById('newsArticleModalV2').classList.remove('hidden')")
    check('reader controls replace the page controls',
          "scrollJumpControls.hidden&&!newsReaderScrollControls.hidden&&!newsReaderScrollBottom.hidden")
    page_y = page.evaluate('document.scrollingElement.scrollTop')
    scroll(.6, reader=True)
    check('reader descent has its own down ring',
          "newsReaderScrollBottom.dataset.progressActive==='true'&&Math.abs(Number(newsReaderScrollBottom.dataset.progress)-60)<1")
    scroll(.2, reader=True)
    check('reader ascent has its own up ring',
          "newsReaderScrollTop.dataset.progressActive==='true'&&Math.abs(Number(newsReaderScrollTop.dataset.progress)-80)<1")
    page.locator('#newsReaderScrollTop').focus()
    page.keyboard.press('Enter')
    check('reader keyboard jump leaves the background at its original position',
          "document.querySelector('.news-reader-modal-body').scrollTop===0&&document.scrollingElement.scrollTop==="+str(page_y))
    page.locator('#newsReaderScrollBottom').click()
    check('reader bottom action leaves the background untouched',
          "newsReaderScrollBottom.hidden&&!newsReaderScrollTop.hidden&&document.scrollingElement.scrollTop==="+str(page_y))
    for language, label in [('fr','Remonter tout en haut'),('en','Back to the top'),('ja','一番上に戻る'),('es','Volver al principio'),('de','Ganz nach oben'),('pt-BR','Voltar ao início'),('zh-CN','返回顶部')]:
        page.evaluate("lang=>{window.testLanguage=lang;window.dispatchEvent(new Event('alm:language-changed'))}",language)
        check('page and reader labels follow '+language,
              'scrollJumpTop.title==='+json.dumps(label)+'&&newsReaderScrollTop.title==='+json.dumps(label))
    page.evaluate("newsArticleModalV2.classList.add('hidden')")
    check('closing the reader restores the previous page state',
          "!scrollJumpControls.hidden&&newsReaderScrollControls.hidden&&scrollJumpTop.dataset.progressActive==='true'&&document.scrollingElement.scrollTop==="+str(page_y))
    page.evaluate('testDialog.showModal()')
    check('settings modal hides background scroll controls', 'scrollJumpControls.hidden')
    page.evaluate('testDialog.close()')
    check('closing settings restores scroll controls', '!scrollJumpControls.hidden')
    page.evaluate("longContent.style.height='0';window.scrollTo({top:0,behavior:'instant'})")
    check('pages without overflow hide both arrows', 'scrollJumpTop.hidden&&scrollJumpBottom.hidden')
    page.evaluate("longContent.style.height='500px'")
    page.set_viewport_size({'width':480,'height':360})
    check('short scrollable pages offer a down control without horizontal overflow',
          "!scrollJumpBottom.hidden&&document.documentElement.scrollWidth<=innerWidth")
    page.evaluate("document.documentElement.dataset.motion='reduced'")
    page.emulate_media(reduced_motion='no-preference')
    page.locator('#scrollJumpBottom').click()
    check('ALM reduced motion works independently of the system preference',
          'document.scrollingElement.scrollTop===document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight')
    assert not errors, errors
    print(str(len(checks))+' directional scroll checks passed; real DOM, layout, scroll, keyboard and media-query behavior.', flush=True)
    (OUTPUT / 'scroll-checks.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2))
    browser.close()
