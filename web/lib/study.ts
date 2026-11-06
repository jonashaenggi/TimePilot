export type SubjectPriority = "high" | "normal" | "low" | "paused";
export type Subject = { id: string; name: string; short: string; color: string; priority: SubjectPriority; noteCount: number };
export type Task = { id: string; title: string; subjectId: string; date: string; minutes: number; completed: boolean };
export type Session = { id: string; title: string; subjectId: string; date: string; start: string; minutes: number; completed: boolean };
export type Exam = { id: string; title: string; subjectId: string; date: string; time?: string; priority: "high" | "normal" | "low"; tentative?: boolean };
export type LearningError = { id: string; title: string; subjectId: string; dueDate: string; resolved: boolean };
export type FocusEntry = { id: string; date: string; minutes: number; subjectId: string };
export type VaultInfo = { name: string; importedAt: string; noteCount: number };
export type AppData = {
  version: 1; mode: "demo" | "personal"; subjects: Subject[]; tasks: Task[];
  sessions: Session[]; exams: Exam[]; errors: LearningError[];
  weeklyGoalMinutes: number; focusLog: FocusEntry[]; vault?: VaultInfo;
};

/** Local calendar date: never convert midnight through UTC. */
export function todayKey(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) throw new Error("Ungültiges Datum.");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekDates(date: Date = new Date(), offset = 0): string[] {
  if (!Number.isInteger(offset) || Math.abs(offset) > 5200) throw new Error("Ungültige Kalenderwoche.");
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return todayKey(day);
  });
}

export function defaultSubjects(): Subject[] {
  return [
    { id: "statistics", name: "Statistik", short: "STAT", color: "#8e7cc3", priority: "high", noteCount: 0 },
    { id: "architecture", name: "Computer Architecture", short: "CA", color: "#d89772", priority: "high", noteCount: 0 },
    { id: "computing", name: "Scientific Computing", short: "SC", color: "#7195a1", priority: "normal", noteCount: 0 },
    { id: "databases", name: "Introduction to Databases", short: "DB", color: "#75a08c", priority: "normal", noteCount: 0 },
    { id: "engineering", name: "Software Engineering", short: "SE", color: "#bd8eac", priority: "normal", noteCount: 0 },
    { id: "physics", name: "Physik I", short: "PHY", color: "#b6a05f", priority: "normal", noteCount: 0 },
    { id: "game-theory", name: "Spieltheorie", short: "GT", color: "#87a58c", priority: "low", noteCount: 0 },
    { id: "complex-analysis", name: "Funktionentheorie", short: "FT", color: "#949aa6", priority: "paused", noteCount: 0 },
  ];
}

export function createEmptyData(): AppData {
  return { version: 1, mode: "personal", subjects: defaultSubjects(), tasks: [], sessions: [], exams: [], errors: [], weeklyGoalMinutes: 600, focusLog: [] };
}

/** Entirely illustrative data, relative to today; never a claimed personal history. */
export function createDemoData(today: Date = new Date()): AppData {
  const data = createEmptyData();
  data.mode = "demo";
  const day = todayKey(today);
  const offsetDay = (offset: number) => {
    const value = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12);
    return todayKey(value);
  };
  const week = weekDates(today);
  data.tasks = [
    { id: "demo-task-1", title: "Bedingte Wahrscheinlichkeit festigen", subjectId: "statistics", date: day, minutes: 50, completed: false },
    { id: "demo-task-2", title: "Pointer & Speicher verstehen", subjectId: "architecture", date: day, minutes: 50, completed: false },
    { id: "demo-task-3", title: "Übungsblatt nachbereiten", subjectId: "computing", date: day, minutes: 30, completed: true },
  ];
  data.sessions = [
    { id: "demo-session-1", title: "Wahrscheinlichkeit & Bayes", subjectId: "statistics", date: day, start: "09:00", minutes: 50, completed: false },
    { id: "demo-session-2", title: "C: Pointer und Listen", subjectId: "architecture", date: day, start: "11:00", minutes: 50, completed: false },
    { id: "demo-session-3", title: "Lineare Gleichungssysteme", subjectId: "computing", date: week[1], start: "10:00", minutes: 50, completed: false },
    { id: "demo-session-4", title: "SQL praktisch anwenden", subjectId: "databases", date: week[3], start: "14:00", minutes: 50, completed: false },
    { id: "demo-session-5", title: "Projektschritt vorbereiten", subjectId: "engineering", date: week[4], start: "15:00", minutes: 50, completed: false },
  ];
  data.exams = [
    { id: "demo-exam-1", title: "Übungsklausur", subjectId: "statistics", date: offsetDay(12), priority: "high" },
    { id: "demo-exam-2", title: "Wissenscheck", subjectId: "architecture", date: offsetDay(19), priority: "normal" },
    { id: "demo-exam-3", title: "Probeprüfung", subjectId: "computing", date: offsetDay(27), priority: "normal", tentative: true },
  ];
  // An empty review queue is intentional: sample course material is not a user mistake.
  return data;
}

export function weekStats(data: AppData, date: Date = new Date()) {
  const dates = weekDates(date);
  const daily = dates.map(day => {
    const sessions = data.sessions.filter(session => session.date === day);
    return {
      date: day,
      plannedMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
      completedMinutes: sessions.filter(session => session.completed).reduce((sum, session) => sum + session.minutes, 0),
      focusMinutes: data.focusLog.filter(entry => entry.date === day).reduce((sum, entry) => sum + entry.minutes, 0),
    };
  });
  const sum = (key: "plannedMinutes" | "completedMinutes" | "focusMinutes") => daily.reduce((total, day) => total + day[key], 0);
  const sessions = data.sessions.filter(session => dates.includes(session.date));
  return {
    plannedMinutes: sum("plannedMinutes"), completedMinutes: sum("completedMinutes"), focusMinutes: sum("focusMinutes"),
    remainingMinutes: Math.max(0, data.weeklyGoalMinutes - sum("completedMinutes")),
    completedSessions: sessions.filter(session => session.completed).length,
    totalSessions: sessions.length, daily,
  };
}

function record(value: unknown, label: string, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: Objekt erwartet.`);
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some(key => !allowed.includes(key))) throw new Error(`${label}: Unbekanntes Feld.`);
  return object;
}
function text(value: unknown, label: string, max = 300): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label}: Ungültiger Text.`);
  return value;
}
function id(value: unknown): string {
  const result = text(value, "ID", 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new Error("Ungültige ID.");
  return result;
}
function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}: Ungültige Zahl.`);
  return value;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label}: Wahrheitswert erwartet.`);
  return value;
}
function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${label}: Unbekannter Wert.`);
  return value as T;
}
function calendarDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Ungültiges Kalenderdatum.");
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 2200 || todayKey(new Date(year, month - 1, day, 12)) !== value) throw new Error("Ungültiges Kalenderdatum.");
  return value;
}
function time(value: unknown): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Ungültige Uhrzeit.");
  return value;
}
function rows<T extends { id: string }>(value: unknown, label: string, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error(`${label}: Ungültige Liste.`);
  const result = value.map(parse);
  if (new Set(result.map(row => row.id)).size !== result.length) throw new Error(`${label}: Doppelte IDs.`);
  return result;
}

/** Validate and clone before replacing live state. Nothing in input is trusted or mutated. */
export function validateBackup(input: unknown): AppData {
  const data = record(input, "Backup", ["version", "mode", "subjects", "tasks", "sessions", "exams", "errors", "weeklyGoalMinutes", "focusLog", "vault"]);
  if (data.version !== 1) throw new Error("Nicht unterstützte Backup-Version.");
  const subjects = rows(data.subjects, "Fächer", value => {
    const row = record(value, "Fach", ["id", "name", "short", "color", "priority", "noteCount"]);
    const color = text(row.color, "Farbe", 7);
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("Ungültige Fachfarbe.");
    return { id: id(row.id), name: text(row.name, "Fachname", 200), short: text(row.short, "Fachkürzel", 20), color, priority: oneOf(row.priority, ["high", "normal", "low", "paused"] as const, "Priorität"), noteCount: integer(row.noteCount, "Notizanzahl", 0, 1000000) };
  });
  const subjectIds = new Set(subjects.map(subject => subject.id));
  const subjectId = (value: unknown) => {
    const result = id(value);
    if (!subjectIds.has(result)) throw new Error("Unbekanntes Fach in einem Eintrag.");
    return result;
  };
  const tasks = rows(data.tasks, "Aufgaben", value => {
    const row = record(value, "Aufgabe", ["id", "title", "subjectId", "date", "minutes", "completed"]);
    return { id: id(row.id), title: text(row.title, "Aufgabe"), subjectId: subjectId(row.subjectId), date: calendarDate(row.date), minutes: integer(row.minutes, "Aufwand", 1, 10080), completed: bool(row.completed, "Erledigt") };
  });
  const sessions = rows(data.sessions, "Lernblöcke", value => {
    const row = record(value, "Lernblock", ["id", "title", "subjectId", "date", "start", "minutes", "completed"]);
    const start = time(row.start);
    const minutes = integer(row.minutes, "Dauer", 1, 1440);
    const [hour, minute] = start.split(":").map(Number);
    if (hour * 60 + minute + minutes > 1440) throw new Error("Lernblock endet am Folgetag. Bitte aufteilen.");
    return { id: id(row.id), title: text(row.title, "Lernblock"), subjectId: subjectId(row.subjectId), date: calendarDate(row.date), start, minutes, completed: bool(row.completed, "Erledigt") };
  });
  const exams = rows(data.exams, "Prüfungen", value => {
    const row = record(value, "Prüfung", ["id", "title", "subjectId", "date", "time", "priority", "tentative"]);
    return { id: id(row.id), title: text(row.title, "Prüfung"), subjectId: subjectId(row.subjectId), date: calendarDate(row.date), priority: oneOf(row.priority, ["high", "normal", "low"] as const, "Priorität"), ...(row.time === undefined ? {} : { time: time(row.time) }), ...(row.tentative === undefined ? {} : { tentative: bool(row.tentative, "Vorläufig") }) };
  });
  const errors = rows(data.errors, "Lernfehler", value => {
    const row = record(value, "Lernfehler", ["id", "title", "subjectId", "dueDate", "resolved"]);
    return { id: id(row.id), title: text(row.title, "Lernfehler"), subjectId: subjectId(row.subjectId), dueDate: calendarDate(row.dueDate), resolved: bool(row.resolved, "Wiederholt") };
  });
  const focusLog = rows(data.focusLog, "Fokuszeiten", value => {
    const row = record(value, "Fokuszeit", ["id", "date", "minutes", "subjectId"]);
    return { id: id(row.id), date: calendarDate(row.date), minutes: integer(row.minutes, "Fokusdauer", 1, 1440), subjectId: subjectId(row.subjectId) };
  });
  let vault: VaultInfo | undefined;
  if (data.vault !== undefined) {
    const row = record(data.vault, "Vault", ["name", "importedAt", "noteCount"]);
    const importedAt = text(row.importedAt, "Importzeit", 60);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(importedAt) || Number.isNaN(Date.parse(importedAt))) throw new Error("Ungültige Importzeit.");
    vault = { name: text(row.name, "Vaultname", 200), importedAt, noteCount: integer(row.noteCount, "Notizanzahl", 0, 1000000) };
  }
  return { version: 1, mode: oneOf(data.mode, ["demo", "personal"] as const, "Modus"), subjects, tasks, sessions, exams, errors, focusLog, weeklyGoalMinutes: integer(data.weeklyGoalMinutes, "Wochenziel", 0, 10080), ...(vault ? { vault } : {}) };
}
