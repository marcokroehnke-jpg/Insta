import zlib from 'node:zlib';

/**
 * Minimaler PNG-Encoder plus ein paar Zeichenbefehle.
 *
 * Zweck: Die Demo-Daten brauchen Produktfotos, sollen aber keine
 * Bildbibliothek als Abhängigkeit nachziehen. Ein PNG besteht aus wenigen
 * Blöcken und zlib bringt Node mit – das reicht für synthetische Motive.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 3);
  }

  /**
   * Mischt eine Farbe mit der vorhandenen – alpha zwischen 0 und 1.
   * Koordinaten werden abgerundet: ein Buffer-Index mit Nachkommastelle
   * verwirft den Schreibzugriff kommentarlos.
   */
  blend(px, py, [r, g, b], alpha = 1) {
    const x = Math.floor(px);
    const y = Math.floor(py);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    if (alpha >= 1) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      return;
    }
    this.data[i] = this.data[i] * (1 - alpha) + r * alpha;
    this.data[i + 1] = this.data[i + 1] * (1 - alpha) + g * alpha;
    this.data[i + 2] = this.data[i + 2] * (1 - alpha) + b * alpha;
  }

  /** Diagonaler Verlauf über die gesamte Fläche. */
  gradient(from, to) {
    const max = this.width + this.height;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = (x + y) / max;
        this.blend(x, y, [
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t,
          from[2] + (to[2] - from[2]) * t
        ]);
      }
    }
  }

  rect(x0, y0, w, h, color, alpha = 1) {
    const xs = Math.round(x0);
    const ys = Math.round(y0);
    const xe = Math.round(x0 + w);
    const ye = Math.round(y0 + h);
    for (let y = ys; y < ye; y++) {
      for (let x = xs; x < xe; x++) this.blend(x, y, color, alpha);
    }
  }

  circle(cx, cy, radius, color, alpha = 1) {
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > r2) continue;
        // Weiche Kante über das letzte Pixel, sonst wirken die Kreise ausgefranst.
        const edge = Math.min(1, (radius - Math.sqrt(d2)) / 1.5);
        this.blend(x, y, color, alpha * edge);
      }
    }
  }

  ring(cx, cy, outer, inner, color, alpha = 1) {
    for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++) {
      for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d > outer || d < inner) continue;
        const edge = Math.min(1, Math.min(outer - d, d - inner) / 1.5);
        this.blend(x, y, color, alpha * edge);
      }
    }
  }

  /** Weicher Schatten als flach gedrückte Ellipse. */
  shadow(cx, cy, rx, ry, alpha = 0.3) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d > 1) continue;
        this.blend(x, y, [0, 0, 0], alpha * (1 - d) ** 1.6);
      }
    }
  }

  toPngBuffer() {
    const stride = this.width * 3;
    const raw = Buffer.alloc((stride + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      raw[y * (stride + 1)] = 0; // Filtertyp 0 (keiner)
      this.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; // Bittiefe
    ihdr[9] = 2; // Farbtyp: Truecolor RGB
    ihdr[10] = 0; // Kompression
    ihdr[11] = 0; // Filter
    ihdr[12] = 0; // kein Interlacing

    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0))
    ]);
  }
}

const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16)
];

/**
 * Drei Platzhalter-Motive, wie sie im Markt aufgenommen würden.
 * Bewusst schematisch – sie sollen die Oberfläche füllen, nicht echte Fotos ersetzen.
 */
export const MOTIFS = {
  waschmaschine(w = 1080, h = 1350) {
    const c = new Canvas(w, h);
    c.gradient(hex('#8d97a6'), hex('#e6e0d4'));
    c.rect(0, h * 0.78, w, h * 0.22, hex('#b9b3a6'), 0.55);
    c.shadow(w * 0.5, h * 0.79, w * 0.32, h * 0.035, 0.35);
    c.rect(w * 0.28, h * 0.28, w * 0.44, h * 0.5, hex('#f4f5f7'));
    c.rect(w * 0.28, h * 0.28, w * 0.44, h * 0.07, hex('#2b3038'));
    c.circle(w * 0.63, h * 0.315, w * 0.016, hex('#7fd39b'));
    c.ring(w * 0.5, h * 0.56, w * 0.155, w * 0.125, hex('#9aa3ae'));
    c.circle(w * 0.5, h * 0.56, w * 0.125, hex('#dfe6ee'));
    c.ring(w * 0.5, h * 0.56, w * 0.125, w * 0.108, hex('#c3ccd6'));
    return c;
  },

  kuehlschrank(w = 1080, h = 1350) {
    const c = new Canvas(w, h);
    c.gradient(hex('#75838d'), hex('#d6dedb'));
    c.rect(0, h * 0.8, w, h * 0.2, hex('#a8b0ad'), 0.5);
    c.shadow(w * 0.5, h * 0.81, w * 0.28, h * 0.03, 0.35);
    c.rect(w * 0.31, h * 0.18, w * 0.38, h * 0.63, hex('#e9edf1'));
    c.rect(w * 0.31, h * 0.45, w * 0.38, h * 0.006, hex('#b6bec6'));
    c.rect(w * 0.655, h * 0.22, w * 0.012, h * 0.19, hex('#9aa3ae'));
    c.rect(w * 0.655, h * 0.49, w * 0.012, h * 0.26, hex('#9aa3ae'));
    return c;
  },

  fernseher(w = 1080, h = 1350) {
    const c = new Canvas(w, h);
    c.gradient(hex('#4e5a66'), hex('#c2cbd2'));
    c.rect(0, h * 0.72, w, h * 0.28, hex('#9aa2a8'), 0.45);
    c.shadow(w * 0.5, h * 0.735, w * 0.3, h * 0.025, 0.4);
    c.rect(w * 0.12, h * 0.26, w * 0.76, h * 0.44, hex('#1b1f24'));
    c.rect(w * 0.135, h * 0.272, w * 0.73, h * 0.415, hex('#2f4a63'));
    c.rect(w * 0.135, h * 0.272, w * 0.73, h * 0.13, hex('#4a7ea8'), 0.6);
    c.rect(w * 0.46, h * 0.7, w * 0.08, h * 0.035, hex('#1b1f24'));
    c.rect(w * 0.34, h * 0.732, w * 0.32, h * 0.014, hex('#1b1f24'));
    return c;
  }
};
