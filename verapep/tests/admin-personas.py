#!/usr/bin/env python3
"""VERAPEP simulated admin personas (v19).

AI-scripted, simulated first-time administrators — NOT real user research.
Each persona signs in and then navigates "blind" with the same heuristic as
tests/personas.py: it reads visible links, buttons and tabs, scores their text
against the words that persona would use, and clicks the best match. Data-entry
steps (typing a description, choosing a decision) are done the way a person
would: by locating the visible field or button whose label matches.

Usage:  python3 tests/admin-personas.py              fresh server on a temp data copy
        PERSONA_ROOT=/path/to/other/version ...      run against another checkout
        PERSONA_OUT=result.json ...                  raw results
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import personas as base  # noqa: E402  (shared navigator, server start-up, result type)

from playwright.sync_api import Page, sync_playwright  # noqa: E402

ADMIN = {'email': 'admin@verapep.local', 'password': 'ChangeMe-123!'}

# Administrators work inside the admin area: the public site header and footer are not candidates.
# Stale markers from an earlier scan can sit on elements that are now hidden; clear them first.
base.CANDIDATES_JS = base.CANDIDATES_JS.replace("const out = [];", "document.querySelectorAll('[data-persona-idx]').forEach(n => n.removeAttribute('data-persona-idx'));\n  const out = [];", 1)
base.CANDIDATES_JS = base.CANDIDATES_JS.replace("document.querySelectorAll('a[href], button, summary, [role=\"button\"]')", "(document.getElementById('admin-dashboard') || document).querySelectorAll('a[href], button, summary, [role=\"button\"], [role=\"tab\"]')")


def login(page: Page, root: str, result: base.Result) -> None:
    page.goto(root + '/admin.html', wait_until='domcontentloaded')
    page.fill('#admin-email', ADMIN['email'])
    page.fill('#admin-password', ADMIN['password'])
    page.locator('#admin-login-form button').first.click()
    page.wait_for_selector('#admin-dashboard:not([hidden])', timeout=8000)
    base.settle(page)


def visible_text(page: Page) -> str:
    return page.evaluate("() => [...document.querySelectorAll('[data-admin-panel]:not([hidden]), .admin-overview, #admin-dashboard')].map(n => n.innerText).join('\\n')")


def api(root: str, path: str, body=None, cookie=None, csrf=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(root + path, data=data, method=method or ('POST' if data else 'GET'))
    request.add_header('Content-Type', 'application/json')
    if cookie:
        request.add_header('Cookie', cookie)
    if csrf:
        request.add_header('X-CSRF-Token', csrf)
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return response.status, json.loads(response.read() or b'{}'), response.headers
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read() or b'{}'), error.headers


def api_login(root: str):
    status, payload, headers = api(root, '/api/admin/login', ADMIN)
    return headers.get('Set-Cookie', '').split(';')[0], payload.get('csrf')


def fill_by_label(page: Page, result: base.Result, words: list[str], text: str) -> bool:
    """Type into the visible text field whose label best matches the words."""
    fields = page.evaluate(r"""(words) => {
      const out = [];
      document.querySelectorAll('textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=search])').forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || el.closest('[hidden]') || el.disabled || el.readOnly) return;
        const label = (el.closest('label')?.innerText || el.getAttribute('aria-label') || el.placeholder || '').toLowerCase();
        const score = words.filter(w => label.includes(w)).length;
        el.setAttribute('data-persona-field', String(i));
        out.push({ i, score, label: label.slice(0, 60) });
      });
      return out.sort((a, b) => b.score - a.score);
    }""", words)
    if not fields or fields[0]['score'] == 0:
        result.stuck = result.stuck or f'No field labelled like {words}'
        return False
    page.locator(f"[data-persona-field=\"{fields[0]['i']}\"]").fill(text)
    result.steps += 1
    result.path.append(f"[type into “{fields[0]['label'][:28]}”]")
    return True


def click_by_words(page: Page, result: base.Result, words: list[str]) -> bool:
    candidates = page.evaluate(base.CANDIDATES_JS)
    ranked = sorted(((base.score(c, words) + (1 if c['tag'] == 'button' else 0), c) for c in candidates), key=lambda item: (-item[0], len(item[1]['text'])))
    if not ranked or ranked[0][0] <= 1:
        result.stuck = result.stuck or f'No button matched {words}'
        return False
    best = ranked[0][1]
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator(f"[data-persona-idx=\"{best['idx']}\"]").first.click()
    result.steps += 1
    result.path.append(best['text'][:40])
    base.settle(page)
    return True


def tasks(root: str):
    def find_missing_docs(page, r):
        # Success: a count of products lacking verified documentation is stated on screen.
        pattern = re.compile(r'\b\d+\b[^\n]{0,40}\b(missing|without|lack\w*|no)\b[^\n]{0,30}\b(documentation|documents|description|verified content)', re.I)
        base.navigate(page, r, ['overview', 'documentation', 'missing', 'products', 'readiness'], lambda p: bool(pattern.search(visible_text(p))))

    def complete_product(page, r):
        # Success: KPV has a content draft waiting for review (checked through the API afterwards).
        base.navigate(page, r, ['products', 'product', 'workspace', 'edit'], lambda p: p.locator('[data-admin-panel="products"]:not([hidden]) input[type=search]:visible').count() > 0)
        r.completed = False  # reaching the list is only the first step
        search = page.locator('[data-admin-panel="products"]:not([hidden]) input[type=search]:visible').first
        if search.count():
            search.fill('KPV'); r.steps += 1; r.path.append('[search “KPV”]'); base.settle(page)
        if not click_by_words(page, r, ['kpv']):
            return
        click_by_words(page, r, ['draft', 'edit content', 'prepare', 'new draft', 'complete'])
        if not fill_by_label(page, r, ['short description', 'short', 'summary'], 'Peptide reference material supplied as a lyophilised powder in sealed vials.'):
            return
        click_by_words(page, r, ['submit for review', 'send for review', 'review', 'submit'])
        cookie, csrf = api_login(root)
        status, payload, _ = api(root, '/api/admin/products/kpv-071/drafts', cookie=cookie)
        drafts = payload.get('drafts', []) if status == 200 else []
        r.completed = any(d.get('status') in ('internal_review', 'external_review') for d in drafts)
        if not r.completed:
            r.stuck = r.stuck or ('No review workflow exists in this version' if status == 404 else 'Draft not submitted for review')

    def review_change(page, r):
        # Precondition: someone else submitted a draft for GHK-CU. Success: the change is shown as a diff.
        base.navigate(page, r, ['review', 'reviews', 'awaiting review', 'drafts', 'changes', 'products'], lambda p: p.locator('.content-diff:visible ins, .content-diff:visible del').count() > 0 or p.locator('[data-review-draft]:visible').count() > 0)
        if page.locator('[data-review-draft]:visible').count():
            page.locator('[data-review-draft]:visible').first.click(); r.steps += 1; r.path.append('[open proposal]'); base.settle(page)
        r.completed = page.locator('.content-diff:visible ins, .content-diff:visible del').count() > 0
        if not r.completed:
            r.stuck = r.stuck or 'Could not find the proposed change or its differences'

    def launch_blockers(page, r):
        base.navigate(page, r, ['overview', 'status', 'launch', 'blockers', 'readiness'], lambda p: bool(re.search(r'launch blockers|not approved for launch|legal launch readiness', visible_text(p), re.I)))

    def hidden_products(page, r):
        base.navigate(page, r, ['compliance', 'review', 'hidden', 'visible', 'products'], lambda p: bool(re.search(r'\bhidden\b', visible_text(p), re.I)) and p.locator('select:visible').count() > 0)

    return [
        ('F · First-time owner', 'Find how many products lack documentation', (1440, 900), find_missing_docs),
        ('F · First-time owner', 'Complete a product (KPV) and send it for review', (1440, 900), complete_product),
        ('G · Editor-reviewer', 'Review a proposed change and see what changed', (1440, 900), review_change),
        ('H · Owner on a phone', 'Find what blocks the launch', (390, 844), launch_blockers),
        ('H · Owner on a phone', 'Find which products are hidden and why', (390, 844), hidden_products),
    ]


def seed_review_proposal(root: str) -> None:
    """Create a draft by a second editor, so persona G has something to review (v19+ only)."""
    cookie, csrf = api_login(root)
    api(root, '/api/admin/users', {'email': 'writer@example.com', 'password': 'Writer-password-19', 'role': 'editor', 'displayName': 'Writer'}, cookie, csrf)
    status, payload, headers = api(root, '/api/admin/login', {'email': 'writer@example.com', 'password': 'Writer-password-19'})
    writer = headers.get('Set-Cookie', '').split(';')[0]
    w_csrf = payload.get('csrf')
    status, payload, _ = api(root, '/api/admin/products/ghk-cu-043/drafts', {'fields': {'shortDescription': 'Copper peptide reference material in sealed vials.'}, 'note': 'From supplier sheet'}, writer, w_csrf)
    if status in (200, 201):
        draft = payload['draft']['id']
        api(root, f'/api/admin/drafts/{draft}/submit', {}, writer, w_csrf)


def main() -> int:
    root_url = os.environ.get('PERSONA_BASE')
    process = temp = None
    if not root_url:
        root_url, process, temp = base.start_server()
    seed_review_proposal(root_url)
    results = []
    try:
        with sync_playwright() as playwright:
            executable = os.environ.get('CHROMIUM_PATH')
            browser = playwright.chromium.launch(executable_path=executable, args=['--no-proxy-server']) if executable else playwright.chromium.launch(args=['--no-proxy-server'])
            for persona, task, (width, height), action in tasks(root_url):
                result = base.Result(persona=persona, task=task, viewport=f'{width}px')
                context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=width < 700, has_touch=width < 700)
                page = context.new_page()
                page.on('pageerror', lambda error, r=result: r.errors.append(str(error)[:160]))
                try:
                    login(page, root_url, result)
                    action(page, result)
                except Exception as error:  # noqa: BLE001
                    result.stuck = result.stuck or f'Exception: {str(error).splitlines()[0][:160]}'
                context.close()
                results.append(result)
                print(f"{'PASS' if result.completed else 'FAIL'}  {persona:<22} {task:<50} steps={result.steps:<2} {' > '.join(result.path)}")
                if not result.completed:
                    print(f'      stuck: {result.stuck}')
            browser.close()
    finally:
        if process:
            process.terminate(); process.wait(timeout=5)
    print(f"\n{sum(r.completed for r in results)}/{len(results)} admin tasks completed (simulated personas, not real users)")
    if os.environ.get('PERSONA_OUT'):
        Path(os.environ['PERSONA_OUT']).write_text(json.dumps([r.__dict__ for r in results], indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
