type IsometricAnimationOptions = {
  type?: (...args: unknown[]) => unknown;
  delay?: number;
  duration?: number;
  complete?: () => void;
  points?: Array<{
    x: number;
    y: number;
    cp: Array<{ x: number; y: number }>;
  }>;
};

type IsometricMasonry = {
  destroy: () => void;
  layout: () => void;
};

interface Window {
  dynamics: {
    spring: (...args: unknown[]) => unknown;
    bezier: (...args: unknown[]) => unknown;
    animate: (
      element: HTMLElement,
      properties: Record<string, number>,
      options?: IsometricAnimationOptions,
    ) => void;
    stop: (element: HTMLElement) => void;
  };
  imagesLoaded: (element: Element, callback: () => void) => unknown;
  Masonry: new (
    element: Element,
    options: { itemSelector: string; isFitWidth: boolean },
  ) => IsometricMasonry;
}
