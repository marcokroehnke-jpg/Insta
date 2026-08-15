import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(
      new Error(
        'ANTHROPIC_API_KEY ist nicht gesetzt. Trage den Schlüssel in die .env-Datei ein und starte den Server neu.'
      ),
      { status: 400 }
    );
  }
  if (!client) client = new Anthropic();
  return client;
}

export const PILLARS = {
  angebot: {
    label: 'Angebot / Preis',
    brief:
      'Ein konkretes Gerät zu einem konkreten Preis. Der Post muss den Preisvorteil und die Dringlichkeit sofort klarmachen.'
  },
  beratung: {
    label: 'Beratung / Ratgeber',
    brief:
      'Eine echte Kaufhürde auflösen (Welche Größe? Welcher Verbrauch? Passt das in meine Küche?). Am Ende steht der Weg in den Markt oder in die DM.'
  },
  aktion: {
    label: 'Aktion / Verknappung',
    brief:
      'Zeitlich begrenzte Aktion, Restposten, Aktionswochenende. Verknappung ehrlich benennen, kein Fake-Countdown.'
  },
  neuheit: {
    label: 'Neuheit / Eingetroffen',
    brief: 'Neues Gerät ist da. Warum lohnt sich der Wechsel jetzt – für wen konkret?'
  },
  team: {
    label: 'Team / Service',
    brief:
      'Menschen und Service im Markt. Vertrauen aufbauen und trotzdem mit einer Handlungsaufforderung enden.'
  },
  kunde: {
    label: 'Kundenstimme / Referenz',
    brief: 'Konkreter Fall aus dem Markt: Ausgangslage, Lösung, Ergebnis. Beweis statt Werbung.'
  }
};

export const TONES = {
  direkt: 'direkt, klar, ohne Marketing-Floskeln – wie ein guter Verkäufer, der auf den Punkt kommt',
  freundlich: 'freundlich und nahbar, wie ein Gespräch an der Ladentheke',
  fachlich: 'fachlich fundiert, erklärt Technik verständlich ohne belehrend zu wirken',
  frech: 'frech und regional-humorvoll, aber nie albern und nie auf Kosten des Kunden'
};

const SCHEMA = {
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          angle: { type: 'string', description: 'Kurzname des Verkaufswinkels, max. 4 Wörter' },
          hook: { type: 'string', description: 'Die erste Zeile der Caption, maximal 90 Zeichen' },
          caption: {
            type: 'string',
            description:
              'Vollständige Caption inklusive Hook, mit Zeilenumbrüchen, ohne Hashtags, maximal 900 Zeichen'
          },
          cta: { type: 'string', description: 'Die konkrete Handlungsaufforderung als eigener Satz' },
          buyerTrigger: {
            type: 'string',
            description: 'Ein Satz: warum aktiviert diese Variante Käufer statt nur Likes?'
          },
          hashtags: { type: 'array', items: { type: 'string' } },
          firstComment: {
            type: 'string',
            description: 'Text für den ersten Kommentar (Details, Adresse, Öffnungszeiten)'
          },
          altText: { type: 'string', description: 'Barrierefreier Alternativtext für das Bild' }
        },
        required: ['angle', 'hook', 'caption', 'cta', 'buyerTrigger', 'hashtags', 'firstComment', 'altText'],
        additionalProperties: false
      }
    },
    coverText: {
      type: 'string',
      description: 'Kurzer Störer-Text fürs Bild, maximal 28 Zeichen'
    },
    storyIdea: {
      type: 'string',
      description: 'Eine Story-Idee, die den Post begleitet und Richtung Kauf führt'
    },
    imageNotes: {
      type: 'string',
      description: 'Was auf dem Bild zu sehen ist und was am Bild noch verbessert werden sollte'
    }
  },
  required: ['variants', 'coverText', 'storyIdea', 'imageNotes'],
  additionalProperties: false
};

function systemPrompt(settings) {
  const s = settings;
  return [
    `Du schreibst Instagram-Captions für ${s.businessName}${s.city ? ` in ${s.city}` : ''} – ${s.branch || 'Einzelhandel'}.`,
    '',
    'Auftrag: Die Posts sollen nicht Fans unterhalten, sondern Käufer aktivieren. Jede Caption muss eine',
    'konkrete nächste Handlung auslösen – in den Markt kommen, anrufen, eine DM schreiben oder auf den',
    'Link tippen. Reichweite ohne Kaufabsicht ist kein Erfolg.',
    '',
    'Kontext zum Markt:',
    `- Zielgruppe: ${s.audience}`,
    `- Was uns von Online-Händlern unterscheidet: ${s.usp}`,
    s.website ? `- Website: ${s.website}` : '',
    s.phone ? `- Telefon: ${s.phone}` : '',
    `- Standard-Handlungsaufforderung: ${s.defaultCta}`,
    '',
    'So schreibst du:',
    `- Tonalität: ${TONES[s.tone] || TONES.direkt}. Deutsch, Du-Ansprache, keine Anglizismen-Häufung.`,
    '- Die erste Zeile entscheidet. Sie benennt ein Problem, einen Preis oder eine Zahl – nie eine Begrüßung.',
    '- Konkret vor allgemein: Modell, Größe, Preis, Ersparnis, Verfügbarkeit, Liefertermin.',
    '- Nenne den lokalen Bezug (Stadt/Region), damit klar ist, wo gekauft wird.',
    '- Genau eine Handlungsaufforderung pro Caption, am Ende, als eigener Satz.',
    '- Keine erfundenen Fakten. Was du nicht weißt, lässt du weg statt es zu erfinden.',
    '- Keine Superlative ohne Beleg, keine leeren Floskeln ("Qualität, die begeistert").',
    '- Emojis sparsam: höchstens drei, nur wenn sie eine Information tragen.',
    '- Preisangaben immer mit Währung und, falls vorhanden, mit Streichpreis und Ersparnis.',
    '',
    'Hashtags: 12 bis 18 Stück pro Variante, gemischt aus drei Gruppen – lokal (Stadt/Region/Umland),',
    'produktbezogen (Gerätetyp, Marke, Anwendungsfall) und kaufnah (z. B. Beratung, Angebot,',
    'Fachhandel). Keine generischen Reichweiten-Hashtags wie #love oder #instagood: die bringen',
    'Likes von Menschen, die nie im Markt stehen werden.'
  ]
    .filter(Boolean)
    .join('\n');
}

function userPrompt(input) {
  const lines = [
    `Erzeuge ${input.variantCount} Caption-Varianten mit unterschiedlichen Verkaufswinkeln für einen Instagram-Feed-Post.`,
    '',
    `Content-Säule: ${PILLARS[input.pillar]?.label || input.pillar}`,
    `Leitidee dieser Säule: ${PILLARS[input.pillar]?.brief || '—'}`
  ];

  if (input.product) lines.push(`Produkt / Thema: ${input.product}`);
  if (input.priceNew) {
    lines.push(
      `Preis: ${input.priceNew}${input.priceOld ? ` (statt ${input.priceOld})` : ''}`
    );
  }
  if (input.details) lines.push(`Zusätzliche Fakten aus dem Markt: ${input.details}`);
  if (input.cta) lines.push(`Gewünschte Handlungsaufforderung: ${input.cta}`);
  if (input.deadline) lines.push(`Gültig bis / Aktionszeitraum: ${input.deadline}`);
  if (input.avoid) lines.push(`Nicht erwähnen: ${input.avoid}`);

  lines.push(
    '',
    input.hasImage
      ? 'Das angehängte Foto stammt aus dem Markt. Beschreibe in imageNotes, was tatsächlich zu sehen ist, und beziehe dich in den Captions nur auf Dinge, die im Bild oder in den Fakten oben belegt sind.'
      : 'Es liegt kein Foto vor. Setze imageNotes auf einen Hinweis, welches Motiv den Post am besten verkaufen würde.',
    '',
    'Die Varianten müssen sich im Verkaufswinkel unterscheiden (z. B. Preisvorteil, Problemlösung,',
    'Verknappung, Vergleich mit Online-Kauf, Service-Vorteil) – nicht nur in der Formulierung.'
  );

  return lines.join('\n');
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first !== -1 && last > first) return JSON.parse(candidate.slice(first, last + 1));
    throw new Error('Antwort des Modells konnte nicht als JSON gelesen werden.');
  }
}

/**
 * Erzeugt Caption-Varianten. `input.imageBase64` ist ein verkleinertes JPEG
 * (ohne data:-Präfix) und optional.
 */
export async function generateCaptions(settings, input) {
  const anthropic = getClient();

  const content = [];
  if (input.imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: input.imageMime || 'image/jpeg', data: input.imageBase64 }
    });
  }
  content.push({ type: 'text', text: userPrompt({ ...input, hasImage: Boolean(input.imageBase64) }) });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: SCHEMA }
    },
    system: [
      { type: 'text', text: systemPrompt(settings), cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content }]
  });

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('Das Modell hat die Anfrage abgelehnt.'), { status: 422 });
  }

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const data = extractJson(text);

  return {
    ...data,
    variants: (data.variants || []).map((v) => ({
      ...v,
      hashtags: (v.hashtags || []).map(normaliseHashtag).filter(Boolean)
    })),
    usage: {
      model: response.model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0
    }
  };
}

function normaliseHashtag(tag) {
  const clean = String(tag || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '');
  return clean ? `#${clean}` : '';
}

/** Bewertet eine fertige Caption auf Kaufaktivierung, bevor sie eingeplant wird. */
export async function reviewCaption(settings, caption, hashtags = []) {
  const anthropic = getClient();

  const schema = {
    type: 'object',
    properties: {
      score: { type: 'integer', description: 'Käufer-Aktivierung von 0 bis 100' },
      verdict: { type: 'string', description: 'Ein Satz Gesamturteil' },
      strengths: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
      improvements: { type: 'array', items: { type: 'string' } },
      rewrittenHook: { type: 'string', description: 'Ein stärkerer Vorschlag für die erste Zeile' }
    },
    required: ['score', 'verdict', 'strengths', 'risks', 'improvements', 'rewrittenHook'],
    additionalProperties: false
  };

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: [
      {
        type: 'text',
        text: [
          systemPrompt(settings),
          '',
          'Jetzt prüfst du eine fertige Caption. Bewerte streng danach, ob sie einen Menschen mit',
          'Kaufabsicht zu einer konkreten Handlung bringt – nicht danach, ob sie nett klingt.',
          'Punkte kosten: unklare Handlungsaufforderung, fehlender Preis- oder Nutzenbezug, fehlender',
          'Ortsbezug, austauschbare Formulierungen, zu viele Hashtags ohne Kaufbezug.'
        ].join('\n')
      }
    ],
    messages: [
      {
        role: 'user',
        content: `Caption:\n"""\n${caption}\n"""\n\nHashtags: ${hashtags.join(' ') || '—'}`
      }
    ]
  });

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return extractJson(text);
}
