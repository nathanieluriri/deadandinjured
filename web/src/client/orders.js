import { cleanOrders, anySupply, MINUTES, TURN_SECONDS } from "../shared/rules.js";

// A player's orders as a typed form: the supplies ticked in pencil, the crates as stencilled
// crates to count off, the time limit circled. Real checkboxes and radio buttons sit under the
// paper, so it works with a keyboard and a screen reader.
const SUPPLY = [
  ["recon", "Recon plane"],
  ["sniper", "Sniper"],
  ["smoke", "Smoke"],
];

let uid = 0;

export class OrdersForm {
  constructor(host, { orders, onChange, title = "Orders", readonly = false } = {}) {
    this.host = host;
    this.onChange = onChange;
    this.readonly = readonly;
    this.id = `orders${++uid}`;
    this.o = cleanOrders(orders);
    host.classList.add("orders-form");
    host.innerHTML = `
      <p class="of-head">${title}</p>
      <fieldset class="of-row of-supplies"><legend>Supplies</legend>
        ${SUPPLY.map(([k, label]) => `<label class="of-tick"><input type="checkbox" name="${k}"${readonly ? " disabled" : ""}><span class="box" aria-hidden="true"></span>${label}</label>`).join("")}
      </fieldset>
      <fieldset class="of-row of-crates"><legend>Crates</legend>
        <span class="of-crate-row">${[1, 2, 3, 4, 5].map((n) => `<label class="of-crate"><input type="radio" name="${this.id}-crates" value="${n}"${readonly ? " disabled" : ""}><span class="crate" aria-hidden="true"></span><span class="vh">${n} ${n === 1 ? "crate" : "crates"}</span></label>`).join("")}</span>
        <span class="of-note" data-crates></span>
      </fieldset>
      <fieldset class="of-row of-time"><legend>Time limit</legend>
        <span class="of-mins">${MINUTES.map((m) => `<label class="of-min"><input type="radio" name="${this.id}-min" value="${m}"${readonly ? " disabled" : ""}><span>${m} min</span></label>`).join("")}</span>
        <span class="of-note" data-turn></span>
      </fieldset>`;
    host.addEventListener("change", () => this.read());
    this.render();
  }

  get value() {
    return { ...this.o };
  }

  set(orders) {
    this.o = cleanOrders(orders);
    this.render();
  }

  read() {
    if (this.readonly) return;
    const h = this.host;
    const o = { ...this.o };
    for (const [k] of SUPPLY) o[k] = h.querySelector(`input[name="${k}"]`).checked;
    const c = h.querySelector(`input[name="${this.id}-crates"]:checked`);
    if (c) o.crates = Number(c.value);
    const m = h.querySelector(`input[name="${this.id}-min"]:checked`);
    if (m) o.minutes = Number(m.value);
    this.o = cleanOrders(o);
    this.render();
    this.onChange?.(this.value);
  }

  render() {
    const h = this.host;
    const o = this.o;
    for (const [k] of SUPPLY) h.querySelector(`input[name="${k}"]`).checked = o[k];
    for (const r of h.querySelectorAll(`input[name="${this.id}-crates"]`)) {
      r.checked = Number(r.value) === o.crates;
      r.closest(".of-crate").classList.toggle("on", Number(r.value) <= o.crates);
    }
    for (const r of h.querySelectorAll(`input[name="${this.id}-min"]`)) r.checked = Number(r.value) === o.minutes;
    const armed = anySupply(o);
    h.querySelector(".of-crates").disabled = !armed || this.readonly;
    h.querySelector(".of-crates").classList.toggle("off", !armed);
    h.querySelector("[data-crates]").textContent = armed ? `Winner of the draw ${o.crates}, loser ${o.crates - 1}` : "No supplies: the draw wins the first shot";
    h.querySelector("[data-turn]").textContent = `${TURN_SECONDS[o.minutes]} seconds a turn`;
  }
}

// The same orders as one typed line, for a telegram or a note.
export function ordersLine(orders) {
  const o = cleanOrders(orders);
  const sup = SUPPLY.filter(([k]) => o[k]).map(([, l]) => l.split(" ")[0]);
  const s = sup.length ? `${sup.join(", ")}, ${o.crates} ${o.crates === 1 ? "crate" : "crates"}` : "No supplies";
  return `${s}. ${o.minutes} minutes, ${TURN_SECONDS[o.minutes]} seconds a turn.`;
}
