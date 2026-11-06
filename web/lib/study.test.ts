import test from "node:test";
import assert from "node:assert/strict";
import { createDemoData, createEmptyData, defaultSubjects, todayKey, validateBackup, weekDates, weekStats } from "./study.ts";

test("local week begins Monday, including Sunday, year boundary and daylight saving", () => {
  assert.deepEqual(weekDates(new Date(2027, 0, 3, 23)), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.equal(weekDates(new Date(2026, 2, 29), 1)[0], "2026-03-30");
  assert.equal(todayKey(new Date(2026, 10, 7, 0, 1)), "2026-11-07");
});

test("empty personal data contains no fabricated performance or personal mistakes", () => {
  const data = createEmptyData();
  assert.equal(data.mode, "personal");
  for (const rows of [data.tasks, data.sessions, data.exams, data.errors, data.focusLog]) assert.equal(rows.length, 0);
  assert.equal(weekStats(data).completedMinutes, 0);
  assert.equal(data.subjects.find(subject => subject.id === "complex-analysis")?.priority, "paused");
  const first = defaultSubjects();
  first[0].name = "Changed";
  assert.notEqual(defaultSubjects()[0].name, "Changed");
});

test("demo is explicitly demo and dates move with requested day", () => {
  const data = createDemoData(new Date(2030, 4, 8));
  assert.equal(data.mode, "demo");
  assert.equal(data.tasks[0].date, "2030-05-08");
  assert.equal(data.exams[0].date, "2030-05-20");
  assert.equal(data.errors.length, 0);
  assert.deepEqual(validateBackup(data), data);
});

test("weekly statistics separate planned blocks, marked completed blocks and focus timer", () => {
  const data = createEmptyData();
  data.sessions = [
    { id: "a", title: "Study", subjectId: "statistics", date: "2026-11-02", start: "09:00", minutes: 50, completed: true },
    { id: "b", title: "Study", subjectId: "statistics", date: "2026-11-08", start: "09:00", minutes: 30, completed: false },
    { id: "c", title: "Outside", subjectId: "statistics", date: "2026-11-09", start: "09:00", minutes: 100, completed: true },
  ];
  data.focusLog = [{ id: "f", subjectId: "statistics", date: "2026-11-07", minutes: 25 }];
  const stats = weekStats(data, new Date(2026, 10, 7));
  assert.equal(stats.plannedMinutes, 80);
  assert.equal(stats.completedMinutes, 50);
  assert.equal(stats.focusMinutes, 25);
  assert.equal(stats.completedSessions, 1);
  assert.equal(stats.totalSessions, 2);
  assert.equal(stats.remainingMinutes, 550);
});

test("backup validation clones input and preserves unknown exam time as absent", () => {
  const original = createDemoData(new Date(2026, 10, 7));
  const restored = validateBackup(original);
  restored.tasks[0].title = "Changed";
  assert.notEqual(original.tasks[0].title, restored.tasks[0].title);
  assert.equal("time" in restored.exams[0], false);
});

test("backup validation rejects corrupt dates, missing fields, invalid references and quantities", () => {
  const mutations: Array<(data: ReturnType<typeof createDemoData>) => void> = [
    data => { data.tasks[0].date = "2026-02-30"; },
    data => { data.tasks[0].subjectId = "missing"; },
    data => { data.sessions[0].start = "25:00"; },
    data => { data.sessions[0].minutes = -1; },
    data => { data.sessions[0].start = "23:50"; data.sessions[0].minutes = 20; },
    data => { data.weeklyGoalMinutes = Infinity; },
    data => { data.focusLog.push({ id: "f", subjectId: "statistics", date: "2026-11-07", minutes: 1.5 }); },
    data => { data.exams[0].priority = "unknown" as never; },
    data => { data.tasks.push({ ...data.tasks[0] }); },
  ];
  for (const mutate of mutations) {
    const data = createDemoData(new Date(2026, 10, 7));
    mutate(data);
    assert.throws(() => validateBackup(data));
  }
  assert.throws(() => validateBackup({ ...createEmptyData(), unexpected: true }));
  assert.throws(() => validateBackup({ ...createEmptyData(), tasks: undefined }));
  assert.throws(() => validateBackup({ ...createEmptyData(), version: 2 }));
  assert.throws(() => validateBackup(null));
});
