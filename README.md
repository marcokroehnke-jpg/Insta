# Instagram Marketing-Cockpit

Eine Oberfläche für die komplette Marketing-Ausführung auf Instagram: Fotos aus dem
Geschäft aufbereiten, verkaufsstarke Texte erzeugen lassen, Beiträge in feste Slots
legen und automatisch veröffentlichen – und anschließend auswerten, ob daraus
tatsächlich Käufer werden.

Der Leitgedanke steckt in der Auswertung: **Likes zählen null.** Bewertet wird nur,
was Kaufabsicht zeigt – speichern, teilen, Profil aufrufen, klicken, schreiben und
am Ende im Markt stehen.

---

## Der Arbeitsweg

```
  Foto-Studio  →  Texter  →  Redaktionsplan  →  Auto-Posting  →  Käufer-Trichter
  ──────────      ──────     ──────────────     ────────────     ───────────────
  zuschneiden     Claude     feste Slots        Instagram        Kaufsignale
  Preis-Badge     schreibt   pro Woche          Graph API        statt Likes
  Markenbalken    3 Varianten                                    Empfehlungen
```

### 1. Foto-Studio

Foto per Drag & Drop laden und direkt im Browser aufbereiten:

- Zuschnitt auf **4:5** (Feed), **1:1** oder **9:16** (Story), Ausschnitt per Maus verschieben, Mausrad zoomt
- Helligkeit, Kontrast, Sättigung, Farbtemperatur und Vignette
- **„Ladenlicht korrigieren"** – ein Klick gegen das typische zu warme und zu flaue Licht im Verkaufsraum
- **Preis-Badge** mit durchgestrichenem Vorher-Preis und Aktionspreis
- **Störer** („Nur bis Samstag") und **Markenbalken** mit Logo, Marktname und Stadt

Ausgabe ist immer 1080 px breit – das Format, das Instagram ohne Qualitätsverlust annimmt.

### 2. Texter

Claude sieht das aufbereitete Foto, kennt das Marktprofil und schreibt mehrere
Caption-Varianten mit **unterschiedlichen Verkaufswinkeln** – nicht nur anderen
Formulierungen. Jede Variante enthält:

- eine erste Zeile, die mit Problem, Zahl oder Preis öffnet statt mit einer Begrüßung
- genau eine Handlungsaufforderung am Ende
- 12–18 Hashtags aus lokal / produktbezogen / kaufnah – keine Reichweiten-Hashtags
  wie `#love`, die Likes von Menschen bringen, die nie im Markt stehen werden
- einen vorbereiteten ersten Kommentar für Adresse und Öffnungszeiten
- einen Alternativtext für die Barrierefreiheit

Mit **„Kaufkraft prüfen"** bewertet ein zweiter Durchlauf die fertige Caption auf
Kaufaktivierung und schlägt eine stärkere erste Zeile vor.

### 3. Redaktionsplan

Reichweite entsteht durch Regelmäßigkeit, nicht durch einzelne Ausreißer. Deshalb
definierst du **feste Wochen-Slots** (Wochentag + Uhrzeit + Content-Säule). Das
Cockpit zeigt die nächsten Termine und welche davon noch leer sind.

### 4. Auto-Posting

Ein Dienst prüft jede Minute, ob ein Beitrag fällig ist, und veröffentlicht ihn über
die Instagram Graph API – inklusive Karussell aus mehreren Bildern und erstem
Kommentar. Fehlgeschlagene Beiträge werden bis zu dreimal wiederholt und danach
sichtbar als fehlgeschlagen markiert.

### 5. Käufer-Trichter

Der Trichter von der Reichweite bis zum Kunden im Markt:

| Signal | Gewicht | Warum |
| --- | --- | --- |
| Likes | **0** | Kostet nichts, sagt nichts über Kaufabsicht |
| Neue Follower | 2 | Interesse, aber noch kein Kaufsignal |
| Kommentare | 2 | Aufwand, oft eine Frage |
| Gespeichert | 3 | Merkt sich etwas für später – starkes Kaufsignal |
| Geteilt | 3 | Empfehlung an jemanden mit Bedarf |
| Profilaufrufe | 5 | Sucht Adresse und Öffnungszeiten |
| Link-Klicks | 8 | Konkreter Schritt Richtung Kauf |
| DM-Anfragen | 10 | Fragt nach Verfügbarkeit oder Preis |
| Kunden im Markt | 15 | Das eigentliche Ziel |

Daraus entsteht der **Käufer-Score** (0–100): gewichtete Kaufsignale je 1.000
erreichte Personen, über eine Sättigungskurve auf 0–100 abgebildet.

| Signale je 1.000 | Score | Einordnung |
| --- | --- | --- |
| ~50 | 23 | Viele Likes, kaum Kaufabsicht |
| ~200 | 63 | Solider Verkaufspost |
| ~350 | 81 | Starker Verkaufspost |
| ~500 | 91 | Ausreißer nach oben |

Dazu die Kennzahl **Likes je Kaufsignal**: Steht sie über 12, gefallen die Beiträge,
führen aber niemanden in den Markt.

**DM-Anfragen und Kunden im Markt liefert Instagram nicht** – die trägst du je
Beitrag selbst ein (Spalte „Kaufsignale" in der Beitragstabelle). Erst damit schließt
sich der Trichter bis zum Kauf.

Aus den Zahlen leitet das Cockpit konkrete Empfehlungen ab: welche Content-Säule
verkauft, zu welcher Uhrzeit die Kaufsignale am höchsten sind, und woran es hakt,
wenn Reichweite da ist, aber niemand weiterklickt.

---

## Installation

Voraussetzung: **Node.js 20 oder neuer**.

```bash
npm install
cp .env.example .env      # ANTHROPIC_API_KEY eintragen
npm run demo              # optional: Demo-Daten zum Anschauen
npm start
```

Das Cockpit läuft dann auf <http://localhost:4000>.

### Demo-Daten

Beim ersten Start sind alle Ansichten leer, und gerade die Auswertung lässt sich
ohne Zahlen schlecht beurteilen. `npm run demo` legt deshalb einen vollständigen
Beispielbestand an: Marktprofil, drei Produktbilder, drei veröffentlichte
Beiträge mit Insights, einen geplanten und einen Entwurf.

Die Beispielzahlen sind so gewählt, dass der Käufer-Score seine Arbeit zeigt: der
Ratgeber-Beitrag kommt auf 91, der Angebots-Beitrag auf 81 – und der freundliche
Team-Beitrag mit den mit Abstand meisten Likes nur auf 23.

```bash
npm run demo              # legt an, wenn noch keine Daten da sind
npm run demo -- --force   # überschreibt vorhandene Daten
```

Die Bilder erzeugt das Skript selbst (schematische Geräte-Motive, 1080 × 1350) –
es lädt nichts nach und braucht keine Bildbibliothek.

Zwei Dinge dazu: Der Server hält die Datenbank im Speicher, ein bereits laufender
Server muss nach dem Einspielen also neu gestartet werden. Und die drei Beiträge
gelten zwar als veröffentlicht, wurden aber nirgends gepostet – es sind keine
Instagram-Zugangsdaten hinterlegt.

Zum Aufräumen genügt es, den Ordner `data/` zu löschen.

Alle Daten liegen in `./data` (`db.json` und der Ordner `uploads`). Für ein Backup
genügt es, diesen Ordner zu sichern.

### Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | für den Texter | Schlüssel von [console.anthropic.com](https://console.anthropic.com) |
| `ANTHROPIC_MODEL` | nein | Standard: `claude-opus-5` |
| `PORT` | nein | Standard: `4000` |
| `DATA_DIR` | nein | Ablageort für Datenbank und Bilder, Standard: `./data` |
| `IG_API_VERSION` | nein | Standard: `v21.0` |
| `SCHEDULER_TICK_MS` | nein | Taktung des Auto-Posting-Dienstes, Standard: `60000` |

Ohne `ANTHROPIC_API_KEY` startet das Cockpit trotzdem – Foto-Studio, Redaktionsplan
und Auswertung funktionieren, nur die Textvorschläge sind deaktiviert.

---

## Instagram verbinden

Das Veröffentlichen läuft über die **Instagram Graph API**. Meta stellt dafür ein
paar Bedingungen, die sich nicht umgehen lassen:

1. **Instagram-Konto muss ein Business- oder Creator-Konto sein** und mit einer
   Facebook-Seite verknüpft sein. Ein privates Konto kann die API nicht bedienen.
2. **App im Meta-Entwicklerportal anlegen** und das Produkt „Instagram Graph API"
   hinzufügen.
3. **Zugriffsrechte** im Token: `instagram_basic`, `instagram_content_publish`,
   `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`.
4. **Langlebiges Token** erzeugen (kurzlebige Tokens laufen nach einer Stunde ab).
   Auch das langlebige Token gilt nur **60 Tage** und muss danach erneuert werden.
5. **Instagram-Business-Konto-ID** ermitteln – über
   `GET /me/accounts?fields=instagram_business_account`.

Beides trägst du unter **Einstellungen → Instagram-Verbindung** ein und prüfst es mit
„Verbindung testen".

### Die öffentliche Basis-URL

Das ist der Punkt, an dem eine lokale Installation scheitert: **Instagram lädt die
Bilder selbst herunter.** Der Server muss deshalb aus dem Internet erreichbar sein,
und die Adresse trägst du als „Öffentliche Basis-URL" ein (z. B.
`https://cockpit.mein-markt.de`). Die Bilder liegen unter `/uploads/…` und werden
ohne Anmeldung ausgeliefert, damit Instagram sie abrufen kann.

Zum Ausprobieren reicht ein Tunnel wie `cloudflared` oder `ngrok`; für den
Dauerbetrieb gehört das Cockpit hinter einen Reverse Proxy mit TLS.

### Grenzen der Plattform

- Meta begrenzt die Zahl der **über die API veröffentlichten Beiträge pro 24 Stunden**
  je Konto. Den aktuell geltenden Wert und den bereits verbrauchten Anteil liefert der
  Endpunkt `GET /{ig-user-id}/content_publishing_limit`.
- Nur **Bilder und Karussells** – Reels und Stories veröffentlicht diese Anwendung nicht
- Karussell: maximal 10 Bilder
- Manche Insights (`profile_visits`, `follows`) liefert Instagram nicht für jeden
  Medientyp; das Cockpit fällt dann automatisch auf den Basissatz zurück

---

## Betrieb

Das Cockpit hat **keine Benutzerverwaltung**. Es gehört ins interne Netz oder hinter
einen Reverse Proxy mit Zugriffsschutz – wer die Oberfläche erreicht, kann im Namen
des Marktes posten.

Der Access Token wird in `data/db.json` im Klartext gespeichert und über die API nur
noch als letzte sechs Zeichen zurückgegeben. Dateirechte entsprechend setzen.

Als Systemdienst (Beispiel für systemd):

```ini
[Service]
WorkingDirectory=/opt/insta-cockpit
ExecStart=/usr/bin/node server/index.js
Restart=always
EnvironmentFile=/opt/insta-cockpit/.env
```

---

## Aufbau

```
server/
  index.js        HTTP-Server und Routen
  store.js        Ablage (JSON-Datei + Bilder), atomare Schreibvorgänge
  caption.js      Textvorschläge über die Claude API (Bildanalyse + JSON-Schema)
  instagram.js    Instagram Graph API: Veröffentlichen, Insights, Verbindungstest
  scheduler.js    Auto-Posting-Dienst und Slot-Planung
  funnel.js       Käufer-Score, Gewichtung, Empfehlungen
  http.js         Router, Body-Parsing, statische Dateien
demo/
  seed.js         Demo-Datenbestand (npm run demo)
  png.js          Minimaler PNG-Encoder für die Beispielbilder
public/
  index.html      Grundgerüst
  styles.css      Oberfläche
  js/
    app.js        Zustand, Navigation
    studio.js     Foto-Studio (Canvas)
    views.js      Übersicht, Texter, Redaktionsplan, Auswertung, Einstellungen
    api.js        API-Aufrufe
    ui.js         DOM-Helfer, Formatierung
```

Bewusst ohne Frontend-Framework und ohne Datenbank: eine einzige Laufzeit-Abhängigkeit
(`@anthropic-ai/sdk`), `npm install` dauert Sekunden, und der Datenbestand ist eine
lesbare JSON-Datei.
