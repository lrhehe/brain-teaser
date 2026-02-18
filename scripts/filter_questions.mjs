#!/usr/bin/env node
/**
 * Filter questions.json using DeepSeek to keep only age-appropriate content
 * for children aged 5-12.
 *
 * Sends questions in batches of 20 to DeepSeek for review.
 * Removes any question flagged as inappropriate.
 * Saves rejected questions to rejected_questions.json for review.
 *
 * Usage:
 *   source .env && DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY node scripts/filter_questions.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const questionsPath = join(__dirname, '..', 'src', 'data', 'questions.json');
const rejectedPath = join(__dirname, '..', 'src', 'data', 'rejected_questions.json');

const BATCH_SIZE = 20;
const CONCURRENCY = 3;

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
    console.error('Error: DEEPSEEK_API_KEY environment variable is required.');
    process.exit(1);
}

const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
});

const buildPrompt = (batch) => {
    const items = batch.map(q => {
        const opts = q.options.map(o => `${o.id}) ${o.text}`).join(' ');
        return `[ID:${q.id}] ${q.text} | 选项: ${opts} | 答案: ${q.answer}`;
    }).join('\n');

    return `你是一个儿童内容审核专家。请逐条审查以下脑筋急转弯题目，判断是否适合 5-12 岁小朋友。

审查标准——以下任何一条不满足就应该淘汰：
1. 不能包含暴力、血腥、恐怖、死亡相关内容
2. 不能包含色情、性暗示、恋爱相关内容
3. 不能包含赌博、毒品、犯罪相关内容
4. 不能包含歧视、侮辱、脏话相关内容
5. 题目的理解难度不能超出12岁孩子的认知水平（如涉及复杂政治、经济、法律概念）
6. 答案的逻辑不能过于牵强或无聊，应该有趣味性
7. 不能涉及成人世界的社会话题（如婚姻问题、职场潜规则等）

题目列表：
${items}

请严格按照以下 JSON 格式返回一个数组，每个元素对应一道题：
[
  { "id": 数字, "keep": true或false, "reason": "保留或淘汰的简要理由" }
]

只返回 JSON，不要包含其他内容。`;
};

const processBatch = async (batch, batchIndex, totalBatches) => {
    const prompt = buildPrompt(batch);

    try {
        const response = await client.chat.completions.create({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        let results;

        // The API might return { "results": [...] } or just [...]
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            results = parsed;
        } else if (parsed.results && Array.isArray(parsed.results)) {
            results = parsed.results;
        } else if (parsed.questions && Array.isArray(parsed.questions)) {
            results = parsed.questions;
        } else {
            // Try to find array in any top-level key
            const arr = Object.values(parsed).find(v => Array.isArray(v));
            if (arr) {
                results = arr;
            } else {
                console.error(`  Batch ${batchIndex + 1}: unexpected format, keeping all`);
                return batch.map(q => ({ id: q.id, keep: true, reason: 'parse error' }));
            }
        }

        return results;
    } catch (err) {
        console.error(`  Batch ${batchIndex + 1}: ERROR ${err.message}, keeping all`);
        return batch.map(q => ({ id: q.id, keep: true, reason: 'api error' }));
    }
};

// ── Main ──────────────────────────────────────────────────────────
const main = async () => {
    const questions = JSON.parse(readFileSync(questionsPath, 'utf8'));
    console.log(`📝 Total questions: ${questions.length}`);
    console.log(`📦 Batch size: ${BATCH_SIZE}`);
    console.log(`⚡ Concurrency: ${CONCURRENCY}\n`);

    // Split into batches
    const batches = [];
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
        batches.push(questions.slice(i, i + BATCH_SIZE));
    }
    console.log(`📊 Total batches: ${batches.length}\n`);

    // Process batches with concurrency
    const allResults = new Map(); // id → { keep, reason }
    let batchesDone = 0;

    const processBatchWrapper = async (batchIdx) => {
        const results = await processBatch(batches[batchIdx], batchIdx, batches.length);
        for (const r of results) {
            allResults.set(r.id, { keep: r.keep, reason: r.reason });
        }
        batchesDone++;
        const rejected = results.filter(r => !r.keep);
        if (rejected.length > 0) {
            console.log(`  Batch ${batchIdx + 1}/${batches.length}: ${rejected.length} rejected`);
            for (const r of rejected) {
                console.log(`    ❌ #${r.id}: ${r.reason}`);
            }
        } else {
            console.log(`  Batch ${batchIdx + 1}/${batches.length}: all kept ✅`);
        }
    };

    // Run with concurrency
    let nextBatch = 0;
    const worker = async () => {
        while (nextBatch < batches.length) {
            const idx = nextBatch++;
            await processBatchWrapper(idx);
        }
    };

    const workers = Array.from(
        { length: Math.min(CONCURRENCY, batches.length) },
        () => worker()
    );
    await Promise.all(workers);

    // Split into kept and rejected
    const kept = [];
    const rejected = [];

    for (const q of questions) {
        const result = allResults.get(q.id);
        if (!result || result.keep) {
            kept.push(q);
        } else {
            rejected.push({ ...q, _rejectReason: result.reason });
        }
    }

    // Re-number IDs
    kept.forEach((q, i) => { q.id = i + 1; });

    // Save
    writeFileSync(questionsPath, JSON.stringify(kept, null, 2) + '\n', 'utf8');
    writeFileSync(rejectedPath, JSON.stringify(rejected, null, 2) + '\n', 'utf8');

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Done!`);
    console.log(`  Kept: ${kept.length}`);
    console.log(`  Rejected: ${rejected.length}`);
    console.log(`  Rejected saved to: ${rejectedPath}`);
};

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
