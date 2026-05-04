import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { GtdLabelsProvider } from './lib/GtdLabelsContext';
import './styles.css';

// html 要素にダークテーマを付与（Portal 対応: document.body 直下の要素にも適用される）
document.documentElement.setAttribute('data-theme', 'dark');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GtdLabelsProvider>
        <App />
      </GtdLabelsProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
