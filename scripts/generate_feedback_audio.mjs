#!/usr/bin/env node
/**
 * Generate audio files for Chinese feedback phrases (correct, incorrect, complete).
 * Outputs to docs/audio/feedback/ directory.
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const feedbackDir = join(__dirname, '..', 'docs', 'audio', 'feedback');
const mappingPath = join(__dirname, '..', 'src', 'data', 'feedback_audio.json');

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
    console.error('Error: DASHSCOPE_API_KEY is required.');
    process.exit(1);
}

if (!existsSync(feedbackDir)) {
    mkdirSync(feedbackDir, { recursive: true });
}

const hashText = (text) => createHash('md5').update(text).digest('hex').slice(0, 10);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const synthesize = async (text, retries = 3) => {
    for (let attempt = 0; attempt < retries; attempt++) {
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
                    input: { text },
                    parameters: { voice: 'Cherry' },
                }),
            }
        );

        if (!response.ok) {
            if (response.status === 429 && attempt < retries - 1) {
                console.log(`  ⏳ Rate limited, wait ${(attempt + 1) * 5}s...`);
                await sleep((attempt + 1) * 5000);
                continue;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result.code?.includes('Throttling') && attempt < retries - 1) {
            await sleep((attempt + 1) * 5000);
            continue;
        }
        if (result.code) throw new Error(`${result.code}: ${result.message}`);

        const audioUrl = typeof result.output?.audio === 'string'
            ? result.output.audio
            : result.output?.audio?.url;
        if (!audioUrl) throw new Error('No audio URL');

        const audioResp = await fetch(audioUrl);
        return Buffer.from(await audioResp.arrayBuffer());
    }
    throw new Error('Max retries');
};

const phrases = {
    correct: [
        "太棒了！", "真聪明！", "答对了！", "好厉害！", "真厉害！",
        "你真棒！", "非常好！", "太厉害了！", "完美！", "了不起！",
        "正确！", "真不错！", "太好了！", "厉害！", "很棒！",
        "你好聪明！", "太赞了！", "做得好！", "就是这样！", "非常棒！"
    ],
    incorrect: [
        "再试试！", "不太对哦！", "加油！", "再想想！", "别放弃！",
        "快答对了！", "没关系！", "动动脑！", "下次一定行！", "差一点！",
        "再来一次！", "换一个！", "再试一次！", "别灰心！", "你能行的！",
        "没关系哦！", "再想一想！", "你可以的！", "快了快了！", "继续加油！"
    ],
    complete: [
        "挑战完成！", "你太厉害了！", "真是小天才！", "好棒好棒！", "胜利！",
        "冒险家！", "小博士！", "达人！", "冠军！", "闪亮之星！",
        "超级厉害！", "太棒棒了！", "好厉害呀！", "目标达成！", "小英雄！",
        "天才！", "完成了！", "通关啦！", "赢家！", "表现超棒！"
    ]
};

const main = async () => {
    const mapping = {}; // { "太棒了！": "feedback/abc123.mp3" }
    let total = 0;
    let skipped = 0;

    for (const [type, list] of Object.entries(phrases)) {
        console.log(`\n🎵 ${type} (${list.length} phrases):`);
        for (const text of list) {
            const hash = hashText(text);
            const filename = `${hash}.mp3`;
            const filePath = join(feedbackDir, filename);
            const audioFile = `feedback/${filename}`;

            if (existsSync(filePath)) {
                mapping[text] = audioFile;
                skipped++;
                continue;
            }

            try {
                const buf = await synthesize(text);

                // Convert WAV to MP3 via ffmpeg
                const tmpWav = filePath + '.tmp.wav';
                writeFileSync(tmpWav, buf);
                try {
                    execSync(`ffmpeg -y -i "${tmpWav}" -codec:a libmp3lame -b:a 64k -ac 1 "${filePath}" 2>/dev/null`);
                } finally {
                    try { require('fs').unlinkSync(tmpWav); } catch (_) { }
                }

                mapping[text] = audioFile;
                total++;
                console.log(`  ✅ "${text}" → ${audioFile}`);
                await sleep(1000);
            } catch (err) {
                console.error(`  ❌ "${text}": ${err.message}`);
            }
        }
    }

    writeFileSync(mappingPath, JSON.stringify(mapping, null, 2) + '\n', 'utf8');
    console.log(`\nDone! Generated: ${total}, Skipped: ${skipped}`);
    console.log(`Mapping saved to: ${mappingPath}`);
};

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
