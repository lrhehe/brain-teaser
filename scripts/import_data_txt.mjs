#!/usr/bin/env node
/**
 * Import questions from data.txt into questions.json.
 *
 * Steps:
 *   1. Parse data.txt (format: "0001—题目 答案：答案")
 *   2. De-duplicate against existing questions.json
 *   3. Batch-send to Qwen AI to filter age-appropriate (5-12 years) and generate options
 *   4. Append filtered questions to questions.json
 *
 * Usage:
 *   DASHSCOPE_API_KEY=sk-xxx node scripts/import_data_txt.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '..', 'data.txt');
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

// ── Parse data.txt ────────────────────────────────────────────────
const parseDataTxt = (content) => {
    const lines = content.split('\n').filter(l => l.trim());
    const parsed = [];

    for (const line of lines) {
        // Format: "0001—题目 答案：答案"
        const match = line.match(/^(\d+)—(.+?)\s*答案[：:](.+)$/);
        if (!match) continue;

        const [, id, question, answer] = match;
        parsed.push({
            rawId: parseInt(id),
            question: question.trim(),
            answer: answer.trim(),
        });
    }

    return parsed;
};

// ── Batch filter + generate options via AI ─────────────────────────
const BATCH_SIZE = 40; // Questions per API call

const buildFilterPrompt = (batch) => {
    const items = batch.map((q, i) => `${i + 1}. 题：${q.question} 答：${q.answer}`).join('\n');

    return `你是一个儿童内容审核员和脑筋急转弯专家。

以下是一批脑筋急转弯题目和答案。请完成两个任务：

**任务1：筛选**
只保留适合 5-12 岁小朋友的题目。排除以下类型：
- 涉及暴力、死亡、恐怖、色情、成人幽默的
- 需要深厚文化知识（如历史典故）才能理解的
- 涉及赌博、犯罪、酒精等不适合儿童的话题
- 答案过于牵强或不合逻辑，小朋友难以理解的
- 纯文字游戏（如猜字谜、拆字）5岁小朋友无法理解的

**任务2：生成选项**
对于保留的每道题，生成3个选项（1个正确答案 + 2个干扰项）。要求：
- 正确答案来自原文，可以适当简化（去掉"因为"等前缀）
- 干扰项要看起来合理但错误，适合小朋友的认知水平
- 每个选项尽量简短（2-8个字）

题目列表：
${items}

请严格按照以下 JSON 格式返回，不要包含其他内容：
{
  "selected": [
    {
      "index": 1,
      "text": "题目文本",
      "type": "logic|math|animal|daily",
      "options": [
        {"text": "正确答案", "isCorrect": true},
        {"text": "干扰项1", "isCorrect": false},
        {"text": "干扰项2", "isCorrect": false}
      ]
    }
  ]
}

注意：
- index 是上面题目列表中的序号（1-based）
- type 根据题目内容分类：逻辑推理=logic, 数学计算=math, 动物相关=animal, 日常常识=daily
- 如果一道题不适合小朋友，直接不要放在 selected 数组中`;
};

const processBatch = async (batch, batchIndex, totalBatches) => {
    const prompt = buildFilterPrompt(batch);

    try {
        const response = await client.chat.completions.create({
            model: 'qwen-plus',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        const result = JSON.parse(content);

        const selected = (result.selected || []).map(item => ({
            ...item,
            originalQuestion: batch[item.index - 1]?.question,
            originalAnswer: batch[item.index - 1]?.answer,
        }));

        console.log(`  Batch ${batchIndex + 1}/${totalBatches}: ${batch.length} input → ${selected.length} selected`);
        return selected;
    } catch (err) {
        console.error(`  Batch ${batchIndex + 1}/${totalBatches}: ERROR — ${err.message}`);
        return [];
    }
};

// ── Main ──────────────────────────────────────────────────────────
const main = async () => {
    // Parse data.txt
    const raw = parseDataTxt(readFileSync(dataPath, 'utf8'));
    console.log(`Parsed ${raw.length} questions from data.txt`);

    // Load existing questions for de-duplication
    const existing = JSON.parse(readFileSync(questionsPath, 'utf8'));
    const existingTexts = new Set(
        existing.map(q => q.text.replace(/[？?！!。，,\s]/g, ''))
    );

    // Filter out duplicates
    const newRaw = raw.filter(q => {
        const normalized = q.question.replace(/[？?！!。，,\s]/g, '');
        return !existingTexts.has(normalized);
    });
    console.log(`After de-duplication: ${newRaw.length} new questions (removed ${raw.length - newRaw.length} duplicates)\n`);

    if (newRaw.length === 0) {
        console.log('No new questions to process.');
        return;
    }

    // Split into batches
    const batches = [];
    for (let i = 0; i < newRaw.length; i += BATCH_SIZE) {
        batches.push(newRaw.slice(i, i + BATCH_SIZE));
    }
    console.log(`Processing ${batches.length} batches of ~${BATCH_SIZE} questions...\n`);

    // Process all batches
    const allSelected = [];
    for (let i = 0; i < batches.length; i++) {
        const selected = await processBatch(batches[i], i, batches.length);
        allSelected.push(...selected);

        // Rate limiting
        if (i < batches.length - 1) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    console.log(`\nTotal selected: ${allSelected.length} age-appropriate questions`);

    if (allSelected.length === 0) {
        console.log('No suitable questions found.');
        return;
    }

    // Build question objects
    let nextId = Math.max(...existing.map(q => q.id)) + 1;
    const newQuestions = allSelected.map(item => {
        // Shuffle option positions
        const options = item.options
            .sort(() => Math.random() - 0.5)
            .map((opt, j) => ({
                id: String.fromCharCode(97 + j), // a, b, c
                text: opt.text,
                isCorrect: opt.isCorrect,
            }));

        return {
            id: nextId++,
            type: item.type || 'logic',
            text: item.text,
            options,
        };
    });

    // Second round de-duplication (within newly selected)
    const seen = new Set();
    const dedupedNew = newQuestions.filter(q => {
        const key = q.text.replace(/[？?！!。，,\s]/g, '');
        if (seen.has(key) || existingTexts.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Merge and write
    const allQuestions = [...existing, ...dedupedNew];
    writeFileSync(questionsPath, JSON.stringify(allQuestions, null, 2) + '\n', 'utf8');

    console.log(`\nDone!`);
    console.log(`  Previously: ${existing.length} questions`);
    console.log(`  Added: ${dedupedNew.length} questions`);
    console.log(`  Total: ${allQuestions.length} questions`);
    console.log(`\nNext steps:`);
    console.log(`  1. Run: DASHSCOPE_API_KEY=sk-xxx node scripts/generate_pronunciation.mjs`);
    console.log(`  2. Run: DASHSCOPE_API_KEY=sk-xxx node scripts/generate_audio.mjs`);
};

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
