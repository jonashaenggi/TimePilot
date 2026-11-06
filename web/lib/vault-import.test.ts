import test from "node:test";
import assert from "node:assert/strict";
import { importVault, type VaultFile } from "./vault-import.ts";
import { createEmptyData, validateBackup } from "./study.ts";

function file(path: string, content = ""): VaultFile {
  return { name: path.split("/").at(-1)!, webkitRelativePath: path, text: async () => content };
}

const examHeader = "| Datum | Tag | Fach | Prüfung | Uhrzeit | Priorität |\n|---|---|---|---|---|---|\n";

test("imports personal records only from runtime Markdown and counts files, not prose totals", async () => {
  const result = await importVault([
    file("Example/Pruefungstermine HS 2040.md", examHeader + "| 19.11.2040 | Mo | Statistik | Midterm | offen | normal |\n| 05.01.2041 | Di | Funktionentheorie und Vektoranalysis | Examen | 14:15–16:15 | keine Teilnahme |"),
    file("Example/Lernplan.md", "Funktionentheorie bekommt **keine Lernzeit**. Spieltheorie bekommt **wenig Priorität**."),
    file("Example/20_Themen/Statistik/Kombinatorik.md"),
    file("Example/20_Themen/Statistik/Verteilungen.md"),
    file("Example/20_Themen/Statistik/index.md"),
    file("Example/20_Themen/Fachuebergreifend/Grundlagen.md"),
    file("Example/Start.md", "800000 vollständig beherrschte Notizen"),
  ]);
  assert.equal(result.vault.name, "Example");
  assert.equal(result.vault.noteCount, 3);
  assert.equal(result.subjects.find(subject => subject.id === "statistics")?.noteCount, 2);
  assert.equal(result.subjects.find(subject => subject.id === "complex-analysis")?.priority, "paused");
  assert.equal(result.subjects.find(subject => subject.id === "game-theory")?.priority, "low");
  assert.equal(result.subjects.some(subject => subject.id.includes("fachuebergreifend")), false);
  assert.equal(result.exams.length, 2);
  assert.equal(result.exams[0].time, undefined);
  assert.equal(result.exams[1].time, "14:15");
  assert.equal(result.exams[0].date, "2040-11-19");
  assert.match(result.exams[0].id, /^vault-/);
  assert.equal(result.warnings.length, 0);
});

test("rejects impossible and injected dates, preserves valid leap days and warns for invalid times", async () => {
  const result = await importVault([file("Vault/Prüfungstermine.md", examHeader + [
    "| 31.02.2040 | | Statistik | Impossible | offen | normal |",
    "| 29.02.2041 | | Statistik | Not a leap year | offen | normal |",
    "| <script>alert(1)</script> | | Statistik | Injection | 10:00 | normal |",
    "| 29.02.2040 | | Statistik | Leap | 25:10 | normal |",
    "| 2040-03-01 | | Statistik | ISO | 09:00-09:30 | normal |",
    "| 02.03.2040 | | Statistik | Reversed time | 12:00–11:00 | normal |",
  ].join("\n"))]);
  assert.deepEqual(result.exams.map(exam => exam.title), ["Leap", "ISO", "Reversed time"]);
  assert.equal(result.exams[0].date, "2040-02-29");
  assert.equal(result.exams[0].time, undefined);
  assert.equal(result.exams[1].time, "09:00");
  assert.equal(result.exams[2].time, undefined);
  assert.equal(result.warnings.filter(warning => warning.includes("Prüfung ohne gültiges")).length, 3);
});

test("deduplicates selected paths and repeated exams with stable imported IDs", async () => {
  const row = "| 01.12.2040 | | Scientific Computing | Test | offen | normal |";
  const selected = file("Vault/Pruefungstermine.md", examHeader + row + "\n" + row);
  const topic = file("Vault/20_Themen/Scientific Computing/Systems.md");
  const result = await importVault([selected, selected, topic, topic]);
  const second = await importVault([selected, topic]);
  assert.equal(result.vault.noteCount, 1);
  assert.equal(result.exams.length, 1);
  assert.equal(result.exams[0].id, second.exams[0].id);
  assert.equal(result.warnings.filter(warning => /[Dd]oppelt/.test(warning)).length, 3);
});

test("does not read binary files, ordinary topic bodies, traversal paths or oversized files", async () => {
  let readCount = 0;
  const failRead = async () => { readCount++; throw new Error("must not read"); };
  const result = await importVault([
    { name: "material.pdf", webkitRelativePath: "Vault/00_Eingang/material.pdf", text: failRead },
    { name: "topic.md", webkitRelativePath: "Vault/20_Themen/Statistik/topic.md", text: failRead },
    { name: "Pruefungstermine.md", webkitRelativePath: "Vault/../Pruefungstermine.md", text: failRead },
    { name: "Pruefungstermine.md", webkitRelativePath: "Vault/Pruefungstermine.md", size: 3 * 1024 * 1024, text: failRead },
  ]);
  assert.equal(readCount, 0);
  assert.equal(result.vault.noteCount, 1);
  assert.equal(result.exams.length, 0);
  assert.ok(result.warnings.some(warning => warning.includes("2 MB")));
});

test("handles unreadable and oversized text without aborting other files", async () => {
  const result = await importVault([
    { name: "Lernplan.md", text: async () => { throw new Error("access denied"); } },
    file("Pruefungstermine.md", "x".repeat(2 * 1024 * 1024 + 1)),
  ]);
  assert.equal(result.exams.length, 0);
  assert.ok(result.warnings.some(warning => warning.includes("nicht gelesen")));
  assert.ok(result.warnings.some(warning => warning.includes("2 MB")));
});

test("imports explicit error registers but never source-correction warnings as personal mistakes", async () => {
  const result = await importVault([
    file("Vault/90_Pruefen/Computer Architecture exercise solution checks.md", "## A wrong linked-list solution\nFällig: 2040-01-02\nStatus: offen"),
    file("Vault/90_Pruefen/Fehlertraining/Statistik.md", "| ID | Fehler | Fach | Fällig | Status |\n|---|---|---|---|---|\n| err-1 | Bayes verwechselt | Statistik | 02.01.2040 | offen |\n| err-1 | Bayes verwechselt | Statistik | 02.01.2040 | offen |\n| err-2 | Kein Datum | Statistik | später | offen |"),
  ]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].title, "Bayes verwechselt");
  assert.equal(result.errors[0].dueDate, "2040-01-02");
  assert.equal(result.errors[0].resolved, false);
  assert.match(result.errors[0].id, /^vault-/);
  assert.equal(result.subjects.some(subject => subject.id === "architecture"), false);
});

test("reads heading-based error entries without inventing missing review dates", async () => {
  const result = await importVault([file("Vault/90_Pruefen/Fehlertraining/Statistik.md", [
    "# Fehlertraining", "## Fehler: Dichte vs. Wahrscheinlichkeit", "- ID: stats-17", "- Fach: Statistik", "- Nächste Wiederholung: 2040-03-04", "- Status: beherrscht",
    "## Fehler: Ein weiterer Versuch", "- ID: stats-18", "- Fach: Statistik", "- Status: offen",
  ].join("\n"))]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].resolved, true);
  assert.equal(result.errors[0].subjectId, "statistics");
  assert.equal(result.errors[0].dueDate, "2040-03-04");
  assert.ok(result.warnings.some(warning => warning.includes("Fehlereintrag ohne gültigen")));
});

test("code-fenced table examples are not imported as exams; unknown times remain absent", async () => {
  const result = await importVault([file("Vault/Pruefungstermine.md", "```markdown\n" + examHeader + "| 01.01.2040 | | Physik | Example | 11:00 | normal |\n```\n\n" + examHeader + "| 02.01.2040 | | Physik | Real | unbekannt | niedrig |")]);
  assert.equal(result.exams.length, 1);
  assert.equal(result.exams[0].title, "Real");
  assert.equal(result.exams[0].time, undefined);
  assert.equal(result.subjects[0].priority, "low");
});

test("plan priority statements in one table cell do not affect other cells or sentences", async () => {
  const result = await importVault([file("Vault/Lernplan.md", "| Termin | Spieltheorie üben, danach Physik | Spieltheorie bleibt niedrige Priorität. Kein Lernen zulasten von Physik. |")]);
  assert.equal(result.subjects.find(subject => subject.id === "game-theory")?.priority, "low");
  assert.equal(result.subjects.find(subject => subject.id === "physics")?.priority, "normal");
});

test("empty directories and unrelated files cannot clear the current dashboard", async () => {
  await assert.rejects(importVault([]), /Kein Obsidian-Lernvault erkannt/);
  await assert.rejects(importVault([file("Downloads/README.md", "an unrelated project")]), /Kein Obsidian-Lernvault erkannt/);
  await assert.rejects(importVault([{ name: "notes.pdf", text: async () => "not Markdown" }]), /Kein Obsidian-Lernvault erkannt/);
});

test("imported data including range times and long fields survives strict backup validation", async () => {
  const longSubject = "Neues Thema ".repeat(35);
  const result = await importVault([
    file("V".repeat(220) + "/Pruefungstermine.md", examHeader + `| 01.01.2040 | | ${longSubject} | ${"A".repeat(350)} | 09:00–11:00 | normal |`),
    file("Vault/90_Pruefen/Fehlertraining/Statistik.md", `| ID | Fehler | Fach | Fällig | Status |\n|---|---|---|---|---|\n| ${"B".repeat(300)} | ${"C".repeat(350)} | Statistik | 2040-01-02 | offen |`),
  ]);
  const data = { ...createEmptyData(), subjects: result.subjects, exams: result.exams, errors: result.errors, vault: result.vault };
  const restored = validateBackup(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.exams[0].time, "09:00");
  assert.equal(restored.errors.length, 1);
  assert.ok(restored.exams[0].id.length <= 100);
  assert.ok(restored.errors[0].id.length <= 100);
});
