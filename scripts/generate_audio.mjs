#!/usr/bin/env node
/**
 * Generate MP3 audio files for each character's ttsText using Qwen3-TTS-Flash.
 *
 * Supports parallel processing with configurable concurrency.
 *
 * Uses the MultiModalConversation API:
 *   POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
 *
 * The API returns a JSON response containing an audio URL which we download.
 *
 * Usage:
 *   DASHSCOPE_API_KEY=sk-xxx node scripts/generate_audio.mjs
 *   DASHSCOPE_API_KEY=sk-xxx CONCURRENCY=10 node scripts/generate_audio.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const questionsPath = join(__dirname, '..', 'src', 'data', 'questions.json');
const audioDir = join(__dirname, '..', 'public', 'audio');

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is required.');
    process.exit(1);
}

// Ensure audio directory exists
if (!existsSync(audioDir)) {
    mkdirSync(audioDir, { recursive: true });
}

// Generate MD5 hash for a ttsText string
const hashText = (text) => createHash('md5').update(text).digest('hex').slice(0, 12);

// Synthesize text via MultiModalConversation API
const synthesize = async (text) => {
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
        throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const result = await response.json();

    // Check for API-level errors
    if (result.code) {
        throw new Error(`API error ${result.code}: ${result.message}`);
    }

    // Extract audio from response — could be a URL string or an object
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
};

// Run tasks with concurrency pool + periodic save
const SAVE_INTERVAL = 20; // Save progress every N completions

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

            // Periodic save
            if (onCheckpoint && completed - lastSave >= SAVE_INTERVAL) {
                lastSave = completed;
                onCheckpoint(completed);
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
            if (!info.ttsText) continue;
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
            // Already exists — just update refs
            for (const ref of entry.refs) {
                questions[ref.qIndex].pronunciation[ref.char].audioFile = audioFile;
            }
            skipped++;
        } else {
            toProcess.push({ hash, entry, audioFile });
        }
    }

    console.log(`Total unique ttsText: ${ttsMap.size}`);
    console.log(`Already existing: ${skipped}`);
    console.log(`Need generation: ${toProcess.length}`);
    console.log(`Concurrency: ${CONCURRENCY}\n`);

    if (toProcess.length === 0) {
        // Still save to update any audioFile references
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
            writeFileSync(filePath, audioBuffer);

            // Update all references
            for (const ref of entry.refs) {
                questions[ref.qIndex].pronunciation[ref.char].audioFile = audioFile;
            }

            processed++;
            const total = toProcess.length;
            console.log(`  [${processed + errors}/${total}] "${entry.ttsText}" → ${audioFile} (${audioBuffer.length} bytes)`);
            return { status: 'ok' };
        } catch (err) {
            errors++;
            console.error(`  [${processed + errors}/${toProcess.length}] ERROR "${entry.ttsText}": ${err.message}`);
            return { status: 'error', message: err.message };
        }
    });

    // Execute with concurrency pool + periodic save
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
