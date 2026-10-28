// Edits values of a .grtload file in place, leaving everything else byte for byte unchanged.

export type GrtSectionName = 'caliber' | 'gun' | 'projectile' | 'propellant';

/** URL encoding as GRT writes it (encodeURIComponent plus the characters it leaves alone). */
export function grtEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** URL decoding; a value that is not valid URL encoding (a literal "%" typed by hand) stays as it is. */
export function grtDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Sets the value (in the unit the file uses for it) of one <input> of a section. */
export function setInput(xml: string, section: GrtSectionName, name: string, value: string | number): string {
  const block = new RegExp(`(<${section}>)([\\s\\S]*?)(</${section}>)`);
  const m = block.exec(xml);
  if (!m) throw new Error(`section <${section}> missing`);
  const field = new RegExp(`(<input\\s+name="${escapeRe(name)}"\\s+value=")([^"]*)(")`);
  if (!field.test(m[2]!)) throw new Error(`input "${name}" missing in <${section}>`);
  const body = m[2]!.replace(field, (_, a: string, _old: string, c: string) => a + grtEncode(String(value)) + c);
  return xml.slice(0, m.index) + m[1] + body + m[3] + xml.slice(m.index + m[0].length);
}

/** Reads the raw (decoded) value of one <input> of a section. */
export function getInput(xml: string, section: GrtSectionName, name: string): string {
  const block = new RegExp(`<${section}>([\\s\\S]*?)</${section}>`).exec(xml);
  const field = block && new RegExp(`<input\\s+name="${escapeRe(name)}"\\s+value="([^"]*)"`).exec(block[1]!);
  if (!field) throw new Error(`input "${name}" missing in <${section}>`);
  return grtDecode(field[1]!);
}

export function setTitle(xml: string, title: string): string {
  return xml.replace(/<title>[^<]*<\/title>/, `<title>${grtEncode(title)}</title>`);
}
