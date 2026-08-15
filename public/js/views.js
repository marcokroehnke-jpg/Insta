import { api } from './api.js';
import {
  h,
  field,
  input,
  textarea,
  select,
  toast,
  modal,
  confirmDialog,
  fmt,
  statusPill,
  WEEKDAYS,
  fileToDataUrl,
  downscale
} from './ui.js';

/* ================================================================ Übersicht */

export function renderDashboard(app) {
  const { posts, summary, nextSlots, settings, events } = app.state;

  const scheduled = posts.filter((p) => p.status === 'scheduled');
  const published = posts.filter((p) => p.status === 'published');
  const failed = posts.filter((p) => p.status === 'failed');
  const drafts = posts.filter((p) => p.status === 'draft');
  const next = [...scheduled].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];

  const weekAgo = Date.now() - 7 * 86400000;
  const lastWeekCount = published.filter((p) => new Date(p.publishedAt).getTime() > weekAgo).length;

  const goalReach = Number(settings.goals?.reach) || 0;
  const reach = summary.totals?.reach || 0;

  const setupSteps = [
    { done: Boolean(settings.businessName && settings.city), label: 'Marktprofil ausgefüllt', view: 'settings' },
    { done: Boolean(app.meta.aiConfigured), label: 'Texter aktiv (API-Schlüssel gesetzt)', view: 'settings' },
    { done: Boolean(settings.igAccessTokenSet && settings.igUserId), label: 'Instagram verbunden', view: 'settings' },
    { done: Boolean(settings.publicBaseUrl), label: 'Öffentliche Bild-URL gesetzt', view: 'settings' },
    { done: (settings.slots || []).length >= 3, label: 'Mindestens 3 feste Slots pro Woche', view: 'plan' },
    { done: settings.autoPublish, label: 'Automatisches Posten eingeschaltet', view: 'plan' }
  ];
  const openSteps = setupSteps.filter((s) => !s.done);

  return h(
    'div',
    {},
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Übersicht'),
      h(
        'p',
        {},
        'Der Weg ist immer derselbe: Foto aufbereiten, Text erzeugen, in einen festen Slot legen, automatisch posten lassen, Kaufsignale auswerten.'
      )
    ),

    openSteps.length
      ? h(
          'div',
          { class: 'card', style: 'margin-bottom:16px' },
          h('h2', {}, `Einrichtung – ${setupSteps.length - openSteps.length} von ${setupSteps.length} erledigt`),
          h(
            'div',
            { class: 'stack' },
            ...setupSteps.map((step) =>
              h(
                'div',
                { class: 'row', style: 'gap:10px' },
                h('span', { class: `dot ${step.done ? 'on' : 'off'}` }),
                h('span', { class: step.done ? 'muted' : '' }, step.label),
                h('span', { class: 'spacer' }),
                step.done
                  ? null
                  : h('button', { class: 'btn sm ghost', onclick: () => app.go(step.view) }, 'Öffnen →')
              )
            )
          )
        )
      : null,

    h(
      'div',
      { class: 'grid cols-4' },
      statCard('Nächster Beitrag', next ? fmt.dateTime(next.scheduledAt) : '—', next ? next.title : 'Kein Beitrag geplant'),
      statCard('Diese Woche gepostet', String(lastWeekCount), `${scheduled.length} weitere geplant`),
      statCard(
        'Käufer-Score Ø',
        summary.averageScore === null ? '—' : String(summary.averageScore),
        'Gewichtete Kaufsignale je Reichweite'
      ),
      statCard(
        'Reichweite gesamt',
        fmt.number(reach),
        goalReach ? `Ziel: ${fmt.number(goalReach)}` : 'Kein Ziel gesetzt',
        goalReach ? Math.min(1, reach / goalReach) : null
      )
    ),

    failed.length
      ? h(
          'div',
          { class: 'card', style: 'margin-top:16px;border-color:#5a2b2e' },
          h('h2', { style: 'color:var(--bad)' }, `${failed.length} Beitrag/Beiträge fehlgeschlagen`),
          ...failed.map((p) =>
            h(
              'div',
              { class: 'row', style: 'margin-bottom:6px' },
              h('strong', {}, p.title),
              h('span', { class: 'small muted' }, p.error),
              h('span', { class: 'spacer' }),
              h('button', { class: 'btn sm', onclick: () => openPostEditor(app, p) }, 'Öffnen')
            )
          )
        )
      : null,

    h(
      'div',
      { class: 'grid cols-2', style: 'margin-top:16px' },
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Nächste feste Slots'),
        nextSlots.length
          ? h(
              'div',
              { class: 'timeline' },
              ...nextSlots.slice(0, 6).map((slot) => {
                const post = posts.find(
                  (p) => p.scheduledAt && new Date(p.scheduledAt).toISOString().slice(0, 16) === slot.at.slice(0, 16)
                );
                return h(
                  'div',
                  { class: `item ${slot.occupied ? '' : 'free'}` },
                  h('div', { class: 'when' }, fmt.dateTime(slot.at)),
                  h(
                    'div',
                    {},
                    post ? h('strong', {}, post.title) : h('span', { class: 'dim' }, 'frei'),
                    h('div', { class: 'tiny dim' }, pillarLabel(app, slot.pillar))
                  ),
                  post
                    ? statusPill(post.status)
                    : h(
                        'button',
                        {
                          class: 'btn sm',
                          onclick: () => {
                            app.texter.scheduledAt = slot.at;
                            app.texter.pillar = slot.pillar;
                            app.go('texter');
                          }
                        },
                        'Befüllen'
                      )
                );
              })
            )
          : h('div', { class: 'empty' }, 'Noch keine Slots definiert – im Redaktionsplan anlegen.')
      ),
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Schnellstart'),
        h(
          'div',
          { class: 'stack' },
          quickAction('1. Foto aufbereiten', 'Bild zuschneiden, Preis-Badge und Markenbalken setzen.', () => app.go('studio')),
          quickAction('2. Verkaufstext erzeugen', 'Drei Varianten mit unterschiedlichen Kaufanreizen.', () => app.go('texter')),
          quickAction('3. In den Plan legen', 'Feste Slots sorgen für die Regelmäßigkeit.', () => app.go('plan')),
          quickAction('4. Kaufsignale prüfen', 'Wer klickt, speichert, schreibt – und wer kommt?', () => app.go('insights'))
        ),
        h('hr', { class: 'sep' }),
        h(
          'div',
          { class: 'row tiny dim' },
          h('span', {}, `${drafts.length} Entwürfe`),
          h('span', {}, '·'),
          h('span', {}, `${app.state.media.length} Bilder im Archiv`)
        )
      )
    ),

    h(
      'div',
      { class: 'card', style: 'margin-top:16px' },
      h('h2', {}, 'Letzte Ereignisse'),
      events.length
        ? h(
            'table',
            {},
            h('tbody', {}, ...events.slice(0, 10).map((ev) =>
              h(
                'tr',
                {},
                h('td', { class: 'nowrap dim tiny', style: 'width:130px' }, fmt.relative(ev.at)),
                h('td', {}, h('span', { class: `tag ${eventTone(ev.type)}` }, ev.type), ' ', ev.message)
              )
            ))
          )
        : h('div', { class: 'empty' }, 'Noch keine Aktivität.')
    )
  );
}

function eventTone(type) {
  return { error: 'bad', warn: 'warn', publish: 'good', ai: 'accent' }[type] || '';
}

function statCard(label, value, sub, progress = null) {
  return h(
    'div',
    { class: 'stat' },
    h('div', { class: 'label' }, label),
    h('div', { class: 'value' }, value),
    sub ? h('div', { class: 'sub' }, sub) : null,
    progress !== null ? h('div', { class: 'bar' }, h('span', { style: `width:${Math.round(progress * 100)}%` })) : null
  );
}

function quickAction(title, text, onClick) {
  return h(
    'button',
    {
      class: 'btn',
      style: 'width:100%;text-align:left;display:block',
      onclick: onClick
    },
    h('strong', { style: 'display:block' }, title),
    h('span', { class: 'tiny dim' }, text)
  );
}

function pillarLabel(app, key) {
  return app.meta.pillars?.find((p) => p.key === key)?.label || key || '—';
}

/* =================================================================== Texter */

export function renderTexter(app) {
  const t = app.texter;
  const pillars = app.meta.pillars || [];

  const selected = new Set(t.mediaIds || []);

  const gallery = h(
    'div',
    { class: 'gallery' },
    ...app.state.media.slice(0, 12).map((m) => {
      const fig = h(
        'figure',
        {
          class: selected.has(m.id) ? 'selected' : '',
          onclick: () => {
            if (selected.has(m.id)) selected.delete(m.id);
            else selected.add(m.id);
            t.mediaIds = [...selected];
            fig.classList.toggle('selected');
            renderPicks();
          }
        },
        h('img', { src: `/uploads/${m.filename}`, alt: m.label || 'Bild', loading: 'lazy' })
      );
      return fig;
    })
  );

  function renderPicks() {
    [...gallery.children].forEach((fig, i) => {
      const id = app.state.media[i]?.id;
      fig.querySelector('.pick')?.remove();
      const idx = (t.mediaIds || []).indexOf(id);
      if (idx !== -1) fig.append(h('div', { class: 'pick' }, String(idx + 1)));
    });
  }
  renderPicks();

  const productInput = input({ value: t.product || '', placeholder: 'z. B. Waschmaschine Bosch WAN28K43' });
  const priceOldInput = input({ value: t.priceOld || '', placeholder: '999 €' });
  const priceNewInput = input({ value: t.priceNew || '', placeholder: '799 €' });
  const detailsInput = textarea({
    value: t.details || '',
    placeholder: 'Fakten, die nur du kennst: Lagerbestand, Liefertermin, Energieklasse, Aufbau inklusive, Altgerät-Mitnahme …'
  });
  const ctaInput = input({ value: t.cta || app.state.settings.defaultCta || '', placeholder: 'Heute im Markt vorbeikommen' });
  const deadlineInput = input({ value: t.deadline || '', placeholder: 'nur bis Samstag, 18 Uhr' });
  const avoidInput = input({ value: t.avoid || '', placeholder: 'z. B. Konkurrenz nicht nennen' });
  const pillarSelect = select(
    pillars.map((p) => ({ value: p.key, label: p.label })),
    { value: t.pillar || 'angebot' }
  );
  const countSelect = select(
    [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} Variante${n > 1 ? 'n' : ''}` })),
    { value: String(t.variantCount || 3) }
  );

  const results = h('div', { class: 'stack' });

  const generateBtn = h(
    'button',
    { class: 'btn primary', style: 'width:100%' },
    'Verkaufstexte erzeugen'
  );

  generateBtn.onclick = async () => {
    if (!app.meta.aiConfigured) {
      return toast('Es ist kein ANTHROPIC_API_KEY hinterlegt. Siehe Einstellungen.', 'error');
    }
    Object.assign(t, {
      product: productInput.value,
      priceOld: priceOldInput.value,
      priceNew: priceNewInput.value,
      details: detailsInput.value,
      cta: ctaInput.value,
      deadline: deadlineInput.value,
      avoid: avoidInput.value,
      pillar: pillarSelect.value,
      variantCount: Number(countSelect.value)
    });

    generateBtn.disabled = true;
    generateBtn.innerHTML = '';
    generateBtn.append(h('span', { class: 'spin' }), ' Claude schreibt …');
    results.innerHTML = '';
    results.append(h('div', { class: 'empty' }, 'Das Modell liest das Bild und schreibt die Varianten. Das dauert etwa 20–60 Sekunden.'));

    try {
      let imageDataUrl = '';
      const first = (t.mediaIds || [])[0];
      const media = app.state.media.find((m) => m.id === first);
      if (media) {
        // Verkleinert übertragen: schneller und günstiger als das volle 1080er-JPEG.
        imageDataUrl = await downscale(`/uploads/${media.filename}`, 1024, 0.8);
      }

      const payload = { ...t, imageDataUrl };
      delete payload.mediaIds;
      const data = await api.generateCaptions(payload);
      t.result = data;
      renderResults(app, results, data, t);
      toast(`${data.variants.length} Varianten fertig.`, 'success');
    } catch (err) {
      results.innerHTML = '';
      results.append(h('div', { class: 'empty' }, `Fehler: ${err.message}`));
      toast(err.message, 'error');
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Verkaufstexte erzeugen';
    }
  };

  if (t.result) renderResults(app, results, t.result, t);
  else
    results.append(
      h(
        'div',
        { class: 'empty' },
        'Links Bild und Fakten eingeben, dann „Verkaufstexte erzeugen“. Je konkreter die Fakten, desto verkaufsstärker der Text.'
      )
    );

  return h(
    'div',
    {},
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Texter'),
      h(
        'p',
        {},
        'Claude sieht das Bild, kennt dein Marktprofil und schreibt Captions mit unterschiedlichen Kaufanreizen – jede mit genau einer klaren Handlungsaufforderung.'
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
          h('h2', {}, 'Bild auswählen'),
          app.state.media.length
            ? gallery
            : h(
                'div',
                { class: 'empty' },
                'Noch kein Bild im Archiv. ',
                h('a', { href: '#', onclick: (e) => (e.preventDefault(), app.go('studio')) }, 'Zum Foto-Studio')
              ),
          h('p', { class: 'tiny dim', style: 'margin:9px 0 0' }, 'Mehrere Bilder = Karussell. Reihenfolge = Klickreihenfolge.')
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Fakten'),
          field('Content-Säule', pillarSelect),
          field('Produkt / Thema', productInput),
          h(
            'div',
            { class: 'grid', style: 'grid-template-columns:1fr 1fr;gap:12px' },
            field('Vorher-Preis', priceOldInput),
            field('Aktionspreis', priceNewInput)
          ),
          field('Fakten aus dem Markt', detailsInput, 'Nur was stimmt – erfundene Angaben schaden mehr als sie nutzen.'),
          field('Handlungsaufforderung', ctaInput),
          field('Aktionszeitraum', deadlineInput),
          field('Nicht erwähnen', avoidInput),
          field('Anzahl Varianten', countSelect),
          generateBtn
        )
      ),
      results
    )
  );
}

function renderResults(app, container, data, t) {
  container.innerHTML = '';

  if (data.imageNotes) {
    container.append(
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Bild-Einschätzung'),
        h('p', { class: 'small muted', style: 'margin:0' }, data.imageNotes),
        data.coverText
          ? h(
              'div',
              { class: 'row', style: 'margin-top:10px' },
              h('span', { class: 'tiny dim' }, 'Vorschlag für den Störer im Bild:'),
              h('span', { class: 'tag accent' }, data.coverText)
            )
          : null
      )
    );
  }

  data.variants.forEach((v, i) => {
    const captionArea = textarea({ value: v.caption, style: 'min-height:180px' });
    const hashtagArea = textarea({ value: v.hashtags.join(' '), style: 'min-height:70px' });
    const reviewBox = h('div');

    container.append(
      h(
        'div',
        { class: 'variant' },
        h(
          'header',
          {},
          h('span', { class: 'tag accent' }, `Variante ${i + 1}`),
          h('strong', {}, v.angle),
          h('span', { class: 'spacer' }),
          h('span', { class: 'tiny dim' }, `${v.caption.length} Zeichen`)
        ),
        h('div', { class: 'tiny dim', style: 'margin-bottom:8px' }, `Warum das Käufer aktiviert: ${v.buyerTrigger}`),
        captionArea,
        h('div', { class: 'tiny dim', style: 'margin:8px 0 4px' }, 'Hashtags'),
        hashtagArea,
        v.firstComment
          ? h(
              'details',
              { style: 'margin-top:8px' },
              h('summary', { class: 'tiny dim' }, 'Erster Kommentar'),
              h('p', { class: 'small muted', style: 'margin:6px 0 0;white-space:pre-wrap' }, v.firstComment)
            )
          : null,
        reviewBox,
        h(
          'div',
          { class: 'row', style: 'margin-top:12px' },
          h(
            'button',
            {
              class: 'btn primary sm',
              onclick: () =>
                openPostEditor(app, {
                  title: t.product || v.angle,
                  caption: captionArea.value,
                  hashtags: hashtagArea.value.split(/\s+/).filter(Boolean),
                  firstComment: v.firstComment,
                  altText: v.altText,
                  pillar: t.pillar,
                  cta: v.cta,
                  product: t.product,
                  priceOld: t.priceOld,
                  priceNew: t.priceNew,
                  deadline: t.deadline,
                  mediaIds: t.mediaIds || [],
                  scheduledAt: t.scheduledAt || ''
                })
            },
            'Als Beitrag übernehmen'
          ),
          h(
            'button',
            {
              class: 'btn sm',
              onclick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = 'Prüft …';
                try {
                  const review = await api.reviewCaption({
                    caption: captionArea.value,
                    hashtags: hashtagArea.value.split(/\s+/).filter(Boolean)
                  });
                  reviewBox.innerHTML = '';
                  reviewBox.append(renderReview(review, captionArea));
                } catch (err) {
                  toast(err.message, 'error');
                } finally {
                  btn.disabled = false;
                  btn.textContent = 'Kaufkraft prüfen';
                }
              }
            },
            'Kaufkraft prüfen'
          ),
          h(
            'button',
            {
              class: 'btn sm ghost',
              onclick: () => {
                navigator.clipboard
                  ?.writeText(`${captionArea.value}\n\n${hashtagArea.value}`)
                  .then(() => toast('In die Zwischenablage kopiert.', 'success'))
                  .catch(() => toast('Kopieren nicht möglich.', 'error'));
              }
            },
            'Kopieren'
          )
        ),
        h('div', { class: 'hashtags' }, ...v.hashtags.slice(0, 20).map((tag) => h('span', {}, tag)))
      )
    );
  });

  if (data.storyIdea) {
    container.append(
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Story-Idee zum Post'),
        h('p', { class: 'small muted', style: 'margin:0' }, data.storyIdea)
      )
    );
  }
}

function renderReview(review, captionArea) {
  const tone = review.score >= 70 ? 'good' : review.score >= 45 ? 'warn' : 'bad';
  return h(
    'div',
    { class: 'card', style: 'margin-top:10px;background:var(--bg-3)' },
    h(
      'div',
      { class: 'row' },
      h('span', { class: `tag ${tone}` }, `Käufer-Aktivierung ${review.score}/100`),
      h('span', { class: 'small' }, review.verdict)
    ),
    review.improvements?.length
      ? h(
          'ul',
          { class: 'small muted', style: 'margin:10px 0 0;padding-left:18px' },
          ...review.improvements.map((x) => h('li', {}, x))
        )
      : null,
    review.risks?.length
      ? h(
          'ul',
          { class: 'small', style: 'margin:8px 0 0;padding-left:18px;color:var(--warn)' },
          ...review.risks.map((x) => h('li', {}, x))
        )
      : null,
    review.rewrittenHook
      ? h(
          'div',
          { class: 'row', style: 'margin-top:10px' },
          h('span', { class: 'tiny dim' }, 'Stärkere erste Zeile:'),
          h('strong', { class: 'small' }, review.rewrittenHook),
          h(
            'button',
            {
              class: 'btn sm ghost',
              onclick: () => {
                const lines = captionArea.value.split('\n');
                lines[0] = review.rewrittenHook;
                captionArea.value = lines.join('\n');
                toast('Erste Zeile ersetzt.', 'success');
              }
            },
            'Übernehmen'
          )
        )
      : null
  );
}

/* =========================================================== Redaktionsplan */

export function renderPlan(app) {
  const { settings, posts, nextSlots } = app.state;
  const pillars = app.meta.pillars || [];

  const autoToggle = h('input', {
    type: 'checkbox',
    checked: settings.autoPublish,
    onchange: async (e) => {
      try {
        await api.saveSettings({ autoPublish: e.target.checked });
        await app.refresh();
        toast(e.target.checked ? 'Automatisches Posten ist aktiv.' : 'Automatisches Posten pausiert.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  const slotRows = h('div');
  const slots = structuredClone(settings.slots || []);

  function drawSlots() {
    slotRows.innerHTML = '';
    slots.forEach((slot, idx) => {
      slotRows.append(
        h(
          'div',
          { class: 'slot' },
          select(
            WEEKDAYS.map((d, i) => ({ value: String(i), label: d })),
            { value: String(slot.weekday), onchange: (e) => (slot.weekday = Number(e.target.value)) }
          ),
          h('input', { type: 'time', value: slot.time, onchange: (e) => (slot.time = e.target.value) }),
          select(
            pillars.map((p) => ({ value: p.key, label: p.label })),
            { value: slot.pillar, onchange: (e) => (slot.pillar = e.target.value) }
          ),
          h(
            'button',
            {
              class: 'btn sm danger ghost',
              onclick: () => {
                slots.splice(idx, 1);
                drawSlots();
              }
            },
            '×'
          )
        )
      );
    });
  }
  drawSlots();

  const upcoming = h(
    'div',
    { class: 'timeline' },
    ...nextSlots.map((slot) => {
      const post = posts.find(
        (p) => p.scheduledAt && new Date(p.scheduledAt).toISOString().slice(0, 16) === slot.at.slice(0, 16)
      );
      return h(
        'div',
        { class: `item ${post ? '' : 'free'}` },
        h('div', { class: 'when' }, fmt.dateTime(slot.at)),
        h(
          'div',
          {},
          post ? h('strong', {}, post.title) : h('span', { class: 'dim' }, 'frei – noch kein Beitrag'),
          h('div', { class: 'tiny dim' }, pillarLabel(app, slot.pillar))
        ),
        post
          ? h(
              'div',
              { class: 'row' },
              statusPill(post.status),
              h('button', { class: 'btn sm ghost', onclick: () => openPostEditor(app, post) }, 'Bearbeiten')
            )
          : h(
              'button',
              {
                class: 'btn sm',
                onclick: () => {
                  app.texter.scheduledAt = slot.at;
                  app.texter.pillar = slot.pillar;
                  app.go('texter');
                }
              },
              'Beitrag schreiben'
            )
      );
    })
  );

  const byStatus = ['draft', 'scheduled', 'failed', 'published'];

  return h(
    'div',
    {},
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Redaktionsplan'),
      h(
        'p',
        {},
        'Reichweite entsteht durch Regelmäßigkeit. Lege feste Wochen-Slots fest, befülle sie und lass den Dienst automatisch veröffentlichen.'
      )
    ),

    h(
      'div',
      { class: 'grid cols-2' },
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Automatisches Posten'),
        h(
          'label',
          { class: 'switch' },
          autoToggle,
          h('span', {}, settings.autoPublish ? 'Aktiv – geplante Beiträge gehen automatisch raus' : 'Pausiert – Beiträge müssen manuell gepostet werden')
        ),
        h(
          'p',
          { class: 'tiny dim', style: 'margin-top:10px' },
          'Der Dienst prüft jede Minute, ob ein Beitrag fällig ist. Fehlgeschlagene Beiträge werden bis zu dreimal erneut versucht.'
        ),
        settings.igAccessTokenSet && settings.publicBaseUrl
          ? h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 'dot on' }), h('span', { class: 'small muted' }, 'Instagram-Verbindung hinterlegt'))
          : h(
              'div',
              { class: 'row', style: 'margin-top:8px' },
              h('span', { class: 'dot off' }),
              h('span', { class: 'small muted' }, 'Instagram noch nicht vollständig eingerichtet'),
              h('button', { class: 'btn sm ghost', onclick: () => app.go('settings') }, 'Einrichten')
            )
      ),
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Feste Slots pro Woche'),
        slotRows,
        h(
          'div',
          { class: 'row', style: 'margin-top:10px' },
          h(
            'button',
            {
              class: 'btn sm',
              onclick: () => {
                slots.push({ id: `slot_${Date.now()}`, weekday: 2, time: '17:00', pillar: 'angebot' });
                drawSlots();
              }
            },
            '+ Slot'
          ),
          h('span', { class: 'spacer' }),
          h(
            'button',
            {
              class: 'btn primary sm',
              onclick: async () => {
                await api.saveSettings({ slots });
                await app.refresh();
                app.go('plan');
                toast('Slots gespeichert.', 'success');
              }
            },
            'Slots speichern'
          )
        ),
        h(
          'p',
          { class: 'tiny dim', style: 'margin-top:10px' },
          'Empfehlung für den Anfang: drei Slots pro Woche, davon mindestens einer mit einem konkreten Angebot.'
        )
      )
    ),

    h(
      'div',
      { class: 'card', style: 'margin-top:16px' },
      h('h2', {}, 'Nächste Termine'),
      nextSlots.length ? upcoming : h('div', { class: 'empty' }, 'Keine Slots definiert.')
    ),

    ...byStatus.map((status) => {
      const list = posts.filter((p) => p.status === status);
      if (!list.length) return null;
      return h(
        'div',
        { class: 'card', style: 'margin-top:16px' },
        h('h2', {}, `${statusLabelPlural(status)} (${list.length})`),
        h(
          'table',
          {},
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', {}, 'Titel'),
              h('th', {}, 'Säule'),
              h('th', {}, status === 'published' ? 'Veröffentlicht' : 'Termin'),
              h('th', {}, 'Bilder'),
              h('th', {}, '')
            )
          ),
          h(
            'tbody',
            {},
            ...list
              .slice()
              .sort((a, b) => new Date(b.scheduledAt || b.createdAt) - new Date(a.scheduledAt || a.createdAt))
              .map((p) =>
                h(
                  'tr',
                  {},
                  h(
                    'td',
                    {},
                    h('strong', {}, p.title),
                    p.error ? h('div', { class: 'tiny', style: 'color:var(--bad)' }, p.error) : null
                  ),
                  h('td', { class: 'small muted' }, pillarLabel(app, p.pillar)),
                  h('td', { class: 'small nowrap' }, fmt.dateTime(p.publishedAt || p.scheduledAt)),
                  h('td', { class: 'small muted' }, String(p.mediaIds.length)),
                  h(
                    'td',
                    { class: 'num' },
                    h(
                      'div',
                      { class: 'row end' },
                      p.igPermalink ? h('a', { href: p.igPermalink, target: '_blank', class: 'btn sm ghost' }, 'Ansehen') : null,
                      h('button', { class: 'btn sm ghost', onclick: () => openPostEditor(app, p) }, 'Bearbeiten')
                    )
                  )
                )
              )
          )
        )
      );
    })
  );
}

function statusLabelPlural(status) {
  return {
    draft: 'Entwürfe',
    scheduled: 'Geplant',
    failed: 'Fehlgeschlagen',
    published: 'Veröffentlicht'
  }[status];
}

/* ============================================================ Post-Editor */

export function openPostEditor(app, post) {
  const isNew = !post.id;
  const pillars = app.meta.pillars || [];

  const titleInput = input({ value: post.title || '' });
  const captionArea = textarea({ value: post.caption || '', style: 'min-height:200px' });
  const hashtagArea = textarea({ value: (post.hashtags || []).join(' '), style: 'min-height:60px' });
  const commentArea = textarea({ value: post.firstComment || '', style: 'min-height:60px' });
  const altInput = input({ value: post.altText || '' });
  const pillarSelect = select(
    pillars.map((p) => ({ value: p.key, label: p.label })),
    { value: post.pillar || 'angebot' }
  );
  const whenInput = h('input', {
    type: 'datetime-local',
    value: post.scheduledAt ? toLocalInput(post.scheduledAt) : ''
  });

  const selectedMedia = new Set(post.mediaIds || []);
  const mediaPicker = h(
    'div',
    { class: 'gallery' },
    ...app.state.media.slice(0, 12).map((m) => {
      const fig = h(
        'figure',
        {
          class: selectedMedia.has(m.id) ? 'selected' : '',
          onclick: () => {
            if (selectedMedia.has(m.id)) selectedMedia.delete(m.id);
            else selectedMedia.add(m.id);
            fig.classList.toggle('selected');
          }
        },
        h('img', { src: `/uploads/${m.filename}`, alt: '', loading: 'lazy' })
      );
      return fig;
    })
  );

  const nextFree = (app.state.nextSlots || []).filter((s) => !s.occupied).slice(0, 4);

  const body = h(
    'div',
    {},
    field('Titel (nur intern)', titleInput),
    field('Content-Säule', pillarSelect),
    field('Caption', captionArea),
    field('Hashtags', hashtagArea, 'Durch Leerzeichen getrennt.'),
    field('Erster Kommentar', commentArea, 'Adresse, Öffnungszeiten, Details – hält die Caption schlank.'),
    field('Alternativtext (Barrierefreiheit)', altInput),
    h('div', { class: 'tiny dim', style: 'margin-bottom:5px' }, 'Bilder'),
    app.state.media.length ? mediaPicker : h('div', { class: 'empty' }, 'Keine Bilder im Archiv.'),
    h('div', { style: 'height:12px' }),
    field('Geplanter Termin', whenInput),
    nextFree.length
      ? h(
          'div',
          { class: 'row', style: 'margin-top:-6px' },
          h('span', { class: 'tiny dim' }, 'Freie Slots:'),
          ...nextFree.map((s) =>
            h(
              'button',
              {
                class: 'btn sm ghost',
                onclick: () => {
                  whenInput.value = toLocalInput(s.at);
                }
              },
              fmt.dateTime(s.at)
            )
          )
        )
      : null
  );

  const actions = [];

  if (!isNew) {
    actions.push({
      label: 'Löschen',
      variant: 'danger ghost',
      onClick: async (close) => {
        if (!(await confirmDialog('Beitrag löschen?', 'Der Beitrag wird endgültig entfernt.'))) return true;
        await api.deletePost(post.id);
        await app.refresh();
        app.go(app.view);
        close();
      }
    });
  }

  if (!isNew && post.status !== 'published') {
    actions.push({
      label: 'Jetzt veröffentlichen',
      onClick: async () => {
        if (!(await confirmDialog('Jetzt posten?', 'Der Beitrag geht sofort live auf Instagram.'))) return true;
        try {
          await api.publishPost(post.id);
          await app.refresh();
          app.go(app.view);
          toast('Beitrag veröffentlicht.', 'success');
        } catch (err) {
          toast(err.message, 'error');
          await app.refresh();
        }
      }
    });
  }

  actions.push({
    label: isNew ? 'Beitrag anlegen' : 'Speichern',
    variant: 'primary',
    onClick: async () => {
      const payload = {
        title: titleInput.value || 'Ohne Titel',
        caption: captionArea.value,
        hashtags: hashtagArea.value.split(/\s+/).filter(Boolean),
        firstComment: commentArea.value,
        altText: altInput.value,
        pillar: pillarSelect.value,
        cta: post.cta || '',
        product: post.product || '',
        priceOld: post.priceOld || '',
        priceNew: post.priceNew || '',
        deadline: post.deadline || '',
        mediaIds: [...selectedMedia],
        scheduledAt: whenInput.value ? new Date(whenInput.value).toISOString() : ''
      };
      try {
        if (isNew) await api.createPost(payload);
        else await api.updatePost(post.id, payload);
        await app.refresh();
        app.go(isNew ? 'plan' : app.view);
        toast(isNew ? 'Beitrag angelegt.' : 'Gespeichert.', 'success');
      } catch (err) {
        toast(err.message, 'error');
        return true;
      }
    }
  });

  modal({ title: isNew ? 'Neuer Beitrag' : `Beitrag bearbeiten`, body, actions });
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* =========================================================== Käufer-Trichter */

export async function renderInsights(app) {
  const container = h('div', {}, h('div', { class: 'loading' }, 'Lädt Auswertung …'));

  const data = await api.analytics().catch((err) => ({ error: err.message }));
  container.innerHTML = '';

  if (data.error) {
    container.append(h('div', { class: 'empty' }, data.error));
    return container;
  }

  const { summary, recommendations: advice, goals } = data;
  const t = summary.totals;
  const labels = app.meta.metricLabels || {};

  const funnelSteps = [
    { key: 'reach', label: 'Erreichte Personen' },
    { key: 'profile_visits', label: 'Profilaufrufe' },
    { key: 'website_clicks', label: 'Link-Klicks' },
    { key: 'dm_replies', label: 'DM-Anfragen' },
    { key: 'store_visits', label: 'Kunden im Markt' }
  ];
  const top = t.reach || 1;

  container.append(
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Käufer-Trichter'),
      h(
        'p',
        {},
        'Likes zählen hier bewusst null. Bewertet wird, was Kaufabsicht zeigt: speichern, teilen, Profil aufrufen, klicken, schreiben – und am Ende im Markt stehen.'
      )
    ),

    h(
      'div',
      { class: 'grid cols-4' },
      statCard('Käufer-Score Ø', summary.averageScore ?? '—', 'Gewichtete Kaufsignale je 1.000 Reichweite'),
      statCard('Kaufsignale gesamt', fmt.number(summary.totalSignals), `aus ${summary.postCount} Beiträgen`),
      statCard(
        'Likes je Kaufsignal',
        summary.fanToBuyerRatio === null ? '—' : String(summary.fanToBuyerRatio),
        summary.fanToBuyerRatio > 12 ? 'Zu viele Fans, zu wenig Käufer' : 'Gesundes Verhältnis'
      ),
      statCard(
        'Link-Klicks',
        fmt.number(t.website_clicks),
        goals?.clicks ? `Ziel: ${fmt.number(goals.clicks)}` : '',
        goals?.clicks ? Math.min(1, t.website_clicks / goals.clicks) : null
      )
    ),

    h(
      'div',
      { class: 'card', style: 'margin-top:16px' },
      h('h2', {}, 'Trichter'),
      ...funnelSteps.map((step) => {
        const value = t[step.key] || 0;
        const share = value / top;
        return h(
          'div',
          { style: 'margin-bottom:12px' },
          h(
            'div',
            { class: 'row' },
            h('span', { class: 'small' }, step.label),
            h('span', { class: 'spacer' }),
            h('span', { class: 'small nowrap' }, fmt.number(value)),
            h('span', { class: 'tiny dim nowrap' }, ` (${(share * 100).toFixed(1).replace('.', ',')} %)`)
          ),
          h('div', { class: 'bar' }, h('span', { style: `width:${Math.max(share * 100, value ? 1.5 : 0)}%` }))
        );
      }),
      h(
        'p',
        { class: 'tiny dim', style: 'margin:6px 0 0' },
        'DM-Anfragen und Kunden im Markt trägst du unten je Beitrag selbst ein – erst damit schließt sich der Trichter bis zum Kauf.'
      )
    ),

    advice.length
      ? h(
          'div',
          { class: 'card', style: 'margin-top:16px' },
          h('h2', {}, 'Was du als Nächstes ändern solltest'),
          ...advice.map((a) =>
            h('div', { class: `advice ${a.level}` }, h('strong', {}, a.title), h('p', {}, a.text))
          )
        )
      : null,

    summary.byPillar.length
      ? h(
          'div',
          { class: 'card', style: 'margin-top:16px' },
          h('h2', {}, 'Welche Content-Säule verkauft?'),
          h(
            'table',
            {},
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', {}, 'Säule'),
                h('th', { class: 'num' }, 'Beiträge'),
                h('th', { class: 'num' }, 'Reichweite'),
                h('th', { class: 'num' }, 'Kaufsignale / 1.000')
              )
            ),
            h(
              'tbody',
              {},
              ...summary.byPillar.map((row) =>
                h(
                  'tr',
                  {},
                  h('td', {}, pillarLabel(app, row.pillar)),
                  h('td', { class: 'num' }, fmt.number(row.posts)),
                  h('td', { class: 'num' }, fmt.number(row.reach)),
                  h('td', { class: 'num' }, String(row.signalsPerMille).replace('.', ','))
                )
              )
            )
          )
        )
      : null,

    renderPostPerformance(app, labels)
  );

  return container;
}

function renderPostPerformance(app, labels) {
  const published = app.state.posts.filter((p) => p.status === 'published');
  if (!published.length) {
    return h(
      'div',
      { class: 'card', style: 'margin-top:16px' },
      h('h2', {}, 'Beiträge'),
      h('div', { class: 'empty' }, 'Noch keine veröffentlichten Beiträge.')
    );
  }

  const cols = ['reach', 'saved', 'shares', 'profile_visits', 'website_clicks', 'dm_replies', 'store_visits'];

  return h(
    'div',
    { class: 'card', style: 'margin-top:16px' },
    h('h2', {}, 'Beiträge im Detail'),
    h(
      'div',
      { style: 'overflow-x:auto' },
      h(
        'table',
        {},
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', {}, 'Beitrag'),
            h('th', { class: 'num' }, 'Score'),
            ...cols.map((c) => h('th', { class: 'num nowrap' }, labels[c] || c)),
            h('th', {}, '')
          )
        ),
        h(
          'tbody',
          {},
          ...published
            .slice()
            .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
            .map((p) => {
              const ins = p.insights || {};
              const tone = p.buyerScore >= 70 ? 'good' : p.buyerScore >= 45 ? 'warn' : 'bad';
              return h(
                'tr',
                {},
                h(
                  'td',
                  {},
                  h('strong', {}, p.title),
                  h('div', { class: 'tiny dim' }, fmt.date(p.publishedAt), ' · ', pillarLabel(app, p.pillar))
                ),
                h(
                  'td',
                  { class: 'num', title: `${p.signalsPerMille} gewichtete Kaufsignale je 1.000 erreichte Personen` },
                  p.buyerScore === null
                    ? h('span', { class: 'dim' }, '—')
                    : h('span', { class: `tag ${tone}` }, String(p.buyerScore))
                ),
                ...cols.map((c) => h('td', { class: 'num' }, fmt.number(ins[c] || 0))),
                h(
                  'td',
                  { class: 'num' },
                  h(
                    'div',
                    { class: 'row end' },
                    h(
                      'button',
                      {
                        class: 'btn sm ghost',
                        title: 'Insights von Instagram neu laden',
                        onclick: async (e) => {
                          e.currentTarget.disabled = true;
                          try {
                            await api.refreshInsights(p.id);
                            await app.refresh();
                            app.go('insights');
                            toast('Insights aktualisiert.', 'success');
                          } catch (err) {
                            toast(err.message, 'error');
                          }
                        }
                      },
                      '↻'
                    ),
                    h(
                      'button',
                      { class: 'btn sm ghost', onclick: () => openManualInsights(app, p) },
                      'Kaufsignale'
                    )
                  )
                )
              );
            })
        )
      )
    )
  );
}

function openManualInsights(app, post) {
  const dm = h('input', { type: 'number', min: '0', value: String(post.insights?.dm_replies || 0) });
  const visits = h('input', { type: 'number', min: '0', value: String(post.insights?.store_visits || 0) });

  modal({
    title: `Kaufsignale erfassen – ${post.title}`,
    body: h(
      'div',
      {},
      h(
        'p',
        { class: 'small muted' },
        'Diese beiden Zahlen kann Instagram nicht liefern, sie entscheiden aber über den Käufer-Score. Trage ein, was tatsächlich im Markt ankam.'
      ),
      field('DM-Anfragen zu diesem Beitrag', dm),
      field('Kunden, die im Markt darauf angesprochen haben', visits)
    ),
    actions: [
      { label: 'Abbrechen' },
      {
        label: 'Speichern',
        variant: 'primary',
        onClick: async () => {
          await api.setManualInsights(post.id, {
            dm_replies: Number(dm.value) || 0,
            store_visits: Number(visits.value) || 0
          });
          await app.refresh();
          app.go('insights');
          toast('Kaufsignale gespeichert.', 'success');
        }
      }
    ]
  });
}

/* ============================================================ Einstellungen */

export function renderSettings(app) {
  const s = app.state.settings;

  const fields = {
    businessName: input({ value: s.businessName }),
    city: input({ value: s.city, placeholder: 'Stadt / Region' }),
    branch: input({ value: s.branch }),
    website: input({ type: 'url', value: s.website, placeholder: 'https://…' }),
    phone: input({ value: s.phone }),
    audience: textarea({ value: s.audience }),
    usp: textarea({ value: s.usp }),
    defaultCta: input({ value: s.defaultCta }),
    tone: select(
      (app.meta.tones || []).map((t) => ({ value: t.key, label: `${t.key} – ${t.description}` })),
      { value: s.tone }
    ),
    brandColor: h('input', { type: 'color', value: s.brandColor }),
    igUserId: input({ value: s.igUserId, placeholder: '17841400000000000' }),
    igAccessToken: input({
      type: 'password',
      value: '',
      placeholder: s.igAccessTokenSet ? `gespeichert (${s.igAccessTokenHint})` : 'EAAG…'
    }),
    publicBaseUrl: input({ type: 'url', value: s.publicBaseUrl, placeholder: 'https://cockpit.mein-markt.de' }),
    goalReach: h('input', { type: 'number', value: String(s.goals?.reach ?? 0) }),
    goalProfileVisits: h('input', { type: 'number', value: String(s.goals?.profileVisits ?? 0) }),
    goalClicks: h('input', { type: 'number', value: String(s.goals?.clicks ?? 0) }),
    goalBuyerSignals: h('input', { type: 'number', value: String(s.goals?.buyerSignals ?? 0) })
  };

  const logoPreview = h('div', { class: 'brand-mark', style: 'width:56px;height:56px' },
    s.logoDataUrl ? h('img', { src: s.logoDataUrl, alt: 'Logo' }) : 'Logo'
  );
  let logoDataUrl = s.logoDataUrl;

  const logoInput = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/svg+xml',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      logoDataUrl = await fileToDataUrl(file);
      logoPreview.innerHTML = '';
      logoPreview.append(h('img', { src: logoDataUrl, alt: 'Logo' }));
    }
  });

  const connectionResult = h('div', { class: 'small muted', style: 'margin-top:8px' });

  const saveBtn = h(
    'button',
    {
      class: 'btn primary',
      onclick: async () => {
        saveBtn.disabled = true;
        try {
          await api.saveSettings({
            businessName: fields.businessName.value,
            city: fields.city.value,
            branch: fields.branch.value,
            website: fields.website.value,
            phone: fields.phone.value,
            audience: fields.audience.value,
            usp: fields.usp.value,
            defaultCta: fields.defaultCta.value,
            tone: fields.tone.value,
            brandColor: fields.brandColor.value,
            logoDataUrl,
            igUserId: fields.igUserId.value.trim(),
            igAccessToken: fields.igAccessToken.value.trim(),
            publicBaseUrl: fields.publicBaseUrl.value.trim().replace(/\/+$/, ''),
            goals: {
              reach: Number(fields.goalReach.value) || 0,
              profileVisits: Number(fields.goalProfileVisits.value) || 0,
              clicks: Number(fields.goalClicks.value) || 0,
              buyerSignals: Number(fields.goalBuyerSignals.value) || 0
            }
          });
          await app.refresh();
          app.go('settings');
          toast('Einstellungen gespeichert.', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          saveBtn.disabled = false;
        }
      }
    },
    'Einstellungen speichern'
  );

  const testBtn = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        testBtn.disabled = true;
        connectionResult.textContent = 'Prüft Verbindung …';
        try {
          const account = await api.checkInstagram();
          connectionResult.innerHTML = '';
          connectionResult.append(
            h('span', { class: 'dot on' }),
            ` Verbunden mit @${account.username} · ${fmt.number(account.followers_count || 0)} Follower · ${fmt.number(account.media_count || 0)} Beiträge`
          );
        } catch (err) {
          connectionResult.innerHTML = '';
          connectionResult.append(h('span', { class: 'dot off' }), ` ${err.message}`);
        } finally {
          testBtn.disabled = false;
        }
      }
    },
    'Verbindung testen'
  );

  return h(
    'div',
    {},
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Einstellungen'),
      h('p', {}, 'Je genauer das Marktprofil, desto konkreter und verkaufsstärker schreibt der Texter.')
    ),

    h(
      'div',
      { class: 'grid cols-2' },
      h(
        'div',
        { class: 'card' },
        h('h2', {}, 'Marktprofil'),
        field('Name des Marktes', fields.businessName),
        field('Stadt / Region', fields.city, 'Wird für lokale Hashtags und den Ortsbezug in der Caption genutzt.'),
        field('Branche', fields.branch),
        field('Website', fields.website),
        field('Telefon', fields.phone),
        field('Zielgruppe', fields.audience),
        field('Was uns von Online-Händlern unterscheidet', fields.usp, 'Der wichtigste Hebel gegen Preisvergleichsportale.'),
        field('Standard-Handlungsaufforderung', fields.defaultCta),
        field('Tonalität', fields.tone)
      ),
      h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Marke'),
          h('div', { class: 'row', style: 'margin-bottom:12px' }, logoPreview, logoInput),
          field('Markenfarbe', fields.brandColor, 'Wird für Preis-Badge, Störer und Markenbalken im Foto-Studio verwendet.')
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Instagram-Verbindung'),
          field('Instagram-Business-Konto-ID', fields.igUserId),
          field('Access Token', fields.igAccessToken, s.igAccessTokenSet ? 'Ein Token ist gespeichert. Feld leer lassen, um es zu behalten.' : 'Langlebiges Token mit den Rechten instagram_basic, instagram_content_publish und instagram_manage_insights.'),
          field(
            'Öffentliche Basis-URL dieses Servers',
            fields.publicBaseUrl,
            'Instagram lädt die Bilder selbst herunter – der Server muss deshalb aus dem Internet erreichbar sein.'
          ),
          h('div', { class: 'row' }, testBtn),
          connectionResult
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Ziele (30 Tage)'),
          h(
            'div',
            { class: 'grid', style: 'grid-template-columns:1fr 1fr;gap:12px' },
            field('Reichweite', fields.goalReach),
            field('Profilaufrufe', fields.goalProfileVisits),
            field('Link-Klicks', fields.goalClicks),
            field('Kaufsignale', fields.goalBuyerSignals)
          )
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Textmodell'),
          h(
            'div',
            { class: 'row' },
            h('span', { class: `dot ${app.meta.aiConfigured ? 'on' : 'off'}` }),
            h('span', { class: 'small' }, app.meta.aiConfigured ? `Aktiv – ${app.meta.model}` : 'ANTHROPIC_API_KEY fehlt')
          ),
          h(
            'p',
            { class: 'tiny dim', style: 'margin:8px 0 0' },
            'Der Schlüssel wird aus der Datei .env gelesen (ANTHROPIC_API_KEY=…). Nach einer Änderung den Server neu starten.'
          )
        )
      )
    ),

    h('div', { class: 'row', style: 'margin-top:18px' }, saveBtn)
  );
}
