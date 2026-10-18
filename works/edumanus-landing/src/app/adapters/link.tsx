import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { useDemo } from '../demo-context';

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** Keep in-page navigation native; business routes open a local exhibit explanation. */
export default function Link({ href, onClick, children, ...props }: LinkProps) {
  const { showDemo } = useDemo();
  const localAction = href.startsWith('/') && href !== '/';
  const resolved = href === '/' ? '#hero' : localAction ? '#demo-information' : href;
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (localAction && !event.defaultPrevented) {
      event.preventDefault();
      showDemo();
    }
  };
  return <a {...props} href={resolved} onClick={handleClick}>{children}</a>;
}
