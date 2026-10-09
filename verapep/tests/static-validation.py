#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json, re, sys

ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = [p for p in ROOT.rglob('*.html') if 'previews' not in p.parts]

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids=[]; self.refs=[]; self.tags=[]
    def handle_starttag(self, tag, attrs):
        d=dict(attrs); self.tags.append(tag)
        if 'id' in d: self.ids.append(d['id'])
        for key in ('href','src'):
            if key in d: self.refs.append((tag,key,d[key]))

errors=[]
for path in HTML_FILES:
    parser=Parser()
    try: parser.feed(path.read_text(encoding='utf-8'))
    except Exception as exc: errors.append(f'{path.relative_to(ROOT)} parse error: {exc}'); continue
    duplicates=sorted({x for x in parser.ids if parser.ids.count(x)>1})
    if duplicates: errors.append(f'{path.relative_to(ROOT)} duplicate ids: {duplicates}')
    for tag,key,ref in parser.refs:
        if not ref or ref.startswith(('#','mailto:','tel:','http://','https://','data:','javascript:','/api/')): continue
        target=urlsplit(ref).path
        if not target: continue
        resolved=((ROOT / unquote(target).lstrip('/')) if target.startswith('/') else (path.parent / unquote(target))).resolve()
        try: resolved.relative_to(ROOT.resolve())
        except ValueError:
            errors.append(f'{path.relative_to(ROOT)} reference escapes root: {ref}'); continue
        if not resolved.exists(): errors.append(f'{path.relative_to(ROOT)} missing {key}: {ref}')

# JSON integrity and discovery coverage.
for path in (ROOT/'data').glob('*.json'):
    try: json.loads(path.read_text(encoding='utf-8'))
    except Exception as exc: errors.append(f'{path.relative_to(ROOT)} invalid JSON: {exc}')
cat=json.loads((ROOT/'data/catalogue.json').read_text())
content=json.loads((ROOT/'data/product-content.json').read_text())['products']
guide=json.loads((ROOT/'data/guide-config.json').read_text())
if len(cat['products']) != 84: errors.append('catalogue product count is not 84')
if sum(len(p['variants']) for p in cat['products']) != 170: errors.append('catalogue variant count is not 170')
if not (ROOT/'product.html').exists(): errors.append('dynamic product template is missing')
if (ROOT/'shop').exists() and list((ROOT/'shop').glob('*.html')): errors.append('legacy static product pages should not remain in V9')
for product in cat['products']:
    item=content.get(product['id'])
    if not item: errors.append(f'missing product content: {product["id"]}'); continue
    if not item.get('discoveryGoals'): errors.append(f'missing discoveryGoals: {product["id"]}')
    if not item.get('discoveryNeeds'): errors.append(f'missing discoveryNeeds: {product["id"]}')
valid_goals={area['id'] for area in guide.get('focusAreas',[])}
valid_needs={need['id'] for area in guide.get('focusAreas',[]) for need in area.get('needs',[])}
for pid,item in content.items():
    for goal in item.get('discoveryGoals',[]):
        if goal not in valid_goals: errors.append(f'{pid} unknown goal {goal}')
    for need in item.get('discoveryNeeds',[]):
        if need not in valid_needs: errors.append(f'{pid} unknown need {need}')

# Key homepage controls required by app.js.
index=(ROOT/'index.html').read_text()
required_ids=['ambient-liquid','hero-catalogue-count','hero-commerce-status','orbit-product-count','focus-options','need-options','priority-options','finder-summary','product-grid','catalogue-search','category-filter','rating-filter','report-filter','sort-filter','saved-drawer','compare-dialog','vera-panel']
for id_ in required_ids:
    if f'id="{id_}"' not in index: errors.append(f'index missing required id {id_}')


app=(ROOT/'assets/app.js').read_text()
styles=(ROOT/'assets/styles.css').read_text()
for marker in ['state = { focuses: new Set()', "new EventSource('/api/storefront/events')", '--ambient-mint-x', 'requestAnimationFrame(updateAmbient)']:
    if marker not in app: errors.append(f'app.js missing V5 marker: {marker}')
for marker in ['.ambient-liquid__shape--mint', '.ambient-liquid__shape--blue', '@media (prefers-reduced-motion: reduce)']:
    if marker not in styles: errors.append(f'styles.css missing ambient marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'Static validation passed: {len(HTML_FILES)} HTML templates, 84 products, 170 variants, dynamic product routing and discovery tags complete.')
