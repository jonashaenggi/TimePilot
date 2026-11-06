import test from "node:test";
import assert from "node:assert/strict";
import { createDemoData, createEmptyData, validateBackup, type AppData } from "./study.ts";
import { finishFocusTimer, mergeVault, validateFocusTimer, type FocusTimer } from "./workspace.ts";
import type { VaultImport } from "./vault-import";

const timer = (changes: Partial<FocusTimer> = {}): FocusTimer => ({ id: "focus-1", subjectId: "statistics", totalSeconds: 1500, remainingSeconds: 600, endsAt: new Date(2040, 0, 2, 10, 0).getTime(), ...changes });
const vault = (changes: Partial<VaultImport> = {}): VaultImport => ({
  subjects: [createEmptyData().subjects[0]], exams: [], errors: [], warnings: [],
  vault: { name: "Example", importedAt: "2040-01-02T10:00:00.000Z", noteCount: 1 }, ...changes,
});

test("validates and clones running and paused focus timers", () => {
  const data = createEmptyData();
  const running = timer();
  assert.deepEqual(validateFocusTimer(running, data), running);
  assert.notEqual(validateFocusTimer(running, data), running);
  assert.equal(validateFocusTimer(timer({ endsAt: null }), data)?.endsAt, null);
});

test("rejects unknown subjects, fractional durations, unsafe IDs and inconsistent remaining time", () => {
  const data = createEmptyData();
  for (const value of [
    null, [], {}, timer({ subjectId: "unknown" }), timer({ id: "../bad" }), timer({ id: "x".repeat(101) }),
    timer({ totalSeconds: 1500.5 }), timer({ totalSeconds: 61 }), timer({ totalSeconds: 0 }), timer({ totalSeconds: 7260 }),
    timer({ remainingSeconds: -1 }), timer({ remainingSeconds: 1501 }), timer({ remainingSeconds: 0.5 }),
    timer({ endsAt: Number.NaN }), timer({ endsAt: Infinity }), timer({ endsAt: Date.UTC(1800, 0, 1) }), timer({ endsAt: Date.UTC(2201, 0, 1) }),
  ]) assert.equal(validateFocusTimer(value, data), null);
});

test("finished timers use their scheduled date after reload and are idempotent", () => {
  const data = createEmptyData();
  const completed = timer({ remainingSeconds: 0 });
  const now = new Date(2040, 0, 5, 12).getTime();
  const result = finishFocusTimer(data, completed, now);
  assert.equal(data.focusLog.length, 0);
  assert.deepEqual(result.focusLog, [{ id: "focus-1", date: "2040-01-02", minutes: 25, subjectId: "statistics" }]);
  assert.equal(finishFocusTimer(result, completed, now), result);
  assert.doesNotThrow(() => validateBackup(JSON.parse(JSON.stringify(result))));
});

test("expired running timers finish on reload but paused, future and invalid timers do not", () => {
  const data = createEmptyData();
  const now = new Date(2040, 0, 5).getTime();
  assert.equal(finishFocusTimer(data, timer(), now).focusLog.length, 1);
  assert.equal(finishFocusTimer(data, timer({ endsAt: null, remainingSeconds: 0 }), now), data);
  assert.equal(finishFocusTimer(data, timer({ endsAt: now + 1000 }), now), data);
  assert.equal(finishFocusTimer(data, timer({ subjectId: "missing" }), now), data);
  assert.equal(finishFocusTimer(data, timer({ totalSeconds: 70 }), now), data);
});

test("merging a vault preserves manual work and custom subject references", () => {
  const data = createEmptyData();
  data.subjects.push({ id: "custom", name: "My module", short: "MY", color: "#123456", priority: "normal", noteCount: 0 });
  data.tasks.push({ id: "task-1", title: "Manual task", subjectId: "custom", date: "2040-01-01", minutes: 20, completed: false });
  data.sessions.push({ id: "session-1", title: "Manual block", subjectId: "custom", date: "2040-01-01", start: "10:00", minutes: 20, completed: false });
  data.focusLog.push({ id: "focus-old", subjectId: "custom", date: "2040-01-01", minutes: 25 });
  data.exams.push({ id: "manual-exam", title: "Manual exam", subjectId: "custom", date: "2040-01-01", priority: "normal" }, { id: "vault-exam-old", title: "Old import", subjectId: "statistics", date: "2040-01-01", priority: "normal" });
  data.errors.push({ id: "manual-error", title: "Manual error", subjectId: "custom", dueDate: "2040-01-01", resolved: false }, { id: "vault-error-old", title: "Old import", subjectId: "statistics", dueDate: "2040-01-01", resolved: false });
  const imported = vault({ exams: [{ id: "vault-exam-new", title: "New import", subjectId: "statistics", date: "2040-02-02", priority: "normal" }] });
  const result = mergeVault(data, imported);
  assert.ok(result.subjects.some(subject => subject.id === "custom"));
  assert.deepEqual(result.tasks, data.tasks);
  assert.deepEqual(result.sessions, data.sessions);
  assert.deepEqual(result.focusLog, data.focusLog);
  assert.deepEqual(result.exams.map(exam => exam.id), ["manual-exam", "vault-exam-new"]);
  assert.deepEqual(result.errors.map(error => error.id), ["manual-error"]);
  assert.doesNotThrow(() => validateBackup(JSON.parse(JSON.stringify(result))));
  assert.equal(data.exams[1].id, "vault-exam-old");
});

test("imported subject values update defaults while newly discovered subjects are added", () => {
  const data = createEmptyData();
  const updated = { ...data.subjects[0], priority: "low" as const, noteCount: 7 };
  const custom = { id: "new-subject", name: "New module", short: "NEW", color: "#112233", priority: "normal" as const, noteCount: 3 };
  const result = mergeVault(data, vault({ subjects: [updated, custom] }));
  assert.equal(result.subjects.find(subject => subject.id === "statistics")?.noteCount, 7);
  assert.equal(result.subjects.find(subject => subject.id === "statistics")?.priority, "low");
  assert.equal(result.subjects.find(subject => subject.id === "new-subject")?.noteCount, 3);
});

test("demo imports clear illustrative records and return validated personal data", () => {
  const demo = createDemoData(new Date(2040, 0, 2));
  const result = mergeVault(demo, vault());
  assert.equal(result.mode, "personal");
  assert.equal(result.tasks.length, 0);
  assert.equal(result.sessions.length, 0);
  assert.equal(result.exams.length, 0);
  assert.equal(result.focusLog.length, 0);
});

test("invalid merged imports throw without mutating the existing workspace", () => {
  const data = createEmptyData();
  const before = JSON.stringify(data);
  const invalid = vault({ exams: [{ id: "vault-new", title: "Bad subject", subjectId: "missing", date: "2040-01-01", priority: "normal" }] });
  assert.throws(() => mergeVault(data, invalid), /Unbekanntes Fach/);
  assert.equal(JSON.stringify(data), before);
  assert.equal(finishFocusTimer({ ...data, tasks: [{ id: "invalid" }] } as AppData, timer(), new Date(2040, 0, 5).getTime()).focusLog.length, 0);
});
