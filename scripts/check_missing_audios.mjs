#!/usr/bin/env node
/**
 * Check for missing audio files referenced in pronunciation data.
 * Usage: node scripts/check_missing_audios.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dictPath = join(__dirname, '..', 'src', 'data', 'pronunciation_dict.json');
const questionsPath = join(__dirname, '..', 'src', 'data', 'questions.json');
const audioDir = join(__dirname, '..', 'docs', 'audio');
const feedbackDir = join(audioDir, 'feedback');

const dict = JSON.parse(readFileSync(dictPath, 'utf8'));
const qs = JSON.parse(readFileSync(questionsPath, 'utf8'));

// ── 1. Collect all referenced audio files ──────────────────────────
const refs = new Map(); // audioFile -> [{ source, char, ttsText }]

for (const [ch, info] of Object.entries(dict)) {
    if (!info?.audioFile) continue;
    if (!refs.has(info.audioFile)) refs.set(info.audioFile, []);
    refs.get(info.audioFile).push({ source: 'dict', char: ch, ttsText: info.ttsText });
}

for (const q of qs) {
    if (!q.pronunciation) continue;
    for (const [ch, info] of Object.entries(q.pronunciation)) {
        if (!info?.audioFile) continue;
        if (!refs.has(info.audioFile)) refs.set(info.audioFile, []);
        refs.get(info.audioFile).push({ source: `q${q.id}`, char: ch, ttsText: info.ttsText });
    }
}

// ── 2. Check feedback audio ────────────────────────────────────────
let feedbackAudioPath = join(__dirname, '..', 'src', 'data', 'feedback_audio.json');
let feedbackRefs = new Map();
if (existsSync(feedbackAudioPath)) {
    const feedbackMap = JSON.parse(readFileSync(feedbackAudioPath, 'utf8'));
    for (const [text, audioFile] of Object.entries(feedbackMap)) {
        if (!feedbackRefs.has(audioFile)) feedbackRefs.set(audioFile, []);
        feedbackRefs.get(audioFile).push({ text });
    }
}

// ── 3. Find missing files ──────────────────────────────────────────
const missing = [];
for (const [file, sources] of refs) {
    if (!existsSync(join(audioDir, file))) {
        missing.push({ file, sources });
    }
}

const missingFeedback = [];
for (const [file, sources] of feedbackRefs) {
    if (!existsSync(join(audioDir, file))) {
        missingFeedback.push({ file, sources });
    }
}

// ── 4. Find orphaned files (on disk but not referenced) ────────────
const referencedFiles = new Set([...refs.keys()]);
const diskFiles = readdirSync(audioDir).filter(f => f.endsWith('.mp3'));
const orphaned = diskFiles.filter(f => !referencedFiles.has(f));

const feedbackReferencedFiles = new Set([...feedbackRefs.keys()]);
let orphanedFeedback = [];
if (existsSync(feedbackDir)) {
    const feedbackDiskFiles = readdirSync(feedbackDir).filter(f => f.endsWith('.mp3'));
    orphanedFeedback = feedbackDiskFiles.filter(f => !feedbackReferencedFiles.has(`feedback/${f}`));
}

// ── 5. Report ──────────────────────────────────────────────────────
console.log('🔍 Audio File Check Report');
console.log('─'.repeat(50));
console.log(`  Referenced audio files: ${refs.size}`);
console.log(`  Audio files on disk:    ${diskFiles.length}`);
console.log(`  Feedback audio refs:    ${feedbackRefs.size}`);
console.log('');

if (missing.length === 0 && missingFeedback.length === 0) {
    console.log('✅ No missing audio files!');
} else {
    if (missing.length > 0) {
        console.log(`❌ Missing pronunciation audio: ${missing.length}`);
        for (const m of missing) {
            const src = m.sources[0];
            console.log(`   ${m.file} — "${src.char}" (${src.ttsText}) [${src.source}]`);
        }
    }
    if (missingFeedback.length > 0) {
        console.log(`❌ Missing feedback audio: ${missingFeedback.length}`);
        for (const m of missingFeedback) {
            console.log(`   ${m.file} — "${m.sources[0].text}"`);
        }
    }
}

if (orphaned.length > 0 || orphanedFeedback.length > 0) {
    console.log('');
    console.log(`⚠️  Orphaned files (on disk, not referenced): ${orphaned.length + orphanedFeedback.length}`);
    orphaned.slice(0, 10).forEach(f => console.log(`   ${f}`));
    orphanedFeedback.slice(0, 10).forEach(f => console.log(`   feedback/${f}`));
    if (orphaned.length + orphanedFeedback.length > 10) {
        console.log(`   ... and ${orphaned.length + orphanedFeedback.length - 10} more`);
    }
}

console.log('');
process.exit(missing.length + missingFeedback.length > 0 ? 1 : 0);
