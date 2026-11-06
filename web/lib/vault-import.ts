import type { Exam, LearningError, Subject } from "./study";

export interface VaultFile {
  name: string;
  webkitRelativePath?: string;
  size?: number;
  text(): Promise<string>;
}

export interface VaultImport {
  subjects: Subject[];
  exams: Exam[];
  errors: LearningError[];
  vault: { name: string; importedAt: string; noteCount: number };
  warnings: string[];
}

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_RECORDS = 10000;
const SUBJECTS = [
  { id: "statistics", name: "Statistik", short: "STAT", color: "#7471e8", aliases: ["statistik", "einfuhrung in die statistik", "statistics"] },
  { id: "architecture", name: "Computer Architecture", short: "CA", color: "#f2a65a", aliases: ["computer architecture", "architecture"] },
  { id: "computing", name: "Scientific Computing", short: "SC", color: "#54b6a5", aliases: ["scientific computing", "sc"] },
  { id: "databases", name: "Introduction to Databases", short: "DB", color: "#6698d6", aliases: ["introduction to databases", "databases"] },
  { id: "engineering", name: "Software Engineering", short: "SE", color: "#d682ad", aliases: ["software engineering", "se"] },
  { id: "physics", name: "Physik I", short: "PHY", color: "#91ae65", aliases: ["physik i", "physik", "einfuhrung in die physik i: mechanik und thermodynamik"] },
  { id: "game-theory", name: "Spieltheorie", short: "GT", color: "#bd96df", aliases: ["spieltheorie", "spieltheorie und experimental economics", "einfuhrung in die spieltheorie und experimental economics"] },
  { id: "complex-analysis", name: "Funktionentheorie und Vektoranalysis", short: "FV", color: "#86a3ad", aliases: ["funktionentheorie", "funktionentheorie und vektoranalysis"] },
];

function plain(value: string): string {
  return value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, path: string, label?: string) => label || path)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 500);
}

function key(value: string): string {
  return plain(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function slug(value: string): string {
  return key(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `${slug(value).slice(0, 65) || "entry"}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** Strict calendar dates, without Date's rollover of 31 February into March. */
function calendarDate(value: string): string | undefined {
  const text = plain(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const european = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (!iso && !european) return undefined;
  const year = Number(iso ? iso[1] : european![3]);
  const month = Number(iso ? iso[2] : european![2]);
  const day = Number(iso ? iso[3] : european![1]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map(cell => plain(cell.replace(/\\\|/g, "|")));
}

interface TableRow { fields: Record<string, string>; line: number }

function tableRows(markdown: string): TableRow[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const rows: TableRow[] = [];
  let headers: string[] = [];
  let fenced = false;
  for (let index = 0; index < lines.length; index++) {
    if (/^\s*(```|~~~)/.test(lines[index])) { fenced = !fenced; headers = []; continue; }
    if (fenced) continue;
    const line = lines[index].trim();
    if (!line.includes("|")) { headers = []; continue; }
    const next = lines[index + 1];
    if (next && cells(next).every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")))) {
      headers = cells(line).map(key);
      index++;
      continue;
    }
    if (!headers.length) continue;
    const values = cells(line);
    if (values.length !== headers.length) continue;
    rows.push({ fields: Object.fromEntries(headers.map((header, i) => [header, values[i]])), line: index + 1 });
  }
  return rows;
}

function field(fields: Record<string, string>, names: string[]): string {
  return names.map(name => fields[name]).find(Boolean) || "";
}

function relativePath(file: VaultFile): { path: string; vaultName?: string } | undefined {
  const raw = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
  const parts = raw.split("/").filter(Boolean);
  if (parts.some(part => part === ".." || part.includes("\0")) || !parts.length) return undefined;
  if (parts.some(part => [".git", ".obsidian", "node_modules"].includes(part))) return undefined;
  const rootMarkers = ["20_Themen", "30_Faecher", "90_Pruefen", "00_Eingang", "10_Quellen"];
  const marker = parts.findIndex(part => rootMarkers.includes(part));
  if (marker >= 0) return { path: parts.slice(marker).join("/"), vaultName: marker > 0 ? parts[0] : undefined };
  return { path: file.webkitRelativePath && parts.length > 1 ? parts.slice(1).join("/") : parts.join("/"), vaultName: file.webkitRelativePath && parts.length > 1 ? parts[0] : undefined };
}

export async function importVault(files: VaultFile[]): Promise<VaultImport> {
  const subjects = new Map<string, Subject>();
  const exams = new Map<string, Exam>();
  const errors = new Map<string, LearningError>();
  const warnings: string[] = [];
  const paths = new Set<string>();
  let vaultName = "Importierter Vault";
  let noteCount = 0;
  let examFileFound = false;
  let vaultMarkerFound = false;
  const warnedLimits = new Set<string>();

  function limitReached(kind: string, count: number): boolean {
    if (count < MAX_RECORDS) return false;
    if (!warnedLimits.has(kind)) { warnings.push(`Maximal ${MAX_RECORDS} ${kind} werden pro Import übernommen; weitere Einträge wurden ausgelassen.`); warnedLimits.add(kind); }
    return true;
  }

  function subjectFor(raw: string): Subject | undefined {
    const label = plain(raw).replace(/\.md$/i, "").slice(0, 200);
    if (!label) return undefined;
    const normalized = key(label);
    const known = SUBJECTS.find(subject => subject.aliases.includes(normalized));
    const id = known?.id || (slug(label).length <= 90 ? slug(label) : stableId(label));
    if (!id) return undefined;
    if (!subjects.has(id) && limitReached("Fächer", subjects.size)) return undefined;
    if (!subjects.has(id)) subjects.set(id, {
      id, name: known?.name || label, short: known?.short || label.split(/\s+/).map(word => word[0]).join("").slice(0, 4).toUpperCase(),
      color: known?.color || "#86a3ad", priority: "normal", noteCount: 0,
    });
    return subjects.get(id)!;
  }

  function applyPriority(subject: Subject, raw: string): void {
    const normalized = key(raw);
    if (/keine teilnahme|keine lernzeit|kein lernbudget|nicht geschrieben|pausiert|paused/.test(normalized)) subject.priority = "paused";
    else if (/niedrig|wenig prioritat|low/.test(normalized) && subject.priority !== "paused") subject.priority = "low";
    else if (/hoch|high/.test(normalized) && !["paused", "low"].includes(subject.priority)) subject.priority = "high";
  }

  function addError(fields: Record<string, string>, path: string, line: number): void {
    const title = field(fields, ["fehler", "fehlerbeschreibung", "title", "titel", "konzept", "thema"]).slice(0, 200);
    const dueRaw = field(fields, ["fallig", "falligkeit", "nachste wiederholung", "nachster wiederholungstermin", "duedate", "due_date", "nextreviewdate"]);
    const dueDate = calendarDate(dueRaw);
    const fallbackSubject = path.split("/").at(-1)!.replace(/\.md$/i, "");
    const subject = subjectFor(field(fields, ["fach", "subject", "subjectid", "subject_id"]) || fallbackSubject);
    if (!title || !dueDate || !subject) {
      warnings.push(`${path}:${line}: Fehlereintrag ohne gültigen Titel, Fach oder Wiederholungstermin ausgelassen.`);
      return;
    }
    const rawId = field(fields, ["id", "fehler-id"]);
    const id = `vault-error-${stableId(rawId || `${subject.id}-${title}`)}`;
    if (errors.has(id)) { warnings.push(`${path}:${line}: Doppelter Fehlereintrag ausgelassen.`); return; }
    if (limitReached("Lernfehler", errors.size)) return;
    errors.set(id, { id, title, subjectId: subject.id, dueDate, resolved: /^(erledigt|gelost|beherrscht|abgeschlossen|resolved|true)$/i.test(field(fields, ["status", "resolved"])) });
  }

  for (const file of files) {
    if (!/\.md$/i.test(file.name)) continue;
    const location = relativePath(file);
    if (!location) continue;
    const { path } = location;
    if (location.vaultName) vaultName = location.vaultName.slice(0, 200);
    if (paths.has(path)) { warnings.push(`${path}: Doppelt ausgewählte Datei ausgelassen.`); continue; }
    paths.add(path);
    const topic = /^20_Themen\/([^/]+)\//.exec(path);
    if (topic && !/(^|\/)index\.md$/i.test(path)) {
      noteCount++;
      const subject = /^(fachuebergreifend|fachubergreifend)$/i.test(key(topic[1])) ? undefined : subjectFor(topic[1]);
      if (subject) subject.noteCount++;
    }
    const filename = path.split("/").at(-1)!;
    const examFile = /pr(?:ue|ü|u)fungstermine|exam[-_ ]?(dates|schedule)/i.test(filename) && !path.includes("/");
    const planFile = /lernplan|study[-_ ]?plan/i.test(filename) && !path.includes("/");
    const errorFile = /^90_Pruefen\/Fehlertraining\//.test(path) && !/^index\.md$/i.test(filename);
    if (examFile || planFile || errorFile || /^(20_Themen|30_Faecher)\//.test(path) || /^(index|Verarbeitungsregeln)\.md$/i.test(path)) vaultMarkerFound = true;
    if (!examFile && !planFile && !errorFile) continue;
    if (file.size !== undefined && file.size > MAX_MARKDOWN_BYTES) { warnings.push(`${path}: Datei ist grösser als 2 MB und wurde nicht gelesen.`); continue; }
    let markdown: string;
    try { markdown = await file.text(); }
    catch { warnings.push(`${path}: Datei konnte nicht gelesen werden.`); continue; }
    if (new TextEncoder().encode(markdown).byteLength > MAX_MARKDOWN_BYTES) { warnings.push(`${path}: Datei ist grösser als 2 MB und wurde ausgelassen.`); continue; }
    if (planFile) {
      const lines = markdown.split(/\r?\n|(?<=[.!?])\s+|;\s*|\|/);
      for (const line of lines) {
        const normalized = key(line);
        for (const known of SUBJECTS) {
          if (known.aliases.filter(alias => alias.length > 3).some(alias => normalized.includes(alias))) {
            const subject = subjectFor(known.name);
            if (subject) applyPriority(subject, line);
          }
        }
      }
    }
    if (examFile) {
      examFileFound = true;
      for (const row of tableRows(markdown)) {
        const dateRaw = field(row.fields, ["datum", "date"]);
        const title = field(row.fields, ["prufung", "titel", "title", "exam"]).slice(0, 200);
        if (!dateRaw && !title) continue;
        const date = calendarDate(dateRaw);
        const subject = subjectFor(field(row.fields, ["fach", "subject", "modul"]));
        if (!date || !subject || !title) { warnings.push(`${path}:${row.line}: Prüfung ohne gültiges Datum, Fach oder Titel ausgelassen.`); continue; }
        const priorityRaw = field(row.fields, ["prioritat", "priority", "teilnahme"]);
        applyPriority(subject, priorityRaw);
        const identity = `${subject.id}-${date}-${slug(title)}`;
        const id = `vault-exam-${stableId(identity)}`;
        if (exams.has(id)) { warnings.push(`${path}:${row.line}: Doppelte Prüfung ausgelassen.`); continue; }
        if (limitReached("Prüfungen", exams.size)) continue;
        let time: string | undefined;
        const timeRaw = field(row.fields, ["uhrzeit", "zeit", "time"]);
        if (timeRaw && !/^(offen|unbekannt|unknown|tbd|[-–—])$/i.test(timeRaw)) {
          const times = /^(\d{1,2}):(\d{2})(?:\s*[-–—]\s*(\d{1,2}):(\d{2}))?$/.exec(timeRaw);
          if (times && Number(times[1]) < 24 && Number(times[2]) < 60 && (!times[3] || (Number(times[3]) < 24 && Number(times[4]) < 60 && Number(times[3]) * 60 + Number(times[4]) > Number(times[1]) * 60 + Number(times[2])))) {
            // The app's editable time field and backup schema store the start time.
            time = `${times[1].padStart(2, "0")}:${times[2]}`;
          } else warnings.push(`${path}:${row.line}: Ungültige Uhrzeit; Prüfung ohne Uhrzeit übernommen.`);
        }
        exams.set(id, { id, title, subjectId: subject.id, date, ...(time ? { time } : {}), priority: /hoch|high/i.test(priorityRaw) ? "high" : /niedrig|low/i.test(priorityRaw) ? "low" : "normal", ...(/vorlaufig|voraussichtlich|tentative/i.test(key(Object.values(row.fields).join(" "))) ? { tentative: true } : {}) });
      }
    }
    if (errorFile) {
      const rows = tableRows(markdown);
      for (const row of rows) addError(row.fields, path, row.line);
      // Also accept per-error headings with labelled fields, as used in editable registers.
      const lines = markdown.replace(/\r\n/g, "\n").split("\n");
      let fields: Record<string, string> = {};
      let sectionLine = 1;
      let fenced = false;
      const flush = () => {
        if (Object.keys(fields).some(name => ["id", "fehler-id", "fallig", "falligkeit", "nachste wiederholung", "duedate", "due_date", "nextreviewdate"].includes(name))) addError(fields, path, sectionLine);
        fields = {};
      };
      lines.forEach((line, index) => {
        if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
        if (fenced) return;
        const heading = /^#{2,3}\s+(?:Fehler\s*:\s*)?(.+)/i.exec(line);
        if (heading) { flush(); sectionLine = index + 1; fields.titel = plain(heading[1]); return; }
        const entry = /^\s*(?:[-*]\s+)?(?:\*\*)?([^:*]+?)(?:\*\*)?\s*:\s*(.*)$/.exec(line);
        if (entry && !line.includes("|")) fields[key(entry[1])] = plain(entry[2]).replace(/^["']|["']$/g, "");
      });
      flush();
    }
  }
  if (!vaultMarkerFound) throw new Error("Kein Obsidian-Lernvault erkannt. Bitte den Hauptordner mit 20_Themen, 30_Faecher oder deinen Planungsdateien auswählen.");
  if (!noteCount) warnings.push("Keine Themennotizen unter 20_Themen gefunden.");
  if (!examFileFound) warnings.push("Keine Prüfungstermin-Datei im Vault-Hauptordner gefunden.");
  else if (!exams.size) warnings.push("Keine gültigen Prüfungen in den ausgewählten Termin-Dateien erkannt.");
  return { subjects: [...subjects.values()], exams: [...exams.values()].sort((a, b) => a.date.localeCompare(b.date)), errors: [...errors.values()], vault: { name: vaultName, importedAt: new Date().toISOString(), noteCount }, warnings };
}
