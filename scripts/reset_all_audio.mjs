import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'fs';

const qPath = '/Users/ray/Projects/ brain-teaser/src/data/questions.json';
const audioDir = '/Users/ray/Projects/ brain-teaser/docs/audio';
const dictPath = '/Users/ray/Projects/ brain-teaser/src/data/pronunciation_dict.json';

const qs = JSON.parse(readFileSync(qPath, 'utf8'));

let removedTts = 0, removedAudio = 0;
for (const q of qs) {
    if (!q.pronunciation) continue;
    for (const [char, info] of Object.entries(q.pronunciation)) {
        if (info && typeof info === 'object') {
            if ('ttsText' in info) { delete info.ttsText; removedTts++; }
            if ('audioFile' in info) { delete info.audioFile; removedAudio++; }
        }
    }
}

writeFileSync(qPath, JSON.stringify(qs, null, 2) + '\n', 'utf8');
console.log('Removed ttsText:', removedTts);
console.log('Removed audioFile:', removedAudio);

// Delete all audio files
let deleted = 0;
try {
    for (const f of readdirSync(audioDir)) {
        if (f.endsWith('.mp3')) { unlinkSync(`${audioDir}/${f}`); deleted++; }
    }
} catch (e) { }
console.log('Deleted audio files:', deleted);

// Clear dict
if (existsSync(dictPath)) {
    unlinkSync(dictPath);
    console.log('Deleted pronunciation_dict.json');
}
