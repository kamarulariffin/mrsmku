/**
 * Smart 360 AI Edition - Splash screen (semasa app loading)
 * Papar logo ikon rasmi; tajuk, tagline dan gambar optional boleh diubah oleh Superadmin/Admin (Tetapan → PWA → Splash Screen).
 * config: { title, tagline, imageUrl, iconUrl } dari API /api/public/settings/pwa (atau cache).
 * Bila tiada imageUrl, ikon rasmi (iconUrl) dipaparkan sebagai logo.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';

const DEFAULT_TITLE = 'Smart 360 AI Edition';
const DEFAULT_TAGLINE = 'Sistem Pengurusan Maktab Bersepadu';
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&q=80';
const defaultImage = typeof process !== 'undefined' && process.env?.PUBLIC_URL
  ? `${process.env.PUBLIC_URL}/images/splash-hero.webp`
  : '/images/splash-hero.webp';
const defaultIcon = typeof process !== 'undefined' && process.env?.PUBLIC_URL
  ? `${process.env.PUBLIC_URL}/icons/icon-512x512.png`
  : '/icons/icon-512x512.png';

function resolveImageUrl(imageUrl, base) {
  if (!imageUrl || !imageUrl.trim()) return null;
  const u = imageUrl.trim();
  return u.startsWith('http') ? u : (base || (typeof window !== 'undefined' ? window.location.origin : '')) + (u.startsWith('/') ? '' : '/') + u;
}

export function SplashScreen({ config }) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const title = (config?.title && config.title.trim()) ? config.title.trim() : DEFAULT_TITLE;
  const tagline = (config?.tagline && config.tagline.trim()) ? config.tagline.trim() : DEFAULT_TAGLINE;
  const customImageUrl = (config?.imageUrl && config.imageUrl.trim()) ? config.imageUrl.trim() : null;
  const officialIconUrl = (config?.iconUrl && config.iconUrl.trim()) ? config.iconUrl.trim() : defaultIcon;
  const showOfficialLogoOnly = !customImageUrl;
  const resolvedImage = useMemo(() => showOfficialLogoOnly ? null : resolveImageUrl(customImageUrl, base), [customImageUrl, showOfficialLogoOnly]);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [src, setSrc] = useState(() => (resolvedImage || officialIconUrl));

  useEffect(() => {
    setSrc(showOfficialLogoOnly ? officialIconUrl : (resolvedImage || officialIconUrl));
    setImgError(false);
    setImgLoaded(false);
  }, [resolvedImage, officialIconUrl, showOfficialLogoOnly]);

  const handleError = () => {
    if (showOfficialLogoOnly || src === officialIconUrl) {
      setImgError(true);
      return;
    }
    if (src !== FALLBACK_IMAGE) setSrc(FALLBACK_IMAGE);
    else setImgError(true);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[10000] flex flex-col bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 min-h-screen min-h-[100dvh] overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Glow orbs - background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-[80%] h-[80%] rounded-full bg-indigo-500/20 blur-[100px]" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[60%] h-[60%] rounded-full bg-purple-500/20 blur-[80px]" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Logo ikon rasmi (default) atau gambar hero jika admin set custom splash image */}
        <motion.div
          className={`mb-8 flex items-center justify-center ${showOfficialLogoOnly ? 'w-32 h-32 sm:w-40 sm:h-40 rounded-3xl overflow-hidden border border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4),0_0_40px_-20px_rgba(99,102,241,0.3)] bg-white/5' : 'w-full max-w-[280px] sm:max-w-[320px] aspect-[4/3] rounded-3xl overflow-hidden border border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4),0_0_40px_-20px_rgba(99,102,241,0.3)]'}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {!imgError ? (
            <>
              <img
                src={src}
                alt="Logo rasmi Smart 360 AI Edition"
                className={showOfficialLogoOnly ? 'w-full h-full object-contain p-2' : 'w-full h-full object-cover'}
                onLoad={() => setImgLoaded(true)}
                onError={handleError}
              />
              {!imgLoaded && (
                <div className="absolute inset-0 bg-white/5 animate-pulse" />
              )}
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center min-h-[120px]">
              <svg className="w-16 h-16 sm:w-20 sm:h-20 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
          )}
        </motion.div>

        {/* Tajuk & tagline */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-white font-heading tracking-tight">
            {title}
          </h1>
          <p className="text-white/70 text-sm sm:text-base mt-1.5">
            {tagline}
          </p>
        </motion.div>

        {/* Loading bar */}
        <motion.div
          className="mt-10 w-full max-w-[200px] h-1 rounded-full bg-white/10 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]"
            initial={{ width: '0%' }}
            animate={{ width: ['0%', '70%', '100%'] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.3 }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
