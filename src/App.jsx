import { useState, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, RotateCcw, Award, Sparkles, Volume2, Send } from 'lucide-react';
import QuestionCard from './components/QuestionCard';
import AnswerButton from './components/AnswerButton';
import ProgressBar from './components/ProgressBar';
import { questions, feedbackPhrases } from './data/questions';
import { speak } from './utils/tts';

const GAME_SIZE = 5;

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Use local public asset
const mascotImg = '/mascot.png';

function App() {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isAnswered, setIsAnswered] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [gameKey, setGameKey] = useState(0); // triggers re-shuffle

  // Pick GAME_SIZE random questions each game
  const gameQuestions = useMemo(
    () => shuffleArray(questions).slice(0, GAME_SIZE),
    [gameKey]
  );

  const currentQuestion = gameQuestions[currentQuestionIndex];

  const getRandomPhrase = (type) => {
    const phrases = feedbackPhrases[type];
    return phrases[Math.floor(Math.random() * phrases.length)];
  };

  const handleSelect = (option) => {
    if (isAnswered) return;
    setSelectedOption(option);
  };

  const handleSubmit = () => {
    if (!selectedOption || isAnswered) return;
    setIsAnswered(true);

    if (selectedOption.isCorrect) {
      setScore(score + 1);
      setFeedback('correct');
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#818cf8', '#c084fc', '#fb7185', '#fbbf24']
      });
      speak(getRandomPhrase('correct'), 'en-US');
    } else {
      setFeedback('incorrect');
      speak(getRandomPhrase('incorrect'), 'en-US');
    }

    setTimeout(() => {
      if (currentQuestionIndex < gameQuestions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setIsAnswered(false);
        setFeedback(null);
        setSelectedOption(null);
      } else {
        setShowResult(true);
        speak(getRandomPhrase('complete'), 'en-US');
      }
    }, 2500);
  };

  const repeatQuestion = () => {
    speak(currentQuestion.text, 'zh-CN');
  };

  const restartGame = () => {
    setCurrentQuestionIndex(0);
    setScore(0);
    setShowResult(false);
    setIsAnswered(false);
    setFeedback(null);
    setSelectedOption(null);
    setGameKey(k => k + 1); // re-shuffle questions
  };

  // Graded result feedback based on score ratio
  const getResultFeedback = () => {
    const total = gameQuestions.length;
    const ratio = score / total;
    if (ratio === 1) return { title: '🏆 满分通关！', msg: '太厉害了，全部答对！你是真正的智慧之星！', color: 'from-yellow-400 to-amber-500' };
    if (ratio >= 0.8) return { title: '🌟 非常棒！', msg: `答对了 ${score} 道题，离满分就差一点点了！`, color: 'from-indigo-500 to-purple-600' };
    if (ratio >= 0.6) return { title: '👏 表现不错！', msg: `答对了 ${score} 道题，继续加油哦！`, color: 'from-blue-500 to-cyan-500' };
    return { title: '💪 继续努力！', msg: `答对了 ${score} 道题，多练习就会越来越棒！`, color: 'from-pink-500 to-rose-500' };
  };

  if (showResult) {
    const result = getResultFeedback();
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f8fafc]">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-card rounded-[2.5rem] md:rounded-[3.5rem] p-8 md:p-16 text-center max-w-xl w-full relative overflow-hidden"
        >
          <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${result.color}`} />

          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-32 h-32 md:w-40 md:h-40 mx-auto mb-6 md:mb-8 relative"
          >
            <img src={mascotImg} alt="Mascot" className="w-full h-full object-contain" />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute -top-1 -right-1 bg-yellow-400 p-2 rounded-full shadow-lg"
            >
              <Award className="text-white w-6 h-6 md:w-8 md:h-8" />
            </motion.div>
          </motion.div>

          <h1 className="text-4xl md:text-5xl font-black text-gray-800 mb-4">{result.title}</h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-4 md:mb-6 leading-relaxed">
            {result.msg}
          </p>
          <p className="text-gray-500 mb-8 md:mb-10">
            <span className="text-5xl md:text-6xl font-black text-indigo-600 inline-flex items-center gap-2 my-2 md:my-4">
              <Star className="fill-yellow-400 text-yellow-400 w-10 h-10 md:w-12 md:h-12" />
              {score} / {gameQuestions.length}
            </span>
          </p>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={restartGame}
            className={`w-full bg-gradient-to-r ${result.color} text-white text-xl md:text-2xl font-bold py-5 md:py-6 px-8 rounded-[1.5rem] md:rounded-[2rem] shadow-xl flex items-center justify-center gap-3`}
          >
            <RotateCcw className="w-6 h-6 md:w-8 md:h-8" />
            再来一局
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden p-4 md:p-10 pb-32 md:pb-10">
      {/* Background Orbs */}
      <div className="fixed -top-10 -left-10 w-64 h-64 md:w-96 md:h-96 bg-indigo-100 rounded-full blur-[80px] md:blur-[100px] opacity-60 pointer-events-none" />
      <div className="fixed -bottom-10 -right-10 w-64 h-64 md:w-96 md:h-96 bg-yellow-100 rounded-full blur-[80px] md:blur-[100px] opacity-60 pointer-events-none" />

      <header className="relative z-10 flex justify-between items-center max-w-5xl mx-auto mb-8 md:mb-12">
        <div className="flex items-center gap-4 md:gap-6 group">
          <div className="relative">
            <motion.div
              animate={{
                y: [0, -5, 0],
                rotate: [0, 3, -3, 0]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="w-16 h-16 md:w-24 md:h-24 glass rounded-2xl md:rounded-3xl flex items-center justify-center overflow-hidden border-2 border-white/80 shadow-xl"
            >
              <img src={mascotImg} alt="Mascot" className="w-12 h-12 md:w-20 md:h-20 object-contain" />
            </motion.div>

            {/* Repeat Question Button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={repeatQuestion}
              className="absolute -bottom-2 -right-2 bg-indigo-500 text-white p-2 rounded-full shadow-lg border-2 border-white"
            >
              <Volume2 className="w-4 h-4 md:w-6 md:h-6" />
            </motion.button>
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-gray-800 tracking-tighter">智慧对对碰</h1>
            <p className="text-indigo-400 font-bold text-[10px] md:text-sm tracking-widest uppercase">Brain Teaser Adventure</p>
          </div>
        </div>

        <motion.div
          whileHover={{ scale: 1.05 }}
          className="glass px-5 py-2 md:px-8 md:py-4 rounded-full md:rounded-[2rem] shadow-lg flex items-center gap-2 md:gap-4 border-2 border-white/50"
        >
          <Star className="fill-yellow-400 text-yellow-400 w-5 h-5 md:w-8 md:h-8" />
          <span className="text-xl md:text-3xl font-black text-gray-800">{score}</span>
        </motion.div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto">
        <ProgressBar current={currentQuestionIndex + 1} total={gameQuestions.length} />

        <AnimatePresence mode='wait'>
          <motion.div
            key={currentQuestionIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 120 }}
          >
            <QuestionCard question={currentQuestion} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8 mt-8 md:mt-12">
              {currentQuestion.options.map((option) => (
                <AnswerButton
                  key={option.id}
                  answer={option}
                  pronunciation={currentQuestion.pronunciation}
                  onClick={() => handleSelect(option)}
                  isSelected={selectedOption?.id === option.id}
                  disabled={isAnswered}
                />
              ))}
            </div>

            {/* Submit Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 md:mt-12 flex justify-center"
            >
              <motion.button
                whileHover={selectedOption && !isAnswered ? { scale: 1.05 } : {}}
                whileTap={selectedOption && !isAnswered ? { scale: 0.95 } : {}}
                onClick={handleSubmit}
                disabled={!selectedOption || isAnswered}
                className={`
                  flex items-center justify-center gap-3 
                  text-xl md:text-2xl font-black py-4 md:py-5 px-10 md:px-16 
                  rounded-full md:rounded-[2rem] shadow-xl transition-all duration-300
                  ${selectedOption && !isAnswered
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white cursor-pointer hover:shadow-2xl hover:shadow-indigo-300/40'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
                `}
              >
                <Send className="w-5 h-5 md:w-7 md:h-7" />
                提交答案
              </motion.button>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={`
                fixed bottom-6 md:bottom-10 left-1/2 transform -translate-x-1/2 
                px-8 py-4 md:px-12 md:py-6 rounded-full md:rounded-[3rem] 
                text-xl md:text-3xl font-black shadow-2xl flex items-center gap-3 md:gap-4 z-50
                ${feedback === 'correct' ? 'bg-indigo-500 text-white' : 'bg-rose-400 text-white'}
              `}
            >
              {feedback === 'correct' ? (
                <>Good Job! <Sparkles className="w-6 h-6 md:w-8 md:h-8" /></>
              ) : (
                'Try Again! 🐣'
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;
