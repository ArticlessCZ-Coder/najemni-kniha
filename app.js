/* app.js – UI a logika Nájemní knihy. */

(function () {
  "use strict";

  var LS_ROLE = "najem.role";

  var ROLES = {
    landlord: { label: "Pronajímatel", short: "pronajímatel" },
    tenant: { label: "Podnájemník", short: "podnájemník" },
  };

  var MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

  var state = {
    role: null,
    records: [],
    loading: false,
    pendingDelete: null, // id záznamu, u kterého čekáme na druhé kliknutí
    deleteTimer: null,
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- pomocné ---------- */

  function formatMonth(monthKey) {
    var m = /^(\d{4})-(\d{2})$/.exec(monthKey || "");
    if (!m) return monthKey || "—";
    var idx = parseInt(m[2], 10) - 1;
    return (MONTHS[idx] || m[2]) + " " + m[1];
  }

  function formatAmount(amount) {
    var n = parseFloat(String(amount).replace(/\s/g, "").replace(",", "."));
    if (!isFinite(n) || String(amount).trim() === "") return null;
    return n.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč";
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("cs-CZ", {
      day: "numeric", month: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function newId() {
    return Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 8);
  }

  function currentMonthKey() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  /* ---------- hlášky ---------- */

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function showBanner(title, text, kind) {
    var el = $("banner");
    el.innerHTML = "";
    var s = document.createElement("strong");
    s.textContent = title;
    el.appendChild(s);
    el.appendChild(document.createTextNode(text || ""));
    el.className = "banner" + (kind === "info" ? " info" : "");
    el.hidden = false;
  }

  function clearBanner() { $("banner").hidden = true; }

  /* Převede chybu z API na srozumitelnou hlášku. Vrací true, pokud
     kvůli chybě musíme uživatele poslat na přihlašovací obrazovku. */
  function reportError(err, action) {
    var code = err && err.code;
    var detail = (err && err.message) ? " (" + err.message + ")" : "";

    if (code === "auth") {
      showBanner("Přihlášení vypršelo. ",
        "Přihlas se prosím znovu, jinak se data nenačtou ani neuloží.");
      render();
      return true;
    }
    if (code === "access") {
      showBanner("Nemáš přístup k tabulce. ",
        "Přihlášený účet nemá tuhle tabulku nasdílenou, nebo v Google Cloud " +
        "není povolené Google Sheets API." + detail);
    } else if (code === "notfound") {
      showBanner("Tabulka nenalezena. ",
        "Zkontroluj ID tabulky v nastavení (⚙ → Změnit připojení k tabulce).");
    } else if (code === "sheet") {
      showBanner("List se nenašel. ",
        "V tabulce musí být list pojmenovaný \"" + Sheets.getConfig().sheetName +
        "\". Zkontroluj název dole na kartě listu.");
    } else if (code === "network") {
      showBanner("Nejsi online. ",
        "Bez internetu se s tabulkou nedá synchronizovat. Zkus to znovu, až " +
        "budeš mít signál.");
    } else {
      showBanner("Něco se nepovedlo" + (action ? " – " + action + ". " : ". "),
        (err && err.message) || "Neznámá chyba.");
    }
    return false;
  }

  /* ---------- přepínání obrazovek ---------- */

  function render() {
    var configured = Sheets.isConfigured();
    var hasRole = !!state.role;
    var signedIn = Sheets.hasToken();

    show("viewSetup", !configured);
    show("viewRole", configured && !hasRole);
    show("viewAuth", configured && hasRole && !signedIn);
    show("viewApp", configured && hasRole && signedIn);

    $("btnRefresh").hidden = !(configured && hasRole && signedIn);
    $("btnSetupCancel").hidden = !configured;

    $("roleLabel").textContent = state.role ? ROLES[state.role].label : "";

    if (configured && hasRole && signedIn) renderList();
  }

  function show(id, visible) { $(id).hidden = !visible; }

  /* ---------- vykreslení seznamu ---------- */

  function renderList() {
    var list = $("list");
    var recs = state.records.slice().sort(function (a, b) {
      if (a.monthKey === b.monthKey) {
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
      return b.monthKey.localeCompare(a.monthKey);
    });

    // statistiky
    var done = 0, wait = 0, sum = 0;
    recs.forEach(function (r) {
      if (r.landlordConfirmed && r.tenantConfirmed) {
        done++;
        var n = parseFloat(String(r.amount).replace(/\s/g, "").replace(",", "."));
        if (isFinite(n)) sum += n;
      } else {
        wait++;
      }
    });
    $("statDone").textContent = done;
    $("statWait").textContent = wait;
    $("statSum").textContent = sum > 0
      ? sum.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč"
      : "—";

    list.innerHTML = "";
    $("empty").hidden = recs.length > 0 || state.loading;

    recs.forEach(function (rec) { list.appendChild(renderEntry(rec)); });
  }

  function renderEntry(rec) {
    var isDone = rec.landlordConfirmed && rec.tenantConfirmed;

    var el = document.createElement("article");
    el.className = "entry " + (isDone ? "is-done" : "is-wait");

    var head = document.createElement("div");
    head.className = "entry-head";

    var month = document.createElement("span");
    month.className = "entry-month";
    month.textContent = formatMonth(rec.monthKey);
    head.appendChild(month);

    var pill = document.createElement("span");
    pill.className = "pill " + (isDone ? "pill-done" : "pill-wait");
    pill.textContent = isDone ? "✓ Potvrzeno oběma" : "Čeká na potvrzení";
    head.appendChild(pill);

    var amount = document.createElement("span");
    var amountText = formatAmount(rec.amount);
    amount.className = "entry-amount" + (amountText ? "" : " none");
    amount.textContent = amountText || "bez částky";
    head.appendChild(amount);

    el.appendChild(head);

    if (rec.note) {
      var note = document.createElement("p");
      note.className = "entry-note";
      note.textContent = "„" + rec.note + "“";
      el.appendChild(note);
    }

    var sides = document.createElement("div");
    sides.className = "sides";
    sides.appendChild(renderSide(rec, "landlord"));
    sides.appendChild(renderSide(rec, "tenant"));
    el.appendChild(sides);

    var foot = document.createElement("div");
    foot.className = "entry-foot";

    var meta = document.createElement("span");
    meta.className = "entry-meta";
    meta.textContent = "Zapsal: " +
      (ROLES[rec.createdBy] ? ROLES[rec.createdBy].short : "?") +
      (rec.createdAt ? " · " + formatDateTime(rec.createdAt) : "");
    foot.appendChild(meta);

    var del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-sm btn-danger";
    del.textContent = state.pendingDelete === rec.id ? "Opravdu smazat?" : "Smazat";
    del.addEventListener("click", function () { onDelete(rec); });
    foot.appendChild(del);

    el.appendChild(foot);
    return el;
  }

  function renderSide(rec, side) {
    var confirmed = side === "landlord" ? rec.landlordConfirmed : rec.tenantConfirmed;
    var at = side === "landlord" ? rec.landlordConfirmedAt : rec.tenantConfirmedAt;
    var isMe = state.role === side;

    var row = document.createElement("div");
    row.className = "side" + (confirmed ? " ok" : "");

    var box = document.createElement("span");
    box.className = "side-box";
    box.textContent = "✓";
    box.setAttribute("aria-hidden", "true");
    row.appendChild(box);

    var text = document.createElement("span");
    text.className = "side-text";

    var who = document.createElement("span");
    who.className = "side-who";
    who.textContent = ROLES[side].label;
    if (isMe) {
      var you = document.createElement("span");
      you.className = "you";
      you.textContent = " · ty";
      who.appendChild(you);
    }
    text.appendChild(who);

    var when = document.createElement("span");
    when.className = "side-when";
    when.textContent = confirmed
      ? "Potvrzeno " + formatDateTime(at)
      : "Zatím nepotvrzeno";
    text.appendChild(when);
    row.appendChild(text);

    if (isMe && !confirmed) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm btn-primary";
      btn.textContent = "Potvrzuji";
      btn.addEventListener("click", function () { onConfirm(rec, side, btn); });
      row.appendChild(btn);
    }

    return row;
  }

  /* ---------- akce ---------- */

  function setBusy(busy) {
    state.loading = busy;
    $("btnRefresh").classList.toggle("spin", busy);
  }

  function load(quiet) {
    if (!Sheets.hasToken()) { render(); return Promise.resolve(); }
    setBusy(true);
    if (!quiet) $("syncInfo").textContent = "Načítám z tabulky…";
    return Sheets.listRows().then(function (recs) {
      state.records = recs;
      clearBanner();
      $("syncInfo").textContent = "Naposledy načteno " +
        new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
      setBusy(false);
      renderList();
    }).catch(function (err) {
      setBusy(false);
      $("syncInfo").textContent = "";
      reportError(err, "načítání záznamů");
    });
  }

  function onAdd(e) {
    e.preventDefault();
    var monthKey = $("inMonth").value;
    if (!monthKey) { toast("Vyber měsíc."); return; }

    var amountRaw = $("inAmount").value.trim();
    var note = $("inNote").value.trim();

    if (state.records.some(function (r) { return r.monthKey === monthKey; })) {
      if (!window.confirm("Měsíc " + formatMonth(monthKey) +
        " už v knize je. Přidat ještě jeden záznam?")) return;
    }

    var rec = {
      id: newId(),
      monthKey: monthKey,
      amount: amountRaw,
      note: note,
      landlordConfirmed: false,
      landlordConfirmedAt: "",
      tenantConfirmed: false,
      tenantConfirmedAt: "",
      createdAt: new Date().toISOString(),
      createdBy: state.role,
    };

    var btn = $("btnAdd");
    btn.disabled = true;
    btn.textContent = "Zapisuji…";

    Sheets.appendRow(rec).then(function () {
      $("formEntry").reset();
      $("inMonth").value = currentMonthKey();
      $("addCard").open = false;
      toast("Záznam zapsán.");
      return load(true);
    }).catch(function (err) {
      reportError(err, "zápis záznamu");
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Zapsat do knihy";
    });
  }

  /* Potvrzení vlastní strany. Před zápisem načteme aktuální stav tabulky,
     ať nepřepíšeme změnu, kterou mezitím udělala druhá strana. */
  function onConfirm(rec, side, btn) {
    btn.disabled = true;
    btn.textContent = "Potvrzuji…";

    Sheets.listRows().then(function (fresh) {
      state.records = fresh;
      var target = null;
      for (var i = 0; i < fresh.length; i++) {
        if (fresh[i].id === rec.id) { target = fresh[i]; break; }
      }
      if (!target) {
        toast("Záznam už v tabulce není – nejspíš ho druhá strana smazala.");
        renderList();
        return;
      }
      if (side === "landlord" ? target.landlordConfirmed : target.tenantConfirmed) {
        renderList();
        return;
      }

      var now = new Date().toISOString();
      if (side === "landlord") {
        target.landlordConfirmed = true;
        target.landlordConfirmedAt = now;
      } else {
        target.tenantConfirmed = true;
        target.tenantConfirmedAt = now;
      }

      return Sheets.updateRow(target.rowNumber, target).then(function () {
        clearBanner();
        renderList();
        toast(target.landlordConfirmed && target.tenantConfirmed
          ? "Hotovo – potvrzeno oběma stranami."
          : "Potvrzeno. Čeká se na druhou stranu.");
      });
    }).catch(function (err) {
      reportError(err, "potvrzení platby");
      renderList();
    });
  }

  function onDelete(rec) {
    if (state.pendingDelete !== rec.id) {
      state.pendingDelete = rec.id;
      clearTimeout(state.deleteTimer);
      state.deleteTimer = setTimeout(function () {
        state.pendingDelete = null;
        renderList();
      }, 4000);
      renderList();
      return;
    }

    clearTimeout(state.deleteTimer);
    state.pendingDelete = null;

    // Číslo řádku najdeme znovu – mohlo se posunout po smazání jiného řádku.
    Sheets.listRows().then(function (fresh) {
      var target = null;
      for (var i = 0; i < fresh.length; i++) {
        if (fresh[i].id === rec.id) { target = fresh[i]; break; }
      }
      if (!target) {
        state.records = fresh;
        renderList();
        toast("Záznam už v tabulce nebyl.");
        return;
      }
      return Sheets.deleteRow(target.rowNumber).then(function () {
        toast("Záznam smazán.");
        return load(true);
      });
    }).catch(function (err) {
      reportError(err, "mazání záznamu");
      renderList();
    });
  }

  function doSignIn() {
    var btn = $("btnSignIn");
    btn.disabled = true;
    btn.textContent = "Otevírám přihlášení…";
    clearBanner();

    Sheets.signIn(true).then(function () {
      render();
      return load();
    }).catch(function (err) {
      showBanner("Přihlášení se nepodařilo. ",
        "Zkontroluj, že je v Google Cloud Console mezi \"Authorized " +
        "JavaScript origins\" adresa " + location.origin + " a že Client ID " +
        "v nastavení sedí." +
        (err && err.message ? " (" + err.message + ")" : ""));
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Přihlásit se Google účtem";
    });
  }

  /* ---------- nastavení / menu ---------- */

  function openMenu() {
    var cfg = Sheets.getConfig();
    $("menuAccount").textContent = Sheets.hasToken()
      ? "Jsi přihlášený/á. Role na tomhle zařízení: " +
        (state.role ? ROLES[state.role].label : "nevybraná") + "."
      : "Nejsi přihlášený/á.";
    $("btnOpenSheet").hidden = !cfg.spreadsheetId;
    $("menu").hidden = false;
  }

  function closeMenu() { $("menu").hidden = true; }

  function fillSetupForm() {
    var cfg = Sheets.getConfig();
    $("inClientId").value = cfg.clientId;
    $("inSheetId").value = cfg.spreadsheetId;
    $("inSheetName").value = cfg.sheetName;
  }

  /* ---------- start ---------- */

  function wire() {
    $("formSetup").addEventListener("submit", function (e) {
      e.preventDefault();
      Sheets.saveConfig({
        clientId: $("inClientId").value,
        spreadsheetId: $("inSheetId").value,
        sheetName: $("inSheetName").value,
      });
      clearBanner();
      toast("Připojení uloženo.");
      render();
      if (Sheets.isConfigured() && state.role) trySilentSignIn();
    });

    $("btnSetupCancel").addEventListener("click", function () {
      fillSetupForm();
      render();
    });

    document.querySelectorAll(".role-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.role = btn.dataset.role;
        try { localStorage.setItem(LS_ROLE, state.role); } catch (e) {}
        render();
        if (!Sheets.hasToken()) trySilentSignIn();
      });
    });

    $("btnSignIn").addEventListener("click", doSignIn);
    $("formEntry").addEventListener("submit", onAdd);
    $("btnRefresh").addEventListener("click", function () { load(); });

    $("btnMenu").addEventListener("click", openMenu);
    $("btnMenuClose").addEventListener("click", closeMenu);
    $("menu").addEventListener("click", function (e) {
      if (e.target === $("menu")) closeMenu();
    });

    $("btnChangeRole").addEventListener("click", function () {
      state.role = null;
      try { localStorage.removeItem(LS_ROLE); } catch (e) {}
      closeMenu();
      render();
    });

    $("btnChangeConn").addEventListener("click", function () {
      fillSetupForm();
      closeMenu();
      show("viewSetup", true);
      show("viewApp", false);
      show("viewAuth", false);
      show("viewRole", false);
      $("btnSetupCancel").hidden = false;
    });

    $("btnOpenSheet").addEventListener("click", function () {
      var id = Sheets.getConfig().spreadsheetId;
      if (id) window.open("https://docs.google.com/spreadsheets/d/" + id + "/edit", "_blank");
    });

    $("btnSignOut").addEventListener("click", function () {
      Sheets.signOut();
      state.records = [];
      closeMenu();
      clearBanner();
      render();
    });

    window.addEventListener("online", updateNetbar);
    window.addEventListener("offline", updateNetbar);

    // Po návratu do appky zkusíme data osvěžit.
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && Sheets.hasToken()) load(true);
    });
  }

  function updateNetbar() {
    $("netbar").hidden = navigator.onLine;
  }

  function trySilentSignIn() {
    Sheets.signIn(false).then(function () {
      render();
      return load();
    }).catch(function (err) {
      // Tichý pokus selhal – uživatel prostě klikne na tlačítko.
      if (err && err.code === "network") {
        showBanner("Přihlašovací knihovna se nenačetla. ",
          "Zkontroluj připojení k internetu a načti stránku znovu.");
      }
      render();
    });
  }

  function boot() {
    try { state.role = localStorage.getItem(LS_ROLE); } catch (e) {}
    if (!ROLES[state.role]) state.role = null;

    wire();
    fillSetupForm();
    updateNetbar();
    $("inMonth").value = currentMonthKey();
    render();

    if (Sheets.isConfigured() && state.role) trySilentSignIn();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }
  }

  boot();
})();
