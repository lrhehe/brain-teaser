import { readFileSync, writeFileSync } from 'fs';

const qPath = '/Users/ray/Projects/ brain-teaser/src/data/questions.json';
const qs = JSON.parse(readFileSync(qPath, 'utf8'));

// Manual fixes for known unusual patterns
const fixes = {
    '跑得快': { char: '得', word: '跑得快' },
    '饼干饼': { char: '饼', word: '饼干' },
    '方向的方向': { char: '方', word: '方向' },
    '糖果的糖（同音）': { char: '唐', word: '唐朝' },
    '古代的': { char: '古', word: '古代' },
    '书架的书架': { char: '架', word: '书架' },
};

let fixed = 0;
for (const q of qs) {
    if (!q.pronunciation) continue;
    for (const [char, info] of Object.entries(q.pronunciation)) {
        if (!info || typeof info !== 'object' || !info.ttsText) continue;
        // Already in new format
        if (info.ttsText.startsWith('\u201c')) continue;

        const fix = fixes[info.ttsText];
        if (fix) {
            info.ttsText = `\u201c${char}\u201d\uff1a\u201c${fix.word}\u201d的\u201c${char}\u201d`;
            fixed++;
        } else {
            console.log(`Still unfixed: "${char}" → "${info.ttsText}" in #${q.id}`);
        }
    }
}

writeFileSync(qPath, JSON.stringify(qs, null, 2) + '\n', 'utf8');
console.log(`Fixed: ${fixed}`);
