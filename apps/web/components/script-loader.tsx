'use client';

import Script from 'next/script';
import { useState } from 'react';

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

/** Boots terraplan.js after three.js so WebGL helpers exist first. */
export function ScriptLoader() {
  const [threeReady, setThreeReady] = useState(false);

  return (
    <>
      <Script
        src={THREE_CDN}
        strategy="afterInteractive"
        onLoad={() => setThreeReady(true)}
        onError={() => setThreeReady(true)}
      />
      {threeReady ? <Script src="/terraplan.js?v=wx73" strategy="afterInteractive" /> : null}
    </>
  );
}
