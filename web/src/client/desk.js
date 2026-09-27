// The match's windows, run like a taskbar: an icon opens its window, the icon of the window in
// front minimises it again, and each window's own studs minimise (keeping what is in it) or close
// (clearing it). On a phone one window shows at a time, as a sheet rising from the bar.
const SUPPLIES = ["recon", "sniper", "smoke"];
const KEEP = ["aim", "log", "chat"];
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const store = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {}
  return null;
};

export class Desk {
  constructor({ onOpen, onClose, onChange, sound }) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onChange = onChange;
    this.sound = sound;
    this.wins = new Map();
    this.order = [];
    for (const el of document.querySelectorAll("#desk [data-win]")) {
      const name = el.dataset.win;
      const button = document.querySelector(`#bar [data-open="${name}"]`);
      const w = { name, el, button, state: "closed", anim: null };
      this.wins.set(name, w);
      el.querySelector(".w-min").addEventListener("click", () => this.minimise(name, true));
      el.querySelector(".w-x").addEventListener("click", () => this.close(name, true));
      el.addEventListener("pointerdown", () => this.front !== name && this.raise(name));
      button.addEventListener("click", () => this.toggle(name, true));
    }
    let saved = null;
    try { saved = JSON.parse(store("di.desk") || "null"); } catch {}
    this.saved = saved || { aim: "open", log: "open", chat: "closed" };
  }

  get phone() {
    return innerWidth < 900;
  }

  get front() {
    return this.order.at(-1) || null;
  }

  state(name) {
    return this.wins.get(name)?.state || "closed";
  }

  isOpen(name) {
    return this.state(name) === "open";
  }

  // The icon click: open it, bring it forward, or put it away if it is already in front.
  toggle(name, byUser = false) {
    const w = this.wins.get(name);
    if (!w || w.button.disabled) return;
    if (w.state === "open" && this.front === name) this.minimise(name, byUser);
    else this.open(name, { byUser });
  }

  open(name, { byUser = false, focus = byUser && document.activeElement === this.wins.get(name)?.button } = {}) {
    const w = this.wins.get(name);
    if (!w) return;
    const others = [...this.wins.values()].filter((o) => o !== w && o.state === "open");
    for (const o of others) {
      if (this.phone || (SUPPLIES.includes(name) && SUPPLIES.includes(o.name))) this.minimise(o.name, false, true);
    }
    const was = w.state;
    w.state = "open";
    this.raise(name, true);
    if (was !== "open") {
      w.el.hidden = false;
      this.animate(w, "in");
      this.onOpen?.(name);
      if (byUser) this.sound?.("open", name);
    }
    if (focus) requestAnimationFrame(() => w.el.querySelector(".pad button:not(:disabled), .pick button:not(:disabled), .go:not(:disabled), [role=tab][aria-selected=true], .taunts button, .w-min")?.focus({ preventScroll: true }));
    this.changed(byUser);
  }

  minimise(name, byUser = false, quiet = false) {
    const w = this.wins.get(name);
    if (!w || w.state !== "open") return;
    w.state = "min";
    this.drop(name);
    const hadFocus = w.el.contains(document.activeElement);
    this.animate(w, "min");
    if (byUser && !quiet) this.sound?.("min", name);
    if (hadFocus) w.button.focus({ preventScroll: true });
    this.changed(byUser);
  }

  close(name, byUser = false) {
    const w = this.wins.get(name);
    if (!w || w.state === "closed") return;
    const was = w.state;
    w.state = "closed";
    this.drop(name);
    const hadFocus = w.el.contains(document.activeElement);
    if (was === "open") this.animate(w, "close");
    this.onClose?.(name);
    if (byUser) this.sound?.("close", name);
    if (hadFocus) w.button.focus({ preventScroll: true });
    this.changed(byUser);
  }

  // Esc: the window in front goes back to its icon. Returns false when nothing was open.
  escape() {
    const f = this.front;
    if (!f) return false;
    this.minimise(f, true);
    return true;
  }

  raise(name, silent = false) {
    this.drop(name);
    this.order.push(name);
    this.order.forEach((n, i) => (this.wins.get(n).el.style.zIndex = String(10 + i)));
    if (!silent) this.changed(false);
  }

  drop(name) {
    const i = this.order.indexOf(name);
    if (i >= 0) this.order.splice(i, 1);
  }

  // The window rises out of its icon, sinks back into it, or is put away.
  animate(w, how) {
    w.anim?.cancel();
    const el = w.el;
    if (reduced()) {
      el.hidden = how !== "in";
      return;
    }
    const b = w.button.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (r.left + r.width / 2);
    const dy = b.top + b.height / 2 - (r.top + r.height / 2);
    const icon = `translate(${dx}px, ${dy}px) scale(0.08)`;
    let frames;
    let opts;
    if (how === "in") {
      frames = [{ transform: icon, opacity: 0 }, { transform: "none", opacity: 1 }];
      opts = { duration: 380, easing: "cubic-bezier(0.2, 1.1, 0.3, 1)" };
    } else if (how === "min") {
      frames = [{ transform: "none", opacity: 1 }, { transform: icon, opacity: 0 }];
      opts = { duration: 260, easing: "cubic-bezier(0.5, 0, 0.8, 0.4)" };
    } else {
      frames = [{ transform: "none", opacity: 1 }, { transform: "translateY(40px) rotate(-3deg)", opacity: 0 }];
      opts = { duration: 240, easing: "cubic-bezier(0.5, 0, 1, 1)" };
    }
    const a = el.animate(frames, opts);
    w.anim = a;
    a.onfinish = () => {
      if (w.anim !== a) return;
      w.anim = null;
      if (how !== "in") el.hidden = true;
    };
  }

  changed(byUser) {
    for (const w of this.wins.values()) {
      w.button.dataset.state = w.state === "open" ? (this.front === w.name ? "front" : "open") : w.state === "min" ? "min" : "";
      w.button.setAttribute("aria-expanded", String(w.state === "open"));
    }
    if (byUser && !this.phone) {
      const keep = {};
      for (const n of KEEP) keep[n] = this.state(n) === "open" ? "open" : "closed";
      this.saved = keep;
      store("di.desk", JSON.stringify(keep));
    }
    this.onChange?.();
  }

  // A new match: everything shut, then the windows that were open last time come back.
  reset({ restore = true } = {}) {
    for (const w of this.wins.values()) {
      w.anim?.cancel();
      w.state = "closed";
      w.el.hidden = true;
    }
    this.order = [];
    this.changed(false);
    if (!restore) return;
    if (this.phone) {
      this.open("aim");
      return;
    }
    for (const n of KEEP) if (this.saved[n] === "open") this.open(n);
  }
}
