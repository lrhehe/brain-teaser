#!/usr/bin/env node
/**
 * Generate pronunciation data for each question using Qwen LLM.
 *
 * For each question, sends the question text + all option texts to Qwen,
 * and gets back per-character pronunciation (pinyin + example word + ttsText).
 *
 * Usage:
 *   DASHSCOPE_API_KEY=sk-xxx node scripts/generate_pronunciation.mjs
 *
 * Results are written back into questions.json as a `pronunciation` field per question.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const questionsPath = join(__dirname, '..', 'src', 'data', 'questions.json');

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is required.');
    process.exit(1);
}

const client = new OpenAI({
    apiKey,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// Extract Chinese characters from a string
const extractChineseChars = (text) => {
    return [...text].filter(ch => /[\u4e00-\u9fff]/.test(ch));
};

// Build prompt for a single question
const buildPrompt = (question) => {
    const allTexts = [question.text, ...question.options.map(o => o.text)];
    const allChars = [...new Set(allTexts.flatMap(extractChineseChars))];

    if (allChars.length === 0) return null;

    return `你是一个中文发音教学助手，面向5-12岁的小朋友。

以下是一道脑筋急转弯题目及其选项：
题目：${question.text}
选项：${question.options.map(o => `${o.id}. ${o.text}`).join('；')}

请为以下每个中文字，根据它在题目或选项中的语境，生成准确的读音信息：
${allChars.join('、')}

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

// Process a single question
const processQuestion = async (question, index, total) => {
    // Skip if already has pronunciation data
    if (question.pronunciation && Object.keys(question.pronunciation).length > 0) {
        console.log(`  [${index + 1}/${total}] #${question.id} — skipped (already has pronunciation)`);
        return question;
    }

    const prompt = buildPrompt(question);
    if (!prompt) {
        console.log(`  [${index + 1}/${total}] #${question.id} — skipped (no Chinese chars)`);
        return question;
    }

    try {
        const response = await client.chat.completions.create({
            model: 'qwen-plus',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1, // Low temperature for consistency
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        const pronunciation = JSON.parse(content);

        // Validate the response
        const allTexts = [question.text, ...question.options.map(o => o.text)];
        const expectedChars = [...new Set(allTexts.flatMap(extractChineseChars))];
        const missingChars = expectedChars.filter(ch => !pronunciation[ch]);
        if (missingChars.length > 0) {
            console.warn(`  [${index + 1}/${total}] #${question.id} — WARNING: missing chars: ${missingChars.join(', ')}`);
        }

        question.pronunciation = pronunciation;
        console.log(`  [${index + 1}/${total}] #${question.id} — OK (${Object.keys(pronunciation).length} chars)`);
    } catch (err) {
        console.error(`  [${index + 1}/${total}] #${question.id} — ERROR: ${err.message}`);
    }

    return question;
};

// Main
const main = async () => {
    const questions = JSON.parse(readFileSync(questionsPath, 'utf8'));
    console.log(`Processing ${questions.length} questions...\n`);

    // Process sequentially to avoid rate limits
    for (let i = 0; i < questions.length; i++) {
        await processQuestion(questions[i], i, questions.length);
        // Small delay between API calls
        if (i < questions.length - 1) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

    // Save results
    writeFileSync(questionsPath, JSON.stringify(questions, null, 2) + '\n', 'utf8');

    // Summary
    const withPronunciation = questions.filter(q => q.pronunciation);
    const totalChars = withPronunciation.reduce((sum, q) => sum + Object.keys(q.pronunciation).length, 0);
    console.log(`\nDone! ${withPronunciation.length}/${questions.length} questions have pronunciation data.`);
    console.log(`Total character entries: ${totalChars}`);
};

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
