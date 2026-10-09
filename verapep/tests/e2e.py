#!/usr/bin/env python3
from __future__ import annotations
import json, os, shutil, socket, subprocess, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
PREVIEW_DIR=ROOT/'previews'/'information-platform'
DATA_FILES=('catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json')
def free_port():
    with socket.socket() as sock: sock.bind(('127.0.0.1',0)); return int(sock.getsockname()[1])
def wait(url,timeout=15):
    import urllib.request
    end=time.time()+timeout
    while time.time()<end:
        try:
            with urllib.request.urlopen(url+'/api/health',timeout=1) as r:
                if r.status==200:return
        except Exception: time.sleep(.15)
    raise RuntimeError('Server not ready')
def main():
    data=Path(tempfile.mkdtemp(prefix='vp-info-e2e-'))
    for name in DATA_FILES: shutil.copy2(ROOT/'data'/name,data/name)
    port=free_port(); base=f'http://127.0.0.1:{port}'; PREVIEW_DIR.mkdir(parents=True,exist_ok=True)
    env=os.environ.copy(); env.update({'PORT':str(port),'DATA_DIR':str(data),'ADMIN_EMAIL':'admin@verapep.local','ADMIN_PASSWORD':'ChangeMe-123!'})
    process=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    errors=[]
    try:
        wait(base)
        with sync_playwright() as pw:
            options={'headless':True,'args':['--no-sandbox']}
            if Path('/usr/bin/chromium').exists(): options['executable_path']='/usr/bin/chromium'
            browser=pw.chromium.launch(**options)
            context=browser.new_context(viewport={'width':1440,'height':1000})
            page=context.new_page(); page.on('console',lambda msg: errors.append(msg.text) if msg.type=='error' else None); page.on('pageerror',lambda exc: errors.append(str(exc)))
            page.goto(base,wait_until='networkidle'); expect(page.locator('h1')).to_contain_text('Explore science-based'); expect(page.locator('#result-count')).to_contain_text('84 products'); page.screenshot(path=str(PREVIEW_DIR/'homepage-desktop.png'),full_page=True)
            page.locator('#catalogue-search').fill('AICAR'); expect(page.locator('#result-count')).to_contain_text('1 product'); page.locator('.product-card__link').click(); page.wait_for_load_state('networkidle'); expect(page.locator('h1')).to_have_text('AICAR'); expect(page.locator('.info-only-banner')).to_contain_text('Information only'); expect(page.locator('.variant-add-button')).to_have_count(0); page.screenshot(path=str(PREVIEW_DIR/'product-information.png'),full_page=True)
            guide=context.new_page(); guide.goto(base+'/guide.html',wait_until='networkidle'); guide.locator('[data-guide-focus="skin-appearance"]').click(); expect(guide.locator('.guide-result').first).to_be_visible(); guide.screenshot(path=str(PREVIEW_DIR/'product-guide.png'),full_page=True)
            support=context.new_page(); support.goto(base+'/support.html',wait_until='networkidle'); support.locator('#assistant-question').fill('How long is delivery?'); support.locator('#assistant-form button[type="submit"]').click(); expect(support.locator('.assistant-message').last).to_contain_text('7–10 days'); support.screenshot(path=str(PREVIEW_DIR/'ai-support.png'),full_page=True)
            admin=context.new_page(); admin.goto(base+'/admin.html',wait_until='networkidle'); admin.locator('#admin-email').fill('admin@verapep.local'); admin.locator('#admin-password').fill('ChangeMe-123!'); admin.locator('#admin-login-form button').click(); expect(admin.locator('#admin-dashboard')).to_be_visible(); admin.locator('[data-admin-tab="products"]').click(); admin.locator('[data-edit-product]').first.click(); expect(admin.locator('#product-editor')).to_be_visible(); admin.locator('#editor-short-description').fill('Approved catalogue summary.'); admin.locator('#product-editor button[type="submit"]').click(); expect(admin.locator('#admin-message')).to_contain_text('saved'); admin.screenshot(path=str(PREVIEW_DIR/'admin-products.png'),full_page=True)
            mobile=browser.new_context(viewport={'width':390,'height':844}); mp=mobile.new_page(); mp.goto(base,wait_until='networkidle'); assert mp.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth') is False; mp.screenshot(path=str(PREVIEW_DIR/'homepage-mobile.png'),full_page=True); mobile.close(); browser.close()
        assert not errors, errors
        print('E2E information platform passed')
    finally:
        process.terminate();
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill()
        shutil.rmtree(data,ignore_errors=True)
if __name__=='__main__': main()
