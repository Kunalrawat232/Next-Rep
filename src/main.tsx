import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { bootstrap } from './app/bootstrap';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(<StrictMode>{bootstrap(import.meta.env)}</StrictMode>);
