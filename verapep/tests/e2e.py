#!/usr/bin/env python3
"""VERAPEP end-to-end suite (v16, extended in v17).

Runs the real server against a temporary copy of data/ and drives Chromium.

Readiness is detected from application state, never from network idleness:
the storefront keeps a Server-Sent Events stream open, so "networkidle" never
fires. Each test waits for the specific element or attribute that proves the
page has rendered (product cards, aria-busy="false", filled legal facts, ...).

No real purchase or payment is possible: the server runs in sandbox mode and
no product is enabled for checkout. The suite asserts that this stays true.

v17: the publication gate lists 40 of the 84 catalogue products (44 products
whose names indicate prescription medicines, hormones or toxins stay hidden
until a reviewed approval is recorded). Counts below reflect that on purpose.

Usage:  npm run test:e2e        (python3 tests/e2e.py)
        E2E_ONLY=search,legal   run selected tests
        E2E_SHOTS=1             save screenshots to previews/information-platform
"""
from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PREVIEW_DIR = ROOT / 'previews' / 'information-platform'
AXE = ROOT / 'tests' / 'vendor' / 'axe.min.js'
DATA_FILES = ('catalogue.json', 'commerce-policy.json', 'inventory.json', 'store-config.json', 'orders.json', 'returns.json',
              'withdrawals.json', 'product-content.json', 'reviews.json', 'guide-config.json', 'support-kb.json', 'customers.json', 'product-compliance.json')
VISIBLE_PRODUCTS = 40  # v17 preview publication gate (84 in the catalogue)
PUBLIC_PAGES = ['/', '/guide.html', '/support.html', '/my-pages.html', '/checkout.html', '/order.html',
                '/privacy.html', '/terms.html', '/shipping-returns.html', '/product/aicar-025']
TIMEOUT = 10_000
expect.set_options(timeout=TIMEOUT)


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return int(sock.getsockname()[1])


def wait_for_server(base: str, timeout: float = 20) -> None:
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(base + '/api/health', timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.15)
    raise RuntimeError('Server did not become healthy')


def http_status(url: str) -> int:
    request = urllib.request.Request(url, method='GET')
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


class Suite:
    def __init__(self, browser, base: str):
        self.browser = browser
        self.base = base
        self.errors: list[str] = []

    def page(self, width: int = 1440, height: int = 900, **options) -> Page:
        context = self.browser.new_context(viewport={'width': width, 'height': height}, **options)
        page = context.new_page()
        page.on('pageerror', lambda exc: self.errors.append(f'{page.url} JS error: {exc}'))
        page.on('console', lambda msg: self.errors.append(f'{page.url} console: {msg.text}') if msg.type == 'error' and 'status of 404' not in msg.text and 'status of 401' not in msg.text else None)
        return page

    def home(self, page: Page) -> None:
        page.goto(self.base + '/', wait_until='domcontentloaded')
        expect(page.locator('#product-grid .product-card').first).to_be_visible()

    def product(self, page: Page, product_id: str) -> None:
        page.goto(f'{self.base}/product/{product_id}', wait_until='domcontentloaded')
        expect(page.locator('.product-hero')).to_have_attribute('aria-busy', 'false')

    def shot(self, page: Page, name: str) -> None:
        if os.environ.get('E2E_SHOTS'):
            PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(PREVIEW_DIR / f'{name}.png'), full_page=True)

    # ------------------------------------------------------------------ tests

    def test_navigation(self):
        page = self.page()
        self.home(page)
        nav = page.locator('#site-nav .nav__links--v11 a')
        expect(nav).to_have_text(['Shop', 'Product guide', 'Ask Vera', 'Quality', 'My pages'])
        for path, label in [('/guide.html', 'Product guide'), ('/support.html', 'Ask Vera'), ('/my-pages.html', 'My pages')]:
            page.goto(self.base + path, wait_until='domcontentloaded')
            expect(page.locator('#site-nav .nav__links--v11 a[aria-current="page"]')).to_have_text(label)
            expect(page.locator('footer nav[aria-label="Legal"] a')).to_have_count(3)
        page.goto(self.base + '/guide.html', wait_until='domcontentloaded')
        page.keyboard.press('Tab')
        expect(page.locator('.skip-link')).to_be_focused()
        page.keyboard.press('Enter')
        expect(page.locator('#main')).to_be_focused()
        page.locator('#site-nav a', has_text='Shop').click()
        page.wait_for_url(re.compile(r'/index\.html#catalogue$'))
        expect(page.locator('#catalogue')).to_be_in_viewport()
        page.context.close()

    def test_search(self):
        page = self.page()
        self.home(page)
        search = page.locator('#header-product-search')
        page.keyboard.press('/')
        expect(search).to_be_focused()
        search.fill('BPC')
        search.press('Enter')
        expect(page.locator('#result-count')).to_contain_text('6 products found')
        expect(page.locator('#product-grid .product-card h3').first).to_contain_text('BPC')
        search.fill('zzzz-no-match')
        search.press('Enter')
        expect(page.locator('#empty-state')).to_be_visible()
        page.locator('[data-empty-reset]').click()
        expect(page.locator('#result-count')).to_contain_text(f'{VISIBLE_PRODUCTS} products found')
        # A hidden (unreviewed high-risk) product cannot be found by search.
        search.fill('semaglutide')
        search.press('Enter')
        expect(page.locator('#empty-state')).to_be_visible()
        page.locator('[data-empty-reset]').click()
        # Searching from another page lands on the filtered catalogue.
        page.goto(self.base + '/support.html', wait_until='domcontentloaded')
        page.locator('#header-product-search').fill('aicar')
        page.locator('#header-product-search').press('Enter')
        page.wait_for_url(re.compile(r'search=aicar'))
        expect(page.locator('#result-count')).to_contain_text('1 product')
        page.context.close()

    def test_catalogue(self):
        page = self.page()
        self.home(page)
        expect(page.locator('#result-count')).to_contain_text(f'{VISIBLE_PRODUCTS} products found · 12 shown')
        expect(page.locator('#product-grid .product-card')).to_have_count(12)
        page.locator('#load-more').click()
        expect(page.locator('#product-grid .product-card')).to_have_count(24)
        expect(page.locator('[data-stat="products"]')).to_have_text(str(VISIBLE_PRODUCTS))
        page.goto(self.base + '/index.html?category=skin#catalogue', wait_until='domcontentloaded')
        expect(page.locator('#result-count')).to_contain_text('12 products found')
        # Compare up to three products.
        self.home(page)
        for index in range(3):
            page.locator('#product-grid .compare-secondary').nth(index).click()
        expect(page.locator('#compare-bar')).to_be_visible()
        page.locator('#open-compare').click()
        expect(page.locator('#compare-dialog')).to_be_visible()
        expect(page.locator('#compare-content')).to_contain_text('Lab report')
        page.keyboard.press('Escape')
        expect(page.locator('#compare-dialog')).to_be_hidden()
        self.shot(page, 'homepage-desktop')
        page.context.close()

    def test_product_details(self):
        page = self.page()
        self.product(page, 'aicar-025')
        expect(page.locator('h1')).to_have_text('AICAR')
        expect(page.locator('.product-status-pill')).to_have_text('Information only')
        expect(page.locator('#product-breadcrumb')).to_have_text('AICAR')
        expect(page.locator('#product-breadcrumb-category')).to_have_text('Metabolism & Energy')
        expect(page.locator('.spec-table .variant-card')).to_have_count(1)
        expect(page.locator('.variant-add-button')).to_have_count(0)
        expect(page.locator('#information')).to_contain_text('has not been published')
        expect(page.locator('#documentation')).to_contain_text('No lab report has been published')
        expect(page.locator('.product-related__card')).to_have_count(4)
        width = page.locator('.premium-vial-photo--detail').evaluate('el => el.getBoundingClientRect().width')
        assert width > 150, f'product visual collapsed ({width}px)'
        # Save + comparison feedback without alert dialogs.
        page.locator('[data-product-save]').first.click()
        expect(page.locator('#product-toast')).to_contain_text('saved')
        expect(page.locator('[data-product-save]').first).to_have_attribute('aria-pressed', 'true')
        page.locator('.product-section-nav a', has_text='Documentation').click()
        expect(page.locator('#documentation')).to_be_in_viewport()
        self.shot(page, 'product-information')
        # Every catalogue product renders a complete page.
        products = json.loads(urllib.request.urlopen(self.base + '/api/storefront').read())['products']
        for item in products:
            self.product(page, item['id'])
            expect(page.locator('h1')).not_to_have_text('Loading product…')
            assert page.locator('.spec-table .variant-card').count() == len(item['variants']), item['id']
        page.context.close()

    def test_cart_states(self):
        page = self.page()
        self.home(page)
        page.locator('#cart-header-button').click()
        drawer = page.locator('#sandbox-cart-drawer')
        expect(drawer).to_have_class(re.compile('is-open'))
        expect(drawer).to_contain_text('Preview checkout')
        expect(drawer).to_contain_text('Your cart is empty')
        page.keyboard.press('Escape')
        expect(drawer).not_to_have_class(re.compile('is-open'))
        expect(drawer).to_be_hidden()
        expect(page.locator('#cart-header-button')).to_be_focused()
        # No product can be added anywhere: purchasing stays disabled.
        expect(page.locator('[data-add-variant]')).to_have_count(0)
        page.goto(self.base + '/checkout.html', wait_until='domcontentloaded')
        expect(page.locator('.checkout-empty')).to_be_visible()
        expect(page.locator('[data-next-step="2"]')).to_be_hidden()
        storefront = json.loads(urllib.request.urlopen(self.base + '/api/storefront').read())
        assert not any(v['checkoutEnabled'] for p in storefront['products'] for v in p['variants']), 'a product became orderable'
        page.context.close()

    def test_mobile_menu(self):
        page = self.page(390, 844, is_mobile=True, has_touch=True)
        self.home(page)
        button = page.locator('#menu-button')
        expect(page.locator('#mobile-cart-button')).to_be_visible()
        button.click()
        expect(button).to_have_attribute('aria-expanded', 'true')
        expect(page.locator('#site-nav')).to_be_visible()
        expect(page.locator('#site-nav .nav__links--v11 a').first).to_be_in_viewport()
        page.keyboard.press('Escape')
        expect(button).to_have_attribute('aria-expanded', 'false')
        expect(page.locator('#site-nav')).to_be_hidden()
        expect(button).to_be_focused()
        button.click()
        page.locator('#site-nav a', has_text='Product guide').click()
        page.wait_for_url(re.compile(r'/guide\.html$'))
        overflow = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        assert overflow <= 0, f'horizontal overflow {overflow}px'
        self.shot(page, 'homepage-mobile')
        page.context.close()

    def test_forms(self):
        page = self.page()
        # Ask Vera answers from the knowledge base.
        page.goto(self.base + '/support.html', wait_until='domcontentloaded')
        page.locator('#assistant-question').fill('How long is delivery?')
        page.locator('#assistant-form button[type="submit"]').click()
        expect(page.locator('.assistant-message').last).to_contain_text('7–10 days')
        # Review form: client validation first, then moderation.
        self.product(page, 'aicar-025')
        page.locator('.review-form-toggle > summary').click()
        page.locator('#product-review-form button[type="submit"]').click()
        expect(page.locator('#review-message')).to_have_text('Please enter your name.')
        page.locator('#review-name').fill('E2E Tester')
        page.locator('#review-text').fill('Clear specification table and documentation status.')
        page.locator('#product-review-form button[type="submit"]').click()
        expect(page.locator('#review-message')).to_contain_text(re.compile('moderation|review', re.I))
        expect(page.locator('.review-list-public')).to_contain_text('No reviews have been published yet')
        # Order lookup reports an unknown order.
        page.goto(self.base + '/order.html', wait_until='domcontentloaded')
        page.locator('#lookup-order').fill('VP-20260101-XXXX')
        page.locator('#lookup-email').fill('nobody@example.com')
        page.locator('#lookup-form button[type="submit"]').click()
        expect(page.locator('#order-message')).to_be_visible()
        # Guide finder returns results.
        page.goto(self.base + '/guide.html', wait_until='domcontentloaded')
        page.locator('[data-guide-focus="skin-appearance"]').click()
        expect(page.locator('.guide-result').first).to_be_visible()
        page.context.close()

    def test_key_journey(self):
        page = self.page()
        self.home(page)
        page.locator('#finder-focus-options .focus-option').first.click()
        expect(page.locator('#finder-focus-options .focus-option').first).to_have_attribute('aria-pressed', 'true')
        page.locator('#featured-product-grid .product-card__link').first.click()
        expect(page.locator('.product-hero')).to_have_attribute('aria-busy', 'false')
        name = page.locator('h1').inner_text()
        page.locator('[data-product-save]').first.click()
        page.goto(self.base + '/my-pages.html', wait_until='domcontentloaded')
        expect(page.locator('#saved-products')).to_contain_text(name)
        page.context.close()

    def test_legal_pages(self):
        page = self.page()
        for path in ['/privacy.html', '/terms.html', '/shipping-returns.html']:
            page.goto(self.base + path, wait_until='domcontentloaded')
            expect(page.locator('.legal-status')).to_contain_text('Pending legal review')
            expect(page.locator('[data-legal]').first).not_to_have_text('—')
            expect(page.locator('.legal-tabs a[aria-current="page"]')).to_have_count(1)
        expect(page.locator('.legal-countries li')).to_have_count(27)
        expect(page.locator('.legal-method')).to_contain_text('7–10 days')
        page.goto(self.base + '/does-not-exist', wait_until='domcontentloaded')
        expect(page.locator('h1')).to_have_text('This page could not be found.')
        page.context.close()

    def test_broken_links(self):
        page = self.page()
        links: set[str] = set()
        for path in PUBLIC_PAGES:
            page.goto(self.base + path, wait_until='domcontentloaded')
            page.wait_for_load_state('load')
            for href in page.eval_on_selector_all('a[href]', 'els => els.map(a => a.href)'):
                if href.startswith(self.base):
                    links.add(href.split('#')[0])
        broken = [f'{status} {url}' for url in sorted(links) if (status := http_status(url)) >= 400]
        assert not broken, 'broken links:\n' + '\n'.join(broken)
        page.context.close()

    def test_accessibility(self):
        axe = AXE.read_text(encoding='utf-8')
        failures = []
        for width in (390, 1440):
            for path in PUBLIC_PAGES + ['/does-not-exist']:
                page = self.page(width, 900, bypass_csp=True, reduced_motion='reduce')
                page.goto(self.base + path, wait_until='domcontentloaded')
                if path.startswith('/product/'):
                    expect(page.locator('.product-hero')).to_have_attribute('aria-busy', 'false')
                elif path == '/':
                    expect(page.locator('#product-grid .product-card').first).to_be_visible()
                page.wait_for_load_state('load')
                page.add_script_tag(content=axe)
                violations = page.evaluate("""async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }))
                    .violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(' ')}`)""")
                failures += [f'{width}px {path}: {v}' for v in violations]
                assert page.locator('h1').count() == 1, f'{path} should have exactly one h1'
                page.context.close()
        assert not failures, 'axe violations:\n' + '\n'.join(failures)

    def test_admin(self):
        page = self.page()
        page.goto(self.base + '/admin.html', wait_until='domcontentloaded')
        page.locator('#admin-email').fill('admin@verapep.local')
        page.locator('#admin-password').fill('ChangeMe-123!')
        page.locator('#admin-login-form button').click()
        expect(page.locator('#admin-dashboard')).to_be_visible()
        page.locator('[data-admin-tab="products"]').click()
        page.locator('[data-edit-product]').first.click()
        expect(page.locator('#product-editor')).to_be_visible()
        page.locator('#editor-short-description').fill('Approved catalogue summary.')
        page.locator('#product-editor button[type="submit"]').click()
        expect(page.locator('#admin-message')).to_contain_text('saved')
        page.context.close()

    # ------------------------------------------------------------------ v17

    def test_publication_gate(self):
        page = self.page()
        # A hidden product has no page, and the storefront never contains it.
        page.goto(self.base + '/product/semaglutide-003', wait_until='domcontentloaded')
        expect(page.locator('h1')).to_have_text('This page could not be found.')
        storefront = json.loads(urllib.request.urlopen(self.base + '/api/storefront').read())
        assert storefront['productCount'] == VISIBLE_PRODUCTS
        assert not any(p['id'] == 'semaglutide-003' for p in storefront['products'])
        # Internal files are not web content.
        for path in ('/server.mjs', '/package.json', '/README.md', '/scripts/source/catalogue-data.js', '/tests/e2e.py'):
            assert http_status(self.base + path) == 404, path
        page.context.close()

    def test_vera(self):
        page = self.page(430, 900, is_mobile=True, has_touch=True)
        page.goto(self.base + '/support.html', wait_until='domcontentloaded')
        log = page.locator('#assistant-log')
        expect(log).to_have_attribute('aria-live', 'polite')
        # Dosing question: refused, labelled, no product links.
        page.locator('#assistant-question').fill('How much semaglutide should I inject?')
        page.locator('#assistant-question').press('Enter')
        answer = page.locator('.vera-answer').last
        expect(answer).to_contain_text('does not give medical advice')
        expect(answer.locator('.vera-answer__badge')).to_have_text('Not medical advice')
        assert answer.locator('a[href*="/product/"]').count() == 0
        # Swedish question, configured email in the answer.
        page.locator('#assistant-question').fill('hur kontaktar jag er?')
        page.locator('#assistant-form button[type="submit"]').click()
        expect(page.locator('.vera-answer').last).to_contain_text('hello@verapep.eu')
        # Shortcut + follow-up suggestion chips.
        page.locator('.assistant-shortcuts [data-vera-ask]', has_text='Returns').click()
        expect(page.locator('.vera-answer').last).to_contain_text('return')
        page.locator('#assistant-question').fill('qwerty asdf')
        page.locator('#assistant-question').press('Enter')
        expect(page.locator('.vera-answer--fallback').last).to_be_visible()
        page.locator('.vera-answer--fallback [data-vera-suggestion]').first.click()
        expect(page.locator('.vera-answer').last).not_to_have_class(re.compile('vera-answer--fallback'))
        # Visible contact details for people who prefer email.
        expect(page.locator('#contact [data-legal-mail="supportEmail"]')).to_have_text('hello@verapep.eu')
        overflow = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        assert overflow <= 0, f'horizontal overflow {overflow}px'
        self.shot(page, 'ask-vera-mobile')
        # Floating panel on the home page.
        desk = self.page()
        self.home(desk)
        desk.mouse.wheel(0, 1600)
        desk.locator('#vera-launcher').click()
        desk.locator('#vera-quick [data-vera-ask]', has_text='Delivery').click()
        expect(desk.locator('#vera-log .vera-answer').last).to_contain_text('7–10 days')
        desk.keyboard.press('Escape')
        expect(desk.locator('#vera-panel')).to_be_hidden()
        desk.context.close()
        page.context.close()

    def test_mobile_search(self):
        page = self.page(375, 800, is_mobile=True, has_touch=True)
        self.home(page)
        page.locator('#menu-button').click()
        search = page.locator('#header-product-search')
        search.fill('GHK')
        search.press('Enter')
        # v17 fix: the menu closes so the filtered results are visible.
        expect(page.locator('#menu-button')).to_have_attribute('aria-expanded', 'false')
        expect(page.locator('#site-nav')).to_be_hidden()
        expect(page.locator('#product-grid .product-card').first).to_contain_text('GHK')
        page.context.close()

    def test_admin_compliance(self):
        page = self.page()
        page.goto(self.base + '/admin.html', wait_until='domcontentloaded')
        page.locator('#admin-email').fill('admin@verapep.local')
        page.locator('#admin-password').fill('ChangeMe-123!')
        page.locator('#admin-login-form button').click()
        expect(page.locator('#admin-dashboard')).to_be_visible()
        page.locator('[data-admin-tab="status"]').click()
        expect(page.locator('#status-overview')).to_contain_text('Not approved for launch')
        expect(page.locator('#status-blockers')).to_contain_text('compliance approval')
        page.locator('[data-admin-tab="compliance"]').click()
        expect(page.locator('#compliance-rows tr')).to_have_count(84)
        page.locator('#compliance-risk-filter').select_option('high')
        expect(page.locator('#compliance-rows tr')).to_have_count(84 - VISIBLE_PRODUCTS)
        page.locator('#compliance-risk-filter').select_option('')
        page.locator('[data-compliance-id="kpv-071"] [data-compliance-open]').click()
        detail = page.locator('#compliance-detail')
        expect(detail).to_contain_text('Automated suggestion — not a decision')
        detail.locator('select[name="status"]').select_option('needs_evidence')
        detail.locator('input[name="note"]').fill('Waiting for supplier documentation.')
        detail.locator('button[type="submit"]').click()
        expect(page.locator('#admin-message')).to_contain_text('Decision saved')
        expect(page.locator('[data-compliance-id="kpv-071"] .status-pill')).to_have_text('Needs evidence')
        # Knowledge updates are visible and up to date on a fresh install.
        page.locator('[data-admin-tab="guide"]').click()
        expect(page.locator('#kb-migration')).to_contain_text('Up to date')
        expect(page.locator('#kb-entries .kb-entry')).to_have_count(21)
        self.shot(page, 'admin-compliance')
        page.context.close()


def main() -> int:
    data = Path(tempfile.mkdtemp(prefix='vp-e2e-'))
    for name in DATA_FILES:
        shutil.copy2(ROOT / 'data' / name, data / name)
    port = free_port()
    base = f'http://127.0.0.1:{port}'
    env = os.environ.copy()
    env.update({'PORT': str(port), 'DATA_DIR': str(data), 'ADMIN_EMAIL': 'admin@verapep.local', 'ADMIN_PASSWORD': 'ChangeMe-123!', 'APP_ENV': 'development'})
    for key in ('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY'):
        env.pop(key, None)
    process = subprocess.Popen(['node', '--no-warnings', 'server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    results: list[tuple[str, bool, str, float]] = []
    try:
        wait_for_server(base)
        with sync_playwright() as pw:
            options = {'headless': True, 'args': ['--no-sandbox', '--no-proxy-server']}
            if Path('/usr/bin/chromium').exists():
                options['executable_path'] = '/usr/bin/chromium'
            browser = pw.chromium.launch(**options)
            suite = Suite(browser, base)
            only = {name.strip() for name in os.environ.get('E2E_ONLY', '').split(',') if name.strip()}
            tests = [name for name in dir(suite) if name.startswith('test_') and (not only or name[5:] in only)]
            for name in tests:
                started = time.time()
                before = len(suite.errors)
                try:
                    getattr(suite, name)()
                    new_errors = suite.errors[before:]
                    if new_errors:
                        raise AssertionError('console/JS errors:\n' + '\n'.join(new_errors))
                    results.append((name, True, '', time.time() - started))
                except Exception as error:  # report every failure, keep running the rest
                    detail = ''.join(traceback.format_exception_only(type(error), error)).strip()
                    results.append((name, False, detail, time.time() - started))
            browser.close()
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        shutil.rmtree(data, ignore_errors=True)

    for name, ok, detail, seconds in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name[5:]:<16} {seconds:5.1f}s" + (f'\n      {detail}' if detail else ''))
    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)} passed, {len(failed)} failed')
    return 1 if failed or not results else 0


if __name__ == '__main__':
    sys.exit(main())
