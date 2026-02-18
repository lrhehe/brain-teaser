/**
 * TTS Utility — Edge TTS (browser) with SpeechSynthesis fallback
 *
 * Priority:
 *   1. Use edge-tts-universal browser API → high-quality Microsoft neural voices
 *   2. Fall back to browser SpeechSynthesis if Edge TTS unavailable
 *
 * Audio results are cached as blob URLs to avoid repeated synthesis.
 */
import { EdgeTTS } from 'edge-tts-universal/browser';

// ── Cache & state ─────────────────────────────────────────────────
const audioCache = new Map();
let currentAudio = null;

// Voice mapping
const VOICES = {
    'zh-CN': 'zh-CN-XiaoxiaoNeural',
    'en-US': 'en-US-AriaNeural',
};

// ── SpeechSynthesis fallback ──────────────────────────────────────
let voices = [];

const loadVoices = () => {
    voices = window.speechSynthesis?.getVoices() || [];
};

if (typeof window !== 'undefined' && window.speechSynthesis) {
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
}

const getVoice = (lang) => {
    const filteredVoices = voices.filter(v => v.lang.includes(lang.split('-')[0]));
    return filteredVoices.find(v => v.name.includes('Neural')) ||
        filteredVoices.find(v => v.name.includes('Premium')) ||
        filteredVoices.find(v => v.name.includes('Google')) ||
        filteredVoices.find(v => v.name.includes('Microsoft')) ||
        filteredVoices[0] || null;
};

const speakFallback = (text, lang) => {
    if (!window.speechSynthesis) return;
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.lang = lang;
    utterance.rate = lang === 'en-US' ? 0.95 : 1.0;
    utterance.pitch = 1.1;
    window.speechSynthesis.speak(utterance);
};

// ── Edge TTS synthesis ────────────────────────────────────────────
const synthesizeEdgeTTS = async (text, lang) => {
    const voice = VOICES[lang] || VOICES['zh-CN'];
    const tts = new EdgeTTS(text, voice);
    const result = await tts.synthesize();
    // result.audio is a Blob
    return URL.createObjectURL(result.audio);
};

// ── Main speak function ───────────────────────────────────────────
export const speak = async (text, lang = 'zh-CN') => {
    if (!text || !text.trim()) return;

    // Stop any currently playing audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
    }

    const cacheKey = `${text}|${lang}`;

    // Check cache first
    if (audioCache.has(cacheKey)) {
        const audio = new Audio(audioCache.get(cacheKey));
        currentAudio = audio;
        audio.play().catch(() => { });
        return;
    }

    // Try Edge TTS first
    try {
        const blobUrl = await synthesizeEdgeTTS(text, lang);
        audioCache.set(cacheKey, blobUrl);

        const audio = new Audio(blobUrl);
        currentAudio = audio;
        audio.play().catch(() => { });
    } catch {
        // Fallback to browser SpeechSynthesis
        speakFallback(text, lang);
    }
};
