/*
 * Extract plain text from uploaded résumés and JDs.
 * Format is detected from file contents (not just the extension):
 *   PDF (pdf.js from CDN) · DOCX / ODT (built-in zip reader) · legacy Word .doc (OLE piece table) · RTF · plain text.
 * extractText(file) resolves to { text, format, warning? }.
 */
(function (root) {
  const UXM = root.UXM;
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const utf8 = new TextDecoder();
  const cp1252 = new TextDecoder('windows-1252');

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the PDF reader (are you offline?). Paste the text instead.'));
      document.head.appendChild(s);
    });
  }

  const decodeEntities = (s) => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
  const tidy = (s) => s.replace(/[ \t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  // ---------- PDF ----------
  async function pdfText(buf) {
    if (!root.pdfjsLib) await loadScript(PDFJS + 'pdf.min.js');
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    const pdf = await root.pdfjsLib.getDocument({ data: buf }).promise;
    const lines = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      let line = '', lastY = null;
      for (const item of content.items) {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
        line += item.str;
        lastY = y;
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  // ---------- ZIP (DOCX, ODT) ----------
  async function zipEntries(buf) {
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('The file looks damaged (invalid zip structure).');
    const entries = {};
    let p = dv.getUint32(eocd + 16, true);
    for (let n = dv.getUint16(eocd + 10, true); n > 0; n--) {
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      entries[utf8.decode(new Uint8Array(buf, p + 46, nameLen))] = {
        method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), local: dv.getUint32(p + 42, true),
      };
      p += 46 + nameLen + extraLen + commentLen;
    }
    entries.read = async (name) => {
      const e = entries[name];
      if (!e) return null;
      const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
      let bytes = new Uint8Array(buf, start, e.size);
      if (e.method === 8) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      return utf8.decode(bytes);
    };
    return entries;
  }

  async function zipDocText(buf) {
    const zip = await zipEntries(buf);
    const docx = await zip.read('word/document.xml');
    if (docx != null) {
      return {
        format: 'Word (.docx)',
        text: tidy(decodeEntities(docx
          .replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n')
          .replace(/<[^>]+>/g, ''))),
      };
    }
    const odt = await zip.read('content.xml');
    if (odt != null) {
      return {
        format: 'OpenDocument (.odt)',
        text: tidy(decodeEntities(odt
          .replace(/<\/text:(p|h)>/g, '\n').replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n')
          .replace(/<text:s(?: text:c="(\d+)")?\/>/g, (_, n) => ' '.repeat(+n || 1))
          .replace(/<[^>]+>/g, ''))),
      };
    }
    throw new Error('Unsupported zip-based document. Use PDF, Word, RTF, ODT or TXT.');
  }

  // ---------- Legacy Word .doc (OLE compound file + piece table) ----------
  function oleStreams(buf) {
    const dv = new DataView(buf);
    const sectorSize = 1 << dv.getUint16(0x1e, true);
    const miniSize = 1 << dv.getUint16(0x20, true);
    const miniCutoff = dv.getUint32(0x38, true);
    const sectorOffset = (s) => (s + 1) * sectorSize;
    const perSector = sectorSize / 4;

    const fatSectors = [];
    for (let i = 0; i < 109; i++) {
      const s = dv.getUint32(0x4c + i * 4, true);
      if (s < 0xfffffffa) fatSectors.push(s);
    }
    for (let d = dv.getUint32(0x44, true), n = dv.getUint32(0x48, true); n > 0 && d < 0xfffffffa; n--) {
      for (let i = 0; i < perSector - 1; i++) {
        const s = dv.getUint32(sectorOffset(d) + i * 4, true);
        if (s < 0xfffffffa) fatSectors.push(s);
      }
      d = dv.getUint32(sectorOffset(d) + (perSector - 1) * 4, true);
    }
    const fat = [];
    for (const s of fatSectors) for (let i = 0; i < perSector; i++) fat.push(dv.getUint32(sectorOffset(s) + i * 4, true));

    const readBig = (start) => {
      const sectors = [];
      for (let s = start; s < 0xfffffffa && sectors.length <= fat.length; s = fat[s]) sectors.push(s);
      const out = new Uint8Array(sectors.length * sectorSize);
      sectors.forEach((s, i) => {
        const off = sectorOffset(s);
        out.set(new Uint8Array(buf, off, Math.min(sectorSize, buf.byteLength - off)), i * sectorSize);
      });
      return out;
    };

    const dir = readBig(dv.getUint32(0x30, true));
    const ddv = new DataView(dir.buffer);
    const entries = [];
    for (let o = 0; o + 128 <= dir.length; o += 128) {
      const nameLen = ddv.getUint16(o + 0x40, true);
      if (!nameLen) continue;
      const name = new TextDecoder('utf-16le').decode(dir.subarray(o, o + nameLen - 2));
      entries.push({ name, type: dir[o + 0x42], start: ddv.getUint32(o + 0x74, true), size: ddv.getUint32(o + 0x78, true) });
    }
    const rootEntry = entries.find((e) => e.type === 5);
    let miniFat = null, miniStream = null;

    return (name) => {
      const e = entries.find((x) => x.name === name);
      if (!e) return null;
      if (e.size >= miniCutoff) return readBig(e.start).subarray(0, e.size);
      if (!miniFat) {
        const mf = readBig(dv.getUint32(0x3c, true));
        const mdv = new DataView(mf.buffer);
        miniFat = Array.from({ length: mf.length / 4 }, (_, i) => mdv.getUint32(i * 4, true));
        miniStream = readBig(rootEntry.start);
      }
      const out = [];
      for (let s = e.start, guard = 0; s < 0xfffffffa && guard <= miniFat.length; s = miniFat[s], guard++) {
        out.push(...miniStream.subarray(s * miniSize, (s + 1) * miniSize));
      }
      return new Uint8Array(out).subarray(0, e.size);
    };
  }

  function docText(buf) {
    const stream = oleStreams(buf);
    const word = stream('WordDocument');
    if (!word) throw new Error('This .doc file has no Word content.');
    const wdv = new DataView(word.buffer, word.byteOffset, word.byteLength);
    const flags = wdv.getUint16(0x0a, true);
    const table = stream(flags & 0x0200 ? '1Table' : '0Table');
    const fcClx = wdv.getUint32(0x01a2, true), lcbClx = wdv.getUint32(0x01a6, true);
    if (!table || !lcbClx) throw new Error('Unsupported .doc version (pre-Word 97). Save it as .docx or PDF.');

    const tdv = new DataView(table.buffer, table.byteOffset, table.byteLength);
    let p = fcClx;
    while (table[p] === 0x01) p += 3 + tdv.getUint16(p + 1, true); // skip Prc entries
    if (table[p] !== 0x02) throw new Error('Could not read the Word piece table.');
    const lcb = tdv.getUint32(p + 1, true);
    const plc = p + 5;
    const n = (lcb - 4) / 12;
    let text = '';
    for (let i = 0; i < n; i++) {
      const cpStart = tdv.getUint32(plc + i * 4, true), cpEnd = tdv.getUint32(plc + (i + 1) * 4, true);
      const fcRaw = tdv.getUint32(plc + (n + 1) * 4 + i * 8 + 2, true);
      const chars = cpEnd - cpStart;
      if (fcRaw & 0x40000000) {
        const fc = (fcRaw & 0x3fffffff) / 2;
        text += cp1252.decode(word.subarray(fc, fc + chars));
      } else {
        text += new TextDecoder('utf-16le').decode(word.subarray(fcRaw, fcRaw + chars * 2));
      }
    }
    // Field codes: keep the displayed result (between \x14 and \x15), drop the instruction.
    text = text.replace(/\x13[^\x13\x14\x15]*\x14/g, '').replace(/\x13[^\x13\x14\x15]*\x15/g, '').replace(/[\x14\x15]/g, '');
    return tidy(text.replace(/\r|\x0b|\x0c/g, '\n').replace(/\x07/g, '\t').replace(/[\x00-\x08\x0e-\x1f]/g, ''));
  }

  // Fallback when the piece table can't be read: harvest readable text runs.
  function docTextHeuristic(buf) {
    const runs = [];
    const u16 = new TextDecoder('utf-16le').decode(buf.slice(0, buf.byteLength - (buf.byteLength % 2)));
    for (const m of u16.matchAll(/[\x20-\x7e -ɏ\r\n\t]{20,}/g)) runs.push(m[0]);
    if (runs.join('').length < 200) for (const m of cp1252.decode(buf).matchAll(/[\x20-\x7e\r\n\t]{20,}/g)) runs.push(m[0]);
    return tidy(runs.join('\n').replace(/\r/g, '\n'));
  }

  // ---------- RTF ----------
  const RTF_SKIP = /^(fonttbl|colortbl|stylesheet|info|pict|header|headerl|headerr|headerf|footer|footerl|footerr|footerf|listtable|listoverridetable|themedata|colorschememapping|datastore|latentstyles|rsidtbl|generator|xmlnstbl|mmathPr|object|fldinst|filetbl|revtbl)$/;

  function rtfText(src) {
    let out = '', skip = 0, depth = 0, uc = 1, pendingSkip = 0;
    const stack = [];
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') { stack.push({ skip, uc }); depth++; continue; }
      if (ch === '}') { ({ skip, uc } = stack.pop() || { skip: 0, uc: 1 }); depth--; continue; }
      if (ch === '\\') {
        const next = src[i + 1];
        if (next === '\\' || next === '{' || next === '}') { if (!skip) out += next; i++; continue; }
        if (next === "'") {
          if (pendingSkip) pendingSkip--;
          else if (!skip) out += cp1252.decode(new Uint8Array([parseInt(src.substr(i + 2, 2), 16)]));
          i += 3; continue;
        }
        if (next === '*') { skip = depth; i++; continue; }
        if (next === '~') { if (!skip) out += ' '; i++; continue; }
        if (next === '\n' || next === '\r') { if (!skip) out += '\n'; i++; continue; }
        const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i + 1, i + 40));
        if (!m) { i++; continue; }
        i += m[0].length;
        const word = m[1], arg = m[2] != null ? +m[2] : null;
        if (RTF_SKIP.test(word)) skip = skip || depth;
        if (skip) continue;
        if (word === 'par' || word === 'line' || word === 'sect' || word === 'page' || word === 'row') out += '\n';
        else if (word === 'tab' || word === 'cell') out += '\t';
        else if (word === 'emdash') out += '—';
        else if (word === 'endash') out += '–';
        else if (word === 'bullet') out += '•';
        else if (word === 'lquote' || word === 'rquote') out += "'";
        else if (word === 'ldblquote' || word === 'rdblquote') out += '"';
        else if (word === 'uc') uc = arg ?? 1;
        else if (word === 'u' && arg != null) { out += String.fromCharCode(arg < 0 ? arg + 65536 : arg); pendingSkip = uc; }
        continue;
      }
      if (ch === '\r' || ch === '\n') continue;
      if (pendingSkip) { pendingSkip--; continue; }
      if (!skip) out += ch;
    }
    return tidy(out);
  }

  // ---------- entry point ----------
  async function extractText(file) {
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
    const sig = Array.from(head, (b) => b.toString(16).padStart(2, '0')).join('');
    const ascii = String.fromCharCode(...head);

    if (ascii.startsWith('%PDF')) return { format: 'PDF', text: tidy(await pdfText(buf)) };
    if (sig.startsWith('504b0304')) return zipDocText(buf);
    if (sig === 'd0cf11e0a1b11ae1') {
      try {
        return { format: 'Word 97–2003 (.doc)', text: docText(buf) };
      } catch {
        return { format: 'Word 97–2003 (.doc)', text: docTextHeuristic(buf), warning: 'Older .doc format — text was recovered approximately; please review it.' };
      }
    }
    const text = utf8.decode(buf);
    if (text.trimStart().startsWith('{\\rtf')) return { format: 'RTF', text: rtfText(text) };
    if (/[\x00-\x08]/.test(text.slice(0, 2000))) throw new Error('Unsupported file type. Use PDF, Word (.docx/.doc), RTF, ODT or TXT.');
    return { format: 'Text', text: tidy(text) };
  }

  UXM.extractText = extractText;
})(window);
