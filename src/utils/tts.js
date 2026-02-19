/**
 * TTS Utility — uses only pre-generated audio files, no system TTS.
 *
 * - speakChar(audioFile): plays a character pronunciation audio
 * - speakFeedback(text):  plays a feedback phrase audio
 */
import feedbackAudioMap from '../data/feedback_audio.json';

const BASE = import.meta.env.BASE_URL;
let currentAudio = null;

/**
 * Play a pre-generated audio file.
 * @param {string} audioPath - path relative to audio/, e.g. "a1b2c3.mp3" or "feedback/abc.mp3"
 * @returns {HTMLAudioElement|null}
 */
const playAudio = (audioPath) => {
    if (!audioPath) return null;

    // Stop any currently playing audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }

    const audio = new Audio(`${BASE}audio/${audioPath}`);
    currentAudio = audio;
    audio.play().catch(() => { });
    return audio;
};

/**
 * Play a pre-generated character audio file.
 * @param {string} audioFile - filename like "a1b2c3d4e5f6.mp3"
 */
export const speakChar = (audioFile) => {
    return playAudio(audioFile);
};

/**
 * Play a pre-generated feedback phrase audio.
 * @param {string} text - the feedback text, e.g. "太棒了！"
 */
export const speakFeedback = (text) => {
    const audioFile = feedbackAudioMap[text];
    return playAudio(audioFile);
};
