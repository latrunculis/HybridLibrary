/* LEXIKON 5.0 – TERMINAL.JS
   Befehlszeile für die Hybrid-Bibliothek. Greift ausschließlich über
   window.Lexikon (Bibliothek) und window.LexikonSearch (Suche) zu.
   Navigation, Escape-Taste und Ansichtswechsel gehören app.js. */
(() => {
"use strict";
const $ = id => document.getElementById(id), LIB = () => window.Lexikon, S = () => window.LexikonSearch;
const BAR = "═".repeat(48), MAXLINES = 400, PROMPT = "lexikon>";
const THEMES = [["#cccccc", "#f9f1a5"], ["#7dff9a", "#d6ffe0"], ["#ffb347", "#ffe0a8"]];
const st = { R: [], last: { query: "", flags: {} }, mode: "menu", ask: null, hist: [], hi: 0, welcomed: false };
let out, inp, pr, term;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("lexikon.term." + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem("lexikon.term." + k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- Ausgabe ---------- */
function add(node) {
  out.append(node);
  while (out.children.length > MAXLINES) out.firstElementChild.remove();
  out.scrollTop = out.scrollHeight;
}
function print(text = "", cls = "") {
  for (const line of String(text).split("\n")) { const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = line; add(d); }
}
const header = t => { print(); print("═══ " + t + " ═══", "h"); print(); };
const fail = t => print("FEHLER: " + t, "e");
function marked(text, ranges) {
  const f = document.createDocumentFragment(); let p = 0;
  for (const [s, e] of ranges || []) { if (s < p) continue; f.append(text.slice(p, s)); const m = document.createElement("mark"); m.textContent = text.slice(s, e); f.append(m); p = e; }
  f.append(text.slice(p)); return f;
}
function question(label, fn) { pr.textContent = label; st.ask = fn; }
const fmt = b => LIB().formatBytes(b);

/* ---------- Menü, Hilfe ---------- */
function menu() {
  st.mode = "menu"; print(); print(BAR, "d"); print("                    HAUPTMENÜ", "h"); print(BAR, "d");
  print("\n  1  -  Dateinamensuche\n  2  -  Volltextsuche\n  3  -  Kombinierte Suche\n  4  -  Alle Einträge anzeigen\n  5  -  Zufallseintrag\n  6  -  Statistik\n  7  -  Letzte Suchergebnisse\n  8  -  Dateien importieren / synchronisieren\n  9  -  Hilfe\n  0  -  Zur grafischen Oberfläche\n");
}
const HELP = [
  ["SUCHEN", [
    ["n BEGRIFF", "Dateinamensuche"],
    ["t BEGRIFF", "Volltextsuche"],
    ["s BEGRIFF", "Name und Volltext"],
    ["search …", "wie s, mit Parametern (help suche)"],
    ["last", "letzte Ergebnisse"],
    ["help suche", "alle Suchoperatoren"]]],
  ["ANZEIGEN", [
    ["ls", "alle Einträge"],
    ["zufall", "Zufallseintrag"],
    ["open N | Name", "im Leser öffnen"],
    ["cat N", "Text im Terminal"],
    ["info N", "Dateiinformationen"],
    ["stat", "Statistik"]]],
  ["MERKLISTE UND ÄNDERN", [
    ["fav N", "merken / nicht mehr merken"],
    ["favs", "Merkliste anzeigen"],
    ["delete N", "Eintrag löschen"]]],
  ["DATEIEN", [
    ["sync | import", "importieren / aktualisieren"],
    ["backup", "Sicherung speichern"],
    ["restore", "Sicherung laden"],
    ["dateien", "unterstützte Formate"]]],
  ["ANSICHT", [
    ["menu", "Hauptmenü"],
    ["farbe", "Farbschema wechseln"],
    ["schrift N", "Schriftgröße 12-26"],
    ["clear", "Bildschirm leeren"],
    ["gui | exit | 0", "zur Oberfläche"],
    ["version", "Programmversion"]]]
];
const HELP_FOOT = "Eingabe ohne Befehl = kombinierte Suche · Zahl in Trefferliste = öffnen · ↑ ↓ Verlauf · Tab ergänzt";
const HELP_SEARCH = [
  ["PLATZHALTER", [
    ["*", "beliebig viele Zeichen: sokra*  *ismus  *kant*"],
    ["?", "genau ein Zeichen: ka?t"]]],
  ["VERKNÜPFEN (AND OR NOT groß schreiben)", [
    ["kant ethik", "beide Begriffe (UND)"],
    ["kant AND ethik", "ebenso"],
    ["+kant", "Begriff muss enthalten sein"],
    ["kant OR hegel", "mindestens einer der Begriffe"],
    ["kant | hegel", "ebenso"],
    ["NOT hegel", "Begriff ausschließen"],
    ["-hegel", "ebenso"],
    ["(A OR B) AND C", "Gruppierung mit Klammern"]]],
  ["MUSTER", [
    ['"freier wille"', "exakte Wortgruppe"],
    ["kant NEAR/5 ethik", "höchstens 5 Wörter Abstand"],
    ["^wort", "Wortanfang"],
    ["wort$", "Wortende"],
    ["/pat[a-z]+/", "regulärer Ausdruck"]]],
  ["FELDER UND FILTER", [
    ["--name", "nur Dokumentnamen"],
    ["--content", "nur Inhalte"],
    ["--field all", "alle Felder (name, content, all)"],
    ["--type pdf", "nur dieses Format"],
    ["--min-words N", "mindestens N Wörter"],
    ["--max-words N", "höchstens N Wörter"],
    ["--min-size 10KB", "Mindestgröße (B, KB, MB, GB)"],
    ["--max-size 2MB", "Höchstgröße"],
    ["--favorite", "nur Merkliste"],
    ["--limit N", "höchstens N Treffer"]]],
  ["OPTIONEN", [
    ["--case-sensitive", "Groß-/Kleinschreibung beachten"],
    ["--exact", "nur ganze Wörter"],
    ["--fuzzy", "ähnliche Schreibweisen"],
    ["--sort WERT", "relevance, date, name, size, words"],
    ["--order WERT", "asc oder desc"]]],
  ["BEISPIELE", [
    ["s Dok*", ""],
    ['search "Künstliche Intelligenz"', ""],
    ["search Auto OR Motorrad", ""],
    ["search Auto NOT Rennwagen", ""],
    ['search "(Auto OR Motorrad) AND Technik"', ""],
    ['search --name "*.pdf"', ""],
    ["t Daten* --type docx --min-words 100", ""]]]
];
const HELP_SEARCH_FOOT = "Umlaute und Akzente sind egal (a findet ä) · Ohne Parameter wird in Namen und Inhalt gesucht";
function helpView(title, sections, foot) {
  print(); print("═══ " + title + " ═══", "h");
  for (const [name, rows] of sections) {
    print(); print("── " + name + " " + "─".repeat(Math.max(2, 46 - name.length)), "h");
    for (const [key, text] of rows) {
      const line = document.createElement("div"), k = document.createElement("span");
      k.className = "h"; k.textContent = "  " + key + (text ? " ".repeat(Math.max(2, 24 - key.length)) : "");
      line.append(k, text); add(line);
    }
  }
  print(); print(foot, "d");
}

/* ---------- Dokumente, Ergebnisse ---------- */
const docs = () => LIB().getDocuments();
function findDoc(arg) {
  arg = String(arg || "").trim().replace(/^"|"$/g, ""); if (!arg) return null;
  if (/^\d+$/.test(arg)) { const r = st.R[+arg - 1]; return r ? r.doc : null; }
  const all = docs(), f = S().fold(arg);
  return all.find(d => d.id === arg) || all.find(d => d.name.toLowerCase() === arg.toLowerCase()) ||
    all.find(d => S().fold(d.name).includes(f)) || null;
}
function wrap(list) { return list.map(doc => ({ doc, hits: [] })); }
function showResults() {
  if (!st.R.length) { print("Keine Ergebnisse.", "d"); return; }
  st.mode = "res"; print(BAR, "d");
  st.R.forEach((r, i) => {
    const d = r.doc, h = document.createElement("div");
    h.className = "r"; h.dataset.i = i; h.textContent = String(i + 1).padStart(3, "0") + "  " + d.name + (d.favorite ? "  ★" : ""); add(h);
    print("     " + d.extension + " · " + fmt(d.size) + " · " + (d.words || 0).toLocaleString("de-DE") + " Wörter", "d");
    for (const x of (r.hits || []).slice(0, 2)) { const l = document.createElement("div"); l.className = "d"; l.append("     Z." + x.line + ": ", marked(x.text, x.ranges)); add(l); }
  });
  print(BAR, "d"); print("Nummer oder Antippen = öffnen · fav N = merken · 0 = Menü", "d");
}
function openIdx(i) {
  const r = st.R[i]; if (!r) return fail("Ungültige Nummer.");
  LIB().openDocument(r.doc.id, { query: st.last.query, flags: st.last.flags });
}
function doSearch(raw, field) {
  const p = S().parseCommandLine(raw);
  if (field && !p.flags.field) p.flags.field = field;
  const res = LIB().search(p.query, p.flags);
  st.last = { query: p.query, flags: p.flags };
  st.R = res.results.slice(0, 200);
  store.set("last", { query: p.query, flags: p.flags });
  print(BAR, "d"); print("Durchsucht : " + docs().length + "\nGefunden   : " + res.total + (res.total > st.R.length ? "  (angezeigt: " + st.R.length + ")" : ""));
  showResults();
}
function toggleFav(arg) {
  const d = findDoc(arg); if (!d) return fail("Eintrag nicht gefunden. fav N (Nummer aus der Liste).");
  return LIB().toggleFavorite(d.id).then(() => {
    const now = docs().find(x => x.id === d.id);
    st.R.forEach(r => { if (r.doc.id === d.id && now) r.doc = now; });
    print(d.name + (now && now.favorite ? " gemerkt." : " nicht mehr gemerkt."), "h");
  });
}
function stat() {
  const s = LIB().getStatistics(), all = docs(), by = {};
  all.forEach(d => by[d.extension] = (by[d.extension] || 0) + 1);
  header("STATISTIK");
  if (!all.length) return print("Noch keine Einträge. Mit sync importieren.");
  const big = all.reduce((a, b) => b.size > a.size ? b : a);
  print("Einträge         : " + s.documents + "\nWörter           : " + s.words.toLocaleString("de-DE") + "\nGesamtgröße      : " + fmt(s.size) +
    "\nMerkliste        : " + s.favorites + "\nFormate          : " + Object.entries(by).map(([k, v]) => k + " " + v).join(", ") +
    "\nGrößter Eintrag  : " + big.name + " (" + fmt(big.size) + ")");
}

/* ---------- Befehle ---------- */
const C = {};
const reg = (names, fn) => names.split(" ").forEach(n => C[n] = fn);
reg("help hilfe ?", a => a.toLowerCase().startsWith("such")
  ? helpView("SUCHHILFE", HELP_SEARCH, HELP_SEARCH_FOOT)
  : helpView("HILFE", HELP, HELP_FOOT));
reg("menu", menu);
reg("n", a => a ? doSearch(a, "name") : question("Dateiname: ", l => l && doSearch(l, "name")));
reg("t", a => a ? doSearch(a, "content") : question("Suchbegriff: ", l => l && doSearch(l, "content")));
reg("s search suche", a => a ? doSearch(a, null) : question("Suchbegriff: ", l => l && doSearch(l, null)));
reg("ls", () => { st.last = { query: "", flags: {} }; st.R = wrap([...docs()].sort((a, b) => a.name.localeCompare(b.name, "de"))); print(BAR, "d"); print("Anzahl: " + st.R.length); showResults(); });
reg("zufall", () => {
  const all = docs(); if (!all.length) return print("Keine Einträge vorhanden.", "d");
  const d = all[Math.random() * all.length | 0]; st.R = wrap([d]); st.last = { query: "", flags: {} };
  print(BAR, "d"); print(d.name, "h"); print((d.content || "").trim().split("\n").slice(0, 3).join("\n").slice(0, 300));
  question("Öffnen? (j/n) ", l => /^j/i.test(l) && openIdx(0));
});
reg("stat stats status", stat);
reg("last", () => {
  const l = store.get("last");
  if (l && l.query !== undefined && !st.R.length) { st.last = l; st.R = LIB().search(l.query, l.flags).results.slice(0, 200); }
  st.R.length ? (print(BAR, "d"), print("Letzte Suche: " + (st.last.query || "(alle)")), showResults()) : print("Noch keine Suche.", "d");
});
reg("fav favorite", toggleFav);
reg("favs favorites", () => { st.last = { query: "", flags: {} }; st.R = wrap(docs().filter(d => d.favorite)); st.R.length ? (print(BAR, "d"), showResults()) : print("Die Merkliste ist leer.", "d"); });
reg("open", a => { const d = findDoc(a); d ? LIB().openDocument(d.id, a && /^\d+$/.test(a) ? { query: st.last.query, flags: st.last.flags } : {}) : fail("Eintrag nicht gefunden: " + a); });
reg("cat", a => {
  const d = findDoc(a); if (!d) return fail("Eintrag nicht gefunden: " + a);
  const ls = (d.content || "").split("\n"); header(d.name); print(ls.slice(0, 120).join("\n"));
  if (ls.length > 120) print("… " + (ls.length - 120) + " weitere Zeilen. Vollständig mit: open " + a, "d");
});
reg("info", a => {
  const d = findDoc(a); if (!d) return fail("Eintrag nicht gefunden: " + a);
  header("INFORMATION");
  print("Name        : " + d.name + "\nFormat      : " + d.extension + "\nGröße       : " + fmt(d.size) + "\nWörter      : " + (d.words || 0).toLocaleString("de-DE") +
    "\nMerkliste   : " + (d.favorite ? "ja" : "nein") + "\nImportiert  : " + new Date(d.imported || d.created).toLocaleString("de-DE") + "\nID          : " + d.id);
});
reg("delete", a => {
  const d = findDoc(a); if (!d) return fail("Eintrag nicht gefunden: " + a);
  question("„" + d.name + "“ löschen? (j/n) ", async l => {
    if (!/^j/i.test(l)) return print("Nichts gelöscht.", "d");
    await LIB().deleteDocument(d.id);
  });
});
reg("sync import", () => LIB().openFilePicker());
reg("backup", () => LIB().createBackup());
reg("restore", () => LIB().openBackupPicker());
reg("refresh", async () => { await LIB().refresh(); print("Bestand neu geladen: " + docs().length + " Einträge.", "h"); });
reg("clear cls", () => { out.replaceChildren(); });
reg("dateien", () => print("Unterstützte Formate: TXT, PDF, DOCX (je bis 50 MB).\nImport mit sync oder per Drag & Drop in der Oberfläche."));
reg("version", () => print("Lexikon " + LIB().version + " · Suche " + S().version));
reg("gui exit quit", () => LIB().switchView("library"));
reg("farbe", () => { const i = ((store.get("theme") || 0) + 1) % THEMES.length; theme(i); print("Farbschema " + (i + 1) + "/" + THEMES.length, "h"); });
reg("schrift", a => { const n = Math.min(26, Math.max(12, parseInt(a, 10) || 16)); size(n); print("Schriftgröße " + n + " px", "h"); });
function theme(i) { store.set("theme", i); term.style.setProperty("--terminal-fg", THEMES[i][0]); term.style.setProperty("--terminal-hi", THEMES[i][1]); }
function size(n) { store.set("size", n); term.style.fontSize = n + "px"; }
const MENU = { 1: "n", 2: "t", 3: "s", 4: "ls", 5: "zufall", 6: "stat", 7: "last", 8: "sync", 9: "help", 0: "gui" };

async function run(line) {
  line = line.trim();
  const label = pr.textContent; print(label + " " + line, "d"); pr.textContent = PROMPT;
  if (st.ask) { const f = st.ask; st.ask = null; try { await f(line); } catch (e) { fail(e.message); } return; }
  if (!line) return;
  st.hist.push(line); st.hist = st.hist.slice(-100); st.hi = st.hist.length;
  let cmd = line.split(/\s+/)[0].toLowerCase(), raw = line.slice(cmd.length).trim();
  try {
    if (/^\d+$/.test(line)) {
      if (st.mode === "res") return line === "0" ? menu() : openIdx(+line - 1);
      cmd = MENU[line]; if (!cmd) return fail("Ungültige Eingabe."); raw = "";
    }
    if (C[cmd]) await C[cmd](raw); else doSearch(line, null);
  } catch (e) { fail(e.message || "Unbekannter Fehler."); }
}

/* ---------- Eingabe ---------- */
function insert(t) { const i = inp.selectionStart ?? inp.value.length; inp.setRangeText(t, i, inp.selectionEnd ?? i, "end"); inp.focus(); }
function complete() { const v = inp.value; if (v && !/\s/.test(v)) { const m = Object.keys(C).filter(k => k.startsWith(v.toLowerCase())); if (m.length === 1) inp.value = m[0] + " "; } }
function history(d) { if (!st.hist.length) return; st.hi = Math.min(st.hist.length, Math.max(0, st.hi + d)); inp.value = st.hist[st.hi] || ""; }
function setup() {
  out = $("out"); inp = $("in"); term = $("terminal"); pr = $("pr");
  if (!out || !inp || !term || !pr) { console.error("Terminal: Elemente fehlen."); return; }
  $("terminalForm").addEventListener("submit", e => { e.preventDefault(); const v = inp.value; inp.value = ""; run(v); });
  inp.addEventListener("keydown", e => {
    if (e.key === "ArrowUp") { e.preventDefault(); history(-1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); history(1); }
    else if (e.key === "Tab") { e.preventDefault(); complete(); }
  });
  out.addEventListener("click", e => { const r = e.target.closest(".r"); if (r) openIdx(+r.dataset.i); });
  const keys = [["↑", () => history(-1)], ["↓", () => history(1)], ["Tab", complete], ["*", () => insert("*")], ["?", () => insert("?")], ['"', () => insert('"')],
    ["(", () => insert("(")], [")", () => insert(")")], ["|", () => insert(" | ")], ["-", () => insert(" -")], ["Menü", () => run("menu")], ["Hilfe", () => run("help")], ["Sync", () => run("sync")]];
  for (const [t, f] of keys) { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.addEventListener("pointerdown", e => e.preventDefault()); b.addEventListener("click", f); $("keys").append(b); }
  theme(store.get("theme") || 0); if (store.get("size")) size(store.get("size"));
  document.addEventListener("lexikon:view", e => { fit(); if (e.detail === "terminal") { welcome(); setTimeout(() => inp.focus(), 50); } });
  if (window.visualViewport) { visualViewport.addEventListener("resize", fit); visualViewport.addEventListener("scroll", fit); }
  inp.addEventListener("focus", () => setTimeout(() => { window.scrollTo(0, 0); fit(); }, 300));
  document.addEventListener("lexikon:change", () => {            // gelöschte/geänderte Dokumente aus Ergebnissen entfernen
    const cur = new Map(docs().map(d => [d.id, d]));
    st.R = st.R.filter(r => cur.has(r.doc.id)); st.R.forEach(r => r.doc = cur.get(r.doc.id));
  });
}
/* iPad: Terminal an den sichtbaren Bereich anpassen, wenn die Bildschirmtastatur erscheint */
function fit() {
  const v = window.visualViewport;
  if (!v || !term) return;
  if (!term.classList.contains("active")) { term.style.inset = ""; term.style.height = ""; return; }
  term.style.inset = v.offsetTop + "px 0 auto 0";
  term.style.height = v.height + "px";
  out.scrollTop = out.scrollHeight;
}
function welcome() {
  if (st.welcomed || !LIB()) return; st.welcomed = true;
  print(BAR, "d"); print("\n                 L E X I K O N\n\n               Hybrid Library " + LIB().version + "\n"); print(BAR, "d");
  print(docs().length ? docs().length + " Einträge geladen. Befehle: help · Suchsyntax: help suche" : "Noch keine Einträge. Mit sync Dateien importieren.", "h");
  menu();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup, { once: true }); else setup();
})();
