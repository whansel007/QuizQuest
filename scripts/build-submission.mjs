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
// footguns (a stray scratch/ folder, the PDF, a missing video link, a missing
// deployed URL) are caught before the zip is sent.
//
// Usage:
//   node scripts/build-submission.mjs --video-link "<url>" [--deployed-url "<url>"]
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
const presentationDir = path.join(root, 'docs', 'presentation');
// CLAUDE_HANDOFF.md is the brief written for a second agent: useful on disk,
// but it is session context rather than a presentation material, so it is
// neither published nor packed. It is gitignored too - see .gitignore.
const slideFiles = existsSync(presentationDir)
  ? readdirSync(presentationDir).filter(
      (f) => !f.startsWith('CLAUDE_') && statSync(path.join(presentationDir, f)).isFile(),
    )
  : [];
if (!slideFiles.length) problems.push('No presentation files found in docs/presentation/.');
// A file that ships empty is worse than a missing one: the zip shows it as
// present until someone opens it. Catch it here, not in the eLearn upload.
for (const name of slideFiles) {
  if (statSync(path.join(presentationDir, name)).size === 0) {
    problems.push(`01-presentation/${name} is empty - it would ship as a 0-byte file.`);
  }
}

const slidesPath = path.join(presentationDir, 'PRESENTATION_SLIDES.md');
// The deck carries {{VIDEO_LINK}} on slide 1 until the video is uploaded. The
// build swaps in the real link, so the copy that ships always names the video
// that was actually recorded.
const VIDEO_PLACEHOLDER = '{{VIDEO_LINK}}';
let slidesText = null;
if (!existsSync(slidesPath)) {
  // The brief asks for the slides themselves, with the video link on the first
  // one. Without a deck there is no slide 1 to carry the link.
  problems.push('No slide deck found: docs/presentation/PRESENTATION_SLIDES.md is missing.');
} else {
  slidesText = readFileSync(slidesPath, 'utf8');
  // Slide 1 is the section headed "### Slide 1 ...". Taking the text before the
  // first heading of any level would stop at the deck's own preamble ("How to
  // use this file"), which comes before slide 1 and says nothing about the
  // video - so the check would pass on a deck with no link, or fail on a deck
  // that has one. Find the slide-1 heading itself, and read up to the next
  // slide heading.
  const slideHeadings = [...slidesText.matchAll(/^#{2,4}\s*Slide\s*(\d+)/gm)];
  const firstSlideHeading = slideHeadings.find((m) => m[1] === '1');
  let firstSlide;
  if (firstSlideHeading) {
    const after = slidesText.indexOf('\n', firstSlideHeading.index);
    const nextHeading = slidesText.indexOf('\n#', after);
    firstSlide = slidesText.slice(firstSlideHeading.index, nextHeading > 0 ? nextHeading : slidesText.length);
  } else {
    // No numbered slide headings: fall back to the text before the first
    // heading of any level, which is what a plain one-slide deck looks like.
    const firstHeading = slidesText.search(/^#{1,6}\s/m);
    firstSlide = firstHeading > 0 ? slidesText.slice(0, firstHeading) : slidesText.slice(0, 1500);
  }
  const hasPlaceholder = firstSlide.includes(VIDEO_PLACEHOLDER);
  const slideOneLinks = [...firstSlide.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => m[0]);
  if (hasPlaceholder) {
    if (!videoLink) {
      problems.push(
        `Slide 1 still has the ${VIDEO_PLACEHOLDER} placeholder. Upload the demo video, then run this again with --video-link "<the url>".`,
      );
    }
  } else if (!slideOneLinks.length) {
    problems.push('The first slide of PRESENTATION_SLIDES.md has no link in it. The video link has to be ON slide 1.');
  } else if (videoLink && !slideOneLinks.some((u) => u === videoLink)) {
    // The deck and the flag have to name the same video, or the slide points
    // at one recording and the README's check passes on another.
    problems.push(
      `Slide 1 links to ${slideOneLinks.join(', ')} but --video-link is ${videoLink}. They must be the same link.`,
    );
  }
}
if (!videoLink) {
  problems.push('No --video-link was given, so the video link placeholder is left empty.');
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
for (const name of slideFiles) {
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
for (const name of slideFiles) {
  const body = readFileSync(path.join(presentationDir, name), 'utf8');
  // The shipped deck names the recording that was actually made.
  // Buffer.from(text, 'utf8') - NOT new Uint8Array(text): a string passed to
  // the Uint8Array constructor is treated as an array-like, so every character
  // converts to NaN and the file ships as 0 bytes.
  files[`01-presentation/${name}`] = Buffer.from(
    name === 'PRESENTATION_SLIDES.md' && videoLink ? body.split(VIDEO_PLACEHOLDER).join(videoLink) : body,
    'utf8',
  );
}
files['01-presentation/DEMO-VIDEO.txt'] = new Uint8Array(
  Buffer.from(
    `Demo video link\n${'='.repeat(16)}\n\n${videoLink}\n\n` +
      `This is the link that goes on SLIDE 1 of the deck. Slide 1 of\n` +
      `PRESENTATION_SLIDES.md in this folder already carries it.\n`,
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
