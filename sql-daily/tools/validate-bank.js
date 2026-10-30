// Checks every question in data/questions.js. Run with: npm run validate
// Exits with an error code if anything is wrong, so it can also run in CI.

import initSqlJs from 'sql.js';
import { validateBank, countsByTier } from '../js/validate.js';

const SQL = await initSqlJs();
const { errors, warnings, report } = validateBank(SQL);
const verbose = process.argv.includes('--verbose');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

for (const { id, tier, ok, messages } of report) {
  const hasWarning = messages.some((m) => m.level === 'warning');
  const mark = !ok ? red('✖') : hasWarning ? yellow('!') : green('✔');
  console.log(`${mark} ${id}${tier ? dim(` [${tier}]`) : ''}`);
  for (const { level, text } of messages) {
    if (level === 'error') console.log(red(`    ERROR: ${text}`));
    else if (level === 'warning') console.log(yellow(`    warning: ${text}`));
    else if (verbose) console.log(dim(`    ${text}`));
  }
}

const counts = countsByTier();
console.log(`\nQuestions: ${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(', ')}`);
console.log(`Days before the easy/medium/hard questions start repeating: ${Math.min(...Object.values(counts))}`);

if (errors > 0) {
  console.log(red(`\n${errors} error(s), ${warnings} warning(s). Fix the errors above before publishing.`));
  process.exit(1);
}
console.log(green(`\nAll questions passed`) + (warnings ? yellow(` (${warnings} warning(s))`) : '') + '.');
