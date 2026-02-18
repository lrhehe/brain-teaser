/**
 * TTS Utility
 *
 * - speakChar(audioFile): plays a pre-generated audio file from /audio/
 * - speak(text, lang):    uses Chrome SpeechSynthesis for English feedback phrases
 */

// ── Pre-generated audio playback ──────────────────────────────────
let currentAudio = null;

/**
 * Play a pre-generated character audio file.
 * @param {string} audioFile - filename like "a1b2c3d4e5f6.mp3"
 */
export const speakChar = (audioFile) => {
    if (!audioFile) return;

    // Stop any currently playing audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
    }

    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${audioFile}`);
    currentAudio = audio;
    audio.play().catch(() => { });
};

// ── Chrome SpeechSynthesis (for English feedback) ─────────────────
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

/**
 * Speak text using Chrome SpeechSynthesis (used for English feedback).
 */
export const speak = (text, lang = 'zh-CN') => {
    if (!text || !text.trim()) return;
    if (!window.speechSynthesis) return;

    // Stop any currently playing audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
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
