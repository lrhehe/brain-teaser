#!/usr/bin/env node
/**
 * Generate MP3 audio files for each character's ttsText using Qwen3-TTS-Flash.
 *
 * Uses the MultiModalConversation API:
 *   POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
 *
 * The API returns a JSON response containing an audio URL which we download.
 *
 * Usage:
 *   DASHSCOPE_API_KEY=sk-xxx node scripts/generate_audio.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const questionsPath = join(__dirname, '..', 'src', 'data', 'questions.json');
const audioDir = join(__dirname, '..', 'public', 'audio');

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

    // Debug: log full response on first call
    if (!synthesize._debugDone) {
        console.log(`  [DEBUG] Full response: ${JSON.stringify(result).slice(0, 1000)}`);
        synthesize._debugDone = true;
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

    console.log(`Found ${ttsMap.size} unique ttsText entries across ${questions.length} questions.\n`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const [hash, entry] of ttsMap) {
        const filePath = join(audioDir, `${hash}.mp3`);
        const audioFile = `${hash}.mp3`;

        const setAudioFile = () => {
            for (const ref of entry.refs) {
                questions[ref.qIndex].pronunciation[ref.char].audioFile = audioFile;
            }
        };

        // Skip if audio file already exists
        if (existsSync(filePath)) {
            setAudioFile();
            skipped++;
            continue;
        }

        try {
            const audioBuffer = await synthesize(entry.ttsText);
            writeFileSync(filePath, audioBuffer);
            setAudioFile();
            processed++;
            console.log(`  [${processed + skipped}/${ttsMap.size}] "${entry.ttsText}" → ${audioFile} (${audioBuffer.length} bytes)`);
        } catch (err) {
            console.error(`  [${processed + skipped + errors}/${ttsMap.size}] ERROR "${entry.ttsText}": ${err.message}`);
            errors++;
        }

        // Delay between calls to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
    }

    // Save updated questions with audioFile references
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
