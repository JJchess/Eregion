import shell from './landing.module.css';

/**
 * A viewport-sized colour plane that stays behind a scene while its content scrolls.
 * The parent section owns the tone through `data-landing-scene`; keeping the plane as
 * a real element (instead of a fixed page gradient) lets the next section physically
 * push the previous colour out of the viewport.
 */
export function SceneBackdrop() {
  return (
    <div className={shell.sceneBackdropHost} aria-hidden>
      <div className={shell.sceneBackdrop} data-scene-backdrop />
    </div>
  );
}
