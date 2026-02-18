/**
 * TTS Utility — Chrome SpeechSynthesis API
 *
 * Uses the browser-native Web Speech API (speechSynthesis) for text-to-speech.
 * Prefers high-quality voices (Neural / Premium / Google) when available.
 */

// ── Voice loading ─────────────────────────────────────────────────
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
    const langPrefix = lang.split('-')[0];
    const filteredVoices = voices.filter(v => v.lang.includes(langPrefix));
    return filteredVoices.find(v => v.name.includes('Neural')) ||
        filteredVoices.find(v => v.name.includes('Premium')) ||
        filteredVoices.find(v => v.name.includes('Google')) ||
        filteredVoices.find(v => v.name.includes('Microsoft')) ||
        filteredVoices[0] || null;
};

// ── Main speak function ───────────────────────────────────────────
export const speak = (text, lang = 'zh-CN') => {
    if (!text || !text.trim()) return;
    if (!window.speechSynthesis) return;

    // Stop any currently playing speech
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
