#!/usr/bin/env node
/**
 * Generate audio files for each character's ttsText using Qwen-TTS (cosyvoice).
 *
 * Model: qwen-tts (via DashScope MultiModalConversation API)
 * Voice: Cherry (sweet female, good for kids)
 *
 * Supports parallel processing, periodic save, and skip-existing.
 *
 * Usage:
 *   source .env && DASHSCOPE_API_KEY=$DASHSCOPE_API_KEY node scripts/generate_audio.mjs
 *   CONCURRENCY=5 DASHSCOPE_API_KEY=sk-xxx node scripts/generate_audio.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const questionsPath = join(__dirname, '..', 'src', 'data', 'questions.json');
const audioDir = join(__dirname, '..', 'docs', 'audio');

// qwen3-tts-flash has 180 RPM limit
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '1000', 10); // 1s between requests per worker

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is required.');
    process.exit(1);
}

// Ensure audio directory exists
if (!existsSync(audioDir)) {
    mkdirSync(audioDir, { recursive: true });
}

// Check if ffmpeg is available (for WAV→MP3 conversion)
let hasFFmpeg = false;
try {
    execSync('which ffmpeg', { stdio: 'ignore' });
    hasFFmpeg = true;
} catch (_) { }

// Generate MD5 hash for a ttsText string
const hashText = (text) => createHash('md5').update(text).digest('hex').slice(0, 12);

// Sleep helper
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Synthesize text via DashScope API using qwen-tts model
// With retry + exponential backoff for rate limiting
const MAX_RETRIES = 5;

const synthesize = async (text) => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(
            'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'qwen3-tts-flash',
                    input: {
                        text: text,
                    },
                    parameters: {
                        voice: 'Cherry',
                    },
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text();

            // Retry on rate limit (429)
            if (response.status === 429 && attempt < MAX_RETRIES) {
                const backoff = Math.pow(2, attempt + 1) * 3000; // 6s, 12s, 24s, 48s, 96s
                console.log(`    ⏳ Rate limited, retry ${attempt + 1}/${MAX_RETRIES} in ${backoff / 1000}s...`);
                await sleep(backoff);
                continue;
            }

            throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const result = await response.json();

        // Check for API-level rate limit
        if (result.code && result.code.includes('Throttling') && attempt < MAX_RETRIES) {
            const backoff = Math.pow(2, attempt + 1) * 3000;
            console.log(`    ⏳ ${result.code}, retry ${attempt + 1}/${MAX_RETRIES} in ${backoff / 1000}s...`);
            await sleep(backoff);
            continue;
        }

        if (result.code) {
            throw new Error(`API error ${result.code}: ${result.message}`);
        }

        // Extract audio URL from response
        const audio = result.output?.audio;
        let audioUrl;
        if (typeof audio === 'string') {
            audioUrl = audio;
        } else if (audio?.url) {
            audioUrl = audio.url;
        } else {
            throw new Error(`Unexpected audio format: ${JSON.stringify(result.output).slice(0, 500)}`);
        }

        // Download the audio file
        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok) {
            throw new Error(`Failed to download audio: ${audioResponse.status}`);
        }

        const arrayBuffer = await audioResponse.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    throw new Error('Max retries exceeded');
};

// Convert WAV buffer to MP3 using ffmpeg
const wavToMp3 = (wavBuffer, outputPath) => {
    const tmpWav = outputPath + '.tmp.wav';
    writeFileSync(tmpWav, wavBuffer);
    try {
        execSync(`ffmpeg -y -i "${tmpWav}" -codec:a libmp3lame -b:a 64k -ac 1 "${outputPath}" 2>/dev/null`);
    } finally {
        try { require('fs').unlinkSync(tmpWav); } catch (_) { }
    }
};

// Run tasks with concurrency pool + periodic save
const SAVE_INTERVAL = 20;

const runPool = async (tasks, concurrency, onCheckpoint) => {
    const results = new Array(tasks.length);
    let nextIndex = 0;
    let completed = 0;
    let lastSave = 0;

    const worker = async () => {
        while (nextIndex < tasks.length) {
            const i = nextIndex++;
            results[i] = await tasks[i]();
            completed++;

            if (onCheckpoint && completed - lastSave >= SAVE_INTERVAL) {
                lastSave = completed;
                onCheckpoint(completed);
            }

            // Rate limit delay between requests
            if (DELAY_MS > 0 && nextIndex < tasks.length) {
                await sleep(DELAY_MS);
            }
        }
    };

    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
};

// Main
const main = async () => {
    const questions = JSON.parse(readFileSync(questionsPath, 'utf8'));

    // Collect all unique ttsText entries
    const ttsMap = new Map();

    for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        if (!q.pronunciation) continue;

        for (const [char, info] of Object.entries(q.pronunciation)) {
            if (!info || typeof info !== 'object' || !info.ttsText) continue;
            const hash = hashText(info.ttsText);
            if (!ttsMap.has(hash)) {
                ttsMap.set(hash, { ttsText: info.ttsText, refs: [] });
            }
            ttsMap.get(hash).refs.push({ qIndex: qi, char });
        }
    }

    // Separate into existing (skip) and new (process)
    const toProcess = [];
    let skipped = 0;

    for (const [hash, entry] of ttsMap) {
        const filePath = join(audioDir, `${hash}.mp3`);
        const audioFile = `${hash}.mp3`;

        if (existsSync(filePath)) {
            for (const ref of entry.refs) {
                questions[ref.qIndex].pronunciation[ref.char].audioFile = audioFile;
            }
            skipped++;
        } else {
            toProcess.push({ hash, entry, audioFile });
        }
    }

    console.log(`🔊 Model: qwen-tts (voice: Cherry)`);
    console.log(`📊 Total unique ttsText: ${ttsMap.size}`);
    console.log(`✅ Already existing: ${skipped}`);
    console.log(`🆕 Need generation: ${toProcess.length}`);
    console.log(`⚡ Concurrency: ${CONCURRENCY}`);
    console.log(`🎵 FFmpeg: ${hasFFmpeg ? 'available (will convert to MP3)' : 'not found (will save as WAV with .mp3 ext)'}\n`);

    if (toProcess.length === 0) {
        writeFileSync(questionsPath, JSON.stringify(questions, null, 2) + '\n', 'utf8');
        console.log('All audio files already exist. Updated references only.');
        return;
    }

    // Build task functions
    let processed = 0;
    let errors = 0;

    const tasks = toProcess.map(({ hash, entry, audioFile }) => async () => {
        const filePath = join(audioDir, `${hash}.mp3`);

        try {
            const audioBuffer = await synthesize(entry.ttsText);

            // Convert WAV to MP3 if ffmpeg is available
            if (hasFFmpeg) {
                wavToMp3(audioBuffer, filePath);
            } else {
                writeFileSync(filePath, audioBuffer);
            }

            const finalSize = readFileSync(filePath).length;

            // Update all references
            for (const ref of entry.refs) {
                questions[ref.qIndex].pronunciation[ref.char].audioFile = audioFile;
            }

            processed++;
            console.log(`  [${processed + errors}/${toProcess.length}] "${entry.ttsText}" → ${audioFile} (${finalSize} bytes)`);
            return { status: 'ok' };
        } catch (err) {
            errors++;
            console.error(`  [${processed + errors}/${toProcess.length}] ERROR "${entry.ttsText}": ${err.message}`);
            return { status: 'error', message: err.message };
        }
    });

    // Execute with periodic save
    const saveProgress = (completed) => {
        writeFileSync(questionsPath, JSON.stringify(questions, null, 2) + '\n', 'utf8');
        console.log(`  💾 Progress saved (${completed}/${toProcess.length} completed)`);
    };

    await runPool(tasks, CONCURRENCY, saveProgress);

    // Final save
    writeFileSync(questionsPath, JSON.stringify(questions, null, 2) + '\n', 'utf8');

    console.log(`\nDone!`);
    console.log(`  Generated: ${processed}`);
    console.log(`  Skipped (existing): ${skipped}`);
    console.log(`  Errors: ${errors}`);
};

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
