/* sheets.js – přihlášení přes Google Identity Services (GIS) a práce
   s Google Sheets API v4. Žádný backend, žádný client secret.

   Veřejné API tohoto souboru: window.Sheets
     Sheets.getConfig() / saveConfig() / isConfigured()
     Sheets.initAuth()          – připraví token client (až je GIS načtené)
     Sheets.signIn(interactive) – vyžádá access token
     Sheets.signOut()
     Sheets.hasToken()
     Sheets.listRows()          – načte všechny záznamy
     Sheets.appendRow(rec)
     Sheets.updateRow(rowNumber, rec)
     Sheets.deleteRow(rowNumber)
   Chyby házíme jako Error s vlastností .code ("auth" | "access" | "notfound"
   | "sheet" | "network" | "http"), ať je appka umí přeložit do češtiny. */

(function () {
  "use strict";

  var SCOPE = "https://www.googleapis.com/auth/spreadsheets";
  var API = "https://sheets.googleapis.com/v4/spreadsheets";
  var LS_CONFIG = "najem.config";

  var tokenClient = null;
  var accessToken = null;
  var tokenExpiry = 0;
  var sheetIdCache = null;      // gid listu "Payments"
  var sheetIdCacheFor = null;   // pro kterou kombinaci spreadsheetId+sheetName

  /* ---------- konfigurace ---------- */

  function baseConfig() {
    var c = window.NAJEM_CONFIG || {};
    return {
      clientId: c.CLIENT_ID || "",
      spreadsheetId: c.SPREADSHEET_ID || "",
      sheetName: c.SHEET_NAME || "Payments",
    };
  }

  function getConfig() {
    var cfg = baseConfig();
    try {
      var saved = JSON.parse(localStorage.getItem(LS_CONFIG) || "null");
      if (saved) {
        if (saved.clientId) cfg.clientId = saved.clientId;
        if (saved.spreadsheetId) cfg.spreadsheetId = saved.spreadsheetId;
        if (saved.sheetName) cfg.sheetName = saved.sheetName;
      }
    } catch (e) { /* localStorage může být zakázané */ }
    return cfg;
  }

  function saveConfig(cfg) {
    // Uživatel může omylem vložit celou URL tabulky – vytáhneme z ní ID.
    var id = String(cfg.spreadsheetId || "").trim();
    var m = id.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (m) id = m[1];

    var out = {
      clientId: String(cfg.clientId || "").trim(),
      spreadsheetId: id,
      sheetName: String(cfg.sheetName || "Payments").trim() || "Payments",
    };
    try { localStorage.setItem(LS_CONFIG, JSON.stringify(out)); } catch (e) {}
    tokenClient = null;      // client ID se mohlo změnit
    sheetIdCache = null;
    return out;
  }

  function isConfigured() {
    var c = getConfig();
    return !!(c.clientId && c.spreadsheetId);
  }

  /* ---------- autentizace ---------- */

  function gisReady() {
    return !!(window.google && google.accounts && google.accounts.oauth2);
  }

  // Počká, než se doloaduje skript GIS (je načtený s async defer).
  function waitForGis(timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (gisReady()) return resolve();
      var waited = 0;
      var step = 100;
      var t = setInterval(function () {
        if (gisReady()) { clearInterval(t); resolve(); return; }
        waited += step;
        if (waited >= (timeoutMs || 10000)) {
          clearInterval(t);
          var err = new Error("Nepodařilo se načíst přihlašovací knihovnu Google.");
          err.code = "network";
          reject(err);
        }
      }, step);
    });
  }

  function ensureTokenClient() {
    if (tokenClient) return;
    var cfg = getConfig();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: SCOPE,
      callback: function () {}, // nastavuje se před každým requestem
    });
  }

  /* Vyžádá access token.
     interactive=false zkusí tichý pokus (bez kliknutí) – použijeme při startu,
     ať se uživatel nemusí přihlašovat pokaždé znovu. */
  function signIn(interactive) {
    return waitForGis().then(function () {
      ensureTokenClient();
      return new Promise(function (resolve, reject) {
        tokenClient.callback = function (resp) {
          if (resp && resp.access_token) {
            accessToken = resp.access_token;
            // expires_in bývá 3599 s; ubereme minutu jako rezervu
            var ttl = (parseInt(resp.expires_in, 10) || 3600) - 60;
            tokenExpiry = Date.now() + ttl * 1000;
            resolve(accessToken);
          } else {
            var err = new Error("Přihlášení se nezdařilo.");
            err.code = "auth";
            reject(err);
          }
        };
        tokenClient.error_callback = function (e) {
          var err = new Error((e && e.type) || "Přihlášení bylo zrušeno.");
          err.code = "auth";
          err.silent = !interactive;
          reject(err);
        };
        try {
          tokenClient.requestAccessToken({ prompt: interactive ? "" : "none" });
        } catch (e) {
          var err2 = new Error("Přihlášení se nepodařilo spustit.");
          err2.code = "auth";
          reject(err2);
        }
      });
    });
  }

  function hasToken() {
    return !!accessToken && Date.now() < tokenExpiry;
  }

  function signOut() {
    var t = accessToken;
    accessToken = null;
    tokenExpiry = 0;
    sheetIdCache = null;
    if (t && gisReady()) {
      try { google.accounts.oauth2.revoke(t, function () {}); } catch (e) {}
    }
  }

  /* ---------- HTTP vrstva ---------- */

  function apiFetch(url, options) {
    if (!hasToken()) {
      var e = new Error("Přihlášení vypršelo.");
      e.code = "auth";
      return Promise.reject(e);
    }
    var opts = options || {};
    opts.headers = Object.assign({}, opts.headers, {
      Authorization: "Bearer " + accessToken,
    });
    if (opts.body) opts.headers["Content-Type"] = "application/json";

    return fetch(url, opts).then(function (res) {
      if (res.ok) return res.status === 204 ? null : res.json();
      return res.text().then(function (text) {
        var msg = text;
        try { msg = JSON.parse(text).error.message || text; } catch (e) {}
        var err = new Error(msg);
        if (res.status === 401) {
          err.code = "auth";
          accessToken = null;
          tokenExpiry = 0;
        } else if (res.status === 403) {
          err.code = "access";
        } else if (res.status === 404) {
          err.code = "notfound";
        } else if (/Unable to parse range|not found/i.test(msg)) {
          err.code = "sheet";
        } else {
          err.code = "http";
        }
        err.status = res.status;
        throw err;
      });
    }, function () {
      var err = new Error("Nepodařilo se spojit se serverem.");
      err.code = "network";
      throw err;
    });
  }

  /* ---------- mapování řádků ---------- */

  var COLS = 10; // A..J

  function bool(v) {
    return String(v).trim().toUpperCase() === "TRUE";
  }

  function rowToRecord(row, rowNumber) {
    var r = row || [];
    function at(i) { return r[i] === undefined || r[i] === null ? "" : String(r[i]).trim(); }
    return {
      rowNumber: rowNumber,
      id: at(0),
      monthKey: at(1),
      amount: at(2),
      note: at(3),
      landlordConfirmed: bool(at(4)),
      landlordConfirmedAt: at(5),
      tenantConfirmed: bool(at(6)),
      tenantConfirmedAt: at(7),
      createdAt: at(8),
      createdBy: at(9),
    };
  }

  function recordToRow(rec) {
    return [
      rec.id,
      rec.monthKey,
      rec.amount === null || rec.amount === undefined ? "" : String(rec.amount),
      rec.note || "",
      rec.landlordConfirmed ? "TRUE" : "FALSE",
      rec.landlordConfirmedAt || "",
      rec.tenantConfirmed ? "TRUE" : "FALSE",
      rec.tenantConfirmedAt || "",
      rec.createdAt || "",
      rec.createdBy || "",
    ];
  }

  function range(a1) {
    var cfg = getConfig();
    return encodeURIComponent("'" + cfg.sheetName.replace(/'/g, "''") + "'!" + a1);
  }

  function sheetUrl(path) {
    return API + "/" + encodeURIComponent(getConfig().spreadsheetId) + path;
  }

  /* ---------- operace ---------- */

  /* Načte všechny záznamy. Řádek 1 je hlavička, takže data začínají na A2
     a číslo řádku záznamu = index + 2. */
  function listRows() {
    return apiFetch(sheetUrl("/values/" + range("A2:J")))
      .then(function (data) {
        var rows = (data && data.values) || [];
        var out = [];
        for (var i = 0; i < rows.length; i++) {
          var rec = rowToRecord(rows[i], i + 2);
          if (rec.id) out.push(rec); // přeskoč prázdné řádky
        }
        return out;
      });
  }

  function appendRow(rec) {
    var url = sheetUrl("/values/" + range("A:J") +
      ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS");
    return apiFetch(url, {
      method: "POST",
      body: JSON.stringify({ values: [recordToRow(rec)] }),
    });
  }

  function updateRow(rowNumber, rec) {
    var url = sheetUrl("/values/" + range("A" + rowNumber + ":J" + rowNumber) +
      "?valueInputOption=RAW");
    return apiFetch(url, {
      method: "PUT",
      body: JSON.stringify({ values: [recordToRow(rec)] }),
    });
  }

  /* Zjistí gid listu – potřebné pro skutečné smazání řádku. */
  function getSheetId() {
    var cfg = getConfig();
    var key = cfg.spreadsheetId + "|" + cfg.sheetName;
    if (sheetIdCache !== null && sheetIdCacheFor === key) {
      return Promise.resolve(sheetIdCache);
    }
    return apiFetch(sheetUrl("?fields=sheets.properties(sheetId,title)"))
      .then(function (data) {
        var sheets = (data && data.sheets) || [];
        for (var i = 0; i < sheets.length; i++) {
          if (sheets[i].properties.title === cfg.sheetName) {
            sheetIdCache = sheets[i].properties.sheetId;
            sheetIdCacheFor = key;
            return sheetIdCache;
          }
        }
        var err = new Error("List \"" + cfg.sheetName + "\" v tabulce není.");
        err.code = "sheet";
        throw err;
      });
  }

  function deleteRow(rowNumber) {
    return getSheetId().then(function (gid) {
      return apiFetch(sheetUrl(":batchUpdate"), {
        method: "POST",
        body: JSON.stringify({
          requests: [{
            deleteDimension: {
              range: {
                sheetId: gid,
                dimension: "ROWS",
                startIndex: rowNumber - 1, // 0-based, horní mez exkluzivní
                endIndex: rowNumber,
              },
            },
          }],
        }),
      });
    });
  }

  window.Sheets = {
    SCOPE: SCOPE,
    getConfig: getConfig,
    saveConfig: saveConfig,
    isConfigured: isConfigured,
    waitForGis: waitForGis,
    signIn: signIn,
    signOut: signOut,
    hasToken: hasToken,
    listRows: listRows,
    appendRow: appendRow,
    updateRow: updateRow,
    deleteRow: deleteRow,
    COLS: COLS,
  };
})();
