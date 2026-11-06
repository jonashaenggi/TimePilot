import { createEmptyData, todayKey, validateBackup, type AppData } from "./study.ts";
import type { VaultImport } from "./vault-import";

export type FocusTimer = {
  id: string;
  subjectId: string;
  totalSeconds: number;
  remainingSeconds: number;
  endsAt: number | null;
};

const MIN_TIMESTAMP = Date.UTC(1900, 0, 1);
const MAX_TIMESTAMP = Date.UTC(2201, 0, 1) - 1;
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);

/** Restored browser state is untrusted, just like an imported backup. */
export function validateFocusTimer(input: unknown, data: AppData): FocusTimer | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const timer = input as Record<string, unknown>;
  if (Object.keys(timer).some(key => !["id", "subjectId", "totalSeconds", "remainingSeconds", "endsAt"].includes(key))) return null;
  if (!safeId(timer.id) || !safeId(timer.subjectId) || !data.subjects.some(subject => subject.id === timer.subjectId)) return null;
  const { totalSeconds, remainingSeconds, endsAt } = timer;
  if (typeof totalSeconds !== "number" || !Number.isSafeInteger(totalSeconds) || totalSeconds <= 0 || totalSeconds > 7200 || totalSeconds % 60 !== 0) return null;
  if (typeof remainingSeconds !== "number" || !Number.isSafeInteger(remainingSeconds) || remainingSeconds < 0 || remainingSeconds > totalSeconds) return null;
  if (endsAt !== null && (typeof endsAt !== "number" || !Number.isSafeInteger(endsAt) || endsAt < MIN_TIMESTAMP || endsAt > MAX_TIMESTAMP)) return null;
  return { id: timer.id, subjectId: timer.subjectId, totalSeconds, remainingSeconds, endsAt };
}

/** Record a finished timer once, on its scheduled local end date, even after reload. */
export function finishFocusTimer(data: AppData, timer: FocusTimer, now: number = Date.now()): AppData {
  const valid = validateFocusTimer(timer, data);
  if (!valid || valid.endsAt === null || !Number.isFinite(now) || valid.endsAt > now || data.focusLog.some(entry => entry.id === valid.id)) return data;
  const date = todayKey(new Date(valid.endsAt));
  try {
    return validateBackup({ ...data, focusLog: [...data.focusLog, { id: valid.id, subjectId: valid.subjectId, date, minutes: valid.totalSeconds / 60 }] });
  } catch {
    // An invalid existing workspace must not gain another unpersistable record.
    return data;
  }
}

/** Replace imported records, keeping manual work and every subject it still references. */
export function mergeVault(data: AppData, result: VaultImport): AppData {
  const base = data.mode === "demo" ? createEmptyData() : data;
  const subjects = new Map(base.subjects.map(subject => [subject.id, subject]));
  for (const imported of result.subjects) subjects.set(imported.id, imported);
  return validateBackup({
    ...base,
    mode: "personal",
    subjects: [...subjects.values()],
    exams: [...base.exams.filter(exam => !exam.id.startsWith("vault-")), ...result.exams],
    errors: [...base.errors.filter(error => !error.id.startsWith("vault-")), ...result.errors],
    vault: result.vault,
  });
}
