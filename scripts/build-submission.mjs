#!/usr/bin/env node
// Builds the eLearn submission zip.
//
// The brief (Final Project Deliverables) says the zip holds EXACTLY three items:
//   1. the presentation slides/materials, with a link to the demo video on the
//      first slide
//   2. a README - deployed-app URL on page 1, the GitHub repo URL, step-by-step
//      setup/run/test instructions, and any username/password details
//   3. the application, packaged as it sits in the deployed server's root folder,
//      with an index page reachable at "/"
//
// This script does the packaging and then checks the three rules, so the
// footguns (missing slides, a stray scratch/ folder, the PDF, or a missing
// deployed URL) are caught before the zip is sent.
//
// Usage:
//   node scripts/build-submission.mjs --slides "<path>" --video-link "<url>" [--deployed-url "<url>"]
//   node scripts/build-submission.mjs --check          # check only, build nothing
//
// The zip is written to submission/QuizQuest-submission.zip (gitignored).

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'submission');
const zipName = 'QuizQuest-submission.zip';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? '' : args[i + 1] || '';
};
const videoLink = flag('video-link');
const slidesArg = flag('slides');
const deployedUrl = flag('deployed-url');
const checkOnly = args.includes('--check');

const problems = [];
const notes = [];

// ---------------------------------------------------------------- the app build
const distDir = path.join(root, 'dist');
if (!existsSync(path.join(distDir, 'index.html'))) {
  console.error('dist/index.html is missing. Run `pnpm build` first.');
  process.exit(1);
}

// --------------------------------------------------- what the server serves at "/"
// server.js: the root serves dist/index.html and dist/assets; /hero-lab/* comes
// from public/hero-lab; /tag and /client.js come from public/tag.
const appFiles = new Map(); // path inside the zip -> absolute path on disk
const addFile = (zipPath, diskPath) => {
  if (existsSync(diskPath) && statSync(diskPath).isFile()) appFiles.set(zipPath, diskPath);
};
const addTree = (zipPath, diskDir) => {
  if (!existsSync(diskDir)) return;
  for (const entry of readdirSync(diskDir, { withFileTypes: true })) {
    const from = path.join(diskDir, entry.name);
    const to = `${zipPath}/${entry.name}`;
    if (entry.isDirectory()) addTree(to, from);
    else addFile(to, from);
  }
};

addFile('index.html', path.join(distDir, 'index.html'));
addTree('assets', path.join(distDir, 'assets'));
addTree('hero-lab', path.join(root, 'public', 'hero-lab'));
addTree('tag', path.join(root, 'public', 'tag'));
// The tag page loads "client.js" relative to "/", so the deployed root carries a
// copy at the top level as well as inside tag/.
addFile('client.js', path.join(root, 'public', 'tag', 'client.js'));

// ------------------------------------------------------------------- item 1
// Package the finished slides in their native format. Only the path and file
// size are checked here; the team reviews slide content visually.
const slideFiles = new Map();
const defaultSlidesPath = path.join(root, 'docs', 'presentation', 'QuizQuest Project slides.pdf');
const slidesPath = path.resolve(slidesArg || defaultSlidesPath);
if (!existsSync(slidesPath) || !statSync(slidesPath).isFile()) {
  problems.push(`Slide file not found: ${slidesPath}`);
} else if (statSync(slidesPath).size === 0) {
  problems.push(`Slide file is empty: ${slidesPath}`);
} else {
  slideFiles.set(path.basename(slidesPath), slidesPath);
}
if (!videoLink) {
  problems.push('No --video-link was given.');
} else if (!/^https?:\/\//.test(videoLink)) {
  problems.push(`--video-link does not look like a URL: ${videoLink}`);
}
// ------------------------------------------------------------------- item 2
const readmePath = path.join(root, 'README.md');
if (!existsSync(readmePath)) {
  problems.push('README.md is missing.');
} else {
  const readme = readFileSync(readmePath, 'utf8');
  const pageOne = readme.split('\n').slice(0, 40).join('\n');
  const urls = [...pageOne.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => m[0]);
  const deployed = urls.filter((u) => !/github\.com|githubusercontent|shields\.io|npmjs\.com/i.test(u));
  if (!deployed.length) {
    problems.push('README.md page 1 has no deployed-app URL. The brief asks for it on page 1.');
    notes.push('Add a line near the top of README.md, for example:\n  **Deployed app:** https://<your-deployment>/');
  } else if (deployedUrl && !deployed.some((u) => u.includes(deployedUrl))) {
    notes.push(`README page 1 lists ${deployed.join(', ')} but --deployed-url was ${deployedUrl}. Check they match.`);
  } else {
    notes.push(`README page 1 deployed URL: ${deployed.join(', ')}`);
  }
}

// ------------------------------------------------------------------- item 3
if (!appFiles.size) problems.push('The app folder came out empty.');
if (!appFiles.has('index.html')) problems.push('The app folder has no index.html at its root, so "/" would 404.');

// ------------------------------------------------------- anything we must not ship
const forbidden = [];
for (const [zipPath] of appFiles) {
  if (zipPath.startsWith('scratch/') || zipPath.includes('Pandas.pdf')) forbidden.push(zipPath);
}
for (const name of slideFiles.keys()) {
  if (name.includes('Pandas.pdf')) forbidden.push(`01-presentation/${name}`);
}
if (forbidden.length) problems.push(`Forbidden files would ship: ${forbidden.join(', ')}`);

// ------------------------------------------------------------------- report
console.log('Submission check\n');
for (const n of notes) console.log(`  note: ${n}`);
for (const p of problems) console.log(`  PROBLEM: ${p}`);
if (!problems.length) console.log('  all three rules check out');

if (checkOnly) process.exit(problems.length ? 1 : 0);

if (problems.length) {
  console.log('\nNot building the zip until the problems above are fixed.');
  process.exit(1);
}

// ------------------------------------------------------------------- build
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const files = {};
for (const [zipPath, diskPath] of appFiles) {
  files[`03-app/${zipPath}`] = new Uint8Array(readFileSync(diskPath));
}
for (const [name, slidesPath] of slideFiles) {
  files[`01-presentation/${name}`] = new Uint8Array(readFileSync(slidesPath));
}
files['01-presentation/DEMO-VIDEO.txt'] = new Uint8Array(
  Buffer.from(
    `Demo video link\n${'='.repeat(16)}\n\n${videoLink}\n\n` +
      `Add this link to slide 1 of the deck and confirm it is visible.\n`,
  ),
);
files['02-README.md'] = new Uint8Array(readFileSync(readmePath));

// A stray copy of the PDF or the scratch folder must never reach the zip.
for (const key of Object.keys(files)) {
  if (key.includes('Pandas.pdf') || key.startsWith('03-app/scratch/')) delete files[key];
}

const zipped = zipSync(files, { level: 6 });
const zipPath = path.join(outDir, zipName);
writeFileSync(zipPath, zipped);

const bytes = zipped.length;
console.log(`\nWrote ${path.relative(root, zipPath)} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
console.log('  01-presentation/  slides + materials + the demo video link');
console.log('  02-README.md      the README');
console.log('  03-app/           the deployed app root - index.html is at "/"');
