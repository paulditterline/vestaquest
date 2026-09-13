import { simulateExitReadinessReport } from '../packages/game/src/index.js';

const runsPerClass = Number(process.argv[2] ?? 1_000);
const report = simulateExitReadinessReport(1, runsPerClass);

console.log(`Policy: ${report.policyVersion}`);
console.log(
  `Seeds: ${report.firstSeed}-${report.firstSeed + runsPerClass - 1}`,
);
console.table(
  Object.values(report.classes).map((summary) => ({
    class: summary.heroClass.toUpperCase(),
    runs: summary.runs,
    ready: summary.exitReady,
    deaths: summary.deaths,
    stalled: summary.commandLimits,
    'ready %': (summary.readinessRate * 100).toFixed(1),
    'avg ready HP': summary.averageReadyHp.toFixed(2),
    'avg commands': summary.averageCommands.toFixed(1),
  })),
);
console.log(JSON.stringify(report, null, 2));
