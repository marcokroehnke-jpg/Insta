/** Kleine DOM- und UI-Helfer – bewusst ohne Framework. */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in el && key !== 'list' && typeof value !== 'object') {
      el[key] = value;
    } else {
      el.setAttribute(key, value);
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function field(labelText, control, hint) {
  return h('label', { class: 'field' }, h('span', {}, labelText), control, hint ? h('div', { class: 'tiny dim', style: 'margin-top:4px' }, hint) : null);
}

export function input(attrs = {}) {
  return h('input', { type: 'text', ...attrs });
}

export function textarea(attrs = {}) {
  return h('textarea', attrs);
}

export function select(options, attrs = {}) {
  const el = h('select', attrs);
  for (const opt of options) {
    el.append(h('option', { value: opt.value, selected: opt.value === attrs.value }, opt.label));
  }
  el.value = attrs.value ?? el.value;
  return el;
}

export function toast(message, type = 'info', ms = 4200) {
  const root = document.getElementById('toasts');
  const el = h('div', { class: `toast ${type}` }, message);
  root.append(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .2s';
    setTimeout(() => el.remove(), 220);
  }, ms);
}

export function modal({ title, body, actions = [], onClose }) {
  const root = document.getElementById('modalRoot');
  const close = () => {
    root.innerHTML = '';
    onClose?.();
  };
  const backdrop = h(
    'div',
    {
      class: 'modal-backdrop',
      onclick: (e) => {
        if (e.target === backdrop) close();
      }
    },
    h(
      'div',
      { class: 'modal' },
      h('h3', {}, title),
      body,
      actions.length
        ? h(
            'div',
            { class: 'row end', style: 'margin-top:18px' },
            ...actions.map((a) =>
              h(
                'button',
                {
                  class: `btn ${a.variant || ''}`,
                  onclick: async () => {
                    const keep = await a.onClick?.(close);
                    if (!keep) close();
                  }
                },
                a.label
              )
            )
          )
        : null
    )
  );
  root.innerHTML = '';
  root.append(backdrop);
  return close;
}

export function confirmDialog(title, text) {
  return new Promise((resolve) => {
    modal({
      title,
      body: h('p', { class: 'muted' }, text),
      actions: [
        { label: 'Abbrechen', onClick: () => resolve(false) },
        { label: 'Ja, ausführen', variant: 'primary', onClick: () => resolve(true) }
      ],
      onClose: () => resolve(false)
    });
  });
}

export const fmt = {
  number: (n) => (Number(n) || 0).toLocaleString('de-DE'),
  percent: (n, digits = 1) => `${((Number(n) || 0) * 100).toFixed(digits).replace('.', ',')} %`,
  dateTime: (iso) =>
    iso
      ? new Date(iso).toLocaleString('de-DE', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '–',
  date: (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '–'),
  time: (iso) =>
    iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–',
  relative(iso) {
    if (!iso) return '–';
    const diff = Date.now() - new Date(iso).getTime();
    const abs = Math.abs(diff);
    const units = [
      [86400000, 'Tag', 'Tagen'],
      [3600000, 'Std.', 'Std.'],
      [60000, 'Min.', 'Min.']
    ];
    for (const [ms, one, many] of units) {
      if (abs >= ms) {
        const n = Math.round(abs / ms);
        return diff > 0 ? `vor ${n} ${n === 1 ? one : many}` : `in ${n} ${n === 1 ? one : many}`;
      }
    }
    return 'gerade eben';
  }
};

export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export const STATUS_LABEL = {
  draft: 'Entwurf',
  scheduled: 'Geplant',
  publishing: 'Wird gepostet',
  published: 'Veröffentlicht',
  failed: 'Fehlgeschlagen'
};

export function statusPill(status) {
  return h('span', { class: `status-pill status-${status}` }, STATUS_LABEL[status] || status);
}

/** Wandelt eine Datei in ein data:-URL um. */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    img.src = src;
  });
}

/** Verkleinert ein Bild für die Bildanalyse (spart Tokens und Zeit). */
export async function downscale(dataUrl, maxEdge = 1024, quality = 0.82) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
