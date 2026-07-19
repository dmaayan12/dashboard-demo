/** Entry point - plain Vite React SPA, no browser-extension machinery involved. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider, createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';
import './index.css';
import App from './App.jsx';

const HEBREW_AWARE_FONT_STACK = `"Segoe UI", Inter, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif`;

const system = createSystem(defaultConfig, defineConfig({
  theme: {
    tokens: {
      fonts: {
        body: { value: HEBREW_AWARE_FONT_STACK },
        heading: { value: HEBREW_AWARE_FONT_STACK },
      },
    },
  },
}));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <App />
    </ChakraProvider>
  </StrictMode>
);
