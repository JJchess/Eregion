import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

type DemoContextValue = { locale: 'en' | 'zh'; toggleLocale: () => void; showDemo: () => void };
const DemoContext = createContext<DemoContextValue | null>(null);
export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('DemoProvider is required');
  return context;
}
export function useDemoAction() {
  const { showDemo } = useDemo();
  return useCallback((event: MouseEvent<HTMLElement>) => { event.preventDefault(); showDemo(); }, [showDemo]);
}
export function LanguageSwitch() {
  const { locale, toggleLocale } = useDemo();
  return <button type="button" className="demo-language" data-demo-language aria-label={locale === 'en' ? '切换中文' : 'Switch to English'} onClick={toggleLocale}>{locale === 'en' ? '中文' : 'EN'}</button>;
}
export function DemoProvider({ locale, toggleLocale, children }: Omit<DemoContextValue, 'showDemo'> & { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const showDemo = useCallback(() => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  const restoreFocus = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  return <DemoContext.Provider value={{ locale, toggleLocale, showDemo }}>
    {children}
    <dialog ref={dialog} className="demo-dialog" aria-labelledby="demo-information-title" onCancel={(event) => { event.preventDefault(); close(); }} onClose={restoreFocus} onClick={(event) => { if (event.target === dialog.current) close(); }}>
      <div className="demo-dialog-content">
        <h2 id="demo-information-title">{locale === 'zh' ? 'Edumanus 首页演示' : 'Edumanus landing page demo'}</h2>
        <p>{locale === 'zh' ? '这是作品集中的独立展示。你可以探索银河、观看产品视频并体验页面交互；登录、注册和账户文档不接入线上服务。' : 'This is a standalone portfolio exhibit. Explore the galaxy, watch the product videos and try the page interactions. Sign-in, registration and account documentation are not connected to live services.'}</p>
        <button type="button" autoFocus onClick={close}>{locale === 'zh' ? '继续探索' : 'Keep exploring'}</button>
      </div>
    </dialog>
  </DemoContext.Provider>;
}
