import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyEvidenceRecords } from './lib/eval-lab.mjs';

const directoryFlag = process.argv.indexOf('--directory');
const directory = resolve(directoryFlag >= 0 ? process.argv[directoryFlag + 1] : 'evidence/experiments');
const readRecord = (name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const result = verifyEvidenceRecords(
  readRecord('controlled-task-contract-v1.json'),
  readRecord('independent-eval-pipeline-v1.json'),
);
process.stdout.write(`已核对 ${result.records} 份实验记录、${result.trials} 个 Trial 和 Scorer ${result.scorer_version}\n`);
