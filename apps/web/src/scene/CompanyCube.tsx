import React from 'react';
import type { GraphNode, GraphEdge, SceneData } from '@cubes/contracts';

interface CompanyCubeProps {
  data: SceneData;
  onSelectNode: (id: string) => void;
  reducedMotion: boolean;
}

export const CompanyCube: React.FC<CompanyCubeProps> = ({
  data,
  onSelectNode,
  reducedMotion,
}) => {
  const isAvailable = data.status === 'AVAILABLE';
  const nodes = isAvailable ? data.nodes : [];
  const edges = isAvailable ? data.edges : [];

  // Isometric 3D Projection coordinates for graph nodes
  // Arrange nodes inside the luminous lattice space
  const getNodeCoordinates = (index: number, total: number) => {
    if (total === 0) return { cx: 200, cy: 150 };
    const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
    const rx = 100;
    const ry = 45;
    const cx = 200 + rx * Math.cos(angle);
    const cy = 150 + ry * Math.sin(angle);
    return { cx, cy };
  };

  const nodePosMap = new Map<string, { cx: number; cy: number }>();
  nodes.forEach((node, i) => {
    nodePosMap.set(node.id, getNodeCoordinates(i, nodes.length));
  });

  return (
    <div
      className={`company-cube-stage ${isAvailable ? 'cube-available' : 'cube-unavailable'} ${
        reducedMotion ? 'reduced-motion' : ''
      }`}
      data-testid="company-cube-view"
    >
      <svg
        viewBox="0 0 400 300"
        className="company-cube-svg"
        role="region"
        aria-label="Company Cube Knowledge Lattice"
      >
        <defs>
          {/* Luminous Blue Lattice Glow (#00E5FF) */}
          <radialGradient id="lattice-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#04060A" stopOpacity="0" />
          </radialGradient>

          {/* Restrained Sun Accent Reference */}
          <radialGradient id="restrained-sun" cx="80%" cy="20%" r="40%">
            <stop offset="0%" stopColor="#FFF3E0" stopOpacity="0.65" />
            <stop offset="40%" stopColor="#FFB300" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#04060A" stopOpacity="0" />
          </radialGradient>

          {/* Red Graph Evidence Node Glow (#FF1744) */}
          <radialGradient id="evidence-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF1744" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#B71C1C" stopOpacity="0.2" />
          </radialGradient>

          {/* Fracture Outage Pattern */}
          <linearGradient id="outage-fracture" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF5252" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#212121" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Cinematic Backdrop: Restrained Sun & Starfield */}
        <rect width="400" height="300" fill="#060911" />
        <circle cx="330" cy="55" r="75" fill="url(#restrained-sun)" aria-hidden="true" />

        {/* Decorative Distinguishable Background Stars */}
        <g className={reducedMotion ? '' : 'decorative-stars'} opacity="0.35" aria-hidden="true">
          <circle cx="45" cy="40" r="1" fill="#FFFFFF" />
          <circle cx="85" cy="110" r="1.2" fill="#80D8FF" />
          <circle cx="160" cy="35" r="0.8" fill="#FFFFFF" />
          <circle cx="280" cy="90" r="1.1" fill="#80D8FF" />
          <circle cx="360" cy="160" r="1.5" fill="#FFFFFF" />
          <circle cx="70" cy="240" r="0.9" fill="#80D8FF" />
          <circle cx="320" cy="260" r="1" fill="#FFFFFF" />
        </g>

        {/* Central Luminous Blue Lattice Cube Frame */}
        <g
          className={`cube-lattice-frame ${reducedMotion ? '' : 'cube-rotate-subtle'}`}
          style={{ transformOrigin: '200px 150px' }}
        >
          {/* Ambient Glow */}
          <circle cx="200" cy="150" r="110" fill="url(#lattice-glow)" />

          {/* Isometric Cube Wireframe (Luminous Cyan #00E5FF) */}
          <path
            d="
              M 200 65 L 290 115 L 290 215 L 200 265 L 110 215 L 110 115 Z
              M 200 65 L 200 165 L 290 215
              M 200 165 L 110 215
            "
            fill="none"
            stroke={isAvailable ? '#00E5FF' : '#37474F'}
            strokeWidth="1.8"
            strokeDasharray={isAvailable ? 'none' : '4,4'}
            opacity={isAvailable ? 0.8 : 0.4}
          />

          {/* Internal Grid Lattice Lines */}
          <line
            x1="155"
            y1="90"
            x2="245"
            y2="240"
            stroke="#00E5FF"
            strokeWidth="0.8"
            opacity={isAvailable ? 0.35 : 0.1}
          />
          <line
            x1="245"
            y1="90"
            x2="155"
            y2="240"
            stroke="#00E5FF"
            strokeWidth="0.8"
            opacity={isAvailable ? 0.35 : 0.1}
          />
        </g>

        {/* OUTAGE STATE: Disconnected & Fractured */}
        {!isAvailable && (
          <g className="cube-outage-overlay">
            <rect x="70" y="115" width="260" height="70" rx="8" fill="url(#outage-fracture)" stroke="#FF5252" strokeWidth="1.5" />
            <text x="200" y="145" textAnchor="middle" fill="#FF8A80" fontSize="13" fontWeight="bold">
              GRAPH UNAVAILABLE
            </text>
            <text x="200" y="165" textAnchor="middle" fill="#ECEFF1" fontSize="11">
              Evidence severed. Zero proof displayed.
            </text>
          </g>
        )}

        {/* VERIFIED GRAPH EVIDENCE: Proof Edges (Only when AVAILABLE) */}
        {isAvailable && (
          <g className="graph-proof-edges">
            {edges.map((edge) => {
              const fromPos = nodePosMap.get(edge.from);
              const toPos = nodePosMap.get(edge.to);
              if (!fromPos || !toPos) return null;
              return (
                <g key={edge.id} className="evidence-edge-group">
                  <line
                    x1={fromPos.cx}
                    y1={fromPos.cy}
                    x2={toPos.cx}
                    y2={toPos.cy}
                    stroke="#FF1744"
                    strokeWidth="2"
                    strokeOpacity="0.85"
                  />
                  {/* Directional arrowhead or type label */}
                  <text
                    x={(fromPos.cx + toPos.cx) / 2}
                    y={(fromPos.cy + toPos.cy) / 2 - 4}
                    textAnchor="middle"
                    fill="#FF8A80"
                    fontSize="9"
                    className="edge-type-label"
                  >
                    {edge.type}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* VERIFIED GRAPH EVIDENCE: Red Graph Nodes (Only when AVAILABLE) */}
        {isAvailable && (
          <g className="graph-evidence-nodes">
            {nodes.map((node) => {
              const pos = nodePosMap.get(node.id) || { cx: 200, cy: 150 };
              const isSelected = data.selectedNodeId === node.id;
              return (
                <g
                  key={node.id}
                  className={`graph-node-anchor ${isSelected ? 'node-selected' : ''}`}
                  onClick={() => onSelectNode(node.id)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`${node.label} (${node.kind})`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectNode(node.id);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Halo for selected node */}
                  {isSelected && (
                    <circle cx={pos.cx} cy={pos.cy} r="14" fill="none" stroke="#00E5FF" strokeWidth="2.5" />
                  )}
                  {/* Node Body (Red Evidence Node #FF1744) */}
                  <circle cx={pos.cx} cy={pos.cy} r="8" fill="url(#evidence-glow)" stroke="#FF5252" strokeWidth="1.5" />
                  {/* Node Label */}
                  <text
                    x={pos.cx}
                    y={pos.cy + 18}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="10"
                    fontWeight={isSelected ? 'bold' : 'normal'}
                    className="node-svg-label"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
};
