import { installTableEdges } from './services/tableEdges';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './court.css';
import { installCourtFeedback } from './services/courtFeedback';

function CourtFeedback() {
  React.useEffect(installCourtFeedback, []);
  React.useEffect(installTableEdges, []);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CourtFeedback />
    <App />
  </React.StrictMode>,
);
