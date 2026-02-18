#!/usr/bin/env node
/**
 * Filter out questions inappropriate for 5-12 year olds,
 * then re-index all remaining question IDs sequentially.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const questionsPath = join(__dirname, '..', 'src', 'data', 'questions.json');

// IDs to remove and reasons
const removeIds = new Map([
    // Adult/relationship themes - not suitable for 5-12 year olds
    [45, "为什么老陈会说他少了女人一天也活不下去 - adult relationship theme"],
    [55, "人们心中最热烈最难以满足的激情 - options include 爱情/金钱欲望, too abstract"],
    [72, "一个男人加一个女人 - options include 夫妻, relationship theme"],
    [85, "没有生孩子也没有认干娘却先当上了娘 - marriage/adult concept"],
    [91, "为什么婴儿一出生就大哭 - 护士阿姨太漂亮觉得自己太小, inappropriate humor"],
    [98, "为什么离婚的人越来越多 - divorce topic, not kid-friendly"],
    [99, "为什么穿高跟鞋的女人快结婚了 - dating/marriage, not kid-friendly"],
    [103, "谁是世界上最有恒心的画家 - 爱化妆的女人, gender stereotype"],

    // Violence/scary content
    [51, "画的是黑人在半夜里抓乌鸦 - racially insensitive answer"],
    [64, "武松犯了什么罪 - option includes 杀人, violent"],
    [86, "什么时候我们会目中无人 - answer involves 墓地, scary for kids"],

    // Inappropriate humor / too complex concepts
    [89, "为什么流氓坐车不要钱 - 流氓/囚车, criminal theme"],
    [68, "何种动物最接近于人类 - 寄生虫, gross/complex for young kids"],
    [108, "米的外公是谁 - 抱过米也抱过花 pun too complex for 5-year-olds"],
    [109, "米的爸爸是谁 - 蝶恋花 pun too advanced for young kids"],
    [43, "兔崽子龟儿子 - mildly rude language (骂人)"],
    [31, "书店买不到的书是什么书 - 遗书 (suicide note), dark topic"],
]);

const questions = JSON.parse(readFileSync(questionsPath, 'utf8'));
console.log(`Before filtering: ${questions.length} questions`);

const filtered = questions.filter(q => {
    if (removeIds.has(q.id)) {
        console.log(`  REMOVE #${q.id}: ${q.text.substring(0, 30)}... (${removeIds.get(q.id)})`);
        return false;
    }
    return true;
});

// Re-index IDs sequentially
filtered.forEach((q, i) => {
    q.id = i + 1;
});

console.log(`After filtering: ${filtered.length} questions`);
console.log(`Removed: ${questions.length - filtered.length} questions`);

writeFileSync(questionsPath, JSON.stringify(filtered, null, 2) + '\n', 'utf8');
console.log('Done! Updated questions.json with re-indexed IDs');
