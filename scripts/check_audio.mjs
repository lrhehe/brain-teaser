import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const qs = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'data', 'questions.json'), 'utf8'));
const audioDir = join(__dirname, '..', 'docs', 'audio');

let withAudio = 0, withoutAudio = 0, noPron = 0, total = 0;
for (const q of qs) {
    if (!q.pronunciation) { noPron++; continue; }
    for (const [char, info] of Object.entries(q.pronunciation)) {
        total++;
        if (info.audioFile) withAudio++;
        else withoutAudio++;
    }
}

let audioFiles = 0;
try { audioFiles = readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length; } catch (e) { }

console.log('=== Questions Data ===');
console.log('Total questions:', qs.length);
console.log('Questions without pronunciation:', noPron);
console.log('Total pronunciation entries:', total);
console.log('With audioFile ref:', withAudio);
console.log('Without audioFile ref:', withoutAudio);
console.log('');
console.log('=== Audio Files ===');
console.log('MP3 files in public/audio/:', audioFiles);

// Show sample
for (const q of qs) {
    if (!q.pronunciation) continue;
    for (const [char, info] of Object.entries(q.pronunciation)) {
        if (!info.audioFile) {
            console.log('\n=== Sample Missing audioFile ===');
            console.log('Question #' + q.id + ':', q.text);
            console.log('Char:', char);
            console.log('Info:', JSON.stringify(info));
            break;
        }
    }
    if (Object.values(q.pronunciation).some(i => !i.audioFile)) break;
}

// Also check deployed build
const docsDir = join(__dirname, '..', 'docs');
try {
    const docsAudio = readdirSync(join(docsDir, 'audio')).filter(f => f.endsWith('.mp3')).length;
    console.log('\n=== Deployed (docs/) ===');
    console.log('MP3 files in docs/audio/:', docsAudio);
} catch (e) {
    console.log('\n=== Deployed (docs/) ===');
    console.log('No docs/audio/ directory found');
}
