import { useState } from 'react';
import { motion } from 'framer-motion';
import { speakChar } from '../utils/tts';

export default function QuestionCard({ question }) {
    const pronunciation = question.pronunciation || {};
    const [activeIndex, setActiveIndex] = useState(null);

    const handleCharClick = (char, index) => {
        if (!char.trim()) return;
        const info = pronunciation[char];
        if (info?.audioFile) {
            setActiveIndex(index);
            speakChar(info.audioFile);
        }
    };

    const chars = [...question.text];

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative glass-card rounded-[2rem] md:rounded-[3rem] p-6 md:p-14 text-center max-w-3xl mx-auto mb-6 md:mb-10 overflow-hidden"
        >
            {/* Background decoration */}
            <div className="absolute top-0 left-0 w-24 h-24 md:w-32 md:h-32 bg-yellow-200/20 blur-2xl md:blur-3xl -translate-x-1/2 -translate-y-1/2 overflow-hidden pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-32 h-32 md:w-48 md:h-48 bg-indigo-200/20 blur-2xl md:blur-3xl translate-x-1/2 translate-y-1/2 overflow-hidden pointer-events-none" />

            <div className="relative z-10 flex flex-wrap justify-center items-end gap-x-1 gap-y-6 md:gap-y-10">
                {chars.map((char, index) => {
                    const isActive = activeIndex === index;
                    const hasAudio = !!pronunciation[char]?.audioFile;
                    return (
                        <motion.span
                            key={index}
                            animate={isActive ? {
                                scale: 1.4,
                                color: '#4f46e5',
                                textShadow: '0 0 20px rgba(99,102,241,0.4)',
                            } : {
                                scale: 1,
                                color: '#1f2937',
                                textShadow: '0 0 0px transparent',
                            }}
                            whileHover={!isActive ? { scale: 1.15, color: '#6366f1' } : {}}
                            whileTap={{ scale: 0.9 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleCharClick(char, index);
                            }}
                            className={`text-2xl md:text-5xl font-[800] cursor-pointer select-none leading-none relative inline-block
                                ${isActive ? 'z-20' : 'z-10'}
                                ${hasAudio ? '' : 'cursor-default'}`}
                        >
                            {char}
                            {/* Active indicator dot */}
                            {isActive && (
                                <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: [1, 1.3, 1] }}
                                    transition={{ duration: 0.8, repeat: Infinity }}
                                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-1.5 h-1.5 md:w-2 md:h-2 bg-indigo-500 rounded-full"
                                />
                            )}
                        </motion.span>
                    );
                })}
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-8 md:mt-12 flex items-center justify-center gap-2 text-indigo-400 font-bold tracking-widest text-[10px] md:text-xs uppercase relative z-10"
            >
                <span className="w-4 h-[1px] md:w-8 md:h-[2px] bg-indigo-100" />
                点一点文字听发音
                <span className="w-4 h-[1px] md:w-8 md:h-[2px] bg-indigo-100" />
            </motion.div>
        </motion.div>
    );
}
