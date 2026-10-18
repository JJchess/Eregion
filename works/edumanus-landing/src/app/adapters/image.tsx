import type { CSSProperties, ImgHTMLAttributes } from 'react';

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
};

/** The extracted page needs the original image geometry, without Next's server optimizer. */
export default function Image({ fill, priority, quality: _quality, unoptimized: _unoptimized, style, ...props }: ImageProps) {
  const fillStyle: CSSProperties = fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%' } : {};
  return <img {...props} style={{ ...fillStyle, ...style }} loading={priority ? 'eager' : props.loading ?? 'lazy'} fetchPriority={priority ? 'high' : props.fetchPriority} decoding="async" />;
}
