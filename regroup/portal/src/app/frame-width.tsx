// Phone screens that lay out from the window width (intake's step bar) assume the
// window is the screen. In the portal the screen is a column inside the window,
// so a reused screen's frame tells them its own width instead.
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const FrameWidthContext = createContext<number | null>(null);

export const useFrameWidth = (): number | null => useContext(FrameWidthContext);

export function FrameWidth(props: { style?: CSSProperties; testID?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} data-testid={props.testID} style={props.style}>
      <FrameWidthContext.Provider value={width}>{props.children}</FrameWidthContext.Provider>
    </div>
  );
}
