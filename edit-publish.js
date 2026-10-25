/* Save / Publish buttons for both edit modes (editor.js and hub-editor.js).
   The buttons always say where things stand:
     Save       → there are changes on this page not saved yet
     Saved ✓    → everything on this page is saved on your Mac
     Publish    → saved changes the live site doesn't have yet
     Live ✓     → the live site matches what's here
   Publishing shows a bar while GitHub puts the change live, and says when it's done. */
window.wirePublish = function ({ bar, status, save, api, isDirty }) {
  const $ = (s) => bar.querySelector(s);
  const saveBtn = $("[data-a=save]"), pubBtn = $("[data-a=publish]");
  const css = document.createElement("style");
  css.textContent = `
    .ed-btn.done { background: #2a2a2a; color: #9be59b; }
    .ed-btn[disabled] { opacity: .7; cursor: progress; }
    .ed-prog { position: absolute; left: 18px; right: 18px; bottom: 4px; height: 2px; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; opacity: 0; transition: opacity .2s; }
    .ed-prog.on { opacity: 1; }
    .ed-prog i { display: block; height: 100%; width: 0; background: #9be59b; transition: width .6s ease; }
    .ed-bar { position: fixed; }
    .ed-bar .st a { color: #9be59b; text-decoration: underline; }`;
  document.head.appendChild(css);
  const prog = document.createElement("div");
  prog.className = "ed-prog"; prog.innerHTML = "<i></i>";
  bar.appendChild(prog);
  const fill = (pct) => { prog.classList.toggle("on", pct > 0 && pct < 100); prog.firstChild.style.width = pct + "%"; };

  let unpublished = false, busy = false, armed = null;
  function paint() {
    const dirty = isDirty();
    saveBtn.textContent = dirty ? "Save" : "Saved ✓";
    saveBtn.classList.toggle("done", !dirty);
    if (busy) return;
    const pending = dirty || unpublished;
    pubBtn.textContent = armed ? "Sure? Publish" : pending ? "Publish" : "Live ✓";
    pubBtn.classList.toggle("done", !pending && !armed);
  }
  fetch("/api/status").then((r) => r.json()).then((d) => { unpublished = d.unpublished; paint(); }).catch(() => {});

  async function publish() {
    busy = true; pubBtn.disabled = true; saveBtn.disabled = true;
    try {
      pubBtn.textContent = "Saving…";
      if (isDirty()) await save();
      pubBtn.textContent = "Sending…"; status("Sending your changes to GitHub…"); fill(8);
      const r = await api("/api/publish", "{}");
      if (!r.files || !r.files.length) {
        unpublished = false; fill(100);
        status("Nothing new to publish. The live site already has all of this.");
        return;
      }
      // GitHub usually takes 30–90 seconds; check the live site until it matches
      pubBtn.textContent = "Going live…"; status("Sent. Waiting for the live site to update…");
      const start = Date.now(), limit = 4 * 60 * 1000;
      while (Date.now() - start < limit) {
        fill(Math.min(92, 10 + ((Date.now() - start) / 90000) * 80));
        await new Promise((ok) => setTimeout(ok, 5000));
        const live = await fetch(`/api/live?files=${encodeURIComponent(r.files.join(","))}`).then((x) => x.json()).catch(() => ({}));
        if (live.live) {
          unpublished = false; fill(100);
          status(""); $(".st").innerHTML = `Live ✓ <a href="${r.site || "#"}" target="_blank" rel="noopener">View site ↗</a>`;
          return;
        }
      }
      unpublished = false; fill(100);
      status("Sent, but the site is taking longer than usual. It should appear within a few minutes.");
    } catch (e) {
      fill(0); status("Publish failed: " + String(e.message || e).slice(0, 90));
    } finally {
      busy = false; armed = null; pubBtn.disabled = false; saveBtn.disabled = false; paint();
    }
  }

  // Two clicks to publish, so it never happens by accident
  pubBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (busy) return;
    if (!armed) { armed = setTimeout(() => { armed = null; paint(); }, 3000); paint(); return; }
    clearTimeout(armed); armed = null; publish();
  }, true);

  return { paint, changed() { unpublished = true; paint(); } };
};
