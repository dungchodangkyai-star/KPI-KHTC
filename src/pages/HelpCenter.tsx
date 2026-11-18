import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, CircleAlert,
  ExternalLink, HelpCircle, Search, ShieldCheck, Sparkles, UserRound, X
} from 'lucide-react';
import { getActiveLoggedInUser } from '../utils';
import {
  HELP_ARTICLES, HELP_CATEGORIES, HELP_ROUTE_MAP, HelpArticle, HelpRole, normalizeHelpText
} from '../helpContent';

const roleLabel: Record<HelpRole, string> = {
  STAFF: 'Nhân viên',
  LEADER: 'Lãnh đạo',
  ADMIN: 'Quản trị viên'
};

function resolveRole(user: any): HelpRole {
  if (user?.role === 'ADMIN') return 'ADMIN';
  if (user?.role === 'LEADER') return 'LEADER';
  return 'STAFF';
}

function articleSearchText(article: HelpArticle) {
  return normalizeHelpText([
    article.title,
    article.summary,
    article.category,
    ...article.keywords,
    ...article.sections.flatMap(section => [
      section.title,
      ...(section.paragraphs || []),
      ...(section.steps || []),
      ...(section.bullets || [])
    ]),
    ...(article.notes || [])
  ].join(' '));
}

function ArticleBody({ article, onBack }: { article: HelpArticle; onBack: () => void }) {
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-br from-[#eef6fc] to-white px-4 py-5 sm:px-7 sm:py-7">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-[#1F4E78] hover:text-[#1F4E78] lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" /> Danh sách hướng dẫn
        </button>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#1F4E78]">
            {article.category}
          </span>
          {article.roles.map(role => (
            <span key={role} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">
              {roleLabel[role]}
            </span>
          ))}
        </div>
        <h2 className="text-2xl font-black leading-tight text-[#102a43] sm:text-3xl">{article.title}</h2>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">{article.summary}</p>
        {article.route && (
          <Link
            to={article.route}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1F4E78] px-4 text-xs font-black text-white shadow-sm transition hover:bg-[#173a5a]"
          >
            Mở chức năng liên quan <ExternalLink className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="space-y-7 px-4 py-6 sm:px-7 sm:py-8">
        {article.image && (
          <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-[#f4f7fa] p-2 sm:p-3">
            <img src={article.image} alt={article.imageAlt || article.title} className="h-auto w-full rounded-xl object-contain" />
            {article.imageAlt && <figcaption className="px-2 pb-1 pt-3 text-center text-xs font-medium text-slate-500">{article.imageAlt}</figcaption>}
          </figure>
        )}

        {article.sections.map((section, sectionIndex) => (
          <section key={`${article.id}-${sectionIndex}`} className="scroll-mt-24">
            <h3 className="flex items-start gap-2 text-lg font-black text-[#153c5c]">
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] text-[#1F4E78]">
                {sectionIndex + 1}
              </span>
              {section.title}
            </h3>
            {section.paragraphs?.map((paragraph, index) => (
              <p key={index} className="mt-3 text-sm font-medium leading-7 text-slate-700">{paragraph}</p>
            ))}
            {section.steps && (
              <ol className="mt-4 space-y-3">
                {section.steps.map((step, index) => (
                  <li key={index} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm font-medium leading-6 text-slate-700">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1F4E78] text-xs font-black text-white">{index + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            )}
            {section.bullets && (
              <ul className="mt-4 space-y-2.5">
                {section.bullets.map((bullet, index) => (
                  <li key={index} className="flex gap-2.5 text-sm font-medium leading-6 text-slate-700">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {article.notes && article.notes.length > 0 && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-amber-900">
              <CircleAlert className="h-5 w-5" /> Lưu ý quan trọng
            </h3>
            <ul className="mt-3 space-y-2">
              {article.notes.map((note, index) => (
                <li key={index} className="text-sm font-semibold leading-6 text-amber-950">• {note}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-medium text-slate-500">Nội dung hướng dẫn phiên bản 1.0 • Cập nhật 18/11/2026</div>
          <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:border-[#1F4E78] hover:text-[#1F4E78]">
            <ArrowLeft className="h-4 w-4" /> Xem chủ đề khác
          </button>
        </div>
      </div>
    </article>
  );
}

export default function HelpCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = getActiveLoggedInUser();
  const currentRole = resolveRole(currentUser);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const selectedId = searchParams.get('article');

  const allowedArticles = useMemo(
    () => HELP_ARTICLES.filter(article => article.roles.includes(currentRole)),
    [currentRole]
  );

  const filteredArticles = useMemo(() => {
    const normalizedQuery = normalizeHelpText(query);
    return allowedArticles.filter(article => {
      const matchesCategory = category === 'Tất cả' || article.category === category;
      const matchesQuery = !normalizedQuery || articleSearchText(article).includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [allowedArticles, category, query]);

  const selectedArticle = allowedArticles.find(article => article.id === selectedId) || null;
  const routeArticleId = HELP_ROUTE_MAP[searchParams.get('from') || ''];
  const contextualArticle = routeArticleId ? allowedArticles.find(article => article.id === routeArticleId) : null;

  const openArticle = (article: HelpArticle) => {
    setSearchParams({ article: article.id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeArticle = () => {
    setSearchParams({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-5 pb-10">
      <section className="overflow-hidden rounded-2xl border border-[#b8d2e6] bg-gradient-to-br from-[#1F4E78] via-[#245b88] to-[#153c5c] p-5 text-white shadow-md sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider">
              <BookOpen className="h-4 w-4" /> Trung tâm trợ giúp
            </div>
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">Hướng dẫn sử dụng web app KPI</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-blue-50">
              Tìm đúng thao tác theo chức năng và vai trò. Nội dung được lưu cùng phiên bản ứng dụng nên có thể đọc ngay mà không cần mở tài liệu bên ngoài.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <div className="text-2xl font-black">{allowedArticles.length}</div>
              <div className="text-[11px] font-bold text-blue-100">Chủ đề phù hợp</div>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <div className="text-sm font-black">{roleLabel[currentRole]}</div>
              <div className="mt-1 text-[11px] font-bold text-blue-100">Vai trò hiện tại</div>
            </div>
            <div className="col-span-2 rounded-xl border border-white/20 bg-white/10 p-3 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-sm font-black"><ShieldCheck className="h-4 w-4" /> Nội bộ</div>
              <div className="mt-1 text-[11px] font-bold text-blue-100">Theo đúng quyền</div>
            </div>
          </div>
        </div>
      </section>

      {contextualArticle && !selectedArticle && (
        <button
          type="button"
          onClick={() => openArticle(contextualArticle)}
          className="flex w-full items-center justify-between gap-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-100"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><Sparkles className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-wide text-emerald-800">Hướng dẫn đúng màn hình vừa mở</span>
              <span className="block truncate text-sm font-bold text-emerald-950">{contextualArticle.title}</span>
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-emerald-700" />
        </button>
      )}

      {!selectedArticle && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Tìm: duyệt việc, điểm B, khôi phục dữ liệu, thông báo..."
              className="min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 pl-12 pr-12 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-[#1F4E78] focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200" title="Xóa nội dung tìm kiếm">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {['Tất cả', ...HELP_CATEGORIES].map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`min-h-9 shrink-0 rounded-full border px-3 text-[11px] font-black transition ${category === item ? 'border-[#1F4E78] bg-[#1F4E78] text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-[#1F4E78] hover:text-[#1F4E78]'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedArticle ? (
        <ArticleBody article={selectedArticle} onBack={closeArticle} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="hidden self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-0 lg:block">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-[#153c5c]"><HelpCircle className="h-5 w-5" /> Chọn nhanh theo nhóm</div>
            <div className="space-y-1">
              {['Tất cả', ...HELP_CATEGORIES].map(item => {
                const count = item === 'Tất cả' ? allowedArticles.length : allowedArticles.filter(article => article.category === item).length;
                if (count === 0) return null;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${category === item ? 'bg-blue-50 text-[#1F4E78]' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <span>{item}</span><span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-2 text-xs font-black text-[#1F4E78]"><UserRound className="h-4 w-4" /> {roleLabel[currentRole]}</div>
              <p className="mt-1.5 text-[11px] font-medium leading-5 text-slate-600">Danh sách đã được lọc theo quyền tài khoản hiện tại.</p>
            </div>
          </aside>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#102a43]">{query ? `Kết quả tìm kiếm (${filteredArticles.length})` : category}</h2>
                <p className="text-xs font-medium text-slate-500">Chọn một chủ đề để xem hướng dẫn từng bước.</p>
              </div>
            </div>
            {filteredArticles.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredArticles.map(article => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => openArticle(article)}
                    className="group flex min-h-44 flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#75a9d1] hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-[#1F4E78]">{article.category}</span>
                      <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#1F4E78]" />
                    </div>
                    <h3 className="mt-3 text-base font-black leading-5 text-[#102a43] group-hover:text-[#1F4E78]">{article.title}</h3>
                    <p className="mt-2 line-clamp-3 text-xs font-medium leading-5 text-slate-600">{article.summary}</p>
                    <div className="mt-auto pt-3 text-[10px] font-bold text-slate-400">{article.sections.length} nội dung hướng dẫn</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
                <Search className="mx-auto h-9 w-9 text-slate-300" />
                <div className="mt-3 text-sm font-black text-slate-700">Chưa tìm thấy hướng dẫn phù hợp</div>
                <p className="mt-1 text-xs font-medium text-slate-500">Thử từ khóa ngắn hơn hoặc chọn Tất cả.</p>
                <button type="button" onClick={() => { setQuery(''); setCategory('Tất cả'); }} className="mt-4 rounded-xl bg-[#1F4E78] px-4 py-2 text-xs font-bold text-white">Xóa bộ lọc</button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

