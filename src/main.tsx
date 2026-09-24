import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/black-ops-one/latin-400.css';
import './app/styles.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
