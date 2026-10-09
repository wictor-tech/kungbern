/* VERAPEP v12.6 — homepage-ready unified glass-vial renderer.
   - Product source remains the existing catalogue/database.
   - Presentation-only typography normalises obvious punctuation/spacing defects.
   - Vial labels use deterministic, natural line breaks (never arbitrary mid-word wrapping).
   - Colour is driven by the product's primary discovery goal; a secondary goal is a small accent only.
*/
(() => {
  'use strict';

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const rawProductName = product => clean(product?.name || product?.content?.displayName || 'VERAPEP');

  /* Presentation-only corrections. The stored catalogue name is not changed. */
  function typographyName(value) {
    let name = clean(value)
      .replaceAll('）', ')')
      .replaceAll('（', '(')
      .replace(/\bWhitout\b/gi, 'Without')
      .replace(/CJC-1295without\b/gi, 'CJC-1295 Without')
      .replace(/([A-Za-z0-9])\(/g, '$1 (')
      .replace(/([A-Za-z])(?=\d+(?:[.,]\d+)?(?:mg|mcg|µg|ug|iu|ml)\b)/gi, '$1 ')
      .replace(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|iu|ml)\b/gi, (_, number, unit) => {
        const u = unit.toLowerCase();
        const normalUnit = (u === 'mcg' || u === 'ug') ? 'µg' : u === 'iu' ? 'IU' : u === 'ml' ? 'mL' : u;
        return `${number} ${normalUnit}`;
      })
      .replace(/\s*\+\s*/g, ' + ')
      .replace(/\s*\/\s*/g, '/')
      .replace(/\s+/g, ' ')
      .trim();
    return name;
  }

  const displayName = product => typographyName(rawProductName(product));

  const GOAL_PALETTES = {
    'weight-metabolism':   { primary:'#078995', soft:'#6bcbd1', liquid:'#8edee2', pale:'#e9f8f9', label:'Weight & metabolism' },
    'skin-appearance':     { primary:'#c35d98', soft:'#e2a1c5', liquid:'#efbdd7', pale:'#fbecf4', label:'Skin appearance' },
    'strength-recovery':   { primary:'#238f63', soft:'#75c69a', liquid:'#9bdab5', pale:'#eaf7ef', label:'Strength & recovery' },
    'energy-vitality':     { primary:'#bd8615', soft:'#e4bd4c', liquid:'#efd57c', pale:'#fbf5df', label:'Energy' },
    'sleep-focus':         { primary:'#5b63bd', soft:'#9299dc', liquid:'#b2b7e8', pale:'#f0f1fb', label:'Sleep & focus' },
    'healthy-ageing':      { primary:'#318ab7', soft:'#7cc5df', liquid:'#9fd9eb', pale:'#eaf6fb', label:'Healthy ageing' },
    'hormonal-specialist': { primary:'#8253a7', soft:'#b28bd0', liquid:'#c9ade0', pale:'#f4edf8', label:'Hormonal & specialist' }
  };

  const CATEGORY_FALLBACK = {
    metabolism: 'weight-metabolism',
    strength: 'strength-recovery',
    skin: 'skin-appearance',
    specialist: 'hormonal-specialist'
  };

  function colourProfile(product) {
    const goals = Array.isArray(product?.content?.discoveryGoals)
      ? product.content.discoveryGoals.filter(id => GOAL_PALETTES[id])
      : [];
    const primaryId = goals[0] || CATEGORY_FALLBACK[product?.category] || 'healthy-ageing';
    const secondaryId = goals.find(id => id !== primaryId) || primaryId;
    const primary = GOAL_PALETTES[primaryId] || GOAL_PALETTES['healthy-ageing'];
    const secondary = GOAL_PALETTES[secondaryId] || primary;
    return {
      primaryId,
      secondaryId,
      primary: primary.primary,
      primarySoft: primary.soft,
      pale: primary.pale,
      liquid: primary.liquid,
      secondary: secondary.primary,
      hasSecondary: secondaryId !== primaryId,
      goalLabel: primary.label,
      secondaryLabel: secondary.label
    };
  }

  function firstDose(product) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const preferred = variants.find(v => v?.checkoutEnabled && Number(v?.sandboxStock || 0) > 0)
      || variants.find(v => v?.checkoutEnabled)
      || variants[0];
    const candidates = [preferred?.specification, preferred?.catalogueNo].filter(Boolean).map(clean);
    for (const value of candidates) {
      const match = value.match(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|g|iu|ml)\b/i);
      if (!match) continue;
      const number = match[1].replace(',', '.');
      let unit = match[2].toLowerCase();
      if (unit === 'ug' || unit === 'mcg') unit = 'µg';
      if (unit === 'iu') unit = 'IU';
      if (unit === 'ml') unit = 'mL';
      return `${number} ${unit}`;
    }
    return 'See variants';
  }

  function breakTokens(name) {
    const words = typographyName(name).split(/\s+/).filter(Boolean);
    const tokens = [];
    for (let i = 0; i < words.length; i += 1) {
      const current = words[i];
      const next = words[i + 1];
      if (/\d$/.test(current) && /^(mg|µg|IU|mL|g)(?:\/.*)?$/i.test(next || '')) {
        tokens.push(`${current} ${next}`);
        i += 1;
      } else {
        tokens.push(current);
      }
    }
    return tokens;
  }

  function partitions(tokens, lines) {
    const out = [];
    const n = tokens.length;
    if (lines <= 1 || n <= 1) return [[tokens.join(' ')]];
    const rec = (start, left, acc) => {
      if (left === 1) {
        if (start < n) out.push([...acc, tokens.slice(start).join(' ')]);
        return;
      }
      const maxEnd = n - (left - 1);
      for (let end = start + 1; end <= maxEnd; end += 1) {
        rec(end, left - 1, [...acc, tokens.slice(start, end).join(' ')]);
      }
    };
    rec(0, Math.min(lines, n), []);
    return out;
  }

  function scoreLines(lines, preferred) {
    const lengths = lines.map(line => line.length);
    const max = Math.max(...lengths);
    const avg = lengths.reduce((a,b) => a+b,0) / lengths.length;
    const variance = lengths.reduce((sum, n) => sum + (n - avg) ** 2, 0);
    const operatorPenalty = lines.reduce((sum, line) => sum + (/^\+|\+$/.test(line.trim()) ? 10000 : 0), 0);
    const orphanPenalty = lines.reduce((sum, line, i) => sum + (i === lines.length - 1 && line.length <= 3 ? 25 : 0), 0);
    const overflowPenalty = Math.max(0, max - preferred) ** 2 * 18;
    return variance + operatorPenalty + orphanPenalty + overflowPenalty + lines.length * 3;
  }

  function labelLines(product) {
    const name = displayName(product);
    const tokens = breakTokens(name);
    if (!tokens.length) return ['VERAPEP'];
    const compactLength = name.replace(/\s+/g,'').length;
    let desired = compactLength <= 13 ? 1 : compactLength <= 26 ? 2 : compactLength <= 39 ? 3 : 4;
    desired = Math.min(desired, tokens.length, 4);
    const preferred = desired === 1 ? 16 : desired === 2 ? 17 : desired === 3 ? 16 : 15;
    let best = null;
    for (let k = Math.max(1, desired - 1); k <= Math.min(4, tokens.length); k += 1) {
      for (const candidate of partitions(tokens, k)) {
        const score = scoreLines(candidate, preferred) + Math.abs(k - desired) * 18;
        if (!best || score < best.score) best = { lines: candidate, score };
      }
    }
    return best?.lines || [name];
  }

  function lineClass(lines) {
    const max = Math.max(...lines.map(line => line.length));
    if (lines.length >= 4 || max > 22) return 'premium-vial-photo__name--xxlong';
    if (lines.length === 3 || max > 18) return 'premium-vial-photo__name--xlong';
    if (lines.length === 2 || max > 14) return 'premium-vial-photo__name--long';
    return '';
  }

  function render(product, options = {}) {
    const name = displayName(product);
    const rawName = rawProductName(product);
    const dose = firstDose(product);
    const mode = ['detail','cart'].includes(options.mode) ? options.mode : 'card';
    const lines = labelLines(product);
    const longClass = lineClass(lines);
    const palette = colourProfile(product);
    const style = [
      `--vial-primary:${palette.primary}`,
      `--vial-primary-soft:${palette.primarySoft}`,
      `--vial-pale:${palette.pale}`,
      `--vial-secondary:${palette.secondary}`,
      `--vial-liquid:${palette.liquid}`,
      `--vial-secondary-size:${palette.hasSecondary ? '16%' : '0%'}`,
      `--vial-name-lines:${lines.length}`
    ].join(';');
    const ariaGoals = palette.hasSecondary ? `${palette.goalLabel}; ${palette.secondaryLabel}` : palette.goalLabel;
    const nameMarkup = lines.map(line => esc(line)).join('<br>');

    return `<div class="premium-vial-photo premium-vial-photo--${mode}" style="${style}" role="img" data-raw-name="${esc(rawName)}" data-display-name="${esc(name)}" data-goal="${esc(palette.primaryId)}" aria-label="VERAPEP ${esc(name)} ${esc(dose)} vial. Catalogue colour group: ${esc(ariaGoals)}">
      <div class="premium-vial-photo__bottle" aria-hidden="true"></div>
      <div class="premium-vial-photo__cap-tint" aria-hidden="true"></div>
      <div class="premium-vial-photo__liquid-tint" aria-hidden="true"></div>
      <div class="premium-vial-photo__label" aria-hidden="true">
        <div class="premium-vial-photo__band"></div>
        <div class="premium-vial-photo__brand">VERAPEP</div>
        <strong class="premium-vial-photo__name ${longClass}">${nameMarkup}</strong>
        <div class="premium-vial-photo__dose">${esc(dose)}</div>
      </div>
    </div>`;
  }

  window.VerapepeVialRenderer = {
    render,
    rawProductName,
    displayName,
    typographyName,
    firstDose,
    colourProfile,
    labelLines,
    palettes: GOAL_PALETTES
  };
})();
