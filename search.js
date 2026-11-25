/* LEXIKON 5.0 – SEARCH.JS – Suchmaschine (ohne DOM-Zugriff)
   window.LexikonSearch.{search, highlightRanges, parseCommandLine} */
(() => {
"use strict";
const WORD = /[\p{L}\p{N}]+/gu, W = /[\p{L}\p{N}]/u;
const BOOL = { "--name": 1, "--content": 1, "--favorite": 1, "--case-sensitive": 1, "--exact": 1, "--fuzzy": 1 };
const VAL = { "--field": 1, "--type": 1, "--min-words": 1, "--max-words": 1, "--min-size": 1, "--max-size": 1, "--sort": 1, "--order": 1, "--limit": 1 };
const err = (m, p) => new Error(p === undefined ? m : m + " (Zeichen " + (p + 1) + ").");
const esc = s => s.replace(/[.+^${}()|[\]\\*?]/g, "\\$&");
const strip = s => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function fold(s) {                       // Umlaut-/Akzentfaltung bei gleicher Länge
  const n = strip(s);
  if (n.length === s.length) return n;
  let o = "";
  for (const c of s) { const r = strip(c); o += r.length === c.length ? r : (r[0] || " ").padEnd(c.length, " ").slice(0, c.length); }
  return o;
}
function parseSize(v) {
  const m = /^(\d+(?:[.,]\d+)?)\s*(B|KB|MB|GB)?$/i.exec(v);
  if (!m) throw err("Ungültige Größenangabe: " + v);
  return Number(m[1].replace(",", ".")) * { B: 1, KB: 1024, MB: 1048576, GB: 1073741824 }[(m[2] || "B").toUpperCase()];
}

/* ---------- Kommandozeile → {query, flags} ---------- */
function parseCommandLine(str) {
  if ((String(str || "").match(/"/g) || []).length % 2) throw err("Anführungszeichen nicht geschlossen.");
  const toks = String(str || "").match(/(?:[^\s"]|"[^"]*")+/g) || [], q = [], f = {};
  const num = (t, v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw err("Ungültiger Zahlenwert für " + t); return n; };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === "--") { q.push(...toks.slice(i + 1)); break; }
    if (!/^--[a-z-]+$/i.test(t)) { q.push(t); continue; }
    const k = t.toLowerCase();
    if (BOOL[k]) {
      if (k === "--name" || k === "--content") {
        const fld = k.slice(2);
        if (f.field && f.field !== fld) throw err("--name und --content schließen sich aus.");
        f.field = fld;
      } else f[k.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = true;
    } else if (VAL[k]) {
      const v = (toks[++i] || "").replace(/^"|"$/g, "");
      if (!v || v.startsWith("--")) throw err("Wert fehlt für " + t);
      if (k === "--field") { if (!["name", "content", "all"].includes(v)) throw err("Feld muss name, content oder all sein."); f.field = v; }
      else if (k === "--type") f.type = v.replace(/^\./, "").toUpperCase();
      else if (k === "--min-words") f.minWords = num(t, v);
      else if (k === "--max-words") f.maxWords = num(t, v);
      else if (k === "--limit") f.limit = num(t, v);
      else if (k === "--min-size") f.minSize = parseSize(v);
      else if (k === "--max-size") f.maxSize = parseSize(v);
      else if (k === "--sort") { if (!["relevance", "date", "name", "size", "words"].includes(v.toLowerCase())) throw err("Unbekannte Sortierung: " + v); f.sort = v.toLowerCase(); }
      else if (k === "--order") { if (!["asc", "desc"].includes(v.toLowerCase())) throw err("Reihenfolge muss asc oder desc sein."); f.order = v.toLowerCase(); }
    } else throw err("Unbekannter Suchparameter: " + t);
  }
  if (f.minWords > f.maxWords) throw err("Minimale Wortanzahl darf nicht größer als maximale sein.");
  if (f.minSize > f.maxSize) throw err("Minimale Dateigröße darf nicht größer als maximale sein.");
  return { query: q.join(" ").trim(), flags: f };
}

/* ---------- Tokenizer ---------- */
function lex(q) {
  const t = [], n = q.length; let i = 0;
  while (i < n) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "(" || c === ")") { t.push({ k: c, p: i }); i++; continue; }
    const s = i; let neg = false;
    if ((c === "-" || c === "+") && i + 1 < n && !/[\s()]/.test(q[i + 1])) { neg = c === "-"; i++; }
    if (q[i] === '"') {
      const e = q.indexOf('"', i + 1);
      if (e < 0) throw err("Anführungszeichen nicht geschlossen", s);
      t.push({ k: "T", v: q.slice(i + 1, e), phrase: true, neg, p: s }); i = e + 1; continue;
    }
    if (q[i] === "/") {
      const m = /^\/((?:\\.|[^\/\\])+)\/i?/.exec(q.slice(i));
      if (m) { t.push({ k: "T", v: m[1], rx: true, neg, p: s }); i += m[0].length; continue; }
    }
    let e = i; while (e < n && !/[\s()]/.test(q[e])) e++;
    const w = q.slice(i, e); i = e;
    if (!neg && s === e - w.length) {
      if (w === "AND" || w === "OR" || w === "NOT") { t.push({ k: w, p: s }); continue; }
      if (w === "|") { t.push({ k: "OR", p: s }); continue; }
      const m = /^NEAR\/(\d+)$/.exec(w);
      if (m) { t.push({ k: "NEAR", n: +m[1], p: s }); continue; }
      if (w === "+") continue;
    }
    t.push({ k: "T", v: w, neg, p: s });
  }
  return t;
}

/* ---------- Parser: OR < AND < NOT < NEAR ---------- */
function parse(q) {
  const m = /^"([^"]*)"$/.exec(q.trim());
  if (m && /[()]|\b(AND|OR|NOT)\b|NEAR\/\d/.test(m[1])) q = m[1];     // "(A OR B) AND C"
  const tk = lex(q); let i = 0;
  const pk = () => tk[i];
  const orE = () => { let a = andE(); while (pk() && pk().k === "OR") { i++; a = { t: "or", a, b: andE() }; } return a; };
  const andE = () => { let a = un(); while (pk() && pk().k !== "OR" && pk().k !== ")") { if (pk().k === "AND") i++; a = { t: "and", a, b: un() }; } return a; };
  const un = () => { if (pk() && pk().k === "NOT") { i++; return { t: "not", x: un() }; } return nr(); };
  const nr = () => { let a = pr(); while (pk() && pk().k === "NEAR") { const n = tk[i++].n; a = { t: "near", a, b: pr(), n }; } return a; };
  const pr = () => {
    const k = tk[i++];
    if (!k) throw err("Operand fehlt am Ende der Suche", q.length);
    if (k.k === "(") { const e = orE(), c = tk[i++]; if (!c || c.k !== ")") throw err("Klammer nicht geschlossen", k.p); return e; }
    if (k.k === "T") { const node = { t: "term", v: k.v, phrase: k.phrase, rx: k.rx }; return k.neg ? { t: "not", x: node } : node; }
    throw err("Unerwartetes Element „" + (k.k === "NEAR" ? "NEAR" : k.k) + "“", k.p);
  };
  if (!tk.length) return null;
  const ast = orE();
  if (i < tk.length) throw err("Unerwartete Klammer", tk[i].p);
  return ast;
}
function positives(n, out = []) {
  if (!n) return out;
  if (n.t === "term") out.push(n);
  else if (n.t === "not") return out;
  else { positives(n.a, out); positives(n.b, out); }
  return out;
}

/* ---------- Auswertung ---------- */
function lev(a, b, k) {
  let p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const c = [i]; let min = i;
    for (let j = 1; j <= b.length; j++) { c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); min = Math.min(min, c[j]); }
    if (min > k) return k + 1; p = c;
  }
  return p[b.length];
}
function source(n, fl) {
  if (n.rx) return { src: n.v, a: false, z: false };
  let v = n.v, a = false, z = false;
  if (!n.phrase) { if (v[0] === "^") { a = true; v = v.slice(1); } if (v.endsWith("$")) { z = true; v = v.slice(0, -1); } }
  if (!fl.cs) v = fold(v);
  let s = esc(v).replace(/\\\*/g, "[\\p{L}\\p{N}]*").replace(/\\\?/g, "[\\p{L}\\p{N}]");
  if (n.phrase) s = s.replace(/\s+/g, "\\s+");
  return { src: s, a: a || fl.exact, z: z || fl.exact };
}
function ctxOf(s, fl) { return { s, fl, pc: new Map(), _w: null, _ws: null }; }
function words(c) { return c._w || (c._w = new Set(c.s.match(WORD) || [])); }
function wstarts(c) { return c._ws || (c._ws = [...c.s.matchAll(WORD)].map(m => m.index)); }
function positions(n, c) {
  if (c.pc.has(n)) return c.pc.get(n);
  const fl = c.fl, rf = "gu" + (fl.cs ? "" : "i"); let re, info = { a: false, z: false };
  if (fl.fuzzy && !n.rx && !n.phrase && !/[*?^$]/.test(n.v)) {
    const v = fl.cs ? n.v : fold(n.v), k = v.length >= 8 ? 2 : v.length >= 4 ? 1 : 0;
    const ws = [...words(c)].filter(w => Math.abs(w.length - v.length) <= k && lev(w, v, k) <= k);
    info = { a: true, z: true };
    re = ws.length ? new RegExp("(?:" + ws.map(esc).join("|") + ")", rf) : null;
  } else {
    try { info = source(n, fl); re = new RegExp(info.src, rf); } catch (e) { throw err("Ungültiger Ausdruck: " + n.v); }
  }
  const out = []; let m;
  if (re) while ((m = re.exec(c.s)) && out.length < 3000) { if (!m[0]) { re.lastIndex++; continue; }
    const st = m.index, en = st + m[0].length;
    if ((info.a && st > 0 && W.test(c.s[st - 1])) || (info.z && en < c.s.length && W.test(c.s[en]))) { re.lastIndex = st + 1; continue; }
    out.push([st, en]); }
  c.pc.set(n, out); return out;
}
function posOf(n, c) {
  if (n.t === "term") return positions(n, c);
  if (n.t === "or") return posOf(n.a, c).concat(posOf(n.b, c));
  throw err("NEAR kann nur Begriffe oder Gruppen mit OR verbinden.");
}
function wi(ws, p) { let lo = 0, hi = ws.length - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (ws[m] <= p) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
function ev(n, c) {
  switch (n.t) {
    case "term": return positions(n, c).length > 0;
    case "and": return ev(n.a, c) && ev(n.b, c);
    case "or": return ev(n.a, c) || ev(n.b, c);
    case "not": return !ev(n.x, c);
    case "near": {
      const ws = wstarts(c), A = posOf(n.a, c).map(p => wi(ws, p[0])), Z = posOf(n.b, c).map(p => wi(ws, p[0]));
      return A.some(a => Z.some(b => a !== b && Math.abs(a - b) <= n.n));
    }
  }
  return false;
}

/* ---------- Dokumentansicht (mit Cache) ---------- */
const CACHE = new WeakMap();
function view(d, fl) {
  if (fl.cs) return { name: d.name || "", text: d.content || "" };
  let v = CACHE.get(d);
  if (!v) { v = { name: fold(d.name || ""), text: fold(d.content || "") }; CACHE.set(d, v); }
  return v;
}
function norm(flags) { return { cs: !!flags.caseSensitive, exact: !!flags.exact, fuzzy: !!flags.fuzzy, field: flags.field || "all" }; }
function merge(r) {
  r.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const o = [];
  for (const x of r) { const l = o[o.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else o.push([x[0], x[1]]); }
  return o;
}
function highlightRanges(doc, query, flags = {}) {
  const fl = norm(flags), ast = parse(query || ""), c = ctxOf(view(doc, fl).text, fl);
  return merge(positives(ast).flatMap(t => positions(t, c)));
}
function snippets(doc, ranges) {
  const text = doc.content || "", starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  const by = new Map();
  for (const [s, e] of ranges) {
    const ln = wi(starts, s); if (!by.has(ln)) { if (by.size >= 3) continue; by.set(ln, []); }
    by.get(ln).push([s - starts[ln], Math.min(e, (starts[ln + 1] ?? text.length + 1) - 1) - starts[ln]]);
  }
  return [...by].map(([ln, rs]) => {
    const end = text.indexOf("\n", starts[ln]), line = text.slice(starts[ln], end < 0 ? undefined : end).replace(/\r$/, "");
    const off = Math.max(0, rs[0][0] - 60);
    return { line: ln + 1, text: (off ? "…" : "") + line.slice(off, off + 180), ranges: rs.map(([a, b]) => [a - off + (off ? 1 : 0), b - off + (off ? 1 : 0)]).filter(([a, b]) => a < 181 && b > a) };
  });
}

/* ---------- Hauptfunktion ---------- */
function search(docs, query, flags = {}) {
  const fl = norm(flags), ast = parse(query || "");
  let list = docs.filter(d =>
    (!flags.type || String(d.extension).toUpperCase() === flags.type) &&
    (!flags.favorite || d.favorite === true) &&
    (flags.minWords === undefined || (d.words || 0) >= flags.minWords) &&
    (flags.maxWords === undefined || (d.words || 0) <= flags.maxWords) &&
    (flags.minSize === undefined || d.size >= flags.minSize) &&
    (flags.maxSize === undefined || d.size <= flags.maxSize));
  let res = [];
  if (!ast) res = list.map(doc => ({ doc, score: 0, count: 0, nameHit: false, hits: [] }));
  else {
    const pos = positives(ast);
    for (const doc of list) {
      const v = view(doc, fl), s = fl.field === "name" ? v.name : fl.field === "content" ? v.text : v.name + "\n" + v.text;
      if (!ev(ast, ctxOf(s, fl))) continue;
      const cc = ctxOf(v.text, fl), nc = ctxOf(v.name, fl);
      const rs = fl.field === "name" ? [] : merge(pos.flatMap(t => positions(t, cc)));
      const nameHit = fl.field !== "content" && pos.some(t => positions(t, nc).length);
      const score = pos.reduce((a, t) => a + Math.log2(1 + (fl.field === "name" ? 0 : positions(t, cc).length)), 0) + (nameHit ? 3 : 0);
      res.push({ doc, score, count: rs.length, nameHit, hits: snippets(doc, rs) });
    }
  }
  const sort = flags.sort || (ast ? "relevance" : "date"), order = flags.order || (sort === "name" ? "asc" : "desc");
  const key = { relevance: r => r.score, date: r => r.doc.modified || r.doc.created || 0, size: r => r.doc.size, words: r => r.doc.words || 0 }[sort];
  res.sort((a, b) => sort === "name" ? String(a.doc.name).localeCompare(b.doc.name, "de") : key(a) - key(b));
  if (order === "desc" && sort !== "name") res.reverse(); else if (order === "desc") res.reverse();
  const total = res.length;
  if (flags.limit) res = res.slice(0, flags.limit);
  return { results: res, total };
}

window.LexikonSearch = Object.freeze({ version: "1.0", search, highlightRanges, parseCommandLine, fold });
})();
