/* Edit mode for index.html (the hub). Loaded only when the URL has ?edit.
   Saving needs the local server: python3 edit_server.py */
(() => {
  const H = window.HUB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  let dirty = false;
  let version = null;
  fetch("/api/version?file=hub").then((r) => r.json()).then((d) => { version = d.version; }).catch(() => {});

  /* ---------- styles ---------- */
  const css = document.createElement("style");
  css.textContent = `
    .ed-bar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 100; display: flex; gap: 6px; align-items: center;
      background: #111; color: #fff; padding: 8px 8px 8px 16px; border-radius: 999px; font: 13px/1 Inter, system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.25); }
    .ed-bar .st { color: #aaa; margin-right: 8px; white-space: nowrap; }
    .ed-btn { font: inherit; border: 0; cursor: pointer; border-radius: 999px; padding: 8px 12px; background: #2a2a2a; color: #fff; }
    .ed-btn:hover { background: #3a3a3a; }
    .ed-btn.primary { background: #fff; color: #111; }
    [data-item] { position: relative; }
    .ed-tools { position: absolute; top: -4px; right: -4px; z-index: 20; display: flex; gap: 3px; opacity: 0; transition: opacity .15s; }
    [data-item]:hover > .ed-tools, .ed-tools:focus-within { opacity: 1; }
    .ed-tools button { font: 11px/1 Inter, system-ui, sans-serif; border: 0; cursor: pointer; border-radius: 5px; padding: 5px 7px; background: rgba(17,17,17,.85); color: #fff; }
    [contenteditable="true"] { outline: 1px dashed rgba(0,0,0,.22); outline-offset: 2px; border-radius: 2px; cursor: text; }
    [contenteditable="true"]:focus { outline: 1.5px solid #2f6bff; }
    [contenteditable="true"]:empty::before { content: attr(data-ph); color: #c4c4c4; }
    .ed-add { display: block; margin: 12px 0 0; padding: 8px 10px; border: 1px dashed #c8c8c8; border-radius: 6px; background: transparent;
      font: 12px Inter, system-ui, sans-serif; color: #888; cursor: pointer; }
    .ed-add:hover { border-color: #111; color: #111; }
    .ed-drag-over { outline: 2px solid #2f6bff; outline-offset: 2px; }
    .ed-busy { cursor: progress !important; }
    .wall .ed-add { align-self: start; }
  `;
  document.head.appendChild(css);

  /* ---------- toolbar ---------- */
  const bar = document.createElement("div");
  bar.className = "ed-bar";
  bar.innerHTML = `<span class="st">Edit mode</span>
    <button class="ed-btn" data-a="bio" title="Which bio the hub shows">Bio ${(H.me.bioPick || "b").toUpperCase()}</button>
    <button class="ed-btn primary" data-a="save">Save</button>
    <button class="ed-btn" data-a="publish">Publish</button>
    <button class="ed-btn" data-a="exit">Exit</button>`;
  document.body.appendChild(bar);
  const status = (t) => { $(".st", bar).textContent = t; };
  let P = null; // Save / Publish button states, from edit-publish.js
  const markDirty = () => { dirty = true; status("Unsaved changes"); if (P) P.changed(); };
  if (!local) status("Edit mode only saves on your Mac");
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- helpers ---------- */
  async function api(path, body, type = "application/json") {
    const headers = { "Content-Type": type };
    if (path.startsWith("/api/save") && version) headers["X-Base-Version"] = version;
    const r = await fetch(path, { method: "POST", headers, body });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || data.log || `Request failed (${r.status})`);
    return data;
  }
  function pick(accept) {
    return new Promise((res) => {
      const i = document.createElement("input");
      i.type = "file"; i.accept = accept;
      i.onchange = () => res(i.files[0]);
      i.click();
    });
  }
  async function upload(file) {
    document.body.classList.add("ed-busy"); status("Uploading…");
    try { const { path } = await api(`/api/upload?project=hub&name=${encodeURIComponent(file.name)}`, file, "application/octet-stream"); markDirty(); return path; }
    catch (e) { status("Upload failed: " + e.message); throw e; }
    finally { document.body.classList.remove("ed-busy"); }
  }
  function confirmBtn(btn, fn) { // two-click confirmation instead of a dialog
    if (btn.dataset.armed) return fn();
    btn.dataset.armed = "1"; const t = btn.textContent; btn.textContent = "Sure?";
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = t; }, 2500);
  }
  const get = (path) => path.split(".").reduce((o, k) => o[k], H);
  const parent = (path) => { const k = path.split("."); const last = k.pop(); return [get(k.join(".")), last]; };
  const move = (arr, from, to) => { if (to < 0 || to >= arr.length) return; arr.splice(to, 0, arr.splice(from, 1)[0]); };
  function plainPaste(e) { // keep pasted text clean: no fonts, colours or spacing from other apps
    e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
  }
  function clean(html) { // keep links (and the chips' little logos), drop everything else
    return html.replace(/<(?!\/?(a[ >]|img |b>|em>|i>|br))[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  }
  const month = () => new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  const OPTIONAL = new Set(["m", "d", "tag"]);
  const NEW = {
    paragraph: () => "New paragraph.",
    update: () => ({ m: month(), t: "New update" }),
    answer: () => ({ q: "The question?", a: "Your answer.", m: month() }),
    item: () => ({ t: "New item" }),
    person: () => ({ t: "Name", img: "" }),
    lately: () => ({ m: month(), t: "A topic" })
  };
  const ADD_LABEL = { paragraph: "+ Paragraph", update: "+ Update", answer: "+ Answered question", item: "+ Item", person: "+ Person", lately: "+ Topic" };
  const PREPEND = new Set(["update", "answer", "lately"]); // running lists, newest first

  function rerender() { const y = scrollY; window.HUB_SITE.route(); scrollTo(0, y); }

  /* ---------- decorate the page ---------- */
  function decorate() {
    $$("[data-edit]").forEach((el) => {
      el.contentEditable = "true";
      el.spellcheck = true;
      el.addEventListener("paste", plainPaste);
      // Don't follow links or fold sections while editing text
      el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
      el.addEventListener("keyup", (e) => { if (e.key === " ") e.preventDefault(); });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.blur(); }
      });
      el.addEventListener("blur", () => {
        const copy = el.cloneNode(true); $$(".ed-tools", copy).forEach((t) => t.remove());
        const path = el.dataset.edit, [obj, key] = parent(path), val = clean(copy.innerHTML);
        if ((obj[key] || "") === val) return;
        if (!val && OPTIONAL.has(key)) delete obj[key]; else obj[key] = val;
        markDirty();
      });
    });

    $$("[data-item]").forEach((el) => {
      const path = el.dataset.item, [list, k] = parent(path), i = +k, it = list[i];
      const buttons = [
        ["↑", () => { move(list, i, i - 1); markDirty(); rerender(); }],
        ["↓", () => { move(list, i, i + 1); markDirty(); rerender(); }]
      ];
      const kind = el.parentElement.closest("[data-list]")?.dataset.kind || el.closest("[data-list]")?.dataset.kind;
      if (it && typeof it === "object" && (kind === "item" || kind === "person")) {
        buttons.push([it.img ? "Image ✓" : "Image", async (b) => {
          if (it.img) return confirmBtn(b, () => { delete it.img; markDirty(); rerender(); });
          const f = await pick("image/*"); if (!f) return; it.img = await upload(f); rerender();
        }]);
        if (kind === "item") buttons.push([it.url && it.url !== "#" ? "Link ✓" : "Link", () => {
          const u = prompt("Link for this item (leave empty for none)", it.url || "");
          if (u === null) return;
          if (u.trim()) it.url = u.trim(); else delete it.url;
          markDirty(); rerender();
        }]);
      }
      if (it && typeof it === "object" && kind === "item") buttons.push([it.hidden ? "Show" : "Hide", () => { it.hidden = !it.hidden; if (!it.hidden) delete it.hidden; markDirty(); rerender(); }]);
      buttons.push(["✕", (b) => confirmBtn(b, () => { list.splice(i, 1); markDirty(); rerender(); })]);
      const box = document.createElement("div");
      box.className = "ed-tools"; box.contentEditable = "false";
      for (const [label, fn] of buttons) {
        const b = document.createElement("button"); b.type = "button"; b.textContent = label;
        if (label === "Image ✓") b.title = "Click twice to remove the image";
        b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fn(b); };
        box.appendChild(b);
      }
      el.appendChild(box);

      // Drag to reorder within the same list (not on text you're typing in)
      if (el.isContentEditable) return;
      el.draggable = true;
      el.addEventListener("dragstart", (e) => { if (e.target !== el) return; e.dataTransfer.setData("text/ed", path); });
      el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("ed-drag-over"); });
      el.addEventListener("dragleave", () => el.classList.remove("ed-drag-over"));
      el.addEventListener("drop", (e) => {
        e.preventDefault(); el.classList.remove("ed-drag-over");
        const from = e.dataTransfer.getData("text/ed"); if (!from) return;
        const [fl, fk] = parent(from);
        if (fl !== list || +fk === i) return;
        move(list, +fk, i); markDirty(); rerender();
      });
    });

    $$("[data-list]").forEach((el) => {
      const list = get(el.dataset.list), kind = el.dataset.kind;
      const add = document.createElement("button");
      add.type = "button"; add.className = "ed-add"; add.textContent = ADD_LABEL[kind] || "+ Add";
      add.onclick = () => { PREPEND.has(kind) ? list.unshift(NEW[kind]()) : list.push(NEW[kind]()); markDirty(); rerender(); };
      el.after(add);
    });
  }
  window.HUB_EDITOR = { decorate };

  /* ---------- toolbar actions ---------- */
  async function save() {
    if (!local) return status("Edit mode only saves on your Mac");
    document.activeElement?.blur?.(); // keep the text being typed
    status("Saving…");
    try { const r = await api("/api/save?file=hub", JSON.stringify(H)); if (r.version) version = r.version; dirty = false; status("Saved"); if (P) P.paint(); }
    catch (e) { status("Couldn't save: " + e.message); throw e; }
  }
  bar.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "save") save();
    if (a === "bio") {
      const order = ["a", "b", "c"], next = order[(order.indexOf(H.me.bioPick) + 1) % 3];
      H.me.bioPick = next; b.textContent = `Bio ${next.toUpperCase()}`;
      markDirty(); window.HUB_SITE.setBio(next);
    }
    if (a === "exit") {
      const go = () => { dirty = false; location.href = location.pathname + location.hash; };
      if (dirty) return confirmBtn(b, go);
      go();
    }
  });
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); } });
  const pub = document.createElement("script");
  pub.src = "edit-publish.js";
  pub.onload = () => { P = window.wirePublish({ bar, status, save, api, isDirty: () => dirty }); };
  document.head.appendChild(pub);

  decorate();
})();
