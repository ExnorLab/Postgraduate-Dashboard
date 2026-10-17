// Validates tracks.json and every track dataset before the site is built.
// Exit code 1 on any error. Warnings are printed but do not fail the build.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const REQUIRED_TRACK = ['id', 'code', 'title', 'shortDesc', 'active', 'lastUpdated', 'dataFile'];
const REQUIRED_TRACK_DATA = ['trackTitle', 'lastUpdated', 'countries', 'universities'];
const REQUIRED_UNI = [
  'id', 'name', 'country', 'city', 'program', 'monthlyLivingCostUSD', 'scholarshipCategory',
  'scholarshipDetail', 'industryScore', 'hasCoopOrPlacement', 'industryConnection',
  'coreModules', 'appliedModules', 'eeeFitNote', 'lastVerified'
];
const COUNTRIES = ['USA', 'UK', 'Canada', 'Ireland', 'Australia'];
const SCHOLARSHIPS = ['TA_RA', 'MERIT', 'GOV_STEM'];
const ID_PATTERN = /^[A-Z]{2,5}-\d{3,}$/;
const DATE_PATTERN = /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/;

const errors = [];
const warnings = [];
const err = m => errors.push(m);
const warn = m => warnings.push(m);

const tracksFile = read('data/tracks.json');
const seenTrackIds = new Set();
const seenCodes = new Set();
const seenProgramIds = new Set();
const missingCostNote = [];

for (const t of tracksFile.tracks) {
  const where = `track ${t.id ?? '?'}`;
  for (const k of REQUIRED_TRACK) if (t[k] === undefined || t[k] === '') err(`${where}: missing "${k}"`);
  if (seenTrackIds.has(t.id)) err(`${where}: duplicate track id`);
  if (seenCodes.has(t.code)) err(`${where}: duplicate code ${t.code}`);
  seenTrackIds.add(t.id); seenCodes.add(t.code);
  if (typeof t.active !== 'boolean') err(`${where}: "active" must be true or false`);

  if (!t.dataFile || !existsSync(join(ROOT, t.dataFile))) {
    if (t.active) err(`${where}: active track but dataFile "${t.dataFile}" does not exist`);
    continue; // inactive tracks may not have data yet
  }

  const data = read(t.dataFile);
  for (const k of REQUIRED_TRACK_DATA) if (data[k] === undefined) err(`${t.id} data: missing "${k}"`);
  if (data.trackId && data.trackId !== t.id) err(`${t.id} data: trackId "${data.trackId}" does not match tracks.json`);
  if (t.active && (!Array.isArray(data.universities) || data.universities.length === 0)) {
    err(`${t.id}: active track has no universities`);
  }

  const unis = data.universities ?? [];
  for (const u of unis) {
    const w = `${t.id} / ${u.id ?? u.name ?? '?'}`;
    for (const k of REQUIRED_UNI) if (u[k] === undefined || u[k] === null || u[k] === '') err(`${w}: missing "${k}"`);
    if (u.id && !ID_PATTERN.test(u.id)) err(`${w}: id must look like UNI-001`);
    if (u.id && seenProgramIds.has(u.id)) err(`${w}: duplicate program id across tracks`);
    if (u.id) seenProgramIds.add(u.id);
    if (u.country && !COUNTRIES.includes(u.country)) err(`${w}: unknown country "${u.country}"`);
    if (u.scholarshipCategory && !SCHOLARSHIPS.includes(u.scholarshipCategory)) err(`${w}: unknown scholarshipCategory "${u.scholarshipCategory}"`);
    if (typeof u.monthlyLivingCostUSD !== 'number' || u.monthlyLivingCostUSD <= 0) err(`${w}: monthlyLivingCostUSD must be a positive number`);
    if (!Number.isInteger(u.industryScore) || u.industryScore < 1 || u.industryScore > 5) err(`${w}: industryScore must be 1-5`);
    if (typeof u.hasCoopOrPlacement !== 'boolean') err(`${w}: hasCoopOrPlacement must be true or false`);
    if (u.lastVerified && !DATE_PATTERN.test(u.lastVerified)) err(`${w}: lastVerified must look like "October 2026"`);
    if (!Array.isArray(u.coreModules) || u.coreModules.length === 0) err(`${w}: coreModules must be a non-empty list`);
    if (!Array.isArray(u.appliedModules) || u.appliedModules.length === 0) err(`${w}: appliedModules must be a non-empty list`);
    if (u.localCostNote === undefined) missingCostNote.push(u.id);
  }

  if (unis.length && unis.every(u => u.hasCoopOrPlacement === true)) {
    warn(`${t.id}: every program has hasCoopOrPlacement = true; the co-op filter cannot separate programs`);
  }
  if (t.universitiesCount !== undefined && t.universitiesCount !== unis.length) {
    warn(`${t.id}: tracks.json says ${t.universitiesCount} programs, dataset has ${unis.length}`);
  }
}

if (missingCostNote.length) warn(`${missingCostNote.length} program(s) have no localCostNote (cost note hidden)`);
for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
const total = [...seenProgramIds].length;
console.log(`validated ${tracksFile.tracks.length} tracks, ${total} programs: ${errors.length} error(s), ${warnings.length} warning(s)`);
if (errors.length) process.exit(1);
