/** Small inert HTML tree for public review documents. Never executes markup. */
const entities = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  copy: "©",
  times: "×",
  minus: "−",
  trade: "™",
  euro: "€",
};
export function decodeText(s = "") {
  return String(s).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, key) => {
    if (key[0] === "#") {
      const n =
        key[1].toLowerCase() === "x"
          ? parseInt(key.slice(2), 16)
          : parseInt(key.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "�";
    }
    return entities[key.toLowerCase()] ?? all;
  });
}
export function parseHtml(html) {
  if (html.length > 3_000_000) throw Error("document-too-large");
  const root = { tag: "root", attrs: {}, children: [] },
    stack = [root];
  const token =
    /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  let m,
    count = 0;
  while ((m = token.exec(html))) {
    if (++count > 100000) throw Error("document-too-complex");
    if (m[3]) {
      stack.at(-1).children.push(m[3]);
      continue;
    }
    if (!m[1]) continue;
    const tag = m[1].toLowerCase();
    if (m[0][1] === "/") {
      let n = stack.length - 1;
      while (n > 0 && stack[n].tag !== tag) n--;
      if (n > 0) stack.length = n;
      continue;
    }
    const attrs = {};
    for (const a of m[2].matchAll(
      /([^\s=/'">]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
    ))
      attrs[a[1].toLowerCase()] = decodeText(a[2] ?? a[3] ?? a[4] ?? "");
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (
      !/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(
        tag,
      ) &&
      !m[0].endsWith("/>")
    )
      stack.push(node);
  }
  return root;
}
export function* elements(node) {
  if (typeof node === "string") return;
  yield node;
  for (const child of node.children) yield* elements(child);
}
export const hasClass = (node, name) =>
  (node.attrs?.class || "").split(/\s+/).includes(name);
export function textOf(node) {
  if (typeof node === "string") return decodeText(node);
  if (["script", "style", "noscript", "template"].includes(node.tag)) return "";
  return (
    (node.tag === "br" ? "\n" : "") +
    node.children.map(textOf).join("") +
    (["p", "div", "li", "blockquote"].includes(node.tag) ? "\n" : "")
  );
}
export const cleanText = (node) =>
  textOf(node)
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
