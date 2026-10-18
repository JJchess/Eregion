import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'use-intl';
import { LandingPage } from '@/components/landing/LandingPage';
import { DemoProvider } from './demo-context';
import en from '@/messages/en.json';
import zh from '@/messages/zh.json';
import './fonts.css';
import './global.css';

function App() {
  const [locale, setLocale] = useState<'en' | 'zh'>(() => new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en');
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  const toggleLocale = () => {
    const next = locale === 'en' ? 'zh' : 'en';
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    history.replaceState(history.state, '', url);
    setLocale(next);
  };
  return <IntlProvider locale={locale} messages={locale === 'zh' ? zh : en} timeZone="UTC">
    <DemoProvider locale={locale} toggleLocale={toggleLocale}>
      <div className="landing-scroll-root" data-landing-scroll-root="true"><LandingPage key={locale} /></div>
    </DemoProvider>
  </IntlProvider>;
}

createRoot(document.getElementById('root')!).render(<App />);
