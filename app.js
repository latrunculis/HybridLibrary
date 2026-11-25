
/* =========================================================
   LEXIKON 5.0 – HYBRID LIBRARY
   APP.JS
   TEIL 1 VON 5
   Grundstruktur · IndexedDB · Hilfsfunktionen
   ========================================================= */

"use strict";

/* =========================================================
   1. KONFIGURATION
   ========================================================= */

const APP_CONFIG = {
  name: "Lexikon",
  version: "5.0",
  database: "LexikonHybridLibrary",
  databaseVersion: 1,
  store: "documents",
  maxFileSize: 50 * 1024 * 1024,
  supportedTypes: ["txt", "pdf", "docx"]
};

/* =========================================================
   2. ANWENDUNGSZUSTAND
   ========================================================= */

const state = {
  documents: [],
  filteredDocuments: [],
  favoritesOnly: false,
  searchQuery: "",
  currentDocument: null,
  database: null,
  initialized: false,
  importing: false
};

/* =========================================================
   3. DOM-REFERENZEN
   ========================================================= */

const DOM = {};
const BUS = new EventTarget();
function emit(name) {
  BUS.dispatchEvent(new Event(name));
  document.dispatchEvent(new CustomEvent("lexikon:" + name));
}

function cacheDOM() {
  const ids = [
    "app",
    "search",
    "count",
    "words",
    "size",
    "documents",
    "resultCount",
    "listTitle",
    "status",
    "storageInfo",
    "importBtn",
    "fileInput",
    "dropzone",
    "syncBtn",
    "favoritesBtn",
    "allBtn",
    "backupBtn",
    "restoreBtn",
    "backupInput",
    "reader",
    "readerTitle",
    "readerContent",
    "readerFooter",
    "readerClose",
    "readerFavorite",
    "importProgress",
    "importProgressBar",
    "statsBtn",
    "clearSearchBtn",
    "switchTerminal",
    "sideTerminalBtn"
  ];

  for (const id of ids) {
    DOM[id] = document.getElementById(id);
  }
}

/* =========================================================
   4. HILFSFUNKTIONEN
   ========================================================= */

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return (
    (bytes / Math.pow(1024, index)).toFixed(1) +
    " " +
    units[index]
  );
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function getExtension(filename) {
  const parts = String(filename).split(".");
  return parts.length > 1
    ? parts.pop().toLowerCase()
    : "";
}

function generateId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function setStatus(message, type = "") {
  if (!DOM.status) return;

  DOM.status.textContent = message;
  DOM.status.className = "status";

  if (type) {
    DOM.status.classList.add(type);
  }
}

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]
  );
}

/* =========================================================
   5. INDEXEDDB – DATENBANK ÖFFNEN
   ========================================================= */

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(
        new Error("IndexedDB wird von diesem Browser nicht unterstützt.")
      );
      return;
    }

    const request = indexedDB.open(
      APP_CONFIG.database,
      APP_CONFIG.databaseVersion
    );

    request.onupgradeneeded = event => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(APP_CONFIG.store)) {
        const store = db.createObjectStore(
          APP_CONFIG.store,
          { keyPath: "id" }
        );

        store.createIndex(
          "name",
          "name",
          { unique: false }
        );

        store.createIndex(
          "favorite",
          "favorite",
          { unique: false }
        );

        store.createIndex(
          "created",
          "created",
          { unique: false }
        );
      }
    };

    request.onsuccess = () => {
      state.database = request.result;

      state.database.onversionchange = () => {
        state.database.close();
        state.database = null;
      };

      resolve(state.database);
    };

    request.onerror = () => {
      reject(
        request.error ||
        new Error("Datenbank konnte nicht geöffnet werden.")
      );
    };

    request.onblocked = () => {
      console.warn(
        "Datenbankaktualisierung wird durch einen anderen Tab blockiert."
      );
    };
  });
}

/* =========================================================
   6. INDEXEDDB – TRANSAKTIONSHELFER
   ========================================================= */

function databaseRequest(mode, operation) {
  return new Promise((resolve, reject) => {
    if (!state.database) {
      reject(new Error("Datenbank ist nicht geöffnet."));
      return;
    }

    const transaction = state.database.transaction(
      APP_CONFIG.store,
      mode
    );

    const store = transaction.objectStore(APP_CONFIG.store);

    let request;

    try {
      request = operation(store);
    } catch (error) {
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      resolve(request ? request.result : undefined);
    };

    transaction.onerror = () => {
      reject(
        transaction.error ||
        new Error("Datenbanktransaktion fehlgeschlagen.")
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ||
        new Error("Datenbanktransaktion abgebrochen.")
      );
    };
  });
}

/* =========================================================
   7. DATENBANKFUNKTIONEN
   ========================================================= */

async function dbGetAll() {
  const result = await databaseRequest(
    "readonly",
    store => store.getAll()
  );

  return Array.isArray(result) ? result : [];
}

async function dbGet(id) {
  return databaseRequest(
    "readonly",
    store => store.get(id)
  );
}

async function dbSave(document) {
  return databaseRequest(
    "readwrite",
    store => store.put(document)
  );
}

async function dbDelete(id) {
  return databaseRequest(
    "readwrite",
    store => store.delete(id)
  );
}

async function dbClear() {
  return databaseRequest(
    "readwrite",
    store => store.clear()
  );
}

/* =========================================================
   8. DOKUMENTE LADEN
   ========================================================= */

async function loadDocuments() {
  try {
    state.documents = await dbGetAll();

    state.documents.sort(
      (a, b) => (b.created || 0) - (a.created || 0)
    );

    applyFilters();
    updateStatistics();

    return state.documents;

  } catch (error) {
    console.error("Dokumente konnten nicht geladen werden:", error);

    setStatus(
      "Fehler beim Laden der Dokumente: " + error.message,
      "error"
    );

    throw error;
  }
}

/* =========================================================
   9. ANWENDUNG INITIALISIEREN
   ========================================================= */

async function initializeApp() {
  if (state.initialized) return;

  cacheDOM();

  try {
    setStatus("Datenbank wird geöffnet …");

    await openDatabase();

    await loadDocuments();

    state.initialized = true;

    setStatus(
      "Lexikon 5.0 erfolgreich initialisiert.",
      "success"
    );

    console.info(
      "Lexikon 5.0 – Hybrid Library bereit."
    );

  } catch (error) {
    console.error("Initialisierung fehlgeschlagen:", error);

    setStatus(
      "Initialisierung fehlgeschlagen: " + error.message,
      "error"
    );
  }
}


/* =========================================================
   LEXIKON 5.0 – HYBRID LIBRARY
   APP.JS
   TEIL 2 VON 5
   Dokumentenimport · Textextraktion · Dateiverarbeitung
   ========================================================= */

/* =========================================================
   10. DATEITYP PRÜFEN
   ========================================================= */

function isSupportedFile(file) {
  const extension = getExtension(file.name);

  return APP_CONFIG.supportedTypes.includes(extension);
}

/* =========================================================
   11. DATEIGRÖSSE PRÜFEN
   ========================================================= */

function validateFile(file) {
  if (!file) {
    throw new Error("Keine Datei ausgewählt.");
  }

  if (!isSupportedFile(file)) {
    throw new Error(
      "Nicht unterstütztes Dateiformat: " + file.name
    );
  }

  if (file.size > APP_CONFIG.maxFileSize) {
    throw new Error(
      "Datei überschreitet die maximale Größe von 50 MB: " +
      file.name
    );
  }

  return true;
}

/* =========================================================
   12. DATEI ALS TEXT LESEN
   ========================================================= */

async function readFileAsText(file) {
  const buffer = await file.arrayBuffer();
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return text.replace(/^\uFEFF/, "");
}

/* =========================================================
   13. DATEI ALS ARRAYBUFFER LESEN
   ========================================================= */

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(
        reader.error ||
        new Error("Datei konnte nicht gelesen werden.")
      );
    };

    reader.onabort = () => {
      reject(new Error("Dateilesen wurde abgebrochen."));
    };

    reader.readAsArrayBuffer(file);
  });
}

/* =========================================================
   14. TXT-IMPORT
   ========================================================= */

async function extractTXT(file) {
  return readFileAsText(file);
}

/* =========================================================
   15. PDF-IMPORT
   ========================================================= */

async function extractPDF(file) {
  if (!window.pdfjsLib) {
    throw new Error(
      "PDF.js wurde nicht geladen. Bitte Internetverbindung prüfen."
    );
  }

  const buffer = await readFileAsArrayBuffer(file);

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer)
  }).promise;

  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);

      const content = await page.getTextContent();

      const lines = [];
      let currentLine = [];
      let lastY = null;

      for (const item of content.items) {
        if (!item.str) continue;

        const currentY = item.transform
          ? item.transform[5]
          : null;

        if (
          lastY !== null &&
          currentY !== null &&
          Math.abs(currentY - lastY) > 3
        ) {
          lines.push(currentLine.join(" "));
          currentLine = [];
        }

        currentLine.push(item.str);

        if (currentY !== null) {
          lastY = currentY;
        }
      }

      if (currentLine.length) {
        lines.push(currentLine.join(" "));
      }

      pages.push(
        "\n--- Seite " + pageNumber + " ---\n\n" +
        lines.join("\n")
      );

      page.cleanup();
    }

    return pages.join("\n");

  } finally {
    await pdf.destroy();
  }
}

/* =========================================================
   16. DOCX-IMPORT
   ========================================================= */

async function extractDOCX(file) {
  if (!window.mammoth) {
    throw new Error(
      "Mammoth.js wurde nicht geladen. Bitte Internetverbindung prüfen."
    );
  }

  const buffer = await readFileAsArrayBuffer(file);

  const result = await mammoth.extractRawText({
    arrayBuffer: buffer
  });

  return String(result.value || "");
}

/* =========================================================
   17. ZENTRALE TEXTERKENNUNG
   ========================================================= */

async function extractDocumentText(file) {
  const extension = getExtension(file.name);

  switch (extension) {
    case "txt":
      return extractTXT(file);

    case "pdf":
      return extractPDF(file);

    case "docx":
      return extractDOCX(file);

    default:
      throw new Error(
        "Unbekanntes Dateiformat: " + extension
      );
  }
}

/* =========================================================
   18. WORTANZAHL BERECHNEN
   ========================================================= */

function countWords(text) {
  const content = String(text || "").trim();

  if (!content) return 0;

  return content
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

/* =========================================================
   19. DOKUMENTOBJEKT ERSTELLEN
   ========================================================= */

function createDocumentObject(file, content) {
  const now = Date.now();

  return {
    id: generateId(),

    name: file.name,

    extension: getExtension(file.name).toUpperCase(),

    type: file.type || "application/octet-stream",

    size: file.size,

    content: String(content || ""),

    words: countWords(content),
    sourceModified: file.lastModified || 0,

    favorite: false,

    created: now,

    modified: now,

    imported: now
  };
}

/* =========================================================
   20. IMPORTFORTSCHRITT ANZEIGEN
   ========================================================= */

function updateImportProgress(current, total) {
  if (!DOM.importProgress || !DOM.importProgressBar) {
    return;
  }

  const percentage = total > 0
    ? Math.round((current / total) * 100)
    : 0;

  DOM.importProgress.classList.add("visible");

  DOM.importProgress.setAttribute(
    "aria-valuenow",
    String(percentage)
  );

  DOM.importProgressBar.style.width =
    percentage + "%";
}

/* =========================================================
   21. IMPORTFORTSCHRITT ZURÜCKSETZEN
   ========================================================= */

function resetImportProgress() {
  if (!DOM.importProgress || !DOM.importProgressBar) {
    return;
  }

  DOM.importProgress.classList.remove("visible");

  DOM.importProgress.setAttribute(
    "aria-valuenow",
    "0"
  );

  DOM.importProgressBar.style.width = "0%";
}

/* =========================================================
   22. EINZELNE DATEI IMPORTIEREN
   ========================================================= */

async function importSingleFile(file) {
  validateFile(file);
  const key = file.name.toLowerCase();
  const old = state.documents.find(
    item => item.name.toLowerCase() === key
  );
  if (
    old &&
    old.size === file.size &&
    old.sourceModified === (file.lastModified || 0)
  ) {
    return "skipped";
  }
  const content = await extractDocumentText(file);
  const document = createDocumentObject(file, content);
  if (old) {
    document.id = old.id;
    document.favorite = old.favorite;
    document.created = old.created;
  }
  await dbSave(document);
  if (old) {
    state.documents[state.documents.indexOf(old)] = document;
  } else {
    state.documents.unshift(document);
  }
  return old ? "updated" : "new";
}

/* =========================================================
   23. MEHRERE DATEIEN IMPORTIEREN
   ========================================================= */

async function importFiles(fileList) {
  if (state.importing) {
    setStatus(
      "Ein Importvorgang läuft bereits.",
      "error"
    );

    return;
  }

  const files = Array.from(fileList || []);

  if (!files.length) {
    setStatus("Keine Dateien ausgewählt.");
    return;
  }

  state.importing = true;

  let successful = 0;
  let failed = 0;
  let skipped = 0;

  const errors = [];

  setStatus(
    files.length + " Datei(en) werden verarbeitet …"
  );

  updateImportProgress(0, files.length);

  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];

      try {
        const result = await importSingleFile(file);
        if (result === "skipped") skipped++;
        else successful++;

      } catch (error) {
        failed++;

        errors.push(
          file.name + ": " + error.message
        );

        console.error(
          "Importfehler:",
          file.name,
          error
        );
      }

      updateImportProgress(
        index + 1,
        files.length
      );

      setStatus(
        "Import: " +
        (index + 1) +
        " von " +
        files.length +
        " Dateien verarbeitet."
      );

      // Browser regelmäßig Zeit zum Rendern geben.
      await new Promise(resolve =>
        setTimeout(resolve, 0)
      );
    }

    state.documents.sort(
      (a, b) => (b.created || 0) - (a.created || 0)
    );

    applyFilters();
    updateStatistics();

    if (failed === 0) {
      setStatus(
        successful +
        " Datei(en) importiert oder aktualisiert" +
        (skipped ? ", " + skipped + " unverändert" : "") + ".",
        "success"
      );
    } else {
      setStatus(
        successful +
        " erfolgreich, " +
        failed +
        " fehlgeschlagen.\n\n" +
        errors.join("\n"),
        "error"
      );
    }

  } finally {
    state.importing = false;

    setTimeout(resetImportProgress, 1200);

    if (DOM.fileInput) {
      DOM.fileInput.value = "";
    }
  }
}

/* =========================================================
   24. DATEIAUSWAHL ÖFFNEN
   ========================================================= */

function openFilePicker() {
  if (state.importing) return;

  DOM.fileInput?.click();
}

/* =========================================================
   25. DATEIIMPORT – EVENT HANDLER
   ========================================================= */

function handleFileSelection(event) {
  const files = event.target.files;

  importFiles(files);
}

/* =========================================================
   26. DRAG & DROP – INITIALISIERUNG
   ========================================================= */

function initializeDragAndDrop() {
  const dropzone = DOM.dropzone;

  if (!dropzone) return;

  dropzone.addEventListener("click", openFilePicker);

  dropzone.addEventListener("keydown", event => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      openFilePicker();
    }
  });

  dropzone.addEventListener("dragover", event => {
    event.preventDefault();

    dropzone.classList.add("drag");
  });

  dropzone.addEventListener("dragleave", event => {
    if (!dropzone.contains(event.relatedTarget)) {
      dropzone.classList.remove("drag");
    }
  });

  dropzone.addEventListener("drop", event => {
    event.preventDefault();

    dropzone.classList.remove("drag");

    const files = event.dataTransfer?.files;

    if (files?.length) {
      importFiles(files);
    }
  });
}

/* =========================================================
   27. IMPORTEREIGNISSE REGISTRIEREN
   ========================================================= */

function initializeImportEvents() {
  DOM.importBtn?.addEventListener(
    "click",
    openFilePicker
  );

  DOM.syncBtn?.addEventListener(
    "click",
    openFilePicker
  );

  DOM.fileInput?.addEventListener(
    "change",
    handleFileSelection
  );

  initializeDragAndDrop();
}

/* =========================================================
   LEXIKON 5.0 – HYBRID LIBRARY
   APP.JS
   TEIL 3 VON 5
   Dokumentenliste · Suche · Filter · Favoriten · Statistik
   ========================================================= */

/* =========================================================
   28. DOKUMENTENLISTE RENDERN
   ========================================================= */

function renderDocuments(documents = state.filteredDocuments) {
  const container = DOM.documents;

  if (!container) return;

  container.replaceChildren();

  if (!documents.length) {
    const empty = document.createElement("div");

    empty.className = "empty";

    empty.textContent = state.searchQuery
      ? "Keine passenden Dokumente gefunden."
      : state.favoritesOnly
        ? "Deine Merkliste ist noch leer."
        : "Noch keine Dokumente vorhanden.";

    container.appendChild(empty);

    updateResultCount(0);

    return;
  }

  const fragment = document.createDocumentFragment();

  for (const documentData of documents) {
    fragment.appendChild(
      createDocumentElement(documentData)
    );
  }

  container.appendChild(fragment);

  updateResultCount(documents.length);
}

/* =========================================================
   29. EINZELNES DOKUMENTELEMENT ERSTELLEN
   ========================================================= */

function createDocumentElement(documentData) {
  const article = document.createElement("article");

  article.className = "document";
  article.dataset.id = documentData.id;

  const icon = document.createElement("div");

  icon.className = "doc-icon";
  icon.textContent = documentData.extension || "DOC";

  icon.setAttribute("aria-hidden", "true");

  const info = document.createElement("div");

  info.className = "doc-info";

  const name = document.createElement("div");

  name.className = "doc-name";
  name.textContent = documentData.name;

  const meta = document.createElement("div");

  meta.className = "doc-meta";

  meta.textContent =
    formatBytes(documentData.size) +
    " · " +
    (documentData.words || 0).toLocaleString("de-DE") +
    " Wörter · " +
    formatDate(documentData.modified || documentData.created);

  info.append(name, meta);

  const actions = document.createElement("div");

  actions.className = "doc-actions";

  const favoriteButton = document.createElement("button");

  favoriteButton.type = "button";

  favoriteButton.textContent =
    documentData.favorite ? "★" : "☆";

  favoriteButton.title = documentData.favorite
    ? "Aus Merkliste entfernen"
    : "Zur Merkliste hinzufügen";

  favoriteButton.setAttribute(
    "aria-label",
    favoriteButton.title
  );

  favoriteButton.addEventListener("click", event => {
    event.stopPropagation();

    toggleFavorite(documentData.id);
  });

  const openButton = document.createElement("button");

  openButton.type = "button";
  openButton.textContent = "Öffnen";

  openButton.addEventListener("click", event => {
    event.stopPropagation();

    openDocument(documentData.id);
  });

  const deleteButton = document.createElement("button");

  deleteButton.type = "button";
  deleteButton.textContent = "✕";

  deleteButton.className = "danger";
  deleteButton.title = "Dokument löschen";

  deleteButton.setAttribute(
    "aria-label",
    "Dokument " + documentData.name + " löschen"
  );

  deleteButton.addEventListener("click", event => {
    event.stopPropagation();

    deleteDocument(documentData.id);
  });

  actions.append(
    favoriteButton,
    openButton,
    deleteButton
  );

  article.append(icon, info, actions);

  article.tabIndex = 0;
  article.setAttribute("role", "group");

  article.addEventListener("dblclick", () => {
    openDocument(documentData.id);
  });

  article.addEventListener("keydown", event => {
    if (
      event.target === article &&
      event.key === "Enter"
    ) {
      openDocument(documentData.id);
    }
  });

  return article;
}

/* =========================================================
   30. ANZAHL DER SUCHERGEBNISSE
   ========================================================= */

function updateResultCount(count) {
  if (!DOM.resultCount) return;

  DOM.resultCount.textContent =
    count.toLocaleString("de-DE") +
    (count === 1 ? " Eintrag" : " Einträge");
}

/* =========================================================
   31. SUCHFUNKTION
   ========================================================= */

function setSearchQuery(query) {
  state.searchQuery = String(query || "").trim();
  applyFilters();
}

function matchesSearch(documentData, query) {
  if (!query) return true;

  const normalizedQuery = normalizeText(query);

  const searchableText = normalizeText(
    [
      documentData.name,
      documentData.extension,
      documentData.content
    ].join(" ")
  );

  return searchableText.includes(normalizedQuery);
}

function parseSize(value) {
  const match = String(value).trim().match(
    /^(\d+(?:[.,]\d+)?)\s*(B|KB|MB|GB)?$/i
  );

  if (!match) {
    throw new Error("Ungültige Größenangabe: " + value);
  }

  const amount = Number(match[1].replace(",", "."));
  const unit = (match[2] || "B").toUpperCase();

  const factors = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3
  };

  return amount * factors[unit];
}

function findDocuments(query = "", options = {}) {
  const terms = normalizeText(query)
    .split(/\s+/)
    .filter(Boolean);

  let results = [...state.documents];

  if (options.type) {
    const type = String(options.type)
      .replace(/^\./, "")
      .toUpperCase();

    results = results.filter(item =>
      String(item.extension || "").toUpperCase() === type
    );
  }

  if (options.favorite) {
    results = results.filter(item => item.favorite === true);
  }

  if (options.field === "name") {
    results = results.filter(item =>
      terms.every(term =>
        normalizeText(item.name).includes(term)
      )
    );
  } else if (options.field === "content") {
    results = results.filter(item =>
      terms.every(term =>
        normalizeText(item.content).includes(term)
      )
    );
  } else {
    results = results.filter(item => {
      const searchable = normalizeText(
        item.name + " " + item.content
      );

      return terms.every(term =>
        searchable.includes(term)
      );
    });
  }

  if (Number.isFinite(options.minWords)) {
    results = results.filter(item =>
      (item.words || 0) >= options.minWords
    );
  }

  if (Number.isFinite(options.maxWords)) {
    results = results.filter(item =>
      (item.words || 0) <= options.maxWords
    );
  }

  if (Number.isFinite(options.minSize)) {
    results = results.filter(item =>
      item.size >= options.minSize
    );
  }

  if (Number.isFinite(options.maxSize)) {
    results = results.filter(item =>
      item.size <= options.maxSize
    );
  }

  const sorters = {
    name: (a, b) =>
      a.name.localeCompare(b.name, "de"),

    date: (a, b) =>
      (a.modified || a.created) -
      (b.modified || b.created),

    size: (a, b) => a.size - b.size,

    words: (a, b) =>
      (a.words || 0) - (b.words || 0)
  };

  const sort = options.sort || "date";
  const sorter = sorters[sort];

  if (!sorter) {
    throw new Error("Unbekannte Sortierung: " + sort);
  }

  results.sort(sorter);

  if (options.order !== "asc") {
    results.reverse();
  }

  if (Number.isFinite(options.limit)) {
    results = results.slice(
      0,
      Math.max(1, Math.min(100, options.limit))
    );
  }

  return results;
}

/* =========================================================
   32. FILTERSYSTEM
   ========================================================= */

function applyFilters() {
  let result = [...state.documents];

  if (state.favoritesOnly) {
    result = result.filter(
      documentData => documentData.favorite === true
    );
  }

  if (state.searchQuery) {
    try {
      result = LexikonSearch.search(result, state.searchQuery, {})
        .results.map(entry => entry.doc);
    } catch (error) {
      setStatus("Suche: " + error.message, "error");
      result = [];
    }
  }

  if (!state.searchQuery) result.sort((a, b) => (b.modified || b.created || 0) -
              (a.modified || a.created || 0)
  );

  state.filteredDocuments = result;

  renderDocuments(result);
  updateListTitle();
  emit("change");
}

/* =========================================================
   33. ÜBERSCHRIFT DER DOKUMENTENLISTE
   ========================================================= */

function updateListTitle() {
  if (!DOM.listTitle) return;

  if (state.favoritesOnly) {
    DOM.listTitle.textContent = "Merkliste";
  } else if (state.searchQuery) {
    DOM.listTitle.textContent = "Suchergebnisse";
  } else {
    DOM.listTitle.textContent = "Dokumentenbestand";
  }
}

/* =========================================================
   34. SUCHEREIGNISSE
   ========================================================= */

function initializeSearchEvents() {
  if (!DOM.search) return;

  let searchTimeout = null;

  DOM.search.addEventListener("input", event => {
    clearTimeout(searchTimeout);

    const value = event.target.value;

    searchTimeout = setTimeout(() => {
      setSearchQuery(value);
    }, 120);
  });
}

/* =========================================================
   35. FILTER ZURÜCKSETZEN
   ========================================================= */

function clearSearch() {
  state.searchQuery = "";

  if (DOM.search) {
    DOM.search.value = "";
  }

  applyFilters();

  setStatus("Suche zurückgesetzt.", "success");
}

/* =========================================================
   36. MERKLISTE – FAVORITEN UMSCHALTEN
   ========================================================= */

async function toggleFavorite(id) {
  const documentData = state.documents.find(
    item => item.id === id
  );

  if (!documentData) return;

  const previousValue = documentData.favorite;

  documentData.favorite = !previousValue;
  documentData.modified = Date.now();

  try {
    await dbSave(documentData);

    applyFilters();
    updateStatistics();

    setStatus(
      documentData.favorite
        ? "Dokument zur Merkliste hinzugefügt."
        : "Dokument aus der Merkliste entfernt.",
      "success"
    );

  } catch (error) {
    documentData.favorite = previousValue;

    console.error("Favorit konnte nicht gespeichert werden:", error);

    setStatus(
      "Favoritenänderung fehlgeschlagen: " + error.message,
      "error"
    );

    applyFilters();
  }
}

/* =========================================================
   37. MERKLISTE ANZEIGEN
   ========================================================= */

function showFavorites() {
  state.favoritesOnly = true;

  DOM.favoritesBtn?.classList.add("active");
  DOM.allBtn?.classList.remove("active");

  applyFilters();
}

/* =========================================================
   38. ALLE DOKUMENTE ANZEIGEN
   ========================================================= */

function showAllDocuments() {
  state.favoritesOnly = false;

  DOM.allBtn?.classList.add("active");
  DOM.favoritesBtn?.classList.remove("active");

  applyFilters();
}

/* =========================================================
   39. DOKUMENT LÖSCHEN
   ========================================================= */

async function deleteDocument(id) {
  const documentData = state.documents.find(
    item => item.id === id
  );

  if (!documentData) return;

  const confirmed = window.confirm(
    "Möchtest du dieses Dokument wirklich löschen?\n\n" +
    documentData.name +
    "\n\nDiese Aktion kann nicht rückgängig gemacht werden."
  );

  if (!confirmed) return false;

  try {
    await dbDelete(id);

    state.documents = state.documents.filter(
      item => item.id !== id
    );

    if (state.currentDocument?.id === id) {
      closeReader();
    }

    applyFilters();
    updateStatistics();

    setStatus(
  "Dokument gelöscht: " + documentData.name,
  "success"
);

return true;

  } catch (error) {
    console.error("Löschen fehlgeschlagen:", error);

    setStatus(
      "Dokument konnte nicht gelöscht werden: " +
      error.message,
      "error"
    );
  }
}

/* =========================================================
   40. STATISTIKEN AKTUALISIEREN
   ========================================================= */

function updateStatistics() {
  const documents = state.documents;

  const count = documents.length;

  const words = documents.reduce(
    (sum, documentData) =>
      sum + (documentData.words || 0),
    0
  );

  const size = documents.reduce(
    (sum, documentData) =>
      sum + (documentData.size || 0),
    0
  );

  if (DOM.count) {
    DOM.count.textContent =
      count.toLocaleString("de-DE");
  }

  if (DOM.words) {
    DOM.words.textContent =
      words.toLocaleString("de-DE");
  }

  if (DOM.size) {
    DOM.size.textContent = formatBytes(size);
  }

  if (DOM.storageInfo) {
    DOM.storageInfo.textContent =
      "IndexedDB · " +
      count.toLocaleString("de-DE") +
      " Dokumente · " +
      formatBytes(size);
  }
}

/* =========================================================
   41. DETAILSTATISTIK
   ========================================================= */

function showStatistics() {
  const documents = state.documents;

  const favorites = documents.filter(
    item => item.favorite
  ).length;

  const pdf = documents.filter(
    item => item.extension === "PDF"
  ).length;

  const docx = documents.filter(
    item => item.extension === "DOCX"
  ).length;

  const txt = documents.filter(
    item => item.extension === "TXT"
  ).length;

  const words = documents.reduce(
    (sum, item) => sum + (item.words || 0),
    0
  );

  const size = documents.reduce(
    (sum, item) => sum + (item.size || 0),
    0
  );

  const message = [
    "LEXIKON 5.0 – BIBLIOTHEKSSTATISTIK",
    "",
    "Gesamtdokumente: " + documents.length,
    "Merkliste: " + favorites,
    "",
    "DATEIFORMATE",
    "PDF: " + pdf,
    "DOCX: " + docx,
    "TXT: " + txt,
    "",
    "GESAMTUMFANG",
    "Wörter: " + words.toLocaleString("de-DE"),
    "Dateigröße: " + formatBytes(size)
  ].join("\n");

  window.alert(message);
}

/* =========================================================
   42. UI-EVENTS REGISTRIEREN
   ========================================================= */

function initializeLibraryEvents() {
  DOM.favoritesBtn?.addEventListener(
    "click",
    showFavorites
  );

  DOM.allBtn?.addEventListener(
    "click",
    showAllDocuments
  );

  DOM.clearSearchBtn?.addEventListener(
    "click",
    clearSearch
  );

  DOM.statsBtn?.addEventListener(
    "click",
    showStatistics
  );

  initializeSearchEvents();
}


/* =========================================================
   LEXIKON 5.0 – HYBRID LIBRARY
   APP.JS
   TEIL 4 VON 5
   Dokumentenleser · Backup · Restore · Navigation
   ========================================================= */


/* =========================================================
   43. DOKUMENTENLESER ÖFFNEN
   ========================================================= */

function renderReaderContent(documentData, query, flags) {
  const element = DOM.readerContent;
  const text = documentData.content || "";
  state.hitIndex = -1;
  element.scrollTop = 0;
  if (!text) {
    element.textContent =
      "Dieses Dokument enthält keinen extrahierbaren Text.";
    return;
  }
  let ranges = [];
  if (query) {
    try {
      ranges = LexikonSearch.highlightRanges(documentData, query, flags || {});
    } catch (error) {
      ranges = [];
    }
  }
  if (!ranges.length) {
    element.textContent = text;
    return;
  }
  const fragment = document.createDocumentFragment();
  let position = 0;
  for (const [start, end] of ranges.slice(0, 3000)) {
    if (start > position) fragment.append(text.slice(position, start));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(start, end);
    fragment.append(mark);
    position = end;
  }
  fragment.append(text.slice(position));
  element.replaceChildren(fragment);
}

function readerHit(step) {
  const marks = [...DOM.readerContent.querySelectorAll("mark")];
  if (!marks.length) return;
  marks.forEach(mark => mark.classList.remove("a"));
  state.hitIndex =
    ((state.hitIndex ?? -1) + step + marks.length) % marks.length;
  const current = marks[state.hitIndex];
  current.classList.add("a");
  current.scrollIntoView({ block: "center" });
  const info = document.getElementById("hitInfo");
  if (info) info.textContent = (state.hitIndex + 1) + " / " + marks.length;
}

function addHitNavigation() {
  const marks = DOM.readerContent?.querySelectorAll("mark") || [];
  if (!marks.length || !DOM.readerFooter) return;
  const box = document.createElement("span");
  box.className = "hitnav";
  const button = (label, step) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.setAttribute("aria-label", step < 0 ? "Voriger Treffer" : "Nächster Treffer");
    element.addEventListener("click", () => readerHit(step));
    return element;
  };
  const info = document.createElement("span");
  info.id = "hitInfo";
  box.append(button("◀", -1), info, button("▶", 1));
  DOM.readerFooter.append(" ", box);
  readerHit(1);
}

function migrateBackup(backup) {
  if (Array.isArray(backup) && !backup.documents) {
    const now = Date.now();
    backup.documents = backup
      .filter(entry => entry && typeof entry.name === "string")
      .map(entry => {
        const content = String(entry.text || "");
        return {
          id: "legacy-" + entry.name.toLowerCase(),
          name: entry.name,
          extension: getExtension(entry.name).toUpperCase(),
          type: "text/plain",
          size: Number(entry.size) || content.length,
          content,
          words: countWords(content),
          favorite: !!entry.fav,
          created: entry.mod || now,
          modified: entry.mod || now,
          imported: now,
          sourceModified: entry.mod || 0
        };
      });
  }
  return backup;
}

function openDocument(id, options = {}) {
  const documentData = state.documents.find(
    item => item.id === id
  );

  if (!documentData) {
    setStatus("Dokument wurde nicht gefunden.", "error");
    return;
  }

  state.currentDocument = documentData;

  if (DOM.readerTitle) {
    DOM.readerTitle.textContent = documentData.name;
  }

  if (DOM.readerContent) {
    renderReaderContent(
      documentData,
      options.query,
      options.flags
    );
  }

  if (DOM.readerFooter) {
    DOM.readerFooter.textContent =
      documentData.extension +
      " · " +
      formatBytes(documentData.size) +
      " · " +
      (documentData.words || 0).toLocaleString("de-DE") +
      " Wörter · Importiert am " +
      formatDate(documentData.imported || documentData.created);
  }

  updateReaderFavoriteButton();
  addHitNavigation();
  DOM.reader?.classList.add("open");
  DOM.reader?.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";

  DOM.readerClose?.focus();
}


/* =========================================================
   44. DOKUMENTENLESER SCHLIESSEN
   ========================================================= */

function closeReader() {
  if (!DOM.reader) return;

  DOM.reader.classList.remove("open");
  DOM.reader.setAttribute("aria-hidden", "true");

  document.body.style.overflow = "";

  state.currentDocument = null;

  DOM.switchTerminal?.focus();
}


/* =========================================================
   45. FAVORITENSTATUS IM LESER
   ========================================================= */

function updateReaderFavoriteButton() {
  const documentData = state.currentDocument;

  if (!documentData || !DOM.readerFavorite) {
    return;
  }

  DOM.readerFavorite.textContent =
    documentData.favorite
      ? "★ Gemerkt"
      : "☆ Merken";
}


/* =========================================================
   46. FAVORITEN IM LESER UMSCHALTEN
   ========================================================= */

async function toggleReaderFavorite() {
  if (!state.currentDocument) return;

  await toggleFavorite(state.currentDocument.id);

  const updatedDocument = state.documents.find(
    item => item.id === state.currentDocument?.id
  );

  if (updatedDocument) {
    state.currentDocument = updatedDocument;
    updateReaderFavoriteButton();
  }
}


/* =========================================================
   47. LESER-EVENTS
   ========================================================= */

function initializeReaderEvents() {
  DOM.readerClose?.addEventListener(
    "click",
    closeReader
  );

  DOM.readerFavorite?.addEventListener(
    "click",
    toggleReaderFavorite
  );

  DOM.reader?.addEventListener("click", event => {
    if (event.target === DOM.reader) {
      closeReader();
    }
  });

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      DOM.reader?.classList.contains("open")
    ) {
      closeReader();
    }
  });
}


/* =========================================================
   48. BACKUP ERSTELLEN
   ========================================================= */

async function createBackup() {
  try {
    setStatus("Sicherung wird vorbereitet …");

    const documents = await dbGetAll();

    const backup = {
      application: APP_CONFIG.name,
      version: APP_CONFIG.version,
      database: APP_CONFIG.database,
      created: new Date().toISOString(),
      documentCount: documents.length,
      documents: documents
    };

    const json = JSON.stringify(backup, null, 2);

    const blob = new Blob(
      [json],
      { type: "application/json;charset=utf-8" }
    );

    const date = new Date()
      .toISOString()
      .replace(/[:.]/g, "-");
    const fileName = "lexikon-backup-" + date + ".json";
    let shared = false;
    try {
      const file = new File([blob], fileName, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Lexikon Sicherung" });
        shared = true;
      }
    } catch (error) {
      if (error && error.name === "AbortError") {
        setStatus("Sicherung abgebrochen.");
        return;
      }
    }
    if (!shared) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    }

    setStatus(
      documents.length +
      " Dokument(e) erfolgreich gesichert.",
      "success"
    );

  } catch (error) {
    console.error("Backup fehlgeschlagen:", error);

    setStatus(
      "Sicherung fehlgeschlagen: " + error.message,
      "error"
    );
  }
}


/* =========================================================
   49. BACKUP-DATEI AUSWÄHLEN
   ========================================================= */

function openBackupPicker() {
  DOM.backupInput?.click();
}


/* =========================================================
   50. BACKUP-STRUKTUR VALIDIEREN
   ========================================================= */

function validateBackup(backup) {
  migrateBackup(backup);
  if (!backup || typeof backup !== "object") {
    throw new Error("Ungültige Sicherungsdatei.");
  }

  if (!Array.isArray(backup.documents)) {
    throw new Error(
      "Die Sicherung enthält keine gültige Dokumentenliste."
    );
  }

  for (const documentData of backup.documents) {
    if (
      !documentData ||
      typeof documentData !== "object" ||
      typeof documentData.id !== "string" ||
      typeof documentData.name !== "string" ||
      typeof documentData.content !== "string"
    ) {
      throw new Error(
        "Die Sicherungsdatei enthält einen ungültigen Dokumenteneintrag."
      );
    }

    if (
      !Number.isFinite(documentData.size) ||
      documentData.size < 0
    ) {
      throw new Error(
        "Ein Dokument besitzt eine ungültige Dateigröße."
      );
    }
  }

  return true;
}


/* =========================================================
   51. BACKUP WIEDERHERSTELLEN
   ========================================================= */

async function restoreBackup(file) {
  if (!file) return;

  if (state.importing) {
    setStatus(
      "Während eines Imports kann keine Wiederherstellung erfolgen.",
      "error"
    );
    return;
  }

  try {
    if (file.size > 250 * 1024 * 1024) {
      throw new Error(
        "Die Sicherungsdatei überschreitet 250 MB."
      );
    }

    setStatus("Sicherung wird eingelesen …");

    const content = await readFileAsText(file);

    const backup = JSON.parse(content);

    validateBackup(backup);

    const confirmed = window.confirm(
      "Sicherung wiederherstellen?\n\n" +
      "Enthaltene Dokumente: " +
      backup.documents.length +
      "\n\n" +
      "Ja: Vorhandene Bibliothek ergänzen bzw. aktualisieren.\n" +
      "Nein: Vorgang abbrechen."
    );

    if (!confirmed) {
      setStatus("Wiederherstellung abgebrochen.");
      return;
    }

    let restored = 0;

    for (const documentData of backup.documents) {
      await dbSave(documentData);
      restored++;
    }

    await loadDocuments();

    setStatus(
      restored +
      " Dokument(e) erfolgreich wiederhergestellt.",
      "success"
    );

  } catch (error) {
    console.error(
      "Wiederherstellung fehlgeschlagen:",
      error
    );

    setStatus(
      "Wiederherstellung fehlgeschlagen: " +
      error.message,
      "error"
    );

  } finally {
    if (DOM.backupInput) {
      DOM.backupInput.value = "";
    }
  }
}


/* =========================================================
   52. BACKUP-EVENTS
   ========================================================= */

function initializeBackupEvents() {
  DOM.backupBtn?.addEventListener(
    "click",
    createBackup
  );

  DOM.restoreBtn?.addEventListener(
    "click",
    openBackupPicker
  );

  DOM.backupInput?.addEventListener(
    "change",
    event => {
      const file = event.target.files?.[0];

      if (file) {
        restoreBackup(file);
      }
    }
  );
}


/* =========================================================
   53. GLOBALE TASTATURSTEUERUNG
   ========================================================= */

function initializeKeyboardEvents() {
  document.addEventListener("keydown", event => {
    const terminalActive =
      document.getElementById("terminal")
        ?.classList.contains("active");

    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "k"
    ) {
      event.preventDefault();

      if (!terminalActive) {
        DOM.search?.focus();
        DOM.search?.select();
      }
    }
  });
}


/* =========================================================
   54. UI-ZUSTAND INITIALISIEREN
   ========================================================= */

function initializeApplicationEvents() {
  initializeImportEvents();
  initializeLibraryEvents();
  initializeReaderEvents();
  initializeBackupEvents();
  initializeKeyboardEvents();
}

/* =========================================================
   LEXIKON 5.0 – HYBRID LIBRARY
   APP.JS
   TEIL 5 VON 5
   Terminalnavigation · Abschluss · Anwendungsstart
   ========================================================= */


/* =========================================================
   55. TERMINAL-REFERENZEN
   ========================================================= */

function getTerminalElements() {
  return {
    terminal: document.getElementById("terminal"),
    app: document.getElementById("app"),
    switchTerminal: DOM.switchTerminal,
    sideTerminalBtn: DOM.sideTerminalBtn
  };
}


/* =========================================================
   56. ZWISCHEN BIBLIOTHEK UND TERMINAL WECHSELN
   ========================================================= */

function switchView(target) {
  const terminal = document.getElementById("terminal");
  const app = document.getElementById("app");

  if (!terminal || !app) {
    setStatus(
      "Bibliothek oder Terminal wurde nicht gefunden.",
      "error"
    );
    return;
  }

  if (target === "terminal") {
    app.classList.remove("active");
    terminal.classList.add("active");

    terminal.setAttribute("aria-hidden", "false");
    app.setAttribute("aria-hidden", "true");

    document.body.classList.add("terminal-mode");
    app.inert = true;
    terminal.inert = false;

  } else {
    terminal.classList.remove("active");
    app.classList.add("active");

    terminal.setAttribute("aria-hidden", "true");
    app.setAttribute("aria-hidden", "false");

    document.body.classList.remove("terminal-mode");
    app.inert = false;
    terminal.inert = true;
    DOM.search?.focus();
  }
  state.view = target === "terminal" ? "terminal" : "library";
  emit("view");
  document.dispatchEvent(new CustomEvent("lexikon:view", { detail: state.view }));
}


/* =========================================================
   57. TERMINALNAVIGATION INITIALISIEREN
   ========================================================= */

function initializeTerminalNavigation() {
  document.getElementById("switchGUI")?.addEventListener("click", () => {
    switchView("library");
  });
  document.addEventListener("keydown", event => {
    const readerOpen = DOM.reader?.classList.contains("open");
    if (event.key === "Escape" && !readerOpen && state.view === "terminal") {
      switchView("library");
    }
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "t") {
      event.preventDefault();
      switchView(state.view === "terminal" ? "library" : "terminal");
    }
  });
  DOM.switchTerminal?.addEventListener("click", () => {
    switchView("terminal");
  });

  DOM.sideTerminalBtn?.addEventListener("click", () => {
    switchView("terminal");
  });

  const backButtons = document.querySelectorAll(
    "[data-back-to-library]"
  );

  backButtons.forEach(button => {
    button.addEventListener("click", () => {
      switchView("library");
    });
  });

  const terminalButtons = document.querySelectorAll(
    "[data-open-terminal]"
  );

  terminalButtons.forEach(button => {
    button.addEventListener("click", () => {
      switchView("terminal");
    });
  });
}


/* =========================================================
   58. ANWENDUNGSZUSTAND PRÜFEN
   ========================================================= */

function validateApplicationStructure() {
  const requiredElements = [
    "app",
    "documents",
    "fileInput",
    "search"
  ];

  const missing = requiredElements.filter(
    id => !DOM[id]
  );

  if (missing.length) {
    console.warn(
      "Einige Anwendungselemente fehlen:",
      missing
    );
  }

  return missing.length === 0;
}


/* =========================================================
   59. FEHLERBEHANDLUNG
   ========================================================= */

function initializeErrorHandling() {
  window.addEventListener("error", event => {
    console.error(
      "Anwendungsfehler:",
      event.error || event.message
    );

    if (DOM.status) {
      setStatus(
        "Ein unerwarteter Anwendungsfehler ist aufgetreten.",
        "error"
      );
    }
  });

  window.addEventListener(
    "unhandledrejection",
    event => {
      console.error(
        "Nicht behandelter asynchroner Fehler:",
        event.reason
      );

      if (DOM.status) {
        setStatus(
          "Ein Hintergrundvorgang ist fehlgeschlagen.",
          "error"
        );
      }
    }
  );
}


/* =========================================================
   60. INITIALISIERUNGSSTATUS
   ========================================================= */

function updateApplicationStatus() {
  if (!state.initialized) {
    setStatus(
      "Lexikon konnte nicht vollständig initialisiert werden.",
      "error"
    );

    return;
  }

  setStatus(
    "Lexikon 5.0 ist einsatzbereit.",
    "success"
  );
}


/* =========================================================
   61. ALLE ANWENDUNGSEVENTS REGISTRIEREN
   ========================================================= */

function initializeAllEvents() {
  initializeApplicationEvents();
  initializeTerminalNavigation();
  initializeErrorHandling();
}


/* =========================================================
   62. ANWENDUNG STARTEN
   ========================================================= */

async function startApplication() {
  try {
    cacheDOM();

    validateApplicationStructure();

    initializeAllEvents();

    await initializeApp();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
    navigator.storage?.persist?.();

    updateApplicationStatus();

    console.info(
      "========================================"
    );

    console.info(
      "LEXIKON 5.0 – HYBRID LIBRARY"
    );

    console.info(
      "Anwendung erfolgreich gestartet."
    );

    console.info(
      "Dokumente:",
      state.documents.length
    );

    console.info(
      "Datenbank:",
      APP_CONFIG.database
    );

    console.info(
      "========================================"
    );

  } catch (error) {
    console.error(
      "Start der Anwendung fehlgeschlagen:",
      error
    );

    setStatus(
      "Startfehler: " + error.message,
      "error"
    );
  }
}


/* =========================================================
   63. AUTOMATISCHER ANWENDUNGSSTART
   ========================================================= */

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    startApplication,
    { once: true }
  );
} else {
  startApplication();
}


/* =========================================================
   64. OPTIONALE GLOBALE SCHNITTSTELLE
   ========================================================= */


window.Lexikon = Object.freeze({
  version: APP_CONFIG.version,
  apiVersion: 2,
  search(query, flags = {}) {
    return LexikonSearch.search(state.documents, query, flags);
  },
  on(name, callback) {
    BUS.addEventListener(name, callback);
  },
  getView() {
    return state.view || "library";
  },
  openFilePicker() {
    openFilePicker();
  },
  openBackupPicker() {
    openBackupPicker();
  },
  importFiles(files) {
    return importFiles(files);
  },

  getDocuments() {
    return [...state.documents];
  },

  getStatistics() {
    return {
      documents: state.documents.length,

      favorites: state.documents.filter(
        item => item.favorite
      ).length,

      words: state.documents.reduce(
        (sum, item) => sum + (item.words || 0),
        0
      ),

      size: state.documents.reduce(
        (sum, item) => sum + (item.size || 0),
        0
      )
    };
  },

  searchDocuments(query, options = {}) {
    return findDocuments(query, options);
  },

  countWords(text) {
    return countWords(text);
  },

  formatBytes(bytes) {
    return formatBytes(bytes);
  },

  async refresh() {
    return loadDocuments();
  },

  async toggleFavorite(id) {
    return toggleFavorite(id);
  },

  async deleteDocument(id) {
    return deleteDocument(id);
  },

  openDocument(id, options) {
    return openDocument(id, options || {});
  },

  showAll() {
    showAllDocuments();
  },

  showFavorites() {
    showFavorites();
  },

  createBackup() {
    return createBackup();
  },

  switchView(target) {
    switchView(target);
  }
});



