(function () {
  "use strict";
  const choices = {
    cinema: { label: "1 · Кино", color: "#111214" },
    noir: { label: "2 · Нуар", color: "#0a0a0b" },
    list: { label: "3 · Список", color: "#101926" },
    neon: { label: "4 · Неон", color: "#100e19" },
  };
  const key = "dc-appearance-v1";
  let selected = "cinema";
  try {
    const previous = localStorage.getItem(key);
    const saved = previous === "paper" ? "noir" : previous;
    if (Object.hasOwn(choices, saved)) selected = saved;
    if (previous === "paper") localStorage.setItem(key, selected);
  } catch {}
  function apply(value) {
    if (value === "paper") value = "noir";
    if (!Object.hasOwn(choices, value)) return;
    selected = value;
    document.documentElement.dataset.appearance = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", choices[value].color);
    const label = document.getElementById("appearance-current");
    if (label) label.textContent = choices[value].label;
    document.querySelectorAll("[data-appearance-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.appearanceChoice === value));
    });
  }
  // Apply the saved dark palette before the first paint.
  apply(selected);
  document.addEventListener("DOMContentLoaded", () => {
    const picker = document.getElementById("appearance-picker");
    if (!picker) return;
    apply(selected);
    picker.addEventListener("click", (event) => {
      const button = event.target.closest("[data-appearance-choice]");
      if (!button) return;
      apply(button.dataset.appearanceChoice);
      try { localStorage.setItem(key, selected); } catch {}
      picker.open = false;
      picker.querySelector("summary").focus();
    });
    document.addEventListener("click", (event) => {
      if (!picker.contains(event.target)) picker.open = false;
    });
    picker.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      picker.open = false;
      picker.querySelector("summary").focus();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === key) apply(event.newValue || "cinema");
    });
  });
})();
