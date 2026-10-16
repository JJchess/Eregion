import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider, useLocale, useTranslations } from 'use-intl';
import { ArrowLeft, ArrowUpRight, Boxes, Check, ChartColumn, Moon, Search, Sun, X } from 'lucide-react';
import '@fontsource-variable/geist';
import en from './en.json';
import zh from './zh.json';
import type { Locale, SkillSummary, SkillType } from './contract';
import { displayName, displayDescription } from './contract';
import { categories, defaultInstalled, makeTree, skills } from './data';
import { browserStorage, defaultAgent, normalizeNickname, readAgent, writeAgent, type AgentProfile } from './agent';
import { AgentEditor, AvatarThumb, Insights, type HistoryRange } from './views';
import { catalogCategories, colorFor, layoutLevel, percent, shortNumber, summarize } from './model';
import { usePanelPresence } from './use-panel-presence';
import { ThemeProvider, useNightMode } from './theme';
import './skill-market.css';
import './market-shell.css';
import './demo.css';

// This import is never requested by the mobile list presentation.
const Universe = lazy(() => import('./universe'));
const byId = new Map(skills.map(skill => [skill.skill_id, skill]));
type Nav = { category: string | null; selected: string | null; kind: SkillType; scope: 'all' | 'installed'; view: 'overview' | 'insights'; query: string };
type Panel = { kind: 'skill'; skillId: string } | { kind: 'agent'; draft: AgentProfile; error: string };

function readNavigation(): Nav {
  const params = new URLSearchParams(location.search);
  return {
    category: categories.some(category => category.id === params.get('category')) ? params.get('category') : null,
    selected: byId.has(params.get('skill') || '') ? params.get('skill') : null,
    kind: params.get('type') === 'role' ? 'role' : 'task',
    scope: params.get('scope') === 'installed' ? 'installed' : 'all',
    view: params.get('view') === 'insights' ? 'insights' : 'overview',
    query: params.get('q') || '',
  };
}
function persistNavigation(nav: Nav, replace: boolean) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ category: nav.category, skill: nav.selected, type: nav.kind === 'role' ? 'role' : null, scope: nav.scope === 'installed' ? 'installed' : null, view: nav.view === 'insights' ? 'insights' : null, q: nav.query || null })) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
}
function useDesktop() {
  const [desktop, setDesktop] = useState(() => matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const query = matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(query.matches);
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  return desktop;
}
function readInstalled() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('portfolio-galaxy-installed') || 'null');
    if (Array.isArray(value)) return new Set(value.filter((id): id is string => typeof id === 'string' && byId.has(id)));
  } catch { /* A denied or invalid store falls back to the sample selection. */ }
  return new Set(defaultInstalled);
}

function Market({ onLocale }: { onLocale: () => void }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('Starport.v2');
  const d = useTranslations('Demo');
  const { mode, toggleMode } = useNightMode();
  const desktop = useDesktop();
  const [nav, setNav] = useState(readNavigation);
  const navRef = useRef(nav); navRef.current = nav;
  const [installed, setInstalled] = useState(readInstalled);
  const [agent, setAgent] = useState(() => readAgent(browserStorage(), 'demo'));
  const [draft, setDraft] = useState<AgentProfile | null>(null);
  const [draftError, setDraftError] = useState('');
  const [recenter, setRecenter] = useState(0);
  const [range, setRange] = useState<HistoryRange>('quarter');
  const [chartPick, setChartPick] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const sidebarRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const skillOpener = useRef<HTMLElement | null>(null);
  const agentOpener = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<'panel' | 'skill' | 'agent' | 'map' | null>(null);
  const requested = useMemo<Panel | null>(() => draft ? { kind: 'agent', draft, error: draftError } : nav.selected ? { kind: 'skill', skillId: nav.selected } : null, [draft, draftError, nav.selected]);
  const panelKey = draft ? 'agent' : nav.selected ? `skill:${nav.selected}` : 'collection';
  const presence = usePanelPresence(requested, panelKey, sidebarRef);
  const shown = presence.content;
  const panelInteractive = panelKey === presence.key && presence.phase === 'open';
  const overlay = !desktop && Boolean(requested || shown);

  const navigate = useCallback((patch: Partial<Nav>, replace = false) => {
    const next = { ...navRef.current, ...patch };
    navRef.current = next; setNav(next); setDraft(null); setDraftError('');
    persistNavigation(next, replace);
  }, []);
  useEffect(() => {
    const pop = () => {
      const next = readNavigation(); navRef.current = next; setNav(next); setDraft(null);
      pendingFocus.current = next.selected ? 'panel' : 'map';
    };
    addEventListener('popstate', pop); return () => removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    try { localStorage.setItem('portfolio-galaxy-installed', JSON.stringify([...installed])); } catch { /* Session-only demo state. */ }
  }, [installed]);

  const scoped = useMemo(() => skills.filter(skill => skill.skill_type === nav.kind && (nav.scope === 'all' || installed.has(skill.skill_id))), [nav.kind, nav.scope, installed]);
  const tree = useMemo(() => makeTree(scoped), [scoped]);
  const level = useMemo(() => layoutLevel(tree, nav.category, locale), [tree, nav.category, locale]);
  const categoryOptions = useMemo(() => catalogCategories(tree, locale), [tree, locale]);
  const focused = categories.find(category => category.id === nav.category);
  const context = useMemo(() => scoped.filter(skill => (!nav.category || skill.category === nav.category) && (!nav.query || `${skill.name_en} ${skill.name_zh} ${skill.description_en} ${skill.description_zh} ${skill.category}`.toLocaleLowerCase().includes(nav.query.trim().toLocaleLowerCase()))), [scoped, nav.category, nav.query]);
  const ranked = useMemo(() => [...context].sort((a, b) => b.install_count - a.install_count), [context]);
  const totals = useMemo(() => summarize(scoped), [scoped]);
  const stats = useMemo(() => summarize(context), [context]);
  const chart = ranked.find(skill => skill.skill_id === chartPick) || ranked[0];
  const mapVisible = desktop && nav.view === 'overview' && !nav.query && context.length > 0;
  const title = nav.query ? d('results') : nav.view === 'insights' ? t('insights') : focused ? (locale === 'zh' ? focused.zh : focused.en) : t('overview');
  const number = (value: number) => shortNumber(value, locale);

  function openSkill(id: string, source: HTMLElement | null, category?: string | null) {
    if (nav.selected === id && !draft) { closePanel(); return; }
    skillOpener.current = source; pendingFocus.current = 'panel';
    navigate({ selected: id, ...(category ? { category } : {}) }, Boolean(nav.selected));
  }
  function toggleAgent(source: HTMLElement | null) {
    if (draft) { closePanel(); return; }
    agentOpener.current = source; pendingFocus.current = 'panel';
    setDraft({ ...agent, avatar: { ...agent.avatar } }); setDraftError('');
  }
  function closePanel() {
    if (draft) {
      pendingFocus.current = nav.selected ? 'panel' : 'agent'; setDraft(null); setDraftError('');
    } else {
      pendingFocus.current = 'skill'; navigate({ selected: null }, true);
    }
  }
  function pickCategory(id: string) {
    pendingFocus.current = 'map'; navigate({ category: id || null, selected: null });
  }
  function home() {
    pendingFocus.current = 'map'; navigate({ category: null, selected: null, query: '' });
  }
  function toggleInstall(skill: SkillSummary) {
    const next = new Set(installed);
    if (next.has(skill.skill_id)) next.delete(skill.skill_id); else next.add(skill.skill_id);
    setInstalled(next);
    setAnnouncement(d(next.has(skill.skill_id) ? 'installedMessage' : 'removedMessage', { name: displayName(skill, locale) }));
  }
  function saveAgent() {
    if (!draft) return;
    const nickname = normalizeNickname(draft.nickname);
    if (!nickname) { setDraftError(t('nicknameHint')); return; }
    const next = { ...draft, nickname }; setAgent(next);
    const saved = writeAgent(browserStorage(), next, 'demo');
    setAnnouncement(d(saved ? 'saved' : 'savedSession')); closePanel();
  }

  useLayoutEffect(() => {
    if (presence.phase !== 'open' || presence.key !== panelKey || !pendingFocus.current) return;
    const intent = pendingFocus.current; pendingFocus.current = null;
    if (intent === 'panel') panelRef.current?.querySelector<HTMLElement>('[data-panel-heading]')?.focus({ preventScroll: true });
    else {
      const target = intent === 'skill' ? skillOpener.current : intent === 'agent' ? agentOpener.current : null;
      if (target?.isConnected && target.getClientRects().length && !target.closest('[inert]')) target.focus({ preventScroll: true });
      else stageRef.current?.focus({ preventScroll: true });
    }
  }, [presence.phase, presence.key, panelKey, nav.category, nav.view, nav.query]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (requested) { event.preventDefault(); closePanel(); }
        else if (nav.query) { navigate({ query: '' }, true); searchRef.current?.focus({ preventScroll: true }); }
      }
      if (event.key === 'Tab' && overlay && panelInteractive) {
        const targets = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href], [tabindex="0"]') || [])].filter(node => node.getClientRects().length && !node.closest('[inert]'));
        const first = targets[0], last = targets.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && (document.activeElement === first || !targets.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
  });

  const navigation = <>
    <nav className="sk-nav" aria-label={d('views')}>
      {(['overview', 'insights'] as const).map(view => <button key={view} aria-current={nav.view === view ? 'page' : undefined} onClick={() => { if (nav.view !== view) navigate({ view, selected: null }); }}>{t(view)}</button>)}
    </nav>
    <button className="sk-profile" data-agent-trigger aria-label={draft ? t('cancel') : t('editAgent')} aria-expanded={Boolean(draft)} onClick={event => toggleAgent(event.currentTarget)}><AvatarThumb avatar={agent.avatar} size={30} /></button>
  </>;
  const detail = shown?.kind === 'skill' ? byId.get(shown.skillId) : null;

  return <div className="market-shell skill-market demo-shell" data-market-version="v2" data-market-phase="open">
    <header className="market-header" inert={overlay}>
      <h1><button onClick={home} aria-label={d('home')}><span className="demo-brand-orb" aria-hidden="true" />Galaxy <span className="demo-sample">{d('sample')}</span></button></h1>
      <div className="market-header-actions">
        <button className="demo-header-button" data-theme-toggle onClick={toggleMode} aria-label={d(mode === 'dark' ? 'lightTheme' : 'darkTheme')}>{mode === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        <button className="demo-header-button demo-language" data-locale-toggle onClick={onLocale} aria-label={d('changeLanguage')}>{locale === 'en' ? '中文' : 'EN'}</button>
      </div>
    </header>
    <div className="market-search demo-search" inert={overlay}>
      <Search size={15} aria-hidden="true" />
      <input ref={searchRef} type="search" value={nav.query} onChange={event => navigate({ query: event.target.value, selected: null }, true)} placeholder={t('search')} aria-label={t('search')} />
      {nav.query && <button aria-label={t('clearSearch')} onClick={() => { navigate({ query: '' }, true); searchRef.current?.focus(); }}><X size={14} /></button>}
    </div>
    <div className="market-mobile-toolbar" hidden={desktop} inert={overlay}><div className="market-region-content" data-skill-market-v2><div className="sk-content-navigation">{navigation}</div></div></div>
    <div className="market-layout" data-overlay={overlay}>
      <aside className="market-sidebar" data-market-region="sidebar">
        <div className="market-region-content" data-skill-market-v2>
          <div className={`sk-sidebar-content${shown ? ' has-panel-content' : ''}`}>
            {desktop && <div className="sk-content-navigation">{navigation}</div>}
            <aside ref={sidebarRef} className="sk-sidebar" tabIndex={-1} data-panel-open={Boolean(requested)} data-content-key={presence.key} data-content-phase={presence.phase} data-content-reversing={presence.reversing} onTransitionEnd={presence.onTransitionEnd} aria-label={shown ? t(shown.kind === 'agent' ? 'editAgent' : 'detail') : t('collection')}>
              {shown && <section id="sk-side-panel" ref={panelRef} className="sk-detail" role={desktop ? undefined : 'dialog'} aria-modal={!desktop || undefined} aria-labelledby="demo-panel-title" aria-hidden={!panelInteractive || undefined} inert={!panelInteractive} data-sidebar-view="detail" data-active="true" data-panel-state={presence.phase} data-panel-kind={shown.kind}>
                <header data-motion-group="0"><button data-close-panel onClick={closePanel} aria-label={shown.kind === 'agent' ? t('cancel') : t('closeDetail')}><ArrowLeft size={16} />{t('back')}</button><h2 id="demo-panel-title" tabIndex={-1} data-panel-heading>{t(shown.kind === 'agent' ? 'editAgent' : 'detail')}</h2></header>
                <div className="sk-detail-scroll" key={presence.key}>
                  {shown.kind === 'agent' ? <AgentEditor draft={shown.draft} error={shown.error} onChange={next => { setDraft(next); setDraftError(''); }} /> : detail && <>
                    <div className="demo-detail-heading" data-motion-group="1"><span className="demo-detail-pearl" style={{ '--pearl-color': colorFor(detail.category) } as React.CSSProperties} aria-hidden="true" /><span className="demo-kicker">{d(detail.skill_type === 'task' ? 'tools' : 'characters')}</span><h3>{displayName(detail, locale)}</h3><p>{displayDescription(detail, locale)}</p></div>
                    <dl className="demo-detail-stats" data-motion-group="2"><div><dt>{d('sampleAdoptions')}</dt><dd>{number(detail.install_count)}</dd></div><div><dt>{d('sampleSuccess')}</dt><dd>{percent(detail.usage.successes / detail.usage.calls)}</dd></div></dl>
                    <section className="demo-example" data-motion-group="3"><h4>{d('example')}</h4><p>{locale === 'zh' ? detail.example_zh : detail.example_en}</p></section>
                    <p className="demo-detail-note" data-motion-group="4">{d('detailNote')}</p>
                  </>}
                </div>
                <footer className="sk-panel-actions" data-motion-group="4">
                  {shown.kind === 'agent' ? <><button className="sk-secondary" onClick={closePanel}>{t('cancel')}</button><button className="sk-install" data-save-agent onClick={saveAgent}>{t('save')}</button></> : detail && <button className="sk-install demo-install" data-install-skill={detail.skill_id} aria-pressed={installed.has(detail.skill_id)} onClick={() => toggleInstall(detail)}>{installed.has(detail.skill_id) ? <><Check size={16} />{d('remove')}</> : <><ArrowUpRight size={16} />{d('install')}</>}</button>}
                </footer>
              </section>}
              <div className="sk-collection" data-sidebar-view="collection" data-active={!shown} aria-hidden={Boolean(shown) || !panelInteractive || undefined} inert={Boolean(shown) || !panelInteractive}>
                <section className="sk-summary-card" data-motion-group="1"><div className="sk-ring"><svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="57" fill="none" stroke="#eee6f5" strokeWidth="6" /><circle cx="70" cy="70" r="57" fill="none" stroke="#9b77d9" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${totals.count ? 358 : 0} 358`} transform="rotate(-90 70 70)" /><circle cx="70" cy="70" r="46" fill="none" stroke="#f3e5c9" strokeWidth="6" /><circle cx="70" cy="70" r="46" fill="none" stroke="#e9b569" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${totals.count ? scoped.filter(skill => installed.has(skill.skill_id)).length / totals.count * 289 : 0} 289`} transform="rotate(-90 70 70)" /></svg><div><Boxes size={15} /><strong data-total-count>{totals.count}</strong><span>{t('skillsUnit')}</span></div></div><h3>{t('collection')}</h3><p>{t(nav.kind === 'task' ? 'toolCount' : 'characterCount', { count: totals.count })}</p><div className="sk-summary-rows"><div><span>{t('installedBadge')}</span><strong>{scoped.filter(skill => installed.has(skill.skill_id)).length}</strong></div></div></section>
                <section className="sk-violet-card" data-motion-group="2"><p className="demo-stats-label">{d('sampleStatistics')}</p><div><span>{t('adoptions')}</span><strong>{number(totals.installs)}</strong><small>{t('adoptionsHint')}</small></div><div><span>{t('successRate')}</span><strong>{percent(totals.rate)}<ChartColumn size={23} /></strong><small>{t('callsHint', { count: number(totals.calls) })}</small></div></section>
                <p className="demo-collection-note" data-motion-group="3">{d('collectionNote')}</p>
              </div>
            </aside>
          </div>
        </div>
      </aside>
      <main className="market-main" data-market-region="main" inert={overlay}>
        <div className="market-region-content" data-skill-market-v2>
          <section ref={stageRef} className={`sk-stage sk-view-${nav.view}${mapVisible ? ' has-map' : ' is-flat'}`} aria-label={t('map')} tabIndex={-1}>
            {mapVisible && <><div className="sk-tray" aria-hidden="true" /><div className="sk-spatial"><Suspense fallback={<div className="sk-loading" role="status">{t('loadingMap')}</div>}><Universe level={level} selected={nav.selected} installed={installed} installationStatus="ready" agent={draft || agent} agentEditing={Boolean(draft)} recenter={recenter} onRecenter={() => setRecenter(value => value + 1)} onBackdrop={() => { if (nav.selected && !draft) closePanel(); }} onAgent={toggleAgent} onCategory={pickCategory} onBack={home} onSkill={openSkill} /></Suspense></div></>}
            <h2 className={mapVisible ? 'sk-map-title' : 'sk-stage-title'}>{title}</h2>
            {!mapVisible && <div className="sk-stage-heading"><div className="sk-breadcrumb">{focused ? <><button onClick={home}><AvatarThumb avatar={agent.avatar} size={14} />{t('overview')}</button><span>/</span><span>{locale === 'zh' ? focused.zh : focused.en}</span></> : <span>{nav.view === 'insights' ? d('sampleStatistics') : d('browse')}</span>}</div></div>}
            <div className="sk-toolbar"><div className="sk-navigation"><div className="sk-kind" role="group" aria-label={t('kind')}>{(['task', 'role'] as const).map(kind => <button key={kind} aria-pressed={nav.kind === kind} onClick={() => { if (kind !== nav.kind) navigate({ kind, category: null, selected: null }); }}>{d(kind === 'task' ? 'tools' : 'characters')}</button>)}</div></div><div className="sk-scope"><label className="demo-select"><span className="sr-only">{t('source')}</span><select aria-label={t('source')} value={nav.scope} onChange={event => navigate({ scope: event.target.value as Nav['scope'], category: null, selected: null })}><option value="all">{d('allSkills')}</option><option value="installed">{t('installed')}</option></select></label>{!mapVisible && <label className="demo-select"><span className="sr-only">{t('anyCategory')}</span><select aria-label={t('anyCategory')} value={nav.category || ''} onChange={event => pickCategory(event.target.value)}><option value="">{t('anyCategory')}</option>{categoryOptions.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}{focused && !categoryOptions.some(category => category.id === focused.id) && <option value={focused.id}>{locale === 'zh' ? focused.zh : focused.en}</option>}</select></label>}</div></div>
            {!mapVisible && <div className="sk-flat-content">
              {!context.length ? <div className="sk-empty"><h3>{d('empty')}</h3><p>{d('emptyHint')}</p></div> : nav.view === 'insights' && !nav.query ? <Insights ranked={ranked} stats={stats} selectedId={chart?.skill_id || null} detail={chart || null} range={range} onRange={setRange} onSelect={setChartPick} onOpen={openSkill} /> : <div className="demo-results" data-mobile-list={!desktop || undefined}><p className="demo-result-count">{d('resultsCount', { count: context.length })}</p>{context.map(skill => <button className="sk-skill-row demo-skill-row" key={skill.skill_id} data-skill={skill.skill_id} aria-expanded={nav.selected === skill.skill_id} onClick={event => openSkill(skill.skill_id, event.currentTarget)}><span className="sk-mini-pearl" style={{ background: `radial-gradient(circle at 30% 25%, #fff, ${installed.has(skill.skill_id) ? colorFor(skill.category) : '#bac1d2'} 70%)` }} aria-hidden="true" /><span className="sk-row-copy"><strong>{displayName(skill, locale)}</strong><small>{displayDescription(skill, locale)}</small></span><span className="demo-row-status">{installed.has(skill.skill_id) ? <Check size={15} aria-label={t('installedBadge')} /> : <ArrowUpRight size={15} aria-hidden="true" />}</span></button>)}</div>}
            </div>}
            <div className="demo-stage-note">{d('sample')}{mapVisible && <span> · {d('dragHint')}</span>}</div>
          </section>
        </div>
      </main>
    </div>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
  </div>;
}

function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    const query = new URLSearchParams(location.search).get('lang');
    if (query === 'zh' || query === 'en') return query;
    try { return localStorage.getItem('portfolio-galaxy-locale') === 'zh' ? 'zh' : 'en'; } catch { return 'en'; }
  });
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.title = locale === 'zh' ? 'Galaxy 技能市场 — 交互演示' : 'Galaxy Skill Market — Interactive demo';
    try { localStorage.setItem('portfolio-galaxy-locale', locale); } catch { /* Session-only preference. */ }
  }, [locale]);
  return <IntlProvider locale={locale} messages={locale === 'zh' ? zh : en} timeZone="UTC"><ThemeProvider><Market onLocale={() => {
    const next = locale === 'en' ? 'zh' : 'en';
    const url = new URL(location.href); url.searchParams.set('lang', next); history.replaceState(history.state, '', url);
    setLocale(next);
  }} /></ThemeProvider></IntlProvider>;
}

createRoot(document.getElementById('root')!).render(<App />);
