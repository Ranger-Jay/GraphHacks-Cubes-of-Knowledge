import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MountedSpaceScene } from './MountedSpaceScene';
import { createMountedStudio } from './studio/mountedStudio';
import './styles.css';
import './scene/scene.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing root element');
const studio = createMountedStudio();
createRoot(container).render(<App Scene={MountedSpaceScene} studio={studio} />);
