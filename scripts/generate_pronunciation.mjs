#!/usr/bin/env node
/**
 * Generate ttsText for each character's pronunciation data using DeepSeek API.
 *
 * For each question, collects all unique Chinese characters that lack ttsText,
 * uses a dictionary cache to reuse known pronunciations, and calls DeepSeek
 * only for unknown or polyphonic characters.
 *
 * The ttsText is a child-friendly phrase that helps kids remember the character,
 * e.g. "苹果的苹" for 苹, "妈妈的妈" for 妈.
 *
 * Usage:
 *   source .env && DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY node scripts/generate_pronunciation.mjs
 *   CONCURRENCY=10 DEEPSEEK_API_KEY=sk-xxx node scripts/generate_pronunciation.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const questionsPath = join(__dirname, '..', 'src', 'data', 'questions.json');
const dictPath = join(__dirname, '..', 'src', 'data', 'pronunciation_dict.json');

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
    console.error('Error: DEEPSEEK_API_KEY environment variable is required.');
    process.exit(1);
}

const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
});

// ── Character Dictionary ──────────────────────────────────────────
// dict: { char: [ { pinyin, ttsText } ] }
// Non-polyphonic chars: 1 entry; polyphonic chars: 2+ entries.

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
            if (!info || typeof info !== 'object' || !info.pinyin || !info.ttsText) continue;

            if (!dict[char]) dict[char] = [];

            const exists = dict[char].some(r => r.pinyin === info.pinyin);
            if (!exists) {
                dict[char].push({ pinyin: info.pinyin, ttsText: info.ttsText });
                added++;
            }
        }
    }

    return { dict, added };
};

const saveDict = (dict) => {
    writeFileSync(dictPath, JSON.stringify(dict, null, 2) + '\n', 'utf8');
};

const isPolyphonic = (dict, char) => dict[char] && dict[char].length > 1;

// ── Extract Chinese characters ────────────────────────────────────
const extractChineseChars = (text) => {
    return [...text].filter(ch => /[\u4e00-\u9fff]/.test(ch));
};

// ── Build prompt ──────────────────────────────────────────────────
const buildPrompt = (question, charsToResolve) => {
    if (charsToResolve.length === 0) return null;

    return `你是一个幼儿中文识字教学专家，面向5-12岁的小朋友。

题目：${question.text}
选项：${question.options.map(o => `${o.id}. ${o.text}`).join('；')}

请为以下每个中文字生成读音信息：
${charsToResolve.join('、')}

要求：
1. pinyin：带声调拼音（如 lì、shén）
2. ttsText：帮助孩子记住这个字的读音的短语。
   - 格式必须严格为：\u201cX\u201d\uff1a\u201cYY\u201d的\u201cX\u201d，其中X是这个字，YY是包含这个字的常见词
   - 例如："树"："大树"的"树"、"妈"："妈妈"的"妈"、"苹"："苹果"的"苹"
   - 要求使用孩子日常生活中最常见、最容易理解的词语
   - 优先选择：身体部位（眼睛的眼）、家人称呼（妈妈的妈）、日常物品（书包的书）、动物（小猫的猫）、食物（苹果的苹）、颜色（红色的红）、大自然（太阳的太）
   - 避免使用成语、文言文、或者孩子不熟悉的词
3. 多音字要根据题目语境选择正确读音

请严格按照以下 JSON 格式返回，不要包含其他内容：
{
  "字1": { "pinyin": "...", "ttsText": "\u201c字1\u201d\uff1a\u201cXX\u201d的\u201c字1\u201d" },
  "字2": { "pinyin": "...", "ttsText": "\u201c字2\u201d\uff1a\u201cXX\u201d的\u201c字2\u201d" }
}`;
};

// ── Process a single question ─────────────────────────────────────
const processQuestion = async (question, dict) => {
    const allTexts = [question.text, ...question.options.map(o => o.text)];
    const allChars = [...new Set(allTexts.flatMap(extractChineseChars))];

    if (allChars.length === 0) {
        return { status: 'skipped', reason: 'no Chinese chars' };
    }

    // Check which chars need ttsText
    const needsTts = allChars.filter(ch => {
        const info = question.pronunciation?.[ch];
        return !info?.ttsText;
    });

    if (needsTts.length === 0) {
        return { status: 'skipped', reason: 'all have ttsText' };
    }

    // Separate: dict-resolvable vs needs API
    const resolved = {};
    const needsApi = [];

    for (const char of needsTts) {
        if (!dict[char]) {
            needsApi.push(char);
        } else if (isPolyphonic(dict, char)) {
            needsApi.push(char);
        } else {
            resolved[char] = { ...dict[char][0] };
        }
    }

    // Merge resolved into existing pronunciation
    if (!question.pronunciation) question.pronunciation = {};
    for (const [char, data] of Object.entries(resolved)) {
        question.pronunciation[char] = { ...question.pronunciation[char], ...data };
    }

    // If all resolved from dict, done
    if (needsApi.length === 0) {
        return {
            status: 'dict',
            charCount: needsTts.length,
            dictHits: needsTts.length,
            apiChars: 0,
        };
    }

    // Call DeepSeek API
    const prompt = buildPrompt(question, needsApi);

    try {
        const response = await client.chat.completions.create({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        const apiResult = JSON.parse(content);

        for (const char of needsApi) {
            if (apiResult[char]) {
                question.pronunciation[char] = {
                    ...question.pronunciation[char],
                    ...apiResult[char],
                };

                // Update dictionary
                if (!dict[char]) dict[char] = [];
                const exists = dict[char].some(r => r.pinyin === apiResult[char].pinyin);
                if (!exists) {
                    dict[char].push({
                        pinyin: apiResult[char].pinyin,
                        ttsText: apiResult[char].ttsText,
                    });
                }
            }
        }

        return {
            status: 'ok',
            charCount: needsTts.length,
            dictHits: Object.keys(resolved).length,
            apiChars: needsApi.length,
        };
    } catch (err) {
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

    // Identify questions that need ttsText
    const needsProcessing = questions.filter(q => {
        if (!q.pronunciation) return true;
        return Object.values(q.pronunciation).some(
            info => info && typeof info === 'object' && !info.ttsText
        );
    });

    console.log(`📖 Dictionary: ${totalCharsInDict} unique chars (${polyphonicCount} polyphonic)`);
    console.log(`📝 Total questions: ${questions.length}`);
    console.log(`🆕 Need ttsText: ${needsProcessing.length}`);
    console.log(`⚡ Concurrency: ${CONCURRENCY}\n`);

    if (needsProcessing.length === 0) {
        saveDict(dict);
        console.log('All questions already have ttsText. Dictionary saved.');
        return;
    }

    // Build task functions
    let logCounter = 0;
    const tasks = questions.map((q) => async () => {
        const result = await processQuestion(q, dict);

        logCounter++;
        if (result.status === 'ok') {
            console.log(`  [${logCounter}/${questions.length}] #${q.id} — OK (${result.dictHits} cached + ${result.apiChars} API)`);
        } else if (result.status === 'dict') {
            console.log(`  [${logCounter}/${questions.length}] #${q.id} — ✨ All from dict (${result.charCount} chars)`);
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
    let totalDictHits = 0, totalApiChars = 0;
    for (const r of results) {
        counts[r.status]++;
        if (r.dictHits) totalDictHits += r.dictHits;
        if (r.apiChars) totalApiChars += r.apiChars;
    }

    console.log(`\nDone!`);
    console.log(`  From API: ${counts.ok} questions (${totalApiChars} chars)`);
    console.log(`  From dict: ${counts.dict} questions (${totalDictHits} chars)`);
    console.log(`  Skipped: ${counts.skipped}`);
    console.log(`  Errors: ${counts.error}`);
    console.log(`  Dictionary: ${Object.keys(dict).length} chars (${Object.values(dict).filter(r => r.length > 1).length} polyphonic)`);
};

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
