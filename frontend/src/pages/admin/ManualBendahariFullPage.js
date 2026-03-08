/**
 * Manual Pengguna Bendahari – dokumen penuh (Markdown) dalam format mesra pengguna.
 * Memuat docs/MANUAL_BENDAHARI.md dari public, navigasi (TOC) dan merender dengan react-markdown.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, BookOpen, Loader2, List } from 'lucide-react';

const MANUAL_URL = `${process.env.PUBLIC_URL || ''}/docs/MANUAL_BENDAHARI.md`;

/**
 * Slug yang sepadan dengan anchor dalam MANUAL_BENDAHARI.md (Navigasi Manual (Kandungan)):
 * "1. Dashboard Admin" -> "1-dashboard-admin", "Formula & Logik" -> "formula--logik",
 * "Soalan Lazim (FAQ) – AR & Peringatan" -> "soalan-lazim-faq--ar--peringatan".
 */
function slugify(text) {
  let s = String(text)
    .replace(/\s*\.\s*/g, '-')
    .replace(/\s*&\s*/g, '--')
    .replace(/\s*[–—\-]\s*/g, '-')
    .replace(/\s*\(([^)]*)\)\s*/g, (_, content) => '-' + content.trim().toLowerCase().replace(/\s+/g, '-') + '-');
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

function parseToc(md) {
  if (!md) return [];
  const lines = md.split('\n');
  const toc = [];
  const re = /^(#{2,3})\s+(.+)$/;
  lines.forEach((line) => {
    const m = line.match(re);
    if (m) {
      const level = m[1].length;
      const title = m[2].trim();
      toc.push({ level, title, id: slugify(title) });
    }
  });
  // Pastikan id unik (elakkan duplicate key dan sasaran anchor berganda)
  const seen = new Set();
  toc.forEach((entry) => {
    let id = entry.id;
    let n = 1;
    while (seen.has(id)) {
      id = `${entry.id}-${++n}`;
    }
    seen.add(id);
    entry.id = id;
  });
  return toc;
}

/** Komponen artikel: reset ref setiap render dan render markdown dengan heading id mengikut TOC. */
function ArticleContent({ content, toc, tocIndexRef }) {
  tocIndexRef.current = 0;

  const getNextHeadingId = () => {
    const idx = tocIndexRef.current;
    if (idx < toc.length) {
      tocIndexRef.current += 1;
      return toc[idx].id;
    }
    return undefined;
  };

  const handleAnchorClick = (e, href) => {
    if (!href?.startsWith('#')) return;
    const id = href.slice(1);
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <article className="prose prose-slate prose-headings:font-heading prose-headings:text-slate-800 prose-headings:scroll-mt-24 prose-a:text-teal-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-800 max-w-none bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => {
            const id = getNextHeadingId();
            return id ? <h2 id={id}>{children}</h2> : <h2>{children}</h2>;
          },
          h3: ({ children }) => {
            const id = getNextHeadingId();
            return id ? <h3 id={id}>{children}</h3> : <h3>{children}</h3>;
          },
          a: ({ href, children }) => {
            if (href?.startsWith('#')) {
              return (
                <a
                  href={href}
                  onClick={(e) => handleAnchorClick(e, href)}
                  className="text-teal-600 hover:underline"
                >
                  {children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}

export default function ManualBendahariFullPage() {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const tocIndexRef = useRef(0);

  const toc = useMemo(() => parseToc(content), [content]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(MANUAL_URL)
      .then((res) => {
        if (!res.ok) throw new Error('Dokumen tidak dijumpai');
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 min-w-0 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/admin/knowledge')}
            className="inline-flex items-center gap-2 text-teal-700 hover:text-teal-900 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Pusat Pengetahuan
          </button>
          <span className="flex items-center gap-2 text-slate-600 text-sm">
            <BookOpen className="w-4 h-4 text-teal-600" />
            Manual Penuh – Bendahari
          </span>
        </div>
      </header>

      <div className="flex-1 flex max-w-6xl mx-auto w-full px-4 py-6 gap-6">
        {!loading && !error && toc.length > 0 && (
          <nav
            aria-label="Navigasi dalam dokumen"
            className="hidden lg:block w-56 shrink-0 sticky top-20 self-start rounded-xl border border-slate-200 bg-white p-4 shadow-sm max-h-[calc(100vh-7rem)] overflow-y-auto"
          >
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              <List className="w-4 h-4 text-teal-600" />
              Kandungan
            </p>
            <ul className="space-y-1 text-sm">
              {toc.map(({ level, title, id }) => (
                <li key={id} style={{ paddingLeft: level === 3 ? 12 : 0 }}>
                  <a
                    href={`#${id}`}
                    onClick={(e) => {
                      const el = document.getElementById(id);
                      if (el) {
                        e.preventDefault();
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className="block py-1 text-slate-600 hover:text-teal-600 hover:underline truncate"
                  >
                    {title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <main className="flex-1 min-w-0">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
              <p className="text-slate-600">Memuatkan dokumen…</p>
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="text-amber-800 font-medium">{error}</p>
              <p className="text-sm text-amber-700 mt-1">Fail: docs/MANUAL_BENDAHARI.md</p>
              <button
                type="button"
                onClick={() => navigate('/admin/knowledge')}
                className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
              >
                Kembali ke Pusat Pengetahuan
              </button>
            </div>
          )}
          {!loading && !error && content && (
            <ArticleContent content={content} toc={toc} tocIndexRef={tocIndexRef} />
          )}
        </main>
      </div>
    </div>
  );
}
