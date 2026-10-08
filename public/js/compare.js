import { h, field, input, select, toast, loadImage } from './ui.js';
import { api } from './api.js';
import { RATIOS } from './studio.js';

/**
 * Preisvergleich: Waschmittelkosten pro Waschladung als Balkengrafik.
 *
 * Die Startwerte sind recherchierte Online-Preise (Stand Oktober 2026) und
 * nur ein Ausgangspunkt. Vor dem Posten die eigenen Regalpreise eintragen:
 * Vergleichende Werbung muss nachprüfbar sein (§ 6 UWG), deshalb steht
 * unter der Grafik immer, aus welchem Preis und welcher Ladungszahl jeder
 * Wert berechnet wurde.
 *
 * Die Ladungszahl auf der Packung gilt nur bei Dosierung genau nach
 * Anleitung. Von Hand wird in der Praxis mehr eingefüllt; eine Automatik
 * wie Miele TwinDos dosiert nach Beladung. Deshalb rechnet die Grafik bei
 * Handdosierung den Mehrverbrauch drauf, der sich aus der angegebenen
 * Einsparung der Automatik ergibt, und zeigt ihn als hellen Balkenteil.
 */
export function createCompareState() {
  return {
    headline: 'Was kostet eine Wäsche?',
    subline: 'Waschmittel pro Ladung: automatisch vs. von Hand dosiert',
    washesPerYear: 200,
    highlight: 'auto',
    asOf: new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
    source: 'Online-Handelspreise',
    // Miele: „bis zu 30 %“ Waschmittelersparnis ggü. manueller Dosierung,
    // Gutachten Öko-Institut vom 06.09.2013. Obergrenze, kein Durchschnitt.
    autoSaving: 30,
    savingSource: 'Miele-Angabe „bis zu 30 %“, Öko-Institut 2013',
    products: [
      {
        brand: 'Miele',
        product: 'UltraPhase 1 + 2 für TwinDos',
        pack: 'Set je 3× UltraPhase 1 und 2',
        price: '91,90',
        loads: '111',
        auto: true
      },
      {
        brand: 'Persil',
        product: 'Universal Kraft-Gel',
        pack: '',
        price: '17,23',
        loads: '50',
        auto: false
      },
      {
        brand: 'Ariel',
        product: 'Universal+ flüssig',
        pack: '',
        price: '18,45',
        loads: '70',
        auto: false
      }
    ]
  };
}

const FORMATS = ['4:5', '9:16'];

/** „17,23 €“, „17.23“ oder „17“ → 17.23 */
function parseNumber(value) {
  const n = Number(String(value).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const euro = (n, digits = 2) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;

/**
 * Faktor für den Mehrverbrauch bei Handdosierung. Spart die Automatik 30 %,
 * braucht die Hand das 1 / 0,7 = 1,43-fache – also 43 % mehr, nicht 30 %.
 */
export function manualFactor(c) {
  const saving = Math.min(90, Math.max(0, Number(c.autoSaving) || 0));
  return 1 / (1 - saving / 100);
}

/**
 * Kosten je Wäsche laut Packung (rated) und realistisch (perLoad).
 * Zeilen ohne gültigen Preis oder Ladungszahl fallen raus.
 */
export function computeRows(c) {
  const factor = manualFactor(c);
  return c.products
    .map((p, index) => {
      const price = parseNumber(p.price);
      const loads = parseNumber(p.loads);
      const rated = price > 0 && loads > 0 ? price / loads : 0;
      return { ...p, index, price, loads, rated, perLoad: p.auto ? rated : rated * factor };
    })
    .filter((r) => r.brand.trim() && r.perLoad > 0);
}

function highlightIndex(c, rows) {
  if (c.highlight === 'none' || !rows.length) return -1;
  if (c.highlight === 'auto') return rows.reduce((a, b) => (b.perLoad < a.perLoad ? b : a)).index;
  return Number(c.highlight);
}

/* --------------------------------------------------------------- rendering */

function roundedRect(ctx, x, y, w, hgt, r) {
  r = Math.min(r, w / 2, hgt / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hgt, r);
  ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Bricht Text auf maxWidth um und gibt die Zeilen zurück. */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderCompare(canvas, c, ratio, settings, logoImg) {
  const { w: W, h: H } = RATIOS[ratio];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const story = ratio === '9:16';
  const brandColor = settings.brandColor || '#e2001a';
  const ink = '#16181d';
  const muted = '#5d6370';
  const track = '#e6e3dd';
  const neutralBar = '#3b4049';
  const pad = W * 0.07;

  const rows = computeRows(c);
  const hi = highlightIndex(c, rows);
  const max = Math.max(...rows.map((r) => r.perLoad), 0.01);

  ctx.fillStyle = '#f6f4f0';
  ctx.fillRect(0, 0, W, H);

  // Kopf
  const headTop = story ? H * 0.09 : H * 0.055;
  ctx.fillStyle = brandColor;
  ctx.fillRect(pad, headTop, W * 0.12, Math.max(6, W * 0.009));

  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  const headSize = Math.round(W * (story ? 0.085 : 0.068));
  ctx.font = `800 ${headSize}px sans-serif`;
  let y = headTop + headSize * 1.3;
  for (const line of wrap(ctx, c.headline, W - pad * 2)) {
    ctx.fillText(line, pad, y);
    y += headSize * 1.08;
  }

  const subSize = Math.round(W * 0.033);
  ctx.font = `500 ${subSize}px sans-serif`;
  ctx.fillStyle = muted;
  y += subSize * 0.1 - headSize * 0.08;
  for (const line of wrap(ctx, c.subline, W - pad * 2)) {
    ctx.fillText(line, pad, y);
    y += subSize * 1.35;
  }

  // Fußnote zuerst vermessen: Sie sitzt fest über dem Markenbalken, der
  // Balkenbereich bekommt den Rest.
  const barBar = H * 0.11;
  const noteSize = Math.round(W * 0.02);
  const noteLine = noteSize * 1.4;
  ctx.font = `500 ${noteSize}px sans-serif`;
  const factor = manualFactor(c);
  const anyManual = factor > 1 && rows.some((r) => !r.auto);
  const notes = [
    `Packungswert = Preis ÷ Waschladungen laut Hersteller${
      c.washesPerYear > 0 ? `, Jahr = ${c.washesPerYear} Wäschen` : ''
    }.${
      anyManual
        ? ` Heller Balkenteil: Annahme, Automatik spart ${c.autoSaving} %${
            c.savingSource ? ` (${c.savingSource})` : ''
          }, also ${Math.round((factor - 1) * 100)} % Mehrverbrauch von Hand.`
        : ''
    }`,
    ...rows.map(
      (r) =>
        `${r.brand} ${r.product}: ${euro(r.price)} ÷ ${r.loads.toLocaleString('de-DE')} WL${r.pack ? ` (${r.pack})` : ''}`
    ),
    [c.source, c.asOf && `Stand ${c.asOf}`, 'Preise und Verbrauch können abweichen.'].filter(Boolean).join(' · ')
  ]
    .filter(Boolean)
    .flatMap((note) => wrap(ctx, note, W - pad * 2));
  const footTop = H - barBar - (story ? H * 0.05 : H * 0.035) - notes.length * noteLine;

  ctx.fillStyle = muted;
  notes.forEach((line, i) => ctx.fillText(line, pad, footTop + noteSize + i * noteLine));

  // Balken
  const brandSize = Math.round(W * (story ? 0.05 : 0.042));
  const prodSize = Math.round(W * (story ? 0.027 : 0.025));
  const barH = Math.round(W * (story ? 0.062 : 0.046));
  const valueSize = Math.round(barH * 0.66);
  const gap = brandSize * 0.3;
  const blockH = brandSize + gap + barH + gap + prodSize * 1.1;

  // Erste Marke unter der Unterzeile, letzter Jahreswert mit Abstand über
  // der Fußnote, dazwischen gleichmäßig verteilt.
  const chartTop = y + subSize * (story ? 2 : 0.6);
  const chartBottom = footTop - noteSize * (story ? 3 : 2);
  const between = rows.length > 1 ? (chartBottom - chartTop - blockH * rows.length) / (rows.length - 1) : 0;
  const labelReserve = W * 0.24;
  const barMax = W - pad * 2 - labelReserve;
  let top = chartTop;

  rows.forEach((r) => {
    const isHi = r.index === hi;

    ctx.fillStyle = ink;
    ctx.font = `800 ${brandSize}px sans-serif`;
    ctx.fillText(r.brand, pad, top + brandSize * 0.85);
    const brandW = ctx.measureText(r.brand).width;
    ctx.fillStyle = muted;
    ctx.font = `500 ${prodSize}px sans-serif`;
    ctx.fillText(r.product, pad + brandW + W * 0.02, top + brandSize * 0.85);

    const barTop = top + brandSize + gap;
    ctx.fillStyle = track;
    roundedRect(ctx, pad, barTop, barMax, barH, barH / 2);
    ctx.fill();

    const len = Math.max(barH, (r.perLoad / max) * barMax);
    const ratedLen = Math.max(barH, (r.rated / max) * barMax);
    const color = isHi ? brandColor : neutralBar;
    if (len > ratedLen) {
      // Mehrverbrauch von Hand: heller Teil hinter dem Packungswert
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = color;
      roundedRect(ctx, pad, barTop, len, barH, barH / 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = color;
    roundedRect(ctx, pad, barTop, ratedLen, barH, barH / 2);
    ctx.fill();

    ctx.textBaseline = 'middle';
    ctx.fillStyle = isHi ? brandColor : ink;
    ctx.font = `800 ${valueSize}px sans-serif`;
    ctx.fillText(euro(r.perLoad), pad + barMax + W * 0.025, barTop + barH / 2);
    ctx.textBaseline = 'alphabetic';

    {
      ctx.fillStyle = muted;
      ctx.font = `500 ${prodSize}px sans-serif`;
      const year = Math.round(r.perLoad * c.washesPerYear);
      const how = r.auto ? 'automatisch dosiert' : `von Hand dosiert · laut Packung ${euro(r.rated)}`;
      ctx.fillText(c.washesPerYear > 0 ? `≈ ${euro(year, 0)} im Jahr · ${how}` : how, pad, barTop + barH + gap + prodSize * 0.9);
    }

    top += blockH + between;
  });

  // Markenbalken wie im Foto-Studio
  const y0 = H - barBar;
  ctx.fillStyle = '#0c0c0e';
  ctx.fillRect(0, y0, W, barBar);
  ctx.fillStyle = brandColor;
  ctx.fillRect(0, y0, W, Math.max(4, H * 0.005));
  let textX = W * 0.05;
  if (logoImg) {
    const lh = barBar * 0.5;
    const lw = (logoImg.width / logoImg.height) * lh;
    ctx.drawImage(logoImg, textX, y0 + (barBar - lh) / 2, lw, lh);
    textX += lw + W * 0.03;
  }
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(W * 0.036)}px sans-serif`;
  ctx.fillText(settings.businessName || '', textX, y0 + barBar * 0.38);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `500 ${Math.round(W * 0.026)}px sans-serif`;
  ctx.fillText([settings.city, settings.phone].filter(Boolean).join(' · '), textX, y0 + barBar * 0.68);
  ctx.textBaseline = 'alphabetic';
}

/* -------------------------------------------------------------------- view */

export function renderCompareView(app) {
  const c = app.compare;
  const settings = app.state.settings;
  let logoImg = null;

  const canvases = Object.fromEntries(FORMATS.map((r) => [r, h('canvas', { class: 'compare-canvas' })]));
  const draw = () => FORMATS.forEach((r) => renderCompare(canvases[r], c, r, settings, logoImg));

  if (settings.logoDataUrl) {
    loadImage(settings.logoDataUrl)
      .then((img) => {
        logoImg = img;
        draw();
      })
      .catch(() => {});
  }

  const text = (key, attrs = {}) =>
    input({
      value: c[key],
      ...attrs,
      oninput: (e) => {
        c[key] = e.target.value;
        draw();
      }
    });

  const highlightOptions = () => [
    { value: 'auto', label: 'Günstigstes automatisch' },
    { value: 'none', label: 'Keins' },
    ...c.products.map((p, i) => ({ value: String(i), label: p.brand || `Produkt ${i + 1}` }))
  ];
  const highlightSelect = select(highlightOptions(), {
    value: c.highlight,
    onchange: (e) => {
      c.highlight = e.target.value;
      draw();
    }
  });

  const perLoadOut = c.products.map(() => h('span', { class: 'tiny dim' }));
  const updatePerLoad = () => {
    const rows = computeRows(c);
    perLoadOut.forEach((out, i) => {
      const r = rows.find((x) => x.index === i);
      out.textContent = !r
        ? 'Preis und Waschladungen eintragen'
        : r.auto || r.perLoad === r.rated
          ? `= ${euro(r.perLoad)} pro Wäsche`
          : `= ${euro(r.rated)} laut Packung, ${euro(r.perLoad)} von Hand dosiert`;
    });
  };

  const productCards = c.products.map((p, i) => {
    const prodInput = (key, label, attrs = {}, hint) =>
      field(
        label,
        input({
          value: p[key],
          ...attrs,
          oninput: (e) => {
            p[key] = e.target.value;
            updatePerLoad();
            draw();
          }
        }),
        hint
      );
    return h(
      'div',
      { class: 'card' },
      h('h2', {}, `Produkt ${i + 1}`),
      h('div', { class: 'grid cols-2', style: 'gap:10px' }, prodInput('brand', 'Marke'), prodInput('product', 'Produkt')),
      prodInput('pack', 'Packung (optional, für die Fußnote)', { placeholder: 'Set, Doppelpack …' }),
      h(
        'div',
        { class: 'grid cols-2', style: 'gap:10px' },
        prodInput('price', 'Packungspreis (€)', { inputmode: 'decimal' }),
        prodInput('loads', 'Waschladungen', { inputmode: 'numeric' })
      ),
      h(
        'label',
        { class: 'switch', style: 'margin:4px 0 8px' },
        h('input', {
          type: 'checkbox',
          checked: p.auto,
          onchange: (e) => {
            p.auto = e.target.checked;
            updatePerLoad();
            draw();
          }
        }),
        h('span', {}, 'Dosiert automatisch (z. B. TwinDos)')
      ),
      perLoadOut[i]
    );
  });

  async function save(ratio) {
    const canvas = canvases[ratio];
    const media = await api.uploadMedia({
      dataUrl: canvas.toDataURL('image/png'),
      label: `${c.headline} (${RATIOS[ratio].label})`,
      width: canvas.width,
      height: canvas.height
    });
    return media;
  }

  const saveBtn = h(
    'button',
    {
      class: 'btn primary',
      onclick: async () => {
        saveBtn.disabled = true;
        try {
          const feed = await save('4:5');
          await save('9:16');
          await app.refresh();
          app.lastMediaId = feed.id;
          toast('Feed- und Story-Grafik im Bildarchiv gespeichert.', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          saveBtn.disabled = false;
        }
      }
    },
    'Beide ins Bildarchiv'
  );

  const toTexterBtn = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        try {
          const media = await save('4:5');
          await app.refresh();
          app.texter.mediaIds = [media.id];
          app.texter.pillar = 'beratung';
          app.go('texter');
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    },
    'Feed speichern & Text schreiben →'
  );

  const download = (ratio) =>
    h(
      'button',
      {
        class: 'btn sm ghost',
        onclick: () => {
          const a = h('a', {
            href: canvases[ratio].toDataURL('image/png'),
            download: `preisvergleich-${ratio.replace(':', 'x')}.png`
          });
          a.click();
        }
      },
      `PNG ${RATIOS[ratio].label}`
    );

  updatePerLoad();
  draw();

  return h(
    'div',
    {},
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Preisvergleich'),
      h(
        'p',
        {},
        'Vergleichsgrafik „Kosten pro Wäsche“ für Feed (4:5) und Story (9:16). Die Startwerte sind recherchierte Online-Preise – vor dem Posten durch eure aktuellen Regalpreise ersetzen. Die Fußnote zeigt automatisch, woraus jeder Wert berechnet ist, damit der Vergleich nachprüfbar bleibt.'
      )
    ),
    h(
      'div',
      { class: 'split' },
      h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Text'),
          field('Überschrift', text('headline')),
          field('Unterzeile', text('subline')),
          h(
            'div',
            { class: 'grid cols-2', style: 'gap:10px' },
            field(
              'Wäschen pro Jahr',
              input({
                value: c.washesPerYear,
                inputmode: 'numeric',
                oninput: (e) => {
                  c.washesPerYear = Math.max(0, Math.round(parseNumber(e.target.value)));
                  draw();
                }
              }),
              '0 blendet den Jahreswert aus.'
            ),
            field('Hervorheben', highlightSelect)
          ),
          h('hr', { class: 'sep' }),
          h('h2', {}, 'Dosierung'),
          h(
            'div',
            { class: 'grid cols-2', style: 'gap:10px' },
            field(
              'Ersparnis Automatik (%)',
              input({
                value: c.autoSaving,
                inputmode: 'numeric',
                oninput: (e) => {
                  c.autoSaving = Math.min(90, Math.max(0, Math.round(parseNumber(e.target.value))));
                  updatePerLoad();
                  draw();
                }
              }),
              'Gegenüber Handdosierung. 0 = nur Packungswerte.'
            ),
            field('Quelle der Ersparnis', text('savingSource'))
          ),
          h(
            'p',
            { class: 'tiny dim', style: 'margin:0 0 10px' },
            'Miele nennt „bis zu 30 %“ – das ist die Obergrenze aus dem Öko-Institut-Gutachten von 2013, kein Durchschnitt. Ein vorsichtigerer Wert ist werberechtlich die sicherere Wahl.'
          ),
          h('hr', { class: 'sep' }),
          h(
            'div',
            { class: 'grid cols-2', style: 'gap:10px' },
            field('Preisquelle', text('source', { placeholder: 'Regalpreise im Markt' })),
            field('Stand', text('asOf'))
          )
        ),
        ...productCards,
        h(
          'p',
          { class: 'tiny dim' },
          'Miele: Eine TwinDos-Wäsche verbraucht UltraPhase 1 und 2 zugleich. Deshalb hier das Set mit beiden Komponenten; begrenzend ist UltraPhase 1 mit rund 37 Ladungen je Kartusche.'
        )
      ),
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'compare-previews' }, ...FORMATS.map((r) => h('div', { class: 'studio-canvas-wrap' }, canvases[r]))),
        h('div', { class: 'row' }, saveBtn, toTexterBtn, h('span', { class: 'spacer' }), ...FORMATS.map(download))
      )
    )
  );
}
