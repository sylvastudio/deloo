import type { PropsWithChildren } from 'react';

/** Native: nothing to frame. The web build (web-frame.web.tsx) centres the app in a phone-width column. */
export function WebFrame({ children }: PropsWithChildren) {
  return children;
}
