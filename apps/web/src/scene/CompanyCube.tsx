import React from 'react';
import type { GraphNode, GraphEdge, SceneData, SceneRuntimeContext } from '@cubes/contracts';

interface CompanyCubeProps {
  data: SceneData;
  onSelectNode: (id: string) => void;
  reducedMotion: boolean;
  runtime?: SceneRuntimeContext;
}

export const CompanyCube: React.FC<CompanyCubeProps> = ({
  data,
  onSelectNode,
  reducedMotion,
  runtime,
}) => {
  // Derive phase truthfully: use runtime.phase if provided, otherwise fallback to data.status
  const phase = runtime?.phase ?? (data.status === 'AVAILABLE' ? 'READY' : 'GRAPH_UNAVAILABLE');
  const isReady = phase === 'READY';
  const isAvailable = isReady;
  // Only a proven graph failure gets the outage visual; UNAVAILABLE means "cannot be determined" (docs/scene-phase-matrix.md).
  const isGraphUnavailable = phase === 'GRAPH_UNAVAILABLE';
  const nodes = isReady ? data.nodes : [];
  const edges = isReady ? data.edges : [];

  // Isometric 3D Projection coordinates for graph nodes
  // Arrange nodes inside the luminous lattice space with generous vertical separation
  const getNodeCoordinates = (index: number, total: number) => {
    if (total === 0) return { cx: 200, cy: 150 };
    const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
    const rx = 112;
    const ry = 60;
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
      className={`company-cube-stage ${isReady ? 'cube-available' : 'cube-unavailable'} ${
        isGraphUnavailable ? 'damaged-cube' : ''
      } ${reducedMotion ? 'reduced-motion' : ''}`}
      data-testid="company-cube-view"
      data-phase={phase}
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

          {/* Radiant Golden Sun Accent Reference (Unclipped within 400x300 viewBox) */}
          <radialGradient id="restrained-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFF8E1" stopOpacity="0.95" />
            <stop offset="42%" stopColor="#FFB300" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#04060A" stopOpacity="0" />
          </radialGradient>

          {/* Dying Grey-Black Collapsed Core Gradient (Used during GRAPH_UNAVAILABLE) */}
          <radialGradient id="collapsed-sun-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0B0D13" stopOpacity="0.98" />
            <stop offset="58%" stopColor="#262B36" stopOpacity="0.92" />
            <stop offset="85%" stopColor="#4B5563" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#060911" stopOpacity="0" />
          </radialGradient>

          {/* Red Graph Evidence Node Glow (#FF1744) */}
          <radialGradient id="evidence-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF1744" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#B71C1C" stopOpacity="0.2" />
          </radialGradient>

          {/* Fracture Outage Pattern */}
          <linearGradient id="outage-fracture" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF5252" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#212121" stopOpacity="0.88" />
          </linearGradient>
        </defs>

        {/* Cinematic Backdrop: Radiant Unclipped Sun or Dying Collapsed Core */}
        <rect width="400" height="300" fill="#060911" />
        <g className="solar-anchor" aria-hidden="true">
          <circle
            cx="326"
            cy="58"
            r="50"
            fill={isGraphUnavailable ? 'url(#collapsed-sun-core)' : 'url(#restrained-sun)'}
            opacity={isGraphUnavailable ? 0.95 : 1}
          />
          {!isGraphUnavailable ? (
            <circle
              cx="326"
              cy="58"
              r="18"
              fill="#FFD54F"
              stroke="#FFF8E1"
              strokeWidth="1.2"
              opacity={isReady ? 0.92 : 0.45}
            />
          ) : (
            <g className="dying-solar-core">
              <circle
                cx="326"
                cy="58"
                r="22"
                fill="#14171F"
                stroke="#64748B"
                strokeWidth="1.5"
                strokeDasharray="4,3"
              />
              <circle cx="326" cy="58" r="12" fill="#090B10" stroke="#475569" strokeWidth="1" />
            </g>
          )}
        </g>

        {/* Decorative Distinguishable Background Stars */}
        <g className={reducedMotion ? '' : 'decorative-stars'} opacity={isGraphUnavailable ? "0.15" : "0.35"} aria-hidden="true">
          <circle cx="45" cy="40" r="1" fill="#FFFFFF" />
          <circle cx="85" cy="110" r="1.2" fill="#80D8FF" />
          <circle cx="160" cy="35" r="0.8" fill="#FFFFFF" />
          <circle cx="265" cy="78" r="1.1" fill="#80D8FF" />
          <circle cx="360" cy="160" r="1.5" fill="#FFFFFF" />
          <circle cx="70" cy="240" r="0.9" fill="#80D8FF" />
          <circle cx="320" cy="260" r="1" fill="#FFFFFF" />
        </g>

        {/* Central Luminous Blue Lattice Cube Frame (or Damaged Crimson Lattice) */}
        <g
          className={`cube-lattice-frame ${reducedMotion ? '' : 'cube-rotate-subtle'}`}
          style={{ transformOrigin: '200px 150px' }}
        >
          {/* Ambient Glow */}
          <circle cx="200" cy="150" r="110" fill="url(#lattice-glow)" opacity={isGraphUnavailable ? 0.08 : 1} />

          {/* Isometric Cube Wireframe */}
          <path
            d="
              M 200 65 L 290 115 L 290 215 L 200 265 L 110 215 L 110 115 Z
              M 200 65 L 200 165 L 290 215
              M 200 165 L 110 215
            "
            fill="none"
            stroke={isReady ? '#00E5FF' : isGraphUnavailable ? '#8A1020' : '#37474F'}
            strokeWidth="1.8"
            strokeDasharray={isReady ? 'none' : '4,4'}
            opacity={isReady ? 0.8 : 0.5}
          />

          {/* Internal Grid Lattice Lines */}
          <line
            x1="155"
            y1="90"
            x2="245"
            y2="240"
            stroke={isReady ? '#00E5FF' : isGraphUnavailable ? '#8A1020' : '#37474F'}
            strokeWidth="0.8"
            opacity={isReady ? 0.35 : 0.1}
          />
          <line
            x1="245"
            y1="90"
            x2="155"
            y2="240"
            stroke={isReady ? '#00E5FF' : isGraphUnavailable ? '#8A1020' : '#37474F'}
            strokeWidth="0.8"
            opacity={isReady ? 0.35 : 0.1}
          />
        </g>

        {/* DYING GREY-BLACK COLLAPSED CORE (Visible inside the Cube on proven GRAPH_UNAVAILABLE outage) */}
        {isGraphUnavailable && (
          <g className="dying-grey-black-core" data-testid="dying-grey-black-core" aria-hidden="true">
            <circle cx="200" cy="122" r="38" fill="url(#collapsed-sun-core)" />
            <circle
              cx="200"
              cy="122"
              r="26"
              fill="#181C24"
              stroke="#64748B"
              strokeWidth="1.8"
              strokeDasharray="5,3"
            />
            <circle
              cx="200"
              cy="122"
              r="15"
              fill="#0B0D12"
              stroke="#94A3B8"
              strokeWidth="1.2"
            />
            <line x1="176" y1="106" x2="190" y2="115" stroke="#64748B" strokeWidth="1.2" />
            <line x1="224" y1="106" x2="210" y2="115" stroke="#64748B" strokeWidth="1.2" />
            <line x1="176" y1="138" x2="190" y2="129" stroke="#64748B" strokeWidth="1.2" />
            <line x1="224" y1="138" x2="210" y2="129" stroke="#64748B" strokeWidth="1.2" />
          </g>
        )}

        {/* NON-READY STATES: neutral or damaged cube with a per-phase notice (damaged only for GRAPH_UNAVAILABLE; wording never claims a lost connection) */}
        {!isReady && (
          <g className="cube-outage-overlay">
            <rect
              x="60"
              y={isGraphUnavailable ? '170' : '115'}
              width="280"
              height={isGraphUnavailable ? '58' : '70'}
              rx="8"
              fill="url(#outage-fracture)"
              stroke={isGraphUnavailable ? '#FF5252' : '#78909C'}
              strokeWidth="1.5"
            />
            <text
              x="200"
              y={isGraphUnavailable ? '194' : '143'}
              textAnchor="middle"
              fill={isGraphUnavailable ? '#FF8A80' : '#B0BEC5'}
              fontSize="12"
              fontWeight="bold"
            >
              {isGraphUnavailable
                ? 'GRAPH UNAVAILABLE'
                : phase === 'ACCESS_DENIED'
                ? 'ACCESS DENIED'
                : phase === 'NOT_FOUND'
                ? 'RELEASE NOT FOUND'
                : phase === 'CHECKING'
                ? 'CHECKING THE GRAPH...'
                : 'GRAPH STATUS UNAVAILABLE'}
            </text>
            <text
              x="200"
              y={isGraphUnavailable ? '213' : '163'}
              textAnchor="middle"
              fill="#ECEFF1"
              fontSize="10.5"
            >
              {isGraphUnavailable
                ? 'Evidence unavailable. No proof is shown.'
                : phase === 'ACCESS_DENIED'
                ? 'Analysis unauthorized. Verify credentials.'
                : phase === 'NOT_FOUND'
                ? 'No matching release found in ledger.'
                : phase === 'CHECKING'
                ? 'No proof is shown until the checks finish.'
                : 'The current state could not be determined.'}
            </text>
          </g>
        )}

        {/* VERIFIED GRAPH EVIDENCE: Proof Edges (Only when AVAILABLE) */}
        {isAvailable && (
          <g className="graph-proof-edges">
            {edges.map((edge, edgeIndex) => {
              const fromPos = nodePosMap.get(edge.from);
              const toPos = nodePosMap.get(edge.to);
              if (!fromPos || !toPos) return null;
              const t = 0.36 + (edgeIndex % 3) * 0.14;
              const labelX = fromPos.cx + (toPos.cx - fromPos.cx) * t;
              const labelY =
                fromPos.cy + (toPos.cy - fromPos.cy) * t + (edgeIndex % 2 === 0 ? -7 : 9);
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
                  {/* Staggered directional edge type label to prevent center overlap */}
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    fill="#FF8A80"
                    fontSize="8.5"
                    paintOrder="stroke"
                    stroke="#060911"
                    strokeWidth="2.5"
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
              const labelY = pos.cy < 150 ? pos.cy - 13 : pos.cy + 20;
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
                  {/* Radial Node Label (never overlaps inward edges) */}
                  <text
                    x={pos.cx}
                    y={labelY}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="10"
                    fontWeight={isSelected ? 'bold' : 'normal'}
                    paintOrder="stroke"
                    stroke="#060911"
                    strokeWidth="3"
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
