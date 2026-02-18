#!/usr/bin/env node
/**
 * Generate pronunciation data for each question using Qwen LLM.
 *
 * Optimizations:
 *   - Builds a dictionary from existing pronunciation data
 *   - Non-polyphonic characters (单音字) are reused from the dictionary — no API call
 *   - Only polyphonic characters (多音字) and unknown characters need API calls
 *   - Parallel processing with configurable concurrency
 *   - Periodic save to prevent data loss on interruption
 *
 * Usage:
 *   DASHSCOPE_API_KEY=sk-xxx node scripts/generate_pronunciation.mjs
 *   DASHSCOPE_API_KEY=sk-xxx CONCURRENCY=10 node scripts/generate_pronunciation.mjs
 *
 * Results are written back into questions.json as a `pronunciation` field per question.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const questionsPath = join(__dirname, '..', 'src', 'data', 'questions.json');
const dictPath = join(__dirname, '..', 'src', 'data', 'pronunciation_dict.json');

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is required.');
    process.exit(1);
}

const client = new OpenAI({
    apiKey,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// ── Character Dictionary ──────────────────────────────────────────
// dict: { char: [ { pinyin, example, ttsText, audioFile? } ] }
// Each char maps to an array of known readings.
// Non-polyphonic chars have exactly 1 entry; polyphonic chars have 2+.

const loadDict = () => {
    if (existsSync(dictPath)) {
        return JSON.parse(readFileSync(dictPath, 'utf8'));
    }
    return {};
};

const buildDictFromQuestions = (questions) => {
    const dict = loadDict();
    let added = 0;

    for (const q of questions) {
        if (!q.pronunciation) continue;
        for (const [char, info] of Object.entries(q.pronunciation)) {
            if (!info.pinyin) continue;

            if (!dict[char]) {
                dict[char] = [];
            }

            // Check if this reading already exists
            const exists = dict[char].some(r => r.pinyin === info.pinyin);
            if (!exists) {
                dict[char].push({
                    pinyin: info.pinyin,
                    example: info.example,
                    ttsText: info.ttsText,
                    ...(info.audioFile ? { audioFile: info.audioFile } : {}),
                });
                added++;
            }
        }
    }

    return { dict, added };
};

const saveDict = (dict) => {
    writeFileSync(dictPath, JSON.stringify(dict, null, 2) + '\n', 'utf8');
};

const isPolyphonic = (dict, char) => {
    return dict[char] && dict[char].length > 1;
};

// ── Extract Chinese characters ────────────────────────────────────
const extractChineseChars = (text) => {
    return [...text].filter(ch => /[\u4e00-\u9fff]/.test(ch));
};

// ── Build prompt (only for unresolved chars) ──────────────────────
const buildPrompt = (question, charsToResolve) => {
    if (charsToResolve.length === 0) return null;

    return `你是一个中文发音教学助手，面向5-12岁的小朋友。

以下是一道脑筋急转弯题目及其选项：
题目：${question.text}
选项：${question.options.map(o => `${o.id}. ${o.text}`).join('；')}

请为以下每个中文字，根据它在题目或选项中的语境，生成准确的读音信息：
${charsToResolve.join('、')}

要求：
1. pinyin 使用带声调的拼音（如 lì、shén、me）
2. example 用一个小朋友容易理解的常见词来帮助记忆这个字的读音，格式为"XX的X"（如"美丽的丽"、"什么的什"）
3. ttsText 是用于语音合成的文本，格式为"汉字，例词"（如"丽，美丽的丽"）
4. 注意多音字要根据语境选择正确的读音

请严格按照以下 JSON 格式返回，不要包含其他内容：
{
  "字1": { "pinyin": "...", "example": "...", "ttsText": "..." },
  "字2": { "pinyin": "...", "example": "...", "ttsText": "..." }
}`;
};

// ── Process a single question ─────────────────────────────────────
const processQuestion = async (question, dict) => {
    // Skip if already has pronunciation data
    if (question.pronunciation && Object.keys(question.pronunciation).length > 0) {
        return { status: 'skipped', reason: 'existing' };
    }

    const allTexts = [question.text, ...question.options.map(o => o.text)];
    const allChars = [...new Set(allTexts.flatMap(extractChineseChars))];

    if (allChars.length === 0) {
        return { status: 'skipped', reason: 'no Chinese chars' };
    }

    // Separate chars into: resolvable from dict vs needs API
    const resolved = {};    // char → {pinyin, example, ttsText, audioFile?}
    const needsApi = [];    // chars that need API call

    for (const char of allChars) {
        if (!dict[char]) {
            // Unknown character — must ask API
            needsApi.push(char);
        } else if (isPolyphonic(dict, char)) {
            // Polyphonic — must ask API for context-dependent reading
            needsApi.push(char);
        } else {
            // Single reading — reuse from dict
            resolved[char] = { ...dict[char][0] };
        }
    }

    // If all chars resolved from dict, no API call needed!
    if (needsApi.length === 0) {
        question.pronunciation = resolved;
        return {
            status: 'dict',
            charCount: allChars.length,
            dictHits: allChars.length,
            apiChars: 0,
        };
    }

    // Call API only for unresolved chars
    const prompt = buildPrompt(question, needsApi);

    try {
        const response = await client.chat.completions.create({
            model: 'qwen-plus',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        const apiResult = JSON.parse(content);

        // Merge: dict-resolved + API results
        const pronunciation = { ...resolved };
        for (const char of needsApi) {
            if (apiResult[char]) {
                pronunciation[char] = apiResult[char];

                // Update dictionary with new reading
                if (!dict[char]) dict[char] = [];
                const exists = dict[char].some(r => r.pinyin === apiResult[char].pinyin);
                if (!exists) {
                    dict[char].push({
                        pinyin: apiResult[char].pinyin,
                        example: apiResult[char].example,
                        ttsText: apiResult[char].ttsText,
                    });
                }
            }
        }

        question.pronunciation = pronunciation;

        return {
            status: 'ok',
            charCount: Object.keys(pronunciation).length,
            dictHits: Object.keys(resolved).length,
            apiChars: needsApi.length,
        };
    } catch (err) {
        // On error, still save whatever we resolved from dict
        if (Object.keys(resolved).length > 0) {
            question.pronunciation = resolved;
        }
        return { status: 'error', message: err.message };
    }
};

// ── Concurrency pool with periodic save ───────────────────────────
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
        }
    };

    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
};

// ── Main ──────────────────────────────────────────────────────────
const main = async () => {
    const questions = JSON.parse(readFileSync(questionsPath, 'utf8'));

    // Build dictionary from existing data
    const { dict, added: dictAdded } = buildDictFromQuestions(questions);
    const totalCharsInDict = Object.keys(dict).length;
    const polyphonicCount = Object.values(dict).filter(r => r.length > 1).length;

    // Identify questions that need processing
    const needsProcessing = questions.filter(
        q => !q.pronunciation || Object.keys(q.pronunciation).length === 0
    );

    console.log(`📖 Dictionary: ${totalCharsInDict} unique chars (${polyphonicCount} polyphonic)`);
    console.log(`📝 Total questions: ${questions.length}`);
    console.log(`🆕 Need pronunciation: ${needsProcessing.length}`);
    console.log(`⚡ Concurrency: ${CONCURRENCY}\n`);

    if (needsProcessing.length === 0) {
        saveDict(dict);
        console.log('All questions already have pronunciation data. Dictionary saved.');
        return;
    }

    // Build task functions
    let logCounter = 0;
    const tasks = questions.map((q) => async () => {
        const result = await processQuestion(q, dict);

        logCounter++;
        if (result.status === 'ok') {
            console.log(`  [${logCounter}/${questions.length}] #${q.id} — OK (${result.charCount} chars: ${result.dictHits} cached, ${result.apiChars} from API)`);
        } else if (result.status === 'dict') {
            console.log(`  [${logCounter}/${questions.length}] #${q.id} — ✨ All from dict (${result.charCount} chars, 0 API calls)`);
        } else if (result.status === 'error') {
            console.error(`  [${logCounter}/${questions.length}] #${q.id} — ERROR: ${result.message}`);
        }

        return result;
    });

    // Execute with periodic save
    const saveProgress = (completed) => {
        writeFileSync(questionsPath, JSON.stringify(questions, null, 2) + '\n', 'utf8');
        saveDict(dict);
        console.log(`  💾 Progress saved (${completed} completed, dict: ${Object.keys(dict).length} chars)`);
    };

    const results = await runPool(tasks, CONCURRENCY, saveProgress);

    // Final save
    writeFileSync(questionsPath, JSON.stringify(questions, null, 2) + '\n', 'utf8');
    saveDict(dict);

    // Summary
    const counts = { ok: 0, dict: 0, skipped: 0, error: 0 };
    let totalDictHits = 0;
    let totalApiChars = 0;
    for (const r of results) {
        counts[r.status]++;
        if (r.dictHits) totalDictHits += r.dictHits;
        if (r.apiChars) totalApiChars += r.apiChars;
    }

    console.log(`\nDone!`);
    console.log(`  From API: ${counts.ok} questions (${totalApiChars} chars sent to API)`);
    console.log(`  From dict (0 API calls): ${counts.dict} questions`);
    console.log(`  Skipped: ${counts.skipped}`);
    console.log(`  Errors: ${counts.error}`);
    console.log(`  Dict cache hits: ${totalDictHits} chars`);
    console.log(`  Dictionary size: ${Object.keys(dict).length} chars (${Object.values(dict).filter(r => r.length > 1).length} polyphonic)`);
};

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
