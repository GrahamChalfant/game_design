// Checks the daily features and their questions for mistakes. Used by `npm run validate` and by validate.html.
//
// Returns { errors, warnings, report } where report is a list of
// { id, ok, messages: [{ level: 'error' | 'warning' | 'info', text }] }, one per feature and per question.

import { features, questions } from '../data/features.js';
import { datasets } from '../data/datasets.js';
import { TIERS } from './config.js';
import { runQuery, checkAnswer } from './checker.js';

const REQUIRED = ['id', 'tier', 'dataset', 'title', 'prompt', 'columns', 'solution', 'hints'];

export function validateBank(SQL, bank = questions, featureList = features) {
  const report = [];
  const seenIds = new Set();
  let errors = 0;
  let warnings = 0;

  const seenFeatures = new Set();
  for (const [index, f] of featureList.entries()) {
    const messages = [];
    const id = f.id ?? `(feature #${index + 1}, no id)`;
    for (const field of ['id', 'theme', 'tagline']) {
      if (!f[field]) messages.push({ level: 'error', text: `Feature is missing "${field}".` });
    }
    if (seenFeatures.has(f.id)) messages.push({ level: 'error', text: `The feature id "${f.id}" is used more than once.` });
    seenFeatures.add(f.id);
    for (const tier of Object.keys(TIERS)) {
      if (!f.questions?.[tier]) messages.push({ level: 'error', text: `Feature has no ${tier} question. Every day needs all three.` });
    }
    for (const key of Object.keys(f.questions ?? {})) {
      if (!TIERS[key]) messages.push({ level: 'error', text: `questions.${key} isn't a tier. Use: ${Object.keys(TIERS).join(', ')}.` });
    }
    const ok = messages.length === 0;
    errors += messages.length;
    report.push({ id: `Feature: ${f.theme ?? id}`, ok, messages });
  }

  for (const [index, q] of bank.entries()) {
    const messages = [];
    const error = (text) => messages.push({ level: 'error', text });
    const warn = (text) => messages.push({ level: 'warning', text });
    const info = (text) => messages.push({ level: 'info', text });
    const id = q.id ?? `(question #${index + 1}, no id)`;

    for (const field of REQUIRED) {
      if (q[field] === undefined || q[field] === '') error(`Missing "${field}".`);
    }
    if (seenIds.has(q.id)) error(`The id "${q.id}" is used by more than one question. Ids must be unique.`);
    seenIds.add(q.id);
    if (q.tier && !TIERS[q.tier]) error(`tier is "${q.tier}", but it must be one of: ${Object.keys(TIERS).join(', ')}.`);
    if (q.dataset && datasets[q.dataset] === undefined) {
      error(`dataset is "${q.dataset}", but data/datasets.js only has: ${Object.keys(datasets).join(', ')}.`);
    }
    if (q.orderMatters === undefined) warn('"orderMatters" isn\'t set, so row order will be ignored. Set it to true or false.');
    if (q.hints && (!Array.isArray(q.hints) || q.hints.length === 0)) error('"hints" should be a list with at least one hint.');

    const canRun = messages.every((m) => m.level !== 'error') && q.solution;
    if (canRun) {
      const result = runQuery(SQL, q.dataset, q.solution);
      if (!result.ok) {
        error(`The solution doesn't run: ${result.error}`);
        if (result.tip) error(`Tip: ${result.tip}`);
      } else {
        if (result.rows.length === 0) error('The solution returns no rows. Players could "win" with any empty query.');
        if (Array.isArray(q.columns)) {
          if (q.columns.length !== result.columns.length) {
            error(
              `"columns" lists ${q.columns.length} (${q.columns.join(', ')}) but the solution returns ` +
                `${result.columns.length} (${result.columns.join(', ')}).`,
            );
          } else if (q.columns.some((c, i) => c !== result.columns[i])) {
            warn(`"columns" is [${q.columns.join(', ')}] but the solution's columns are named [${result.columns.join(', ')}].`);
          }
        }
        if (q.orderMatters && !/order\s+by/i.test(q.solution)) {
          error('orderMatters is true but the solution has no ORDER BY, so the expected order isn\'t guaranteed.');
        }
        if (q.orderMatters && !/\border|sort|first|alphabetical|highest|lowest|earliest/i.test(q.prompt)) {
          warn('orderMatters is true, but the prompt doesn\'t seem to tell players what order to use.');
        }
        if (q.orderMatters && hasTiedSortKeys(result)) {
          warn('Some rows look identical in the sort order, so a correct query could return them in a different order.');
        }
        info(`Solution returns ${result.rows.length} row(s): ${result.columns.join(', ')}`);

        for (const sql of q.tests?.accept ?? []) {
          const check = checkAnswer(SQL, q, sql);
          if (check.status !== 'correct') {
            error(`An "accept" test was marked ${check.status}, but it should be correct:\n${indent(sql)}\n` +
              `  Game said: ${check.error ?? check.message}${check.tip ? ` (${check.tip})` : ''}`);
          }
        }
        for (const sql of q.tests?.reject ?? []) {
          const check = checkAnswer(SQL, q, sql);
          if (check.status === 'correct') {
            error(`A "reject" test was marked correct, but it should be wrong:\n${indent(sql)}`);
          }
        }
        const tested = (q.tests?.accept?.length ?? 0) + (q.tests?.reject?.length ?? 0);
        if (tested === 0) warn('No tests. Add a common mistake to tests.reject to make sure it\'s marked wrong.');
        else info(`${tested} test quer${tested === 1 ? 'y' : 'ies'} passed.`);
      }
    }

    const ok = messages.every((m) => m.level !== 'error');
    errors += messages.filter((m) => m.level === 'error').length;
    warnings += messages.filter((m) => m.level === 'warning').length;
    report.push({ id, tier: q.tier, ok, messages });
  }

  return { errors, warnings, report };
}

// If the solution's ORDER BY doesn't separate some rows, re-sorting them by a different
// rule would still "match" the prompt. We detect fully identical rows, the most common case
// that's safe to check.
function hasTiedSortKeys(result) {
  const keys = result.rows.map((r) => JSON.stringify(r));
  return new Set(keys).size !== keys.length;
}

const indent = (sql) => sql.trim().split('\n').map((l) => '    ' + l.trim()).join('\n');

export const featureCount = () => features.length;
