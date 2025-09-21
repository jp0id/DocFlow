'use client';

import { useEffect } from 'react';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    import('../../styles/editor.css').catch(console.error);
  }, []);

  return <div className="h-full">{children}</div>;
}
