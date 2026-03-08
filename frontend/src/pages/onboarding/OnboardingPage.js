import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ONBOARDING_STORAGE_KEY = 'smart360_onboardingCompleted';

const baseUrl = process.env.PUBLIC_URL || '';

function resolveImageUrl(imageUrl) {
  if (!imageUrl || !imageUrl.trim()) return '';
  const u = imageUrl.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return baseUrl + (u.startsWith('/') ? u : `/${u}`);
}

const defaultImages = [
  `${baseUrl}/images/onboarding/onboarding-1-welcome.png`,
  `${baseUrl}/images/onboarding/onboarding-2-yuran-bas.png`,
  `${baseUrl}/images/onboarding/onboarding-3-keluarga.png`,
  `${baseUrl}/images/onboarding/onboarding-4-mula.png`,
];

const defaultSlides = [
  { id: 0, title: 'Selamat datang ke Smart 360 AI Edition', subtitle: 'Satu platform pengurusan Maktab yang pintar dan bersepadu.', image: defaultImages[0] },
  { id: 1, title: 'Yuran, Bas & Asrama', subtitle: 'Urus yuran, tiket bas dan asrama dalam satu tempat. Lebih mudah, lebih pantas.', image: defaultImages[1] },
  { id: 2, title: 'Ibu Bapa & Pelajar', subtitle: 'Pantau anak, bayar yuran, tempah bas dengan mudah dari telefon anda.', image: defaultImages[2] },
  { id: 3, title: 'Mulakan pengalaman anda', subtitle: 'Log masuk atau daftar untuk akses penuh ke Smart 360 AI Edition.', image: defaultImages[3] },
];

function buildSlidesFromConfig(config) {
  if (!config?.slides?.length) return defaultSlides;
  return config.slides
    .slice(0, 20)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s, i) => ({
      id: i,
      title: s.title || '',
      subtitle: s.subtitle || '',
      image: resolveImageUrl(s.image_url) || defaultImages[i] || defaultImages[0],
    }));
}

function completeOnboarding() {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
  } catch (e) {
    console.warn('Onboarding completion not saved', e);
  }
}

export function getOnboardingCompleted() {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function OnboardingPage({ config, onComplete }) {
  const slides = React.useMemo(() => buildSlidesFromConfig(config), [config]);
  const totalSlides = Math.max(1, slides.length);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const slide = slides[Math.min(index, slides.length - 1)] || slides[0];
  const isLast = index === totalSlides - 1;

  const finish = useCallback(() => {
    completeOnboarding();
    if (typeof onComplete === 'function') onComplete();
  }, [onComplete]);

  const goNext = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    setDirection(1);
    setIndex((i) => Math.min(i + 1, totalSlides - 1));
  }, [isLast, finish, totalSlides]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  /** Kembali ke slaid pertama dan main semula animasi dari awal */
  const replayFromStart = useCallback(() => {
    setDirection(1);
    setIndex(0);
  }, []);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const progress = totalSlides > 0 ? ((index + 1) / totalSlides) * 100 : 0;

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 min-h-screen min-h-[100dvh] flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Glow orbs - background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-[80%] h-[80%] rounded-full bg-indigo-500/20 blur-[100px]" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[60%] h-[60%] rounded-full bg-purple-500/20 blur-[80px]" />
      </div>

      {/* Animated progress bar - top (gantikan dot indicator) */}
      <div className="absolute left-0 right-0 h-1 bg-white/10 z-20" style={{ top: 'env(safe-area-inset-top)' }}>
        <motion.div
          className="h-full bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 rounded-r-full shadow-[0_0_20px_rgba(99,102,241,0.6)]"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ willChange: 'width' }}
        />
      </div>

      {/* Skip - top right */}
      <div className="absolute right-4 z-20" style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}>
        <motion.button
          type="button"
          onClick={skip}
          className="text-sm font-medium text-white/80 hover:text-white px-4 py-2 rounded-full hover:bg-white/10 transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
        >
          Skip
        </motion.button>
      </div>

      {/* Slide content - fullscreen mobile-first */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-8">
        <motion.div
          className="w-full max-w-sm flex flex-col items-center"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.x > 50) goNext();
            if (info.offset.x < -50) goPrev();
          }}
          style={{ touchAction: 'pan-x' }}
        >
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={index}
              custom={direction}
              initial={{ opacity: 0, x: direction >= 0 ? 80 : -80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction >= 0 ? -80 : 80 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }}
              className="w-full flex flex-col items-center text-center"
            >
              {/* Glassmorphism card - cartoon style */}
              <motion.div
                className="w-full bg-white/10 backdrop-blur-lg rounded-3xl border border-white/10 overflow-hidden mb-8 shadow-[0_8px_32px_rgba(0,0,0,0.2),0_0_60px_-20px_rgba(99,102,241,0.25)]"
                initial={{ y: 20, opacity: 0.9 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 28 }}
              >
                {/* Ilustrasi kartun AI - floating subtle animation, style cartoon */}
                <motion.div
                  className="relative w-full aspect-[4/3] max-h-[200px] sm:max-h-[260px] rounded-t-3xl overflow-hidden bg-gradient-to-b from-white/10 to-white/5 border-b border-white/10"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ boxShadow: 'inset 0 2px 20px rgba(255,255,255,0.05)' }}
                >
                  <img
                    src={slide.image}
                    alt=""
                    className="w-full h-full object-contain object-center p-3"
                    loading="lazy"
                    decoding="async"
                  />
                </motion.div>
                <div className="p-6 pt-4">
                  <h1 className="text-xl sm:text-2xl font-bold text-white font-heading tracking-tight mb-3">
                    {slide.title}
                  </h1>
                  <p className="text-sm sm:text-base text-white/70 leading-relaxed">
                    {slide.subtitle}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Neon gradient button (blue → purple) */}
        <motion.button
          type="button"
          onClick={goNext}
          className="mt-auto w-full max-w-sm py-4 px-6 rounded-2xl font-semibold text-white text-center bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_40px_rgba(99,102,241,0.5)] border border-white/10"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          {isLast ? 'Mulakan Sekarang' : 'Seterusnya'}
        </motion.button>

        {!isLast && (
          <p className="text-xs text-white/40 mt-4">Swipe ke kanan untuk slide seterusnya</p>
        )}

        {/* Tonton semula - hanya tunjuk bila bukan slaid pertama */}
        {index > 0 && (
          <motion.button
            type="button"
            onClick={replayFromStart}
            className="mt-4 text-xs font-medium text-white/60 hover:text-white/90 transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            aria-label="Tonton animasi dari awal"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Tonton semula dari awal
          </motion.button>
        )}
      </div>
    </div>
  );
}

export { completeOnboarding, ONBOARDING_STORAGE_KEY };
