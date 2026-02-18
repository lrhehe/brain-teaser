import { motion } from 'framer-motion';

export default function ProgressBar({ current, total }) {
    const progress = (current / total) * 100;

    return (
        <div className="w-full max-w-2xl mx-auto mb-6 md:mb-10">
            <div className="flex justify-between items-end mb-2 md:mb-3">
                <div className="flex flex-col">
                    <span className="text-indigo-500 font-bold text-[10px] md:text-xs uppercase tracking-widest">Progress</span>
                    <span className="text-lg md:text-2xl font-black text-gray-800">冒险进行中...</span>
                </div>
                <div className="bg-indigo-50 px-3 py-0.5 md:px-4 md:py-1 rounded-full border border-indigo-100">
                    <span className="text-sm md:text-lg font-bold text-indigo-600">{current} <span className="text-indigo-300 text-xs md:text-sm">/ {total}</span></span>
                </div>
            </div>
            <div className="relative h-3 md:h-5 bg-white/50 backdrop-blur-sm rounded-full overflow-hidden border border-white shadow-inner">
                <motion.div
                    className="h-full bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: "spring", stiffness: 50, damping: 15 }}
                >
                    <motion.div
                        animate={{ x: ['-100%', '200%'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full"
                    />
                </motion.div>
            </div>
        </div>
    );
}
