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

  interface NodeLayout {
    cx: number;
    cy: number;
    anchor: 'start' | 'middle' | 'end';
    textX: number;
    startY: number;
  }

  const EXACT_NODE_LAYOUTS: Record<string, NodeLayout> = {
    'rel-wad': {
      cx: 180,
      cy: 42,
      anchor: 'middle',
      textX: 180,
      startY: 28, // 14px above node circle
    },
    'cut-wad-v4': {
      cx: 118,
      cy: 90,
      anchor: 'end',
      textX: 104,
      startY: 88, // Left-aligned within [5, 104]
    },
    'src-cue-v4': {
      cx: 245,
      cy: 85,
      anchor: 'middle',
      textX: 245,
      startY: 71, // Above node circle
    },
    'trk-basement-hum': {
      cx: 90,
      cy: 165,
      anchor: 'end',
      textX: 76,
      startY: 168, // Left-aligned within [6, 76]
    },
    'trk-night-drive': {
      cx: 320,
      cy: 155,
      anchor: 'middle',
      textX: 320,
      startY: 141, // Above node circle within [288, 352]
    },
    'cut-wad-v3': {
      cx: 110,
      cy: 235,
      anchor: 'end',
      textX: 96,
      startY: 233, // Left-aligned within [3, 96]
    },
    'lic-basement-hum-v3': {
      cx: 175,
      cy: 265,
      anchor: 'middle',
      textX: 175,
      startY: 281, // Below node circle, perfectly centered within [114, 236]
    },
    'src-mail-basement-hum': {
      cx: 155,
      cy: 205,
      anchor: 'middle',
      textX: 155,
      startY: 191, // Above node circle within [108, 202]
    },
    'lic-night-drive-v4': {
      cx: 310,
      cy: 240,
      anchor: 'middle',
      textX: 310,
      startY: 256, // Below node circle within [265, 355]
    },
    'src-lic-night-drive': {
      cx: 270,
      cy: 195,
      anchor: 'middle',
      textX: 270,
      startY: 181, // Above node circle within [223, 317]
    },
    'lic-basement-hum-v4': {
      cx: 150,
      cy: 150,
      anchor: 'middle',
      textX: 150,
      startY: 166,
    },
  };

  const EXACT_EDGE_POSITIONS: Record<string, { x: number; y: number }> = {
    'e-rel-current-cut': { x: 149, y: 62 },
    'CURRENT_CUT': { x: 149, y: 62 },
    'e-lic-bh-covers': { x: 125, y: 215 },
    'e-lic-nd-covers': { x: 300, y: 198 },
    'e-lic-bh-valid-v3': { x: 135, y: 250 },
    'e-lic-nd-valid-v4': { x: 214, y: 165 },
    'e-v4-uses-basement-hum': { x: 116, y: 132 },
    'e-v4-uses-night-drive': { x: 219, y: 135 },
    'e-v4-listed-in': { x: 181, y: 98 },
    'e-lic-bh-evidence': { x: 168, y: 235 },
    'e-lic-nd-evidence': { x: 290, y: 218 },
  };

  // Isometric 3D Projection coordinates for graph nodes
  // Tiered topological and radial distribution avoiding Sun at (326, 58) and eliminating label collisions
  const getNodeLayout = (index: number, total: number, node?: GraphNode): NodeLayout => {
    if (total === 0) {
      return { cx: 200, cy: 150, anchor: 'middle', textX: 200, startY: 136 };
    }

    if (node) {
      const id = node.id.toLowerCase();
      const kind = (node.kind || '').toLowerCase();
      const label = (node.label || '').toLowerCase();

      // Explicit dictionary lookup first
      const exactMatch = EXACT_NODE_LAYOUTS[id];
      if (exactMatch) {
        return exactMatch;
      }

      // Match lic-* rules FIRST before track names to avoid substring collision
      if (id.startsWith('lic-') || kind === 'license') {
        if (id.includes('night') || label.includes('night drive')) {
          return EXACT_NODE_LAYOUTS['lic-night-drive-v4']!;
        }
        return EXACT_NODE_LAYOUTS['lic-basement-hum-v3']!;
      }

      if (id.startsWith('rel-') || kind === 'release') {
        return EXACT_NODE_LAYOUTS['rel-wad']!;
      }
      if (id === 'cut-wad-v4' || (kind === 'cut' && label.includes('v4'))) {
        return EXACT_NODE_LAYOUTS['cut-wad-v4']!;
      }
      if (id === 'cut-wad-v3' || (kind === 'cut' && label.includes('v3'))) {
        return EXACT_NODE_LAYOUTS['cut-wad-v3']!;
      }
      if (id.includes('cue') || label.includes('cue')) {
        return EXACT_NODE_LAYOUTS['src-cue-v4']!;
      }
      if (id.includes('mail') || id.includes('src-lic') || kind === 'source') {
        return id.includes('night') ? EXACT_NODE_LAYOUTS['src-lic-night-drive']! : EXACT_NODE_LAYOUTS['src-mail-basement-hum']!;
      }
      if (id.includes('night-drive') || label.includes('night drive')) {
        return EXACT_NODE_LAYOUTS['trk-night-drive']!;
      }
      if (id.includes('basement-hum') || label.includes('basement hum')) {
        return EXACT_NODE_LAYOUTS['trk-basement-hum']!;
      }
    }

    // Dynamic distributed layout for arbitrary or test nodes
    const angleStep = (2 * Math.PI) / Math.max(total, 1);
    const startAngle = Math.PI * 0.75;
    const angle = startAngle + index * angleStep;
    const rx = 132;
    const ry = 88;
    const cx = Math.round(200 + rx * Math.cos(angle));
    const cy = Math.round(150 + ry * Math.sin(angle));
    const anchor: 'start' | 'middle' | 'end' = cx < 160 ? 'end' : cx > 240 ? 'start' : 'middle';
    const textX = anchor === 'end' ? cx - 12 : anchor === 'start' ? cx + 12 : cx;
    const startY = cy < 100 ? cy - 14 : cy > 200 ? cy + 18 : cy;
    return { cx, cy, anchor, textX, startY };
  };

  const nodePosMap = new Map<string, { cx: number; cy: number }>();
  const nodeLayoutMap = new Map<string, NodeLayout>();
  nodes.forEach((node, i) => {
    const layout = getNodeLayout(i, nodes.length, node);
    nodeLayoutMap.set(node.id, layout);
    nodePosMap.set(node.id, { cx: layout.cx, cy: layout.cy });
  });

  // Split long labels (e.g. "Basement Hum festival clearance (email)") into clean multi-line segments
  const formatNodeLabel = (label: string): string[] => {
    if (label.length <= 16) return [label];
    const words = label.split(' ');
    if (words.length <= 1) return [label];
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  };

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

              const exact = EXACT_EDGE_POSITIONS[edge.id] || EXACT_EDGE_POSITIONS[edge.type];
              let labelX = exact?.x;
              let labelY = exact?.y;

              if (labelX === undefined || labelY === undefined) {
                const dx = toPos.cx - fromPos.cx;
                const dy = toPos.cy - fromPos.cy;
                const dist = Math.hypot(dx, dy) || 1;
                const nx = -dy / dist;
                const ny = dx / dist;

                // True midpoint between nodes, offset perpendicularly to avoid line & stay far from node circles
                const perp = (edgeIndex % 2 === 0 ? 10 : -10);
                labelX = (fromPos.cx + toPos.cx) / 2 + nx * perp;
                labelY = (fromPos.cy + toPos.cy) / 2 + ny * perp + 3;
              }

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
                  {/* Directional edge type label at midpoint with dark halo */}
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    fill="#FF8A80"
                    fontSize="8"
                    fontWeight="600"
                    paintOrder="stroke"
                    stroke="#060911"
                    strokeWidth="3.5"
                    strokeLinejoin="round"
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
              const layout = nodeLayoutMap.get(node.id) || { cx: 200, cy: 150, anchor: 'middle', textX: 200, startY: 136 };
              const pos = { cx: layout.cx, cy: layout.cy };
              const isSelected = data.selectedNodeId === node.id;
              const lines = formatNodeLabel(node.label);
              const anchor = layout.anchor;
              const textX = layout.textX;
              const startY = layout.startY;

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
                  {/* Non-overlapping multi-line label with high-contrast halo */}
                  <text
                    x={textX}
                    y={startY}
                    textAnchor={anchor}
                    fill="#FFFFFF"
                    fontSize="9.5"
                    fontWeight={isSelected ? 'bold' : 'normal'}
                    paintOrder="stroke"
                    stroke="#060911"
                    strokeWidth="3.5"
                    strokeLinejoin="round"
                    className="node-svg-label"
                  >
                    {lines.map((line, lIdx) => (
                      <tspan
                        key={lIdx}
                        x={textX}
                        dy={lIdx === 0 ? 0 : 11}
                      >
                        {line}
                      </tspan>
                    ))}
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
