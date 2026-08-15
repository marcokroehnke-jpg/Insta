import { api } from './api.js';
import { h, toast } from './ui.js';
import { createStudioState, renderStudio } from './studio.js';
import { renderDashboard, renderInsights, renderPlan, renderSettings, renderTexter } from './views.js';

const VIEWS = {
  dashboard: renderDashboard,
  studio: renderStudio,
  texter: renderTexter,
  plan: renderPlan,
  insights: renderInsights,
  settings: renderSettings
};

const app = {
  view: 'dashboard',
  state: null,
  meta: {},
  studio: createStudioState(),
  texter: { pillar: 'angebot', variantCount: 3, mediaIds: [] },

  async refresh() {
    this.state = await api.state();
    updateChrome(this);
    return this.state;
  },

  go(view) {
    if (!VIEWS[view]) view = 'dashboard';
    this.view = view;
    if (location.hash.slice(1) !== view) location.hash = view;
    render(this);
  }
};

async function render(app) {
  const main = document.getElementById('main');
  document.querySelectorAll('#nav button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === app.view);
  });

  main.innerHTML = '';
  main.append(h('div', { class: 'loading' }, 'Lädt …'));

  try {
    const node = await VIEWS[app.view](app);
    main.innerHTML = '';
    main.append(node);
    main.scrollIntoView?.({ block: 'start' });
    window.scrollTo(0, 0);
  } catch (err) {
    main.innerHTML = '';
    main.append(h('div', { class: 'empty' }, `Diese Ansicht konnte nicht geladen werden: ${err.message}`));
    console.error(err);
  }
}

function updateChrome(app) {
  const s = app.state.settings;

  document.getElementById('brandName').textContent = s.businessName || 'Marketing-Cockpit';
  document.getElementById('brandSub').textContent = s.city || 'Instagram';

  const mark = document.getElementById('brandMark');
  mark.innerHTML = '';
  if (s.logoDataUrl) {
    mark.append(h('img', { src: s.logoDataUrl, alt: '' }));
  } else {
    mark.textContent = (s.businessName || 'IG').slice(0, 2).toUpperCase();
  }
  mark.style.background = s.brandColor || 'var(--accent)';

  const scheduled = app.state.posts.filter((p) => p.status === 'scheduled').length;
  const status = document.getElementById('sideStatus');
  status.innerHTML = '';
  status.append(
    row(app.meta.aiConfigured ? 'on' : 'off', app.meta.aiConfigured ? 'Texter bereit' : 'Kein API-Schlüssel'),
    row(
      s.igAccessTokenSet && s.igUserId && s.publicBaseUrl ? 'on' : 'off',
      s.igAccessTokenSet && s.igUserId && s.publicBaseUrl ? 'Instagram verbunden' : 'Instagram unvollständig'
    ),
    row(s.autoPublish ? 'on' : 'idle', s.autoPublish ? `Auto-Posting an · ${scheduled} geplant` : 'Auto-Posting pausiert')
  );
}

function row(dotClass, text) {
  return h('div', { class: 'row' }, h('span', { class: `dot ${dotClass}` }), h('span', {}, text));
}

document.getElementById('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (btn) app.go(btn.dataset.view);
});

window.addEventListener('hashchange', () => {
  const view = location.hash.slice(1);
  if (view && view !== app.view) app.go(view);
});

window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
});

(async function boot() {
  try {
    app.meta = await api.meta();
    await app.refresh();
    app.go(location.hash.slice(1) || 'dashboard');
  } catch (err) {
    document.getElementById('main').innerHTML = '';
    document
      .getElementById('main')
      .append(h('div', { class: 'empty' }, `Der Server antwortet nicht: ${err.message}`));
    toast('Verbindung zum Server fehlgeschlagen.', 'error');
  }
})();

// Für Debugging in der Browser-Konsole
window.__app = app;
