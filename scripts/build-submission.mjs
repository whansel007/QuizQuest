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
// footguns (the source tree instead of the build, a stray scratch/ folder, a
// missing video link, a missing deployed URL) are caught before the zip is sent.
//
// Usage:
//   node scripts/build-submission.mjs --video-link "<url>" [--deployed-url "<url>"]
//   node scripts/build-submission.mjs --check          # check only, build nothing
//
// The zip is written to submission/QuizQuest-submission.zip (gitignored).

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
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
addTree('fonts', path.join(distDir, 'fonts'));
addTree('hero-lab', path.join(root, 'public', 'hero-lab'));
addTree('tag', path.join(root, 'public', 'tag'));
// The tag page loads "client.js" relative to "/", so the deployed root carries a
// copy at the top level as well as inside tag/.
addFile('client.js', path.join(root, 'public', 'tag', 'client.js'));

// ------------------------------------------------------------------- item 1
// The deck that ships is the team's slide deck as a PDF. The brief asks for
// PPTX or PDF, and the first slide has to carry the demo-video link - so the
// link is verified inside the PDF itself, not in a side-car file.
//
// docs/presentation/PRESENTATION_SLIDES.md is the working script for the
// presentation (speaker notes, run of show, Q&A prep). It is deliberately NOT
// shipped: two decks in one folder is how the wrong one gets presented.
const presentationDir = path.join(root, 'docs', 'presentation');
const deckPath = path.resolve(root, flag('deck') || path.join('docs', 'presentation', 'QuizQuest-Presentation-Slides.pdf'));
const deckName = path.basename(deckPath);

// Other material the brief explicitly allows next to the slides: the script the
// demo video was recorded from.
const extraPresentationFiles = ['DEMO_VIDEO_SCRIPT.md'];

if (!existsSync(deckPath)) {
  problems.push(
    `The slide deck is missing: ${path.relative(root, deckPath)}. ` +
      `Copy the team's deck (PDF or PPTX) into docs/presentation/ so the packer can pick it up, ` +
      `or point at it with --deck "<path>". The submission needs the deck with the video link on slide 1.`,
  );
} else {
  const deckBytes = readFileSync(deckPath);
  if (deckBytes.length === 0) {
    problems.push(`${path.relative(root, deckPath)} is empty - it would ship as a 0-byte file.`);
  }
  const lower = deckName.toLowerCase();
  if (!lower.endsWith('.pdf') && !lower.endsWith('.pptx')) {
    problems.push(`${deckName} is not a PDF or PPTX. The brief accepts only those two formats for the slides.`);
  }
  for (const name of extraPresentationFiles) {
    const p = path.join(presentationDir, name);
    if (!existsSync(p)) {
      notes.push(`Optional material not found, skipping: docs/presentation/${name}`);
      continue;
    }
    if (statSync(p).size === 0) {
      problems.push(`01-presentation/${name} is empty - it would ship as a 0-byte file.`);
    }
  }

  // The link has to be ON slide 1. Read the deck back and look for it there.
  if (videoLink && lower.endsWith('.pdf')) {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({ data: new Uint8Array(deckBytes), useSystemFonts: true }).promise;
      const first = await doc.getPage(1);
      const items = (await first.getTextContent()).items.map((i) => i.str);
      const flat = items.join(' ').replace(/\s+/g, '');
      const wanted = videoLink.replace(/\s+/g, '');
      if (!flat.includes(wanted)) {
        problems.push(
          `Slide 1 of ${deckName} does not carry the video link (${videoLink}). ` +
            `The brief says the link has to be on the FIRST slide.`,
        );
      } else {
        notes.push(`Slide 1 of ${deckName} carries the video link.`);
      }
    } catch (err) {
      problems.push(`Could not read ${deckName} to check slide 1 for the video link: ${err.message}`);
    }
  }
}
if (!videoLink) {
  problems.push('No --video-link was given, so the deck cannot be checked against the recorded video.');
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
const appKeys = [...appFiles.keys()];
if (!appKeys.some((k) => k.startsWith('assets/'))) {
  problems.push('The app folder has no assets/ folder, so the built JavaScript and CSS are missing.');
}

// ------------------------------------------------------- anything we must not ship
// The source tree, the AI prompts and the scratch folder are not part of the
// deployed root and must never reach the grader.
const forbidden = [];
for (const [zipPath] of appFiles) {
  if (zipPath.startsWith('scratch/') || zipPath.includes('Pandas.pdf')) forbidden.push(zipPath);
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
mkdirSync(outDir, { recursive: true });

const files = {};
for (const [zipPath, diskPath] of appFiles) {
  // Buffer, not utf8: a PDF or a font read as utf8 comes back as a string and
  // then ships as corrupt bytes. The old read-and-read-as-text loop had
  // exactly that bug.
  files[`03-app/${zipPath}`] = new Uint8Array(readFileSync(diskPath));
}

// Item 1: the deck (the PDF as-is) plus the video's source material.
files[`01-presentation/${deckName}`] = new Uint8Array(readFileSync(deckPath));
for (const name of extraPresentationFiles) {
  const p = path.join(presentationDir, name);
  if (existsSync(p)) files[`01-presentation/${name}`] = new Uint8Array(readFileSync(p));
}
files['01-presentation/DEMO-VIDEO.txt'] = new Uint8Array(
  Buffer.from(
    `Demo video link\n${'='.repeat(16)}\n\n${videoLink}\n\n` +
      `This is the link that goes on SLIDE 1 of the deck. Slide 1 of\n` +
      `${deckName} in this folder already carries it.\n`,
  ),
);

// Item 2: the README.
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

// ------------------------------------------------- the zip holds three items
const tops = new Set(Object.keys(files).map((k) => k.split('/')[0]));
const expected = ['01-presentation', '02-README.md', '03-app'];
const wrong = [...tops].filter((t) => !expected.includes(t));
const missing = expected.filter((t) => !tops.has(t));
if (wrong.length || missing.length) {
  console.error(
    `\nFAILED the three-item rule. unexpected: [${wrong.join(', ')}] missing: [${missing.join(', ')}]`,
  );
  process.exit(1);
}
console.log(`\nThree items confirmed: ${[...tops].sort().join(', ')}`);
