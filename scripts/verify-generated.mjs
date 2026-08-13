#!/usr/bin/env node
import { writeCatalogs } from './catalogs.mjs';

const mismatches = writeCatalogs({ check: true });
if (mismatches.length) {
  console.error(`Generated catalogs differ: ${mismatches.join(', ')}. Run npm run catalogs:generate.`);
  process.exitCode = 1;
} else {
  console.log('generated catalogs are reproducible');
}
