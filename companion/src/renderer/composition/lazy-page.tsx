import { useEffect, useState, type ComponentType, type ReactNode } from 'react';

export interface LazyPageComponent<P extends object> {
  (props: P): ReactNode;
  /** Starts loading the page chunk; later renders show the page without a placeholder. */
  preload(): Promise<unknown>;
}

/**
 * A page whose code is a separate chunk, loaded on first mount or by preload().
 * Until it loads, `placeholder` renders an empty tab panel with the page's own
 * classes so the layout holds. This deliberately avoids Suspense, which can hold
 * back revealing a boundary for up to 300 ms; a state update shows the page as
 * soon as its chunk has been evaluated. (Ported from Kitsune Input.)
 */
export function lazyPage<P extends object>(
  load: () => Promise<ComponentType<P>>,
  placeholder: (props: P) => ReactNode = () => null
): LazyPageComponent<P> {
  let pending: Promise<ComponentType<P>> | undefined;
  let loaded: ComponentType<P> | undefined;
  const preload = () => {
    if (!pending) {
      const promise = load().then((component) => { loaded = component; return component; });
      // A failed chunk load is retried by the next mount or preload.
      promise.catch(() => { if (pending === promise) pending = undefined; });
      pending = promise;
    }
    return pending;
  };
  function LazyPage(props: P) {
    const [Page, setPage] = useState<ComponentType<P> | undefined>(() => loaded);
    useEffect(() => {
      if (Page) return undefined;
      let mounted = true;
      preload().then((component) => { if (mounted) setPage(() => component); }, () => undefined);
      return () => { mounted = false; };
    }, [Page]);
    return Page ? <Page {...props} /> : placeholder(props);
  }
  LazyPage.preload = preload;
  return LazyPage;
}

/** An empty tab panel with the page's classes, shown while the page chunk loads. */
export function pageShell(className: string, panelId?: string) {
  return ({ active }: { readonly active: boolean }) => (
    <div
      className={`control-page ${className} ${active ? 'active' : ''}`}
      id={panelId}
      role="tabpanel"
      aria-hidden={!active}
      aria-busy="true"
    />
  );
}
