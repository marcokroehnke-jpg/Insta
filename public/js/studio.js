import { h, field, input, select, toast, fileToDataUrl, loadImage } from './ui.js';
import { api } from './api.js';

export const RATIOS = {
  '4:5': { w: 1080, h: 1350, label: '4:5 Feed' },
  '1:1': { w: 1080, h: 1080, label: '1:1 Quadrat' },
  '9:16': { w: 1080, h: 1920, label: '9:16 Story' }
};

export function createStudioState() {
  return {
    img: null,
    sourceDataUrl: '',
    ratio: '4:5',
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    brightness: 100,
    contrast: 100,
    saturation: 105,
    warmth: 0,
    vignette: 18,
    showBadge: false,
    priceOld: '',
    priceNew: '',
    badgePosition: 'tr',
    stickerText: '',
    showBrandBar: true,
    brandLine: ''
  };
}

/* --------------------------------------------------------------- rendering */

function drawRoundedRect(ctx, x, y, w, hgt, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hgt, r);
  ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderToCanvas(canvas, s, settings, logoImg) {
  const { w: W, h: H } = RATIOS[s.ratio];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, 0, W, H);

  if (s.img) {
    const cover = Math.max(W / s.img.width, H / s.img.height) * s.zoom;
    const dw = s.img.width * cover;
    const dh = s.img.height * cover;
    const dx = (W - dw) / 2 + s.offsetX;
    const dy = (H - dh) / 2 + s.offsetY;

    ctx.save();
    ctx.filter = `brightness(${s.brightness}%) contrast(${s.contrast}%) saturate(${s.saturation}%)`;
    ctx.drawImage(s.img, dx, dy, dw, dh);
    ctx.restore();

    // Farbtemperatur
    if (s.warmth !== 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = Math.min(Math.abs(s.warmth) / 100, 0.6);
      ctx.fillStyle = s.warmth > 0 ? '#ff9d3d' : '#3d9dff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Vignette – zieht den Blick zur Bildmitte, wo das Produkt steht
    if (s.vignette > 0) {
      const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${s.vignette / 100})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = '#3a3f4a';
    ctx.font = `500 ${Math.round(W * 0.035)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Noch kein Foto geladen', W / 2, H / 2);
    ctx.textAlign = 'start';
  }

  const brandColor = settings.brandColor || '#e2001a';

  // Störer oben links
  if (s.stickerText.trim()) {
    const text = s.stickerText.trim().toUpperCase();
    const fontSize = Math.round(W * 0.042);
    ctx.save();
    ctx.font = `700 ${fontSize}px sans-serif`;
    const padX = fontSize * 0.7;
    const boxW = ctx.measureText(text).width + padX * 2;
    const boxH = fontSize * 2;
    ctx.translate(W * 0.055, H * 0.06);
    ctx.rotate((-4 * Math.PI) / 180);
    ctx.fillStyle = brandColor;
    drawRoundedRect(ctx, 0, 0, boxW, boxH, fontSize * 0.35);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, padX, boxH / 2 + 1);
    ctx.restore();
  }

  // Preis-Badge
  if (s.showBadge && (s.priceNew || s.priceOld)) {
    const size = W * 0.3;
    const margin = W * 0.05;
    const barH = s.showBrandBar ? H * 0.11 : 0;
    const positions = {
      tr: [W - margin - size, margin],
      tl: [margin, margin],
      br: [W - margin - size, H - barH - margin - size],
      bl: [margin, H - barH - margin - size]
    };
    const [bx, by] = positions[s.badgePosition] || positions.tr;
    const cx = bx + size / 2;
    const cy = by + size / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = size * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = brandColor;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';

    if (s.priceOld) {
      const oldSize = size * 0.13;
      ctx.font = `500 ${oldSize}px sans-serif`;
      const label = `statt ${s.priceOld}`;
      ctx.fillText(label, cx, cy - size * 0.11);
      const wOld = ctx.measureText(label).width;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(2, size * 0.012);
      ctx.beginPath();
      ctx.moveTo(cx - wOld / 2, cy - size * 0.145);
      ctx.lineTo(cx + wOld / 2, cy - size * 0.145);
      ctx.stroke();
    }

    if (s.priceNew) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${size * 0.24}px sans-serif`;
      ctx.fillText(s.priceNew, cx, cy + size * 0.09);
      ctx.font = `600 ${size * 0.09}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('JETZT', cx, cy + size * 0.24);
    }
    ctx.restore();
  }

  // Markenbalken unten
  if (s.showBrandBar) {
    const barH = H * 0.11;
    const y = H - barH;
    ctx.fillStyle = 'rgba(10,10,12,0.9)';
    ctx.fillRect(0, y, W, barH);
    ctx.fillStyle = brandColor;
    ctx.fillRect(0, y, W, Math.max(4, H * 0.005));

    let textX = W * 0.05;
    if (logoImg) {
      const lh = barH * 0.5;
      const lw = (logoImg.width / logoImg.height) * lh;
      ctx.drawImage(logoImg, textX, y + (barH - lh) / 2, lw, lh);
      textX += lw + W * 0.03;
    }

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(W * 0.036)}px sans-serif`;
    ctx.fillText(settings.businessName || '', textX, y + barH * 0.38);

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `500 ${Math.round(W * 0.026)}px sans-serif`;
    const sub = s.brandLine || [settings.city, settings.phone].filter(Boolean).join(' · ');
    ctx.fillText(sub, textX, y + barH * 0.68);
    ctx.textBaseline = 'alphabetic';
  }
}

/* -------------------------------------------------------------------- view */

export function renderStudio(app) {
  const s = app.studio;
  const settings = app.state.settings;
  let logoImg = null;

  const canvas = h('canvas', { id: 'studioCanvas' });

  const draw = () => renderToCanvas(canvas, s, settings, logoImg);

  if (settings.logoDataUrl) {
    loadImage(settings.logoDataUrl)
      .then((img) => {
        logoImg = img;
        draw();
      })
      .catch(() => {});
  }

  /* ---- Bild laden ---- */

  async function useFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('Bitte ein Bild auswählen (JPG oder PNG).', 'error');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    s.sourceDataUrl = dataUrl;
    s.img = await loadImage(dataUrl);
    s.zoom = 1;
    s.offsetX = 0;
    s.offsetY = 0;
    draw();
    toast('Foto geladen. Jetzt zuschneiden und aufbereiten.', 'success');
  }

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*',
    style: 'display:none',
    onchange: (e) => useFile(e.target.files[0])
  });

  const dropzone = h(
    'div',
    {
      class: 'dropzone',
      onclick: () => fileInput.click(),
      ondragover: (e) => {
        e.preventDefault();
        dropzone.classList.add('over');
      },
      ondragleave: () => dropzone.classList.remove('over'),
      ondrop: (e) => {
        e.preventDefault();
        dropzone.classList.remove('over');
        useFile(e.dataTransfer.files[0]);
      }
    },
    h('div', { style: 'font-size:26px;margin-bottom:6px' }, '⬆'),
    h('div', {}, 'Foto aus dem Markt hierher ziehen'),
    h('div', { class: 'tiny dim', style: 'margin-top:4px' }, 'oder klicken zum Auswählen'),
    fileInput
  );

  /* ---- Zuschnitt per Maus ---- */

  let dragging = false;
  let last = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!s.img) return;
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    canvas.classList.add('dragging');
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    s.offsetX += (e.clientX - last.x) * scale;
    s.offsetY += (e.clientY - last.y) * scale;
    last = { x: e.clientX, y: e.clientY };
    draw();
  });
  const endDrag = () => {
    dragging = false;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    if (!s.img) return;
    e.preventDefault();
    s.zoom = Math.min(4, Math.max(1, s.zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
    zoomSlider.value = String(Math.round(s.zoom * 100));
    zoomOut.textContent = `${Math.round(s.zoom * 100)}%`;
    draw();
  }, { passive: false });

  /* ---- Regler ---- */

  function slider(label, key, min, max, step = 1, suffix = '') {
    const out = h('span', { class: 'val' }, `${s[key]}${suffix}`);
    const range = h('input', {
      type: 'range',
      min,
      max,
      step,
      value: s[key],
      oninput: (e) => {
        s[key] = Number(e.target.value);
        out.textContent = `${s[key]}${suffix}`;
        draw();
      }
    });
    return { row: h('div', { class: 'slider-row' }, h('span', {}, label), range, out), range, out };
  }

  const zoom = slider('Zoom', 'zoom', 1, 4, 0.01);
  // Zoom als Prozent anzeigen
  const zoomSlider = zoom.range;
  const zoomOut = zoom.out;
  zoomOut.textContent = `${Math.round(s.zoom * 100)}%`;
  zoomSlider.addEventListener('input', () => {
    zoomOut.textContent = `${Math.round(s.zoom * 100)}%`;
  });

  const brightness = slider('Helligkeit', 'brightness', 60, 150, 1, '%');
  const contrast = slider('Kontrast', 'contrast', 60, 160, 1, '%');
  const saturation = slider('Sättigung', 'saturation', 0, 200, 1, '%');
  const warmth = slider('Wärme', 'warmth', -100, 100);
  const vignette = slider('Vignette', 'vignette', 0, 70);

  const ratioPills = h(
    'div',
    { class: 'ratio-pills' },
    ...Object.entries(RATIOS).map(([key, r]) =>
      h(
        'button',
        {
          class: s.ratio === key ? 'on' : '',
          onclick: (e) => {
            s.ratio = key;
            [...e.target.parentElement.children].forEach((b) => b.classList.remove('on'));
            e.target.classList.add('on');
            draw();
          }
        },
        r.label
      )
    )
  );

  const priceOldInput = input({
    value: s.priceOld,
    placeholder: '999 €',
    oninput: (e) => {
      s.priceOld = e.target.value;
      draw();
    }
  });
  const priceNewInput = input({
    value: s.priceNew,
    placeholder: '799 €',
    oninput: (e) => {
      s.priceNew = e.target.value;
      draw();
    }
  });
  const stickerInput = input({
    value: s.stickerText,
    placeholder: 'Nur bis Samstag',
    maxlength: 28,
    oninput: (e) => {
      s.stickerText = e.target.value;
      draw();
    }
  });

  const badgeToggle = h('input', {
    type: 'checkbox',
    checked: s.showBadge,
    onchange: (e) => {
      s.showBadge = e.target.checked;
      draw();
    }
  });
  const barToggle = h('input', {
    type: 'checkbox',
    checked: s.showBrandBar,
    onchange: (e) => {
      s.showBrandBar = e.target.checked;
      draw();
    }
  });

  const badgePos = select(
    [
      { value: 'tr', label: 'oben rechts' },
      { value: 'tl', label: 'oben links' },
      { value: 'br', label: 'unten rechts' },
      { value: 'bl', label: 'unten links' }
    ],
    {
      value: s.badgePosition,
      onchange: (e) => {
        s.badgePosition = e.target.value;
        draw();
      }
    }
  );

  /* ---- Aktionen ---- */

  const autoBtn = h(
    'button',
    {
      class: 'btn sm',
      onclick: () => {
        // Ladenlicht ist meist zu warm und zu flau – dieser Satz gleicht das aus.
        Object.assign(s, { brightness: 108, contrast: 116, saturation: 118, warmth: -12, vignette: 22 });
        brightness.range.value = s.brightness;
        brightness.out.textContent = `${s.brightness}%`;
        contrast.range.value = s.contrast;
        contrast.out.textContent = `${s.contrast}%`;
        saturation.range.value = s.saturation;
        saturation.out.textContent = `${s.saturation}%`;
        warmth.range.value = s.warmth;
        warmth.out.textContent = `${s.warmth}`;
        vignette.range.value = s.vignette;
        vignette.out.textContent = `${s.vignette}`;
        draw();
        toast('Ladenlicht-Korrektur angewendet.', 'success');
      }
    },
    '✨ Ladenlicht korrigieren'
  );

  const resetBtn = h(
    'button',
    {
      class: 'btn sm ghost',
      onclick: () => {
        const fresh = createStudioState();
        Object.assign(s, fresh, { img: s.img, sourceDataUrl: s.sourceDataUrl, ratio: s.ratio });
        app.go('studio');
      }
    },
    'Zurücksetzen'
  );

  const saveBtn = h(
    'button',
    {
      class: 'btn primary',
      onclick: async () => {
        if (!s.img) return toast('Zuerst ein Foto laden.', 'error');
        saveBtn.disabled = true;
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const media = await api.uploadMedia({
            dataUrl,
            label: s.stickerText || s.priceNew || '',
            width: canvas.width,
            height: canvas.height
          });
          await app.refresh();
          app.lastMediaId = media.id;
          toast('Bild gespeichert – es steht jetzt im Texter bereit.', 'success');
          app.go('studio');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          saveBtn.disabled = false;
        }
      }
    },
    'Bild speichern'
  );

  const toTexterBtn = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        if (!s.img) return toast('Zuerst ein Foto laden.', 'error');
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const media = await api.uploadMedia({
          dataUrl,
          label: s.priceNew || '',
          width: canvas.width,
          height: canvas.height
        });
        await app.refresh();
        app.texter.mediaIds = [media.id];
        app.texter.priceOld = s.priceOld;
        app.texter.priceNew = s.priceNew;
        app.go('texter');
      }
    },
    'Speichern & Text schreiben →'
  );

  draw();

  /* ---- Galerie ---- */

  const gallery = h(
    'div',
    { class: 'gallery' },
    ...app.state.media.slice(0, 12).map((m) =>
      h(
        'figure',
        { title: m.label || m.filename },
        h('img', { src: `/uploads/${m.filename}`, alt: m.label || 'Aufbereitetes Bild', loading: 'lazy' }),
        h(
          'button',
          {
            class: 'del',
            title: 'Löschen',
            onclick: async (e) => {
              e.stopPropagation();
              await api.deleteMedia(m.id);
              await app.refresh();
              app.go('studio');
            }
          },
          '×'
        )
      )
    )
  );

  return h(
    'div',
    {},
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Foto-Studio'),
      h(
        'p',
        {},
        'Foto aus dem Markt laden, auf das Instagram-Format bringen und mit Preis, Störer und Markenbalken versehen. Das Ergebnis wird in Originalgröße (1080 px breit) gespeichert.'
      )
    ),
    h(
      'div',
      { class: 'split' },
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'card' }, dropzone),
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Format'),
          ratioPills,
          h('hr', { class: 'sep' }),
          h('h2', {}, 'Bild'),
          zoom.row,
          brightness.row,
          contrast.row,
          saturation.row,
          warmth.row,
          vignette.row,
          h('div', { class: 'row', style: 'margin-top:10px' }, autoBtn, resetBtn),
          h(
            'p',
            { class: 'tiny dim', style: 'margin:10px 0 0' },
            'Ziehen im Bild verschiebt den Ausschnitt, Mausrad zoomt.'
          )
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Aufkleber & Marke'),
          h('label', { class: 'switch', style: 'margin-bottom:10px' }, badgeToggle, h('span', {}, 'Preis-Badge zeigen')),
          field('Vorher-Preis (durchgestrichen)', priceOldInput),
          field('Aktionspreis', priceNewInput),
          field('Position des Badges', badgePos),
          h('hr', { class: 'sep' }),
          field('Störer-Text', stickerInput, 'Kurz und konkret – „Nur bis Samstag“ wirkt stärker als „Top Angebot“.'),
          h('label', { class: 'switch' }, barToggle, h('span', {}, 'Markenbalken unten zeigen'))
        )
      ),
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'studio-canvas-wrap' }, canvas),
        h('div', { class: 'row' }, saveBtn, toTexterBtn),
        h(
          'div',
          { class: 'card' },
          h('h2', {}, `Bildarchiv (${app.state.media.length})`),
          app.state.media.length ? gallery : h('div', { class: 'empty' }, 'Noch keine aufbereiteten Bilder.')
        )
      )
    )
  );
}
