'use client';
import { useId } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ArrowUpRight } from 'lucide-react';
import type { Locale } from './contract';
import { avatarPresets, palettes, type AgentAvatar, type AgentProfile } from './agent';
import { displayName, type SkillSummary } from './contract';
import {
  fullNumber,
  historyWindow,
  percent,
  shortNumber,
  skillColor,
  successRate,
  type summarize,
} from './model';

export type HistoryRange = 'month' | 'quarter' | 'year' | 'all';

export function Insights({
  ranked,
  stats,
  selectedId,
  detail,
  range,
  onRange,
  onSelect,
  onOpen,
  error,
  onRetry,
}: {
  error?: boolean;
  onRetry?: () => void;
  /** Skills in scope, most adopted first. */
  ranked: SkillSummary[];
  stats: ReturnType<typeof summarize>;
  selectedId: string | null;
  detail: SkillSummary | null;
  range: HistoryRange;
  onRange: (r: HistoryRange) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string, el: HTMLElement) => void;
}) {
  const t = useTranslations('Starport.v2');
  const locale = useLocale() as Locale;
  const number = (value: number) => shortNumber(value, locale);
  const exact = (value: number) => fullNumber(value, locale);
  const uid = useId().replaceAll(':', '');
  const selected = ranked.find((s) => s.skill_id === selectedId) ?? ranked[0];
  if (!selected) return <div className="sk-empty">{t('noUsage')}</div>;
  const chart = detail?.skill_id === selected.skill_id ? historyWindow(detail.install_history, range) : null;
  const points = chart?.points ?? [],
    max = Math.max(1, ...points.map((p) => p.count));
  const minDate = points.length ? Date.parse(points[0].date) : 0;
  const dateRange = points.length > 1 ? Date.parse(points.at(-1)!.date) - minDate : 1;
  const xy = points.map((p) => [
    62 + ((Date.parse(p.date) - minDate) / dateRange) * 688,
    258 - (p.count / max) * 198,
  ]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const usage = selected.usage;
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
    (n, i, a) => a.indexOf(n) === i,
  );
  return (
    <div className="sk-insights">
      <section className="sk-history-card" aria-label={t('historyTitle')}>
        <div className="sk-chart-heading">
          <div>
            <span>{t('adoptions')}</span>
            <button onClick={(e) => onOpen(selected.skill_id, e.currentTarget)}>
              {displayName(selected, locale)}
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="sk-range" aria-label={t('historyRange')}>
            {(
              [
                ['month', t('month')],
                ['quarter', t('quarter')],
                ['year', t('year')],
                ['all', t('all')],
              ] as const
            ).map(([id, label]) => (
              <button key={id} aria-pressed={range === id} onClick={() => onRange(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="sk-chart-value">
          <strong>{selected.install_count == null ? '—' : exact(selected.install_count)}</strong>
          {chart?.growth != null ? (
            <span>
              +{exact(chart.growth)}
              <small>{t('growth')}</small>
            </span>
          ) : (
            <small>
              {error
                ? t('historyError')
                : chart
                  ? points.length
                    ? t('historyPartial')
                    : t('historyEmpty')
                  : t('historyLoading')}
            </small>
          )}
        </div>
        {points.length ? (
          <svg
            className="sk-history-chart"
            viewBox="0 0 800 306"
            role="img"
            aria-label={t('historyChart', {
              start: points[0].date,
              end: points.at(-1)!.date,
              first: points[0].count,
              last: points.at(-1)!.count,
            })}
          >
            <defs>
              <linearGradient id={`${uid}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#9e82ed" stopOpacity=".3" />
                <stop offset="1" stopColor="#ded5f8" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3].map((n) => (
              <g key={n}>
                <line x1="62" y1={60 + n * 66} x2="750" y2={60 + n * 66} stroke="#ececf4" />
                <text x="48" y={64 + n * 66} textAnchor="end">
                  {number(max * (1 - n / 3))}
                </text>
              </g>
            ))}
            {points.length > 1 && <path d={`${line} L750,258 L62,258 Z`} fill={`url(#${uid}-area)`} />}
            <path d={line} fill="none" stroke="#8a6ddd" strokeWidth="3" />
            <circle
              cx={xy.at(-1)![0]}
              cy={xy.at(-1)![1]}
              r="5"
              fill="#8a6ddd"
              stroke="white"
              strokeWidth="3"
            />
            {ticks.map((n) => (
              <text key={n} x={xy[n][0]} y="287" textAnchor="middle">
                {points[n].date.slice(5).replace('-', '/')}
              </text>
            ))}
          </svg>
        ) : (
          <div className="sk-chart-empty">
            {error ? (
              <button onClick={onRetry}>
                {t('historyError')} · {t('retry')}
              </button>
            ) : chart ? (
              t('historyEmpty')
            ) : (
              t('historyLoading')
            )}
          </div>
        )}
        <div className="sk-chart-stats">
          <div>
            <span>{t('calls')}</span>
            <strong>{usage ? number(usage.calls) : '—'}</strong>
          </div>
          <div>
            <span>{t('successRate')}</span>
            <strong>{percent(successRate(usage))}</strong>
          </div>
          <div>
            <span>{t('upvotes')}</span>
            <strong>{usage ? number(usage.upvotes) : '—'}</strong>
          </div>
        </div>
      </section>
      <section className="sk-ranking">
        <header>
          <h2>{t('ranking')}</h2>
          <span>{t('items', { count: ranked.length })}</span>
        </header>
        <div className="sk-ranking-scroll">
          {ranked.map((skill, i) => (
            <button
              className={selected.skill_id === skill.skill_id ? 'is-selected' : ''}
              key={skill.skill_id}
              onClick={() => onSelect(skill.skill_id)}
            >
              <span className="sk-rank-number">{String(i + 1).padStart(2, '0')}</span>
              <span className="sk-rank-copy">
                <strong>{displayName(skill, locale)}</strong>
                <span>
                  <i
                    style={{
                      width: `${((skill.install_count ?? 0) / Math.max(1, ranked[0].install_count ?? 0)) * 100}%`,
                      background: skillColor(skill),
                    }}
                  />
                </span>
              </span>
              <span>{number(skill.install_count ?? 0)}</span>
            </button>
          ))}
        </div>
        <footer>
          <div>{t('scopeInstalls')} <strong>{number(stats.installs)}</strong></div>
          <div>{t('scopeSuccessRate')} <strong>{percent(stats.rate)}</strong></div>
          <small>{t('installsNote')}</small>
        </footer>
      </section>
    </div>
  );
}

/** DOM stand-in for the Agent's avatar (breadcrumb, picker, fallback). One branch per avatar kind. */
export function AvatarThumb({ avatar, size }: { avatar: AgentAvatar; size: number }) {
  switch (avatar.kind) {
    case 'pearl': {
      const p = palettes[avatar.palette].deep;
      return (
        <span
          className="sk-avatar-thumb"
          aria-hidden="true"
          style={{
            width: size,
            height: size,
            background: `radial-gradient(circle at 32% 30%, ${p.pearl} 0, ${p.body} 58%, ${p.shadow} 100%)`,
          }}
        />
      );
    }
  }
}

const sameAvatar = (a: AgentAvatar, b: AgentAvatar) => JSON.stringify(a) === JSON.stringify(b);

/** The picker lists presets by group, so new avatar kinds only add presets. */
export function AgentEditor({
  draft,
  error,
  onChange,
}: {
  draft: AgentProfile;
  error: string;
  onChange: (next: AgentProfile) => void;
}) {
  const t = useTranslations('Starport.v2');
  const groups = [...new Set(avatarPresets.map((p) => p.group))];
  return (
    <>
      <div className="sk-agent-hero" data-motion-group="1">
        <AvatarThumb avatar={draft.avatar} size={92} />
        <h3>{t('agentTitle')}</h3>
      </div>
      <label className="sk-field" data-motion-group="2">
        <span>{t('nickname')}</span>
        <input
          aria-label={t('nickname')}
          value={draft.nickname}
          onChange={(e) => onChange({ ...draft, nickname: e.target.value })}
          aria-invalid={Boolean(error)}
          aria-describedby="sk-agent-hint"
          autoComplete="off"
        />
        <small id="sk-agent-hint" role={error ? 'alert' : undefined} className={error ? 'is-error' : ''}>
          {error || t('nicknameHint')}
        </small>
      </label>
      {groups.map((group) => (
        <fieldset className="sk-avatar-group" key={group} data-motion-group="3">
          <legend>{t('pearl')}</legend>
          <div>
            {avatarPresets
              .filter((p) => p.group === group)
              .map((preset) => (
                <label className="sk-avatar-option" key={preset.id}>
                  <input
                    type="radio"
                    name="sk-avatar"
                    checked={sameAvatar(preset.avatar, draft.avatar)}
                    onChange={() => onChange({ ...draft, avatar: preset.avatar })}
                  />
                  <AvatarThumb avatar={preset.avatar} size={40} />
                  <span>{t(preset.id as 'moon' | 'lavender' | 'sakura' | 'lake' | 'amber' | 'mint')}</span>
                </label>
              ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}
