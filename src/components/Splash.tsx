import { useEffect } from "react";
import { motion } from "motion/react";
import logoImg from "../assets/images/logo.jpg";

interface SplashProps {
  onComplete: () => void;
}

export default function Splash({ onComplete }: SplashProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2200);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      style={{ background: "linear-gradient(135deg, #A3C69D 0%, #4C6B4C 100%)" }}
      className="absolute inset-0 z-50 flex flex-col justify-center items-center text-white"
    >
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 1.1, 1], opacity: 1 }}
        transition={{ duration: 1.5, cubicBezier: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center"
      >
        <div className="bg-white/10 p-4 rounded-full backdrop-blur-md mb-6 border border-white/20 shadow-2xl overflow-hidden w-36 h-36 flex items-center justify-center">
          <img
            src={logoImg}
            alt="Logo do Projeto"
            className="w-full h-full object-cover rounded-full"
            referrerPolicy="no-referrer"
          />
        </div>
      </motion.div>

      <div className="absolute bottom-12 flex flex-col items-center gap-2">
        <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
        <p className="text-xs text-white/60 font-mono tracking-widest uppercase">Carregando</p>
      </div>
    </motion.div>
  );
}
