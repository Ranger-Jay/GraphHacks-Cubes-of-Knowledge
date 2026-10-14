import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (!container) throw new Error('Missing root element');
createRoot(container).render(
  <main>
    <h1>Cubes of Knowledge</h1>
    <p>Development scaffold. The Company Cube, graph analysis, authentication and agent flows are not implemented yet.</p>
    <p>No clearance, authorization or graph availability is asserted by this page.</p>
  </main>
);
