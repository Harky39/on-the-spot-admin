/* On The Spot — Staff panel (admin.js) */
(function () {
  "use strict";

  /* ---------- Config ---------- */
  var DATA_BASE = "https://harky39.github.io/on-the-spot-data";
  var API_REPO = "Harky39/on-the-spot-data";
  var DATA_BRANCH = "gh-pages"; // the data repo is served by Pages from this branch

  var ADMIN_EMAIL = "peter.hark89@gmail.com";
  var SALT = "ots-admin-v1-2026";
  var HASH = "047f1b09dafbe516247bc8a9d1ac6d1dd62c662d27b95cab970bb2702cdb2008";

  function getToken() {
    try { return (localStorage.getItem("otsDataToken") || "").trim(); } catch (_) { return ""; }
  }
  function setToken(t) {
    try { localStorage.setItem("otsDataToken", t.trim()); } catch (_) {}
  }
  function clearToken() {
    try { localStorage.removeItem("otsDataToken"); } catch (_) {}
  }

  /* ---------- GitHub Contents API helpers ---------- */
  function ghHeaders(withBody) {
    var h = { Authorization: "Bearer " + getToken(), Accept: "application/vnd.github+json" };
    if (withBody) h["Content-Type"] = "application/json";
    return h;
  }

  function ghGet(path) {
    return fetch("https://api.github.com/repos/" + API_REPO + "/contents/" + path, { headers: ghHeaders(false) })
      .then(function (r) { if (!r.ok) throw new Error("GitHub API " + r.status); return r.json(); });
  }

  function ghPut(path, base64Content, message, sha) {
    var body = { message: message, content: base64Content, branch: DATA_BRANCH };
    if (sha) body.sha = sha;
    return fetch("https://api.github.com/repos/" + API_REPO + "/contents/" + path, {
      method: "PUT", headers: ghHeaders(true), body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error("GitHub API " + r.status); return r.json(); });
  }

  function ghDelete(path, sha) {
    return fetch("https://api.github.com/repos/" + API_REPO + "/contents/" + path, {
      method: "DELETE", headers: ghHeaders(true), body: JSON.stringify({ message: "Remove " + path, sha: sha, branch: DATA_BRANCH })
    }).then(function (r) { if (!r.ok && r.status !== 204) throw new Error("GitHub API " + r.status); return r.json ? r.json() : null; });
  }

  function utf8ToBase64(str) { return btoa(unescape(encodeURIComponent(str))); }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var bytes = new Uint8Array(reader.result);
          var binary = "";
          for (var i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          resolve(btoa(binary));
        } catch (err) { reject(err); }
      };
      reader.onerror = function () { reject(new Error("read failed")); };
      reader.readAsArrayBuffer(blob);
    });
  }

  /* ---------- Image compression (for uploads) ---------- */
  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (blob) {
            blob ? resolve(blob) : reject(new Error("compress failed"));
          }, "image/jpeg", quality);
        };
        img.onerror = function () { reject(new Error("load failed")); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error("read failed")); };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Small DOM helpers ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch (_) { return iso || ""; }
  }
  function siteLabel(site) { return site === "van" ? "Caravan repairs" : "Car & van bodywork"; }

  /* ---------- Login ---------- */
  var loginView = document.getElementById("loginView");
  var appView = document.getElementById("appView");
  var loginForm = document.getElementById("loginForm");
  var loginError = document.getElementById("loginError");

  function sha256Hex(str) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    loadQuotes(); // start on the Quotes tab
  }

  function showLogin() {
    sessionStorage.removeItem("otsAdmin");
    appView.hidden = true;
    loginView.hidden = false;
    var pw = document.getElementById("password");
    if (pw) pw.value = "";
  }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var emailEl = document.getElementById("email");
    var pwEl = document.getElementById("password");
    var btn = document.getElementById("loginBtn");
    var email = (emailEl.value || "").trim().toLowerCase();
    var pw = pwEl.value || "";

    loginError.hidden = true;
    if (!email || !pw) {
      loginError.textContent = "Please enter your email and password.";
      loginError.hidden = false;
      return;
    }
    btn.disabled = true;
    sha256Hex(SALT + pw).then(function (hex) {
      if (email === ADMIN_EMAIL && hex === HASH) {
        sessionStorage.setItem("otsAdmin", "1");
        showApp();
      } else {
        loginError.textContent = "That email and password don't match our records.";
        loginError.hidden = false;
      }
    }).catch(function () {
      loginError.textContent = "Couldn't verify — please try again.";
      loginError.hidden = false;
    }).then(function () { btn.disabled = false; });
  });

  var logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", showLogin);
  var logoutBtn2 = document.getElementById("logoutBtn2");
  if (logoutBtn2) logoutBtn2.addEventListener("click", showLogin);

  /* ---------- Tabs ---------- */
  var tabNav = document.getElementById("tabNav");
  var loadedTabs = {};

  function switchTab(name) {
    Array.prototype.forEach.call(tabNav.querySelectorAll(".tab"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".tab-panel"), function (p) {
      p.hidden = p.id !== "panel-" + name;
    });
    if (!loadedTabs[name]) {
      loadedTabs[name] = true;
      if (name === "quotes") loadQuotes();
      else if (name === "car" || name === "van") loadContent(name);
      else if (name === "settings") initSettings();
    }
  }

  tabNav.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".tab") : null;
    if (!btn) return;
    switchTab(btn.getAttribute("data-tab"));
  });

  /* ---------- Quotes ---------- */
  var quoteState = { filter: "all", items: [] };

  function loadQuotes() {
    var listEl = document.getElementById("quoteList");
    var hint = document.getElementById("quotesHint");
    var detail = document.getElementById("quoteDetail");
    if (detail) detail.hidden = true;
    hint.textContent = "";
    listEl.innerHTML = '<p class="hint">Loading…</p>';

    fetch(DATA_BASE + "/quotes/index.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (items) {
        quoteState.items = Array.isArray(items) ? items : [];
        renderQuoteList();
      })
      .catch(function () {
        hint.textContent = "Couldn't load quotes — check your connection and try Refresh.";
        listEl.innerHTML = "";
      });
  }

  function renderQuoteList() {
    var el = document.getElementById("quoteList");
    var filter = quoteState.filter;
    var items = quoteState.items.filter(function (q) { return filter === "all" || q.site === filter; });

    if (!items.length) {
      el.innerHTML = "";
      el.appendChild(el("p", "hint", "No quote requests here yet. New ones from the website forms will appear automatically."));
      return;
    }

    el.innerHTML = "";
    items.forEach(function (q) {
      var card = el("div", "quote-card");

      var head = el("div", "qc-head");
      var nameWrap = el("div", "qc-name");
      nameWrap.appendChild(el("strong", null, q.name || "(no name)"));
      if (q.phone) {
        var tel = document.createElement("a");
        tel.href = "tel:" + String(q.phone).replace(/[^0-9+]/g, "");
        tel.textContent = q.phone;
        nameWrap.appendChild(tel);
      }
      head.appendChild(nameWrap);

      var statusSel = document.createElement("select");
      ["new", "contacted", "quoted", "completed"].forEach(function (s) {
        var o = document.createElement("option");
        o.value = s;
        o.textContent = s.charAt(0).toUpperCase() + s.slice(1);
        if ((q.status || "new") === s) o.selected = true;
        statusSel.appendChild(o);
      });
      statusSel.className = "qc-status";
      statusSel.addEventListener("change", function () { saveQuoteStatus(q.id, statusSel.value); });
      head.appendChild(statusSel);
      card.appendChild(head);

      var meta = el("div", "qc-meta");
      meta.appendChild(el("span", "chip-mini chip-site-" + (q.site === "van" ? "van" : "car"), siteLabel(q.site)));
      meta.appendChild(el("span", "chip-mini", fmtDate(q.createdAt)));
      if (q.photoCount) meta.appendChild(el("span", "chip-mini", q.photoCount + " photo" + (q.photoCount > 1 ? "s" : "")));
      card.appendChild(meta);

      var actions = el("div", "qc-actions");
      var viewBtn = el("button", "btn btn-ghost btn-sm", "View details & photos");
      viewBtn.type = "button";
      viewBtn.addEventListener("click", function () { openQuote(q.id); });
      actions.appendChild(viewBtn);
      card.appendChild(actions);

      el.appendChild(card);
    });
  }

  var quoteFilter = document.getElementById("quoteFilter");
  if (quoteFilter) quoteFilter.addEventListener("change", function () {
    quoteState.filter = quoteFilter.value;
    renderQuoteList();
  });
  var refreshBtn = document.getElementById("refreshQuotes");
  if (refreshBtn) refreshBtn.addEventListener("click", loadQuotes);

  function openQuote(id) {
    fetch(DATA_BASE + "/quotes/" + id + ".json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (q) { if (!q) throw new Error("not found"); renderQuoteDetail(q); })
      .catch(function () { alert("Couldn't load that quote."); });
  }

  function renderQuoteDetail(q) {
    var box = document.getElementById("quoteDetail");
    box.hidden = false;
    box.innerHTML = "";

    var head = el("div", "qd-head");
    var title = el("h3", null, (q.name || "(no name)") + " — " + siteLabel(q.site));
    head.appendChild(title);
    var backBtn = el("button", "btn btn-ghost btn-sm", "&larr; Back to list");
    backBtn.type = "button";
    backBtn.innerHTML = "&larr; Back to list";
    backBtn.addEventListener("click", function () { box.hidden = true; });
    head.appendChild(backBtn);
    box.appendChild(head);

    var facts = el("div", "qd-facts");
    if (q.phone) {
      var tel = document.createElement("a");
      tel.href = "tel:" + String(q.phone).replace(/[^0-9+]/g, "");
      tel.textContent = q.phone;
      facts.appendChild(tel);
    }
    facts.appendChild(el("span", null, fmtDate(q.createdAt)));
    if (q.type) facts.appendChild(el("span", null, "Vehicle: " + q.type));
    box.appendChild(facts);

    var msg = el("p", "qd-message");
    msg.textContent = q.message || "(no description provided)";
    box.appendChild(msg);

    if (Array.isArray(q.photos) && q.photos.length) {
      var grid = el("div", "photo-grid");
      q.photos.forEach(function (p) {
        var a = document.createElement("a");
        a.className = "lb-link";
        a.href = DATA_BASE + "/" + p;
        a.target = "_blank";
        a.rel = "noopener";
        var img = document.createElement("img");
        img.src = DATA_BASE + "/" + p;
        img.alt = "Damage photo";
        img.loading = "lazy";
        img.addEventListener("click", function (e) { e.preventDefault(); openLightbox(DATA_BASE + "/" + p); });
        a.appendChild(img);
        grid.appendChild(a);
      });
      box.appendChild(grid);
    }

    var actions = el("div", "qd-actions");
    var statusSel = document.createElement("select");
    ["new", "contacted", "quoted", "completed"].forEach(function (s) {
      var o = document.createElement("option");
      o.value = s;
      o.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      if ((q.status || "new") === s) o.selected = true;
      statusSel.appendChild(o);
    });
    statusSel.addEventListener("change", function () { saveQuoteStatus(q.id, statusSel.value); });
    actions.appendChild(statusSel);

    var delBtn = el("button", "btn btn-danger btn-sm", "Delete this quote");
    delBtn.type = "button";
    delBtn.addEventListener("click", function () { deleteQuote(q.id); });
    actions.appendChild(delBtn);
    box.appendChild(actions);

    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function saveQuoteStatus(id, status) {
    if (!getToken()) { alert("Please set the data token in Settings first."); return; }
    ghGet("quotes/" + id + ".json").then(function (fileData) {
      var quote = JSON.parse(atob(fileData.content));
      quote.status = status;
      return ghPut("quotes/" + id + ".json", utf8ToBase64(JSON.stringify(quote, null, 2)), "Update quote status: " + id, fileData.sha);
    }).then(function () { return updateIndexEntry(id, { status: status }); })
      .catch(function (err) { alert("Couldn't save the status change: " + err.message); });
  }

  function deleteQuote(id) {
    if (!getToken()) { alert("Please set the data token in Settings first."); return; }
    if (!confirm("Delete this quote and its photos? This can't be undone.")) return;
    listDir("quotes/" + id).then(function (dir) {
      var chain = Promise.resolve();
      dir.forEach(function (f) {
        chain = chain.then(function () { return ghDelete(f.path, f.sha); });
      });
      return chain;
    }).then(function () {
      return ghGet("quotes/" + id + ".json").then(function (fd) { return ghDelete(fd.path, fd.sha); });
    }).then(function () {
      return ghGet("quotes/index.json").then(function (fileData) {
        var list = JSON.parse(atob(fileData.content)) || [];
        list = list.filter(function (q) { return q.id !== id; });
        return ghPut("quotes/index.json", utf8ToBase64(JSON.stringify(list, null, 2)), "Remove quote from index: " + id, fileData.sha);
      });
    }).then(function () {
      document.getElementById("quoteDetail").hidden = true;
      loadQuotes();
    }).catch(function (err) { alert("Couldn't delete the quote: " + err.message); });
  }

  // Directory listing that tolerates a missing directory (404 -> empty list)
  function listDir(path) {
    return ghGet(path).catch(function (err) {
      if (/404/.test(err.message)) return [];
      throw err;
    });
  }

  function updateIndexEntry(id, patch) {
    return ghGet("quotes/index.json").then(function (fileData) {
      var list = JSON.parse(atob(fileData.content)) || [];
      list.forEach(function (q) { if (q.id === id) Object.keys(patch).forEach(function (k) { q[k] = patch[k]; }); });
      return ghPut("quotes/index.json", utf8ToBase64(JSON.stringify(list, null, 2)), "Update quote index: " + id, fileData.sha);
    }).then(loadQuotes);
  }

  /* ---------- Content editor (car & van) ---------- */
  var contentState = {}; // site -> { data, loadedAt }

  function sectionFor(site) { return document.querySelector('.tab-panel[data-site="' + site + '"]'); }

  function loadContent(site) {
    var section = sectionFor(site);
    if (!section) return;
    fetch(DATA_BASE + "/" + site + "/content.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || typeof data !== "object") throw new Error("empty");
        contentState[site] = { data: data };
        var sc = data.showcase || {};
        setImgField(section, "showcase-before", sc.before || "");
        setImgField(section, "showcase-after", sc.after || "");
        renderGalleryEditor(site);
      })
      .catch(function () {
        setStatus(section, "Couldn't load the current content — try again.");
      });
  }

  function setImgField(section, role, url) {
    var input = section.querySelector('[data-role="' + role + '"]');
    if (input) input.value = url;
    updateThumb(section, role);
  }

  function updateThumb(section, role) {
    var input = section.querySelector('[data-role="' + role + '"]');
    var thumb = section.querySelector('[data-thumb-for="' + role + '"]');
    if (!input || !thumb) return;
    if (input.value && input.value.trim()) {
      thumb.src = input.value.trim();
      thumb.hidden = false;
    } else {
      thumb.hidden = true;
    }
  }

  function renderGalleryEditor(site) {
    var section = sectionFor(site);
    var wrap = section.querySelector('[data-role="gallery-items"]');
    if (!wrap || !contentState[site]) return;
    wrap.innerHTML = "";
    (contentState[site].data.gallery || []).forEach(function (item, i) {
      var row = el("div", "gallery-row");

      var thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = item.image;
      thumb.alt = "";
      if (!item.image) thumb.hidden = true;
      row.appendChild(thumb);

      var sel = document.createElement("select");
      ["Before", "In progress", "After"].forEach(function (c) {
        var o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        if ((item.chip || "Before") === c) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () { item.chip = sel.value; });
      row.appendChild(sel);

      var cap = document.createElement("input");
      cap.type = "text";
      cap.placeholder = "Caption (optional)";
      cap.value = item.caption || "";
      cap.addEventListener("input", function () { item.caption = cap.value; });
      row.appendChild(cap);

      var rm = el("button", "btn btn-ghost btn-sm gallery-remove", "Remove");
      rm.type = "button";
      rm.title = "Remove this photo from the site (the file stays in storage)";
      rm.addEventListener("click", function () {
        contentState[site].data.gallery.splice(i, 1);
        renderGalleryEditor(site);
      });
      row.appendChild(rm);

      wrap.appendChild(row);
    });
    if (!(contentState[site].data.gallery || []).length) {
      wrap.appendChild(el("p", "hint small", "No gallery photos yet — add one below."));
    }
  }

  function uploadImage(file, site, subfolder) {
    var name = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    return compressImage(file, 1600, 0.85).then(blobToBase64).then(function (b64) {
      var path = "images/" + site + "/" + subfolder + "-" + name + ".jpg";
      return ghPut(path, b64, "Upload image via admin panel: " + path);
    }).then(function () {
      return DATA_BASE + "/images/" + site + "/" + subfolder + "-" + name + ".jpg";
    });
  }

  function bindContentSection(site) {
    var section = sectionFor(site);
    if (!section || section.dataset.bound === "1") return;
    section.dataset.bound = "1";

    // showcase URL inputs -> live thumbnails
    ["showcase-before", "showcase-after"].forEach(function (role) {
      var input = section.querySelector('[data-role="' + role + '"]');
      if (input) input.addEventListener("input", function () { updateThumb(section, role); });

      var upBtn = section.querySelector('[data-upload-for="' + role + '"]');
      var fileInput = section.querySelector('[data-file-for="' + role + '"]');
      if (upBtn && fileInput) {
        upBtn.addEventListener("click", function () { fileInput.click(); });
        fileInput.addEventListener("change", function () {
          var f = fileInput.files && fileInput.files[0];
          if (!f) return;
          upBtn.disabled = true;
          uploadImage(f, site, role).then(function (url) {
            input.value = url;
            updateThumb(section, role);
          }).catch(function (err) { alert("Upload failed: " + err.message); })
            .then(function () { upBtn.disabled = false; fileInput.value = ""; });
        });
      }
    });

    // add gallery photo
    var addBtn = section.querySelector("[data-add-gallery]");
    var gFile = section.querySelector('[data-role="gallery-file"]');
    if (addBtn && gFile) {
      addBtn.addEventListener("click", function () { gFile.click(); });
      gFile.addEventListener("change", function () {
        var f = gFile.files && gFile.files[0];
        if (!f) return;
        addBtn.disabled = true;
        uploadImage(f, site, "gallery").then(function (url) {
          contentState[site].data.gallery.push({ id: "g" + Date.now().toString(36), image: url, chip: "Before", caption: "" });
          renderGalleryEditor(site);
        }).catch(function (err) { alert("Upload failed: " + err.message); })
          .then(function () { addBtn.disabled = false; gFile.value = ""; });
      });
    }

    // save
    var saveBtn = section.querySelector("[data-save-content]");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        if (!getToken()) { alert("Please set the data token in Settings first."); return; }
        var st = contentState[site];
        if (!st) { setStatus(section, "Content not loaded yet — wait a moment and try again."); return; }

        var before = (section.querySelector('[data-role="showcase-before"]').value || "").trim();
        var after = (section.querySelector('[data-role="showcase-after"]').value || "").trim();
        var payload = { site: site, updated: new Date().toISOString(), showcase: { before: before, after: after }, gallery: st.data.gallery || [] };

        saveBtn.disabled = true;
        setStatus(section, "Saving…");
        ghGet(site + "/content.json").then(function (fileData) {
          return ghPut(site + "/content.json", utf8ToBase64(JSON.stringify(payload, null, 2)), "Update " + site + " content via admin panel", fileData.sha);
        }).then(function () {
          st.data = payload;
          setStatus(section, "Saved ✓ — the public site will update within a minute or two.");
        }).catch(function (err) {
          setStatus(section, "Save failed: " + err.message);
        }).then(function () { saveBtn.disabled = false; });
      });
    }
  }

  function setStatus(section, text) {
    var s = section.querySelector("[data-save-status]");
    if (s) s.textContent = text || "";
  }

  /* ---------- Settings ---------- */
  var settingsBound = false;

  function initSettings() {
    var input = document.getElementById("tokenInput");
    var status = document.getElementById("tokenStatus");
    if (!input) return;
    input.value = getToken();
    if (settingsBound) return; // listeners attached once; value refreshed above
    settingsBound = true;

    document.getElementById("publishToken").addEventListener("click", function () {
      var t = (input.value || "").trim();
      if (!t) { status.textContent = "Paste a token first."; return; }
      setToken(t); // local copy for this browser's API calls
      ghGet("config.json").then(function (fileData) {
        return ghPut("config.json", utf8ToBase64(JSON.stringify({ token: t }, null, 2)), "Publish data token via admin panel", fileData.sha);
      }).then(function () {
        status.textContent = "Published ✓ — both websites will use it for new quote requests (existing visitors pick it up on their next visit).";
      }).catch(function (err) {
        status.textContent = "Saved in this browser, but publishing failed: " + err.message;
      });
    });

    document.getElementById("clearLocalToken").addEventListener("click", function () {
      clearToken();
      input.value = "";
      status.textContent = "Cleared from this browser. (The published token on the websites is unchanged.)";
    });
  }

  /* ---------- Lightbox ---------- */
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightboxImg");

  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = "";
    document.body.style.overflow = "";
  }
  if (lightbox) {
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox || e.target.classList.contains("lb-close")) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !lightbox.hidden) closeLightbox();
    });
  }

  /* ---------- Boot ---------- */
  ["car", "van"].forEach(bindContentSection);
  try {
    if (sessionStorage.getItem("otsAdmin") === "1") showApp();
  } catch (_) {}
})();
