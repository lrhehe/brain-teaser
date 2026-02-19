import { motion } from 'framer-motion';
import { speakChar } from '../utils/tts';

export default function AnswerButton({ answer, pronunciation, onClick, isSelected, disabled }) {
    const handleCharClick = (e, char) => {
        e.stopPropagation();
        if (!char.trim()) return;
        const info = pronunciation?.[char];
        if (info?.audioFile) {
            speakChar(info.audioFile);
        }
        // Also select this option
        onClick(answer);
    };


    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -3 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onClick(answer)}
            className={`
        relative group overflow-hidden cursor-pointer
        rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-6
        transition-all duration-300
        border-b-4 md:border-b-8 active:border-b-0
        flex flex-col items-center justify-center gap-2 w-full min-h-[80px] md:min-h-[120px]
        ${isSelected
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600 border-indigo-700 shadow-2xl shadow-indigo-300/60 scale-[1.03]'
                    : 'glass-card border-blue-100 hover:border-indigo-200'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
        >
            <div className={`absolute inset-0 transition-opacity ${isSelected ? 'bg-gradient-to-br from-white/10 to-transparent opacity-100' : 'bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100'}`} />

            <div className="flex flex-wrap justify-center items-end gap-x-1 gap-y-2 relative z-10">
                {[...answer.text].map((char, index) => (
                    <span
                        key={index}
                        onClick={(e) => handleCharClick(e, char)}
                        className={`text-2xl md:text-4xl font-bold leading-none cursor-pointer active:scale-90 transition-all
                            ${isSelected
                                ? 'text-white hover:text-yellow-200'
                                : 'text-gray-800 hover:text-indigo-500'}`}
                    >
                        {char}
                    </span>
                ))}
            </div>

            {/* Decorative dots */}
            <div className={`absolute top-3 right-3 md:top-4 md:right-4 w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${isSelected ? 'bg-white/40' : 'bg-indigo-200'}`} />
        </motion.div>
    );
}
