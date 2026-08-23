#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analysisFiles } from './analysis-metadata.mjs';
import { fail } from './lib.mjs';

const ANCHOR = /`(?:[a-z0-9][a-z0-9-]*!)?(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|mjs|js|rs|py|md|yml|yaml|json|css|html):\d+(?:-\d+)?`/u;
const HTTPS = /https:\/\/[^\s)]+/u;

export function matrixCellHasEvidence(cell) {
  return ANCHOR.test(cell) || HTTPS.test(cell) || cell.includes('这是推断');
}

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function isSeparator(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

export function matrixFailures(content, relativePath) {
  const errors = [];
  const lines = content.split('\n');
  let marked = false;
  let headerSeen = false;

  lines.forEach((line, index) => {
    if (line.trim() === '<!-- evidence-matrix -->') {
      marked = true;
      headerSeen = false;
      return;
    }
    if (!marked) return;
    const cells = tableCells(line);
    if (!cells) {
      if (headerSeen) marked = false;
      return;
    }
    if (!headerSeen) {
      headerSeen = true;
      return;
    }
    if (isSeparator(cells)) return;

    cells.slice(1).forEach((cell, cellIndex) => {
      if (!matrixCellHasEvidence(cell)) {
        errors.push(`${relativePath}:${index + 1}: matrix cell ${cellIndex + 2} lacks an anchor, an HTTPS URL, or 明确的推断标记`);
      }
    });
  });

  return errors;
}

function main() {
  const errors = analysisFiles().flatMap((file) => matrixFailures(file.content, file.relativePath));
  if (!fail(errors)) console.log('证据矩阵门禁通过');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
