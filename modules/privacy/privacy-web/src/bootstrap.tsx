import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Standalone start only to check that the bundle loads. The module is used through the f.orga shell.
const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <StrictMode>
    <p>This module is loaded through the f.orga shell.</p>
  </StrictMode>,
);
