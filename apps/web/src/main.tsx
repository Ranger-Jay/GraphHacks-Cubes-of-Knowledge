import { createRoot } from 'react-dom/client';
import type { ComponentType } from 'react';
import { App } from './App';
import type { SceneProps } from './components/SceneMount';
import './styles.css';

// Scene lane exports CompanyCubeScene from ./scene/index.tsx. Optional until that module lands.
const sceneModules = import.meta.glob<{ CompanyCubeScene: ComponentType<SceneProps> }>('./scene/index.tsx', { eager: true });
const Scene = Object.values(sceneModules)[0]?.CompanyCubeScene ?? null;

const container = document.getElementById('root');
if (!container) throw new Error('Missing root element');
createRoot(container).render(<App Scene={Scene} />);
