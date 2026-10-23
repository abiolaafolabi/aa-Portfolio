/* Edit mode for portfolio.html. Loaded only when the URL has ?edit.
   Saving needs the local server: python3 edit_server.py */
(() => {
  const C = window.CONTENT;
  const W = C.work;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  let dirty = false;
  let version = null;
  fetch("/api/version").then((r) => r.json()).then((d) => { version = d.version; }).catch(() => {});

  /* ---------- styles ---------- */
  const css = document.createElement("style");
  css.textContent = `
    .ed-bar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 100; display: flex; gap: 6px; align-items: center;
      background: #111; color: #fff; padding: 8px 8px 8px 16px; border-radius: 999px; font: 13px/1 Inter, system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.25); }
    .ed-bar .st { color: #aaa; margin-right: 8px; white-space: nowrap; }
    .ed-btn { font: inherit; border: 0; cursor: pointer; border-radius: 999px; padding: 8px 12px; background: #2a2a2a; color: #fff; }
    .ed-btn:hover { background: #3a3a3a; }
    .ed-btn.primary { background: #fff; color: #111; }
    .ed-btn.warn { background: #c62828; }
    .ed-tools { position: absolute; top: 8px; right: 8px; z-index: 20; display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; opacity: 0; transition: opacity .15s; }
    .ed-hover:hover > .ed-tools, .ed-tools:focus-within { opacity: 1; }
    .ed-tools button, .ed-tools label { font: 12px/1 Inter, system-ui, sans-serif; border: 0; cursor: pointer; border-radius: 6px; padding: 6px 8px; background: rgba(17,17,17,.85); color: #fff; }
    .ed-tools input[type=color] { width: 0; height: 0; opacity: 0; position: absolute; }
    .ed-hover { position: relative; }
    [contenteditable="true"] { outline: 1px dashed rgba(0,0,0,.25); outline-offset: 3px; border-radius: 2px; cursor: text; }
    [contenteditable="true"]:focus { outline: 1.5px solid #2f6bff; }
    .ed-add { display: block; margin: 24px var(--pad, 24px); width: calc(100% - 2 * var(--pad, 24px)); padding: 18px; border: 1.5px dashed #c8c8c8; border-radius: 6px;
      background: transparent; font: 14px Inter, system-ui, sans-serif; color: #777; cursor: pointer; }
    .ed-add:hover { border-color: #111; color: #111; }
    .ed-drag-over { outline: 2px solid #2f6bff; outline-offset: 4px; }
    .ed-busy { cursor: progress !important; }
  `;
  document.head.appendChild(css);

  /* ---------- helpers ---------- */
  const bar = document.createElement("div");
  bar.className = "ed-bar";
  bar.innerHTML = `<span class="st">Edit mode</span>
    <button class="ed-btn" data-a="add">+ Project</button>
    <button class="ed-btn primary" data-a="save">Save</button>
    <button class="ed-btn" data-a="publish">Publish</button>
    <button class="ed-btn" data-a="exit">Exit</button>`;
  document.body.appendChild(bar);
  const status = (t) => { $(".st", bar).textContent = t; };
  const markDirty = () => { dirty = true; status("Unsaved changes"); };
  if (!local) status("Edit mode only saves on your Mac");

  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  async function api(path, body, type = "application/json") {
    const headers = { "Content-Type": type };
    if (path === "/api/save" && version) headers["X-Base-Version"] = version;
    const r = await fetch(path, { method: "POST", headers, body });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || data.log || `Request failed (${r.status})`);
    return data;
  }
  function pick(accept, multiple = false) {
    return new Promise((res) => {
      const i = document.createElement("input");
      i.type = "file"; i.accept = accept; i.multiple = multiple;
      i.onchange = () => res([...i.files]);
      i.click();
    });
  }
  async function upload(files, project) {
    document.body.classList.add("ed-busy");
    status(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    const out = [];
    try {
      for (const f of files) {
        const { path } = await api(`/api/upload?project=${encodeURIComponent(project)}&name=${encodeURIComponent(f.name)}`, f, "application/octet-stream");
        out.push(path);
      }
    } catch (e) { status("Upload failed: " + e.message); throw e; }
    finally { document.body.classList.remove("ed-busy"); }
    markDirty();
    return out;
  }
  const MEDIA = "image/*,video/mp4,video/webm,video/quicktime,.svg";
  const move = (arr, from, to) => { if (to < 0 || to >= arr.length) return; arr.splice(to, 0, arr.splice(from, 1)[0]); };
  function confirmBtn(btn, fn) { // two-click confirmation instead of a dialog
    if (btn.dataset.armed) return fn();
    btn.dataset.armed = "1"; const t = btn.textContent; btn.textContent = "Sure?";
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = t; }, 2500);
  }
  function tools(el, buttons) {
    el.classList.add("ed-hover");
    const box = document.createElement("div");
    box.className = "ed-tools";
    for (const [label, fn, extra] of buttons) {
      if (extra === "color") {
        const l = document.createElement("label"); l.textContent = label;
        const inp = document.createElement("input"); inp.type = "color"; inp.value = fn.value;
        inp.oninput = () => fn.set(inp.value);
        l.appendChild(inp); l.onclick = (e) => { e.preventDefault(); e.stopPropagation(); inp.click(); }; box.appendChild(l); continue;
      }
      const b = document.createElement("button"); b.type = "button"; b.textContent = label;
      b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fn(b); };
      box.appendChild(b);
    }
    el.appendChild(box);
  }
  function draggable(el, list, index, after) {
    el.draggable = true;
    el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/ed", JSON.stringify({ list, index })); });
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("ed-drag-over"); });
    el.addEventListener("dragleave", () => el.classList.remove("ed-drag-over"));
    el.addEventListener("drop", (e) => {
      e.preventDefault(); el.classList.remove("ed-drag-over");
      let d; try { d = JSON.parse(e.dataTransfer.getData("text/ed")); } catch { return; }
      if (d.list !== list || d.index === index) return;
      after(d.index, index);
    });
  }
  function plainPaste(e) { // keep pasted text clean: no fonts, colours or spacing from other apps
    e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
  }
  function clean(html) {
    return html.replace(/<(?!\/?(span class="lbl"|span|a |a>|\/a|br|b>|\/b|em|\/em|i>|\/i))[^>]*>/g, "")
      .replace(/<span(?! class="lbl")[^>]*>(.*?)<\/span>/g, "$1").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  }
  function setPath(obj, path, val) {
    const keys = path.split("."); let o = obj;
    while (keys.length > 1) o = o[keys.shift()];
    o[keys[0]] = val;
  }

  /* ---------- grid ---------- */
  function decorateGrid() {
    const intro = $("[data-edit-global=intro]");
    if (intro) {
      intro.contentEditable = "true";
      intro.addEventListener("paste", plainPaste);
      intro.oninput = () => { C.intro = clean(intro.innerHTML); markDirty(); };
    }
    $$("#grid .item").forEach((card) => {
      const i = +card.dataset.i, w = W[i];
      const cover = $(".cover", card);
      tools(cover, [
        ["Change cover", async () => { const [f] = await pick(MEDIA); if (!f) return; [w.cover] = await upload([f], w.id); refresh(); }],
        ["Backdrop", { value: /^#/.test(w.c || "") ? w.c : "#000000", set: (v) => { w.c = v; cover.style.setProperty("--c", v); markDirty(); } }, "color"],
        [w.hidden ? "Show" : "Hide", () => { w.hidden = !w.hidden; markDirty(); refresh(); }],
        ["Delete", (b) => confirmBtn(b, () => { W.splice(i, 1); markDirty(); refresh(); })]
      ]);
      draggable(card, "grid", i, (from, to) => { move(W, from, to); markDirty(); refresh(); });
    });
  }

  /* ---------- logos ---------- */
  function decorateLogos() {
    C.logos = C.logos || [];
    $$("[data-logo]").forEach((tile) => {
      const k = +tile.dataset.logo;
      const cap = $("[data-edit-logo]", tile);
      cap.contentEditable = "true"; cap.addEventListener("paste", plainPaste);
      cap.addEventListener("blur", () => { C.logos[k].name = cap.textContent.trim(); markDirty(); });
      tools($(".lt", tile), [
        ["←", () => { move(C.logos, k, k - 1); markDirty(); refreshLogos(); }],
        ["→", () => { move(C.logos, k, k + 1); markDirty(); refreshLogos(); }],
        ["Replace", async () => { const [f] = await pick("image/svg+xml,image/png,image/*"); if (!f) return; [C.logos[k].src] = await upload([f], "logos"); refreshLogos(); }],
        ["Remove", (b) => confirmBtn(b, () => { C.logos.splice(k, 1); markDirty(); refreshLogos(); })]
      ]);
      draggable(tile, "logos", k, (from, to) => { move(C.logos, from, to); markDirty(); refreshLogos(); });
    });
    const add = document.createElement("button");
    add.className = "ed-add"; add.textContent = "+ Add logos";
    add.onclick = async () => { const fs = await pick("image/svg+xml,image/png,image/*", true); if (!fs.length) return; const ps = await upload(fs, "logos"); C.logos.push(...ps.map((src) => ({ src, name: "" }))); refreshLogos(); };
    $("#logos").after(add);
  }
  function refreshLogos() { $$("#logos + .ed-add").forEach((b) => b.remove()); SITE.renderLogos(); decorateLogos(); }

  /* ---------- project ---------- */
  function decorateProject() {
    const proj = $("#project");
    if (!document.body.classList.contains("proj-open") || proj.dataset.i == null) return;
    const w = W[+proj.dataset.i];
    if (!w) return;

    $$("[data-edit]", proj).forEach((el) => {
      el.contentEditable = "true";
      el.addEventListener("paste", plainPaste);
      el.addEventListener("click", (e) => e.preventDefault());
      el.addEventListener("blur", () => {
        const path = el.dataset.edit, val = clean(el.innerHTML);
        if (path.startsWith("body.") && !el.textContent.trim()) { w.body.splice(+path.split(".")[1], 1); markDirty(); return rerender(); }
        setPath(w, path, val); markDirty();
        if (["title", "type", "year"].includes(path)) SITE.renderGrid(), decorateGrid();
      });
    });

    const hero = $("[data-hero] .cover", proj);
    if (hero) tools(hero, [
      ["Change cover", async () => { const [f] = await pick(MEDIA); if (!f) return; [w.cover] = await upload([f], w.id); rerender(); }],
      ["Backdrop", { value: /^#/.test(w.c || "") ? w.c : "#000000", set: (v) => { w.c = v; hero.style.setProperty("--c", v); markDirty(); } }, "color"]
    ]);

    const body = $(".body > div:last-child", proj);
    if (body) {
      const add = document.createElement("button");
      add.className = "ed-add"; add.style.margin = "12px 0 0"; add.style.width = "100%";
      add.textContent = "+ Add paragraph";
      add.onclick = () => { w.body.push("New paragraph."); markDirty(); rerender(); };
      body.appendChild(add);
    }

    w.images = w.images || [];
    $$("[data-img]", proj).forEach((el) => {
      const k = +el.dataset.img;
      const norm = () => { if (typeof w.images[k] === "string") w.images[k] = { src: w.images[k] }; return w.images[k]; };
      tools(el, [
        ["←", () => { move(w.images, k, k - 1); markDirty(); rerender(); }],
        ["→", () => { move(w.images, k, k + 1); markDirty(); rerender(); }],
        [el.classList.contains("wide") ? "Half width" : "Full width", () => { const x = norm(); x.wide = !el.classList.contains("wide"); markDirty(); rerender(); }],
        ["Replace", async () => { const [f] = await pick(MEDIA); if (!f) return; const [p] = await upload([f], w.id); const x = norm(); x.src = p; delete x.bg; delete x.word; rerender(); }],
        ["Remove", (b) => confirmBtn(b, () => { w.images.splice(k, 1); markDirty(); rerender(); })]
      ]);
      draggable(el, "images", k, (from, to) => { move(w.images, from, to); markDirty(); rerender(); });
    });
    const lastShots = $$(".shots", proj).pop();
    const addImgs = document.createElement("button");
    addImgs.className = "ed-add"; addImgs.textContent = "+ Add images or videos";
    addImgs.onclick = async () => { const fs = await pick(MEDIA, true); if (!fs.length) return; w.images.push(...await upload(fs, w.id)); rerender(); };
    lastShots ? lastShots.after(addImgs) : $(".body", proj).after(addImgs);

    w.process = w.process || [];
    $$("[data-proc]", proj).forEach((fig) => {
      const k = +fig.dataset.proc;
      tools(fig, [
        ["←", () => { move(w.process, k, k - 1); markDirty(); rerender(); }],
        ["→", () => { move(w.process, k, k + 1); markDirty(); rerender(); }],
        ["Replace", async () => { const [f] = await pick(MEDIA); if (!f) return; [w.process[k].src] = await upload([f], w.id); rerender(); }],
        ["Remove", (b) => confirmBtn(b, () => { w.process.splice(k, 1); markDirty(); rerender(); })]
      ]);
      draggable(fig, "process", k, (from, to) => { move(w.process, from, to); markDirty(); rerender(); });
    });
    const addProc = document.createElement("button");
    addProc.className = "ed-add";
    addProc.textContent = w.process.length ? "+ Add process images" : "+ Add a process board";
    addProc.onclick = async () => { const fs = await pick(MEDIA, true); if (!fs.length) return; const ps = await upload(fs, w.id); w.process.push(...ps.map((src) => ({ src, cap: "" }))); rerender(); };
    ($(".process", proj) || addImgs).after(addProc);
  }

  /* ---------- re-render ---------- */
  function decorate() { decorateGrid(); decorateLogos(); decorateProject(); }
  function refresh() { SITE.renderGrid(); decorate(); }
  function rerender() {
    const proj = $("#project"), y = proj.scrollTop, w = W[+proj.dataset.i];
    open(w.id); proj.scrollTop = y; decorateProject();
  }
  const open = SITE.openProject;
  SITE.openProject = (id) => { open(id); decorateProject(); };
  window.addEventListener("hashchange", () => setTimeout(decorateProject, 0));

  /* ---------- toolbar ---------- */
  async function save() {
    if (!local) return status("Edit mode only saves on your Mac");
    status("Saving…");
    try { const r = await api("/api/save", JSON.stringify(C)); if (r.version) version = r.version; dirty = false; status("Saved"); }
    catch (e) { status("Couldn't save: " + e.message); throw e; }
  }
  bar.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "save") save();
    if (a === "add") {
      let n = 1; while (W.some((w) => w.id === `new-project-${n}`)) n++;
      W.push({ id: `new-project-${n}`, title: "New project", type: "Type", year: String(new Date().getFullYear()), c: "#000000", fg: "#ffffff",
        cover: "", art: "", images: [], process: [], role: "Role", client: "Client", summary: "One line about the project.", body: ["Write about the project."] });
      markDirty(); refresh(); location.hash = `new-project-${n}`;
    }
    if (a === "publish") confirmBtn(b, async () => {
      try { await save(); status("Publishing…"); const r = await api("/api/publish", "{}"); status(r.ok ? "Published. Live in about a minute." : "Publish failed"); }
      catch (err) { status("Publish failed: " + err.message.slice(0, 80)); }
    });
    if (a === "exit") { if (dirty) return confirmBtn(b, () => { dirty = false; location.href = location.pathname + location.hash; }); location.href = location.pathname + location.hash; }
  });
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); } });

  decorate();
})();
