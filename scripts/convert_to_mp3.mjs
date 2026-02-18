#!/usr/bin/env node
/**
 * Convert all WAV-disguised-as-MP3 files in docs/audio/ to actual MP3.
 * Uses ffmpeg for encoding.
 *
 * Usage: node scripts/convert_to_mp3.mjs
 */
import { readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const audioDir = join(__dirname, '..', 'docs', 'audio');

const files = readdirSync(audioDir).filter(f => f.endsWith('.mp3'));
console.log(`Converting ${files.length} files from WAV to real MP3...\n`);

let converted = 0, skipped = 0, errors = 0;
let totalBefore = 0, totalAfter = 0;

for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = join(audioDir, file);
    const tmpPath = filePath + '.tmp.mp3';

    try {
        const sizeBefore = statSync(filePath).size;
        totalBefore += sizeBefore;

        // Convert WAV → MP3 64kbps (mono voice audio doesn't need more)
        execSync(`ffmpeg -y -i "${filePath}" -codec:a libmp3lame -b:a 64k -ac 1 "${tmpPath}" 2>/dev/null`);

        const sizeAfter = statSync(tmpPath).size;
        totalAfter += sizeAfter;

        // Replace original with converted
        unlinkSync(filePath);
        execSync(`mv "${tmpPath}" "${filePath}"`);

        converted++;
        if ((i + 1) % 200 === 0 || i === files.length - 1) {
            console.log(`  [${i + 1}/${files.length}] ${file}: ${sizeBefore} → ${sizeAfter} bytes`);
        }
    } catch (err) {
        errors++;
        console.error(`  ERROR ${file}: ${err.message.split('\n')[0]}`);
        try { unlinkSync(tmpPath); } catch (_) { }
    }
}

const mb = (b) => (b / 1024 / 1024).toFixed(1);
console.log(`\nDone!`);
console.log(`  Converted: ${converted}`);
console.log(`  Errors: ${errors}`);
console.log(`  Before: ${mb(totalBefore)} MB`);
console.log(`  After:  ${mb(totalAfter)} MB`);
console.log(`  Saved:  ${mb(totalBefore - totalAfter)} MB (${Math.round((1 - totalAfter / totalBefore) * 100)}%)`);
