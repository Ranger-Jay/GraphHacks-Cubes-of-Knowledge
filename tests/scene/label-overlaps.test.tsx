import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SceneData } from '@cubes/contracts';
import { CompanyCube } from '../../apps/web/src/scene/CompanyCube';

interface BoundingBox {
  id: string;
  type: 'node-label' | 'edge-label' | 'node-circle';
  text?: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxY <= b.minY || a.minY >= b.maxY);
}

// Canonical full evidence graph fixture (READY state)
const readyFullData: SceneData = {
  status: 'AVAILABLE',
  selectedNodeId: null,
  nodes: [
    { id: 'rel-wad', label: 'WAD', kind: 'Release', sourceRefIds: [] },
    { id: 'cut-wad-v4', label: 'Cut v4 (current distribution cut)', kind: 'Cut', sourceRefIds: [] },
    { id: 'src-cue-v4', label: 'Cue sheet', kind: 'Source', sourceRefIds: [] },
    { id: 'trk-basement-hum', label: 'Basement Hum', kind: 'Track', sourceRefIds: [] },
    { id: 'trk-night-drive', label: 'Night Drive', kind: 'Track', sourceRefIds: [] },
    { id: 'cut-wad-v3', label: 'Cut v3 (festival screener)', kind: 'Cut', sourceRefIds: [] },
    { id: 'lic-basement-hum-v3', label: 'Basement Hum festival clearance (email)', kind: 'License', sourceRefIds: [] },
    { id: 'src-mail-basement-hum', label: 'License evidence', kind: 'Source', sourceRefIds: [] },
    { id: 'lic-night-drive-v4', label: 'Night Drive sync license', kind: 'License', sourceRefIds: [] },
    { id: 'src-lic-night-drive', label: 'License evidence', kind: 'Source', sourceRefIds: [] },
  ],
  edges: [
    { id: 'e-rel-current-cut', from: 'rel-wad', to: 'cut-wad-v4', type: 'CURRENT_CUT', sourceRefIds: [] },
    { id: 'e-v4-listed-in', from: 'cut-wad-v4', to: 'src-cue-v4', type: 'LISTED_IN', sourceRefIds: [] },
    { id: 'e-v4-uses-basement-hum', from: 'cut-wad-v4', to: 'trk-basement-hum', type: 'USES_TRACK', sourceRefIds: [] },
    { id: 'e-v4-uses-night-drive', from: 'cut-wad-v4', to: 'trk-night-drive', type: 'USES_TRACK', sourceRefIds: [] },
    { id: 'e-lic-bh-covers', from: 'lic-basement-hum-v3', to: 'trk-basement-hum', type: 'COVERS', sourceRefIds: [] },
    { id: 'e-lic-bh-valid-v3', from: 'lic-basement-hum-v3', to: 'cut-wad-v3', type: 'VALID_FOR', sourceRefIds: [] },
    { id: 'e-lic-bh-evidence', from: 'lic-basement-hum-v3', to: 'src-mail-basement-hum', type: 'EVIDENCED_BY', sourceRefIds: [] },
    { id: 'e-lic-nd-covers', from: 'lic-night-drive-v4', to: 'trk-night-drive', type: 'COVERS', sourceRefIds: [] },
    { id: 'e-lic-nd-valid-v4', from: 'lic-night-drive-v4', to: 'cut-wad-v4', type: 'VALID_FOR', sourceRefIds: [] },
    { id: 'e-lic-nd-evidence', from: 'lic-night-drive-v4', to: 'src-lic-night-drive', type: 'EVIDENCED_BY', sourceRefIds: [] },
  ],
};

function extractBoundingBoxes(html: string, scaleX = 1, scaleY = 1): BoundingBox[] {
  const boxes: BoundingBox[] = [];

  // Extract node circles (r=8, with halo=12)
  const nodeCircleRegex = /<g[^>]*aria-label="([^"]+)"[^>]*>[\s\S]*?<circle cx="([^"]+)" cy="([^"]+)" r="8"/g;
  let match: RegExpExecArray | null;
  while ((match = nodeCircleRegex.exec(html)) !== null) {
    const label = match[1];
    const cx = parseFloat(match[2]) * scaleX;
    const cy = parseFloat(match[3]) * scaleY;
    boxes.push({
      id: `circle-${label}`,
      type: 'node-circle',
      text: label,
      minX: cx - 8 * scaleX,
      maxX: cx + 8 * scaleX,
      minY: cy - 8 * scaleY,
      maxY: cy + 8 * scaleY,
    });
  }

  // Extract node labels (<text ... className="node-svg-label"> ... </text>)
  const nodeLabelRegex = /<text x="([^"]+)" y="([^"]+)" text-anchor="([^"]+)"[^>]*class="node-svg-label">([\s\S]*?)<\/text>/g;
  while ((match = nodeLabelRegex.exec(html)) !== null) {
    const textX = parseFloat(match[1]) * scaleX;
    const startY = parseFloat(match[2]) * scaleY;
    const anchor = match[3];
    const tspansContent = match[4];

    const lines: string[] = [];
    const tspanRegex = /<tspan[^>]*>([^<]+)<\/tspan>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tspanRegex.exec(tspansContent)) !== null) {
      lines.push(tMatch[1]);
    }
    const fullText = lines.join(' ');
    const maxLineLen = Math.max(...lines.map(l => l.length), 1);
    const approxWidth = maxLineLen * 5.8 * scaleX;
    const approxHeight = (lines.length * 11) * scaleY;

    let minX = textX;
    let maxX = textX + approxWidth;
    if (anchor === 'middle') {
      minX = textX - approxWidth / 2;
      maxX = textX + approxWidth / 2;
    } else if (anchor === 'end') {
      minX = textX - approxWidth;
      maxX = textX;
    }

    boxes.push({
      id: `node-label-${fullText.slice(0, 15)}`,
      type: 'node-label',
      text: fullText,
      minX,
      maxX,
      minY: startY - 8 * scaleY,
      maxY: startY + approxHeight - 8 * scaleY,
    });
  }

  // Extract edge labels (<text ... className="edge-type-label">TYPE</text>)
  const edgeLabelRegex = /<text x="([^"]+)" y="([^"]+)" text-anchor="middle"[^>]*class="edge-type-label">([^<]+)<\/text>/g;
  while ((match = edgeLabelRegex.exec(html)) !== null) {
    const x = parseFloat(match[1]) * scaleX;
    const y = parseFloat(match[2]) * scaleY;
    const edgeType = match[3];
    const width = edgeType.length * 5.5 * scaleX;
    const height = 9 * scaleY;

    boxes.push({
      id: `edge-label-${edgeType}-${x}-${y}`,
      type: 'edge-label',
      text: edgeType,
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: y - 7 * scaleY,
      maxY: y + height - 7 * scaleY,
    });
  }

  return boxes;
}

test('CompanyCube Label Overlaps: zero overlapping label pairs in READY', () => {
  const html = renderToStaticMarkup(
    <CompanyCube data={readyFullData} runtime={{ phase: 'READY' } as any} />
  );

  const boxes = extractBoundingBoxes(html);
  assert.ok(boxes.length > 0, 'Must extract rendered boxes');

  // Find specific key elements
  const currentCut = boxes.find(b => b.type === 'edge-label' && b.text === 'CURRENT_CUT');
  const wad = boxes.find(b => b.type === 'node-label' && b.text === 'WAD');
  const cutV4 = boxes.find(b => b.type === 'node-label' && b.text?.includes('Cut v4'));
  const basementFestival = boxes.find(b => b.type === 'node-label' && b.text?.includes('Basement Hum festival'));
  const coversEdges = boxes.filter(b => b.type === 'edge-label' && b.text === 'COVERS');
  const circles = boxes.filter(b => b.type === 'node-circle');

  // Verification 1: "Basement Hum festival clearance (email)" is NOT cut off at the left edge
  assert.ok(basementFestival, 'Basement Hum festival label must exist');
  assert.ok(basementFestival.minX >= 0, `Basement Hum label minX must be >= 0 (got ${basementFestival.minX})`);

  // Verification 2: CURRENT_CUT is not hidden under WAD or Cut v4
  assert.ok(currentCut, 'CURRENT_CUT edge label must exist');
  assert.ok(wad, 'WAD node label must exist');
  assert.ok(cutV4, 'Cut v4 node label must exist');
  assert.equal(boxesOverlap(currentCut, wad), false, 'CURRENT_CUT must not overlap WAD label');
  assert.equal(boxesOverlap(currentCut, cutV4), false, 'CURRENT_CUT must not overlap Cut v4 label');

  // Verification 3: COVERS labels do not sit on node circles
  assert.ok(coversEdges.length > 0, 'COVERS labels must exist');
  for (const covers of coversEdges) {
    for (const circle of circles) {
      assert.equal(
        boxesOverlap(covers, circle),
        false,
        `COVERS label at (${covers.minX}, ${covers.minY}) must not sit on node circle ${circle.text}`
      );
    }
  }

  // Verification 4: Zero overlapping label pairs between all text labels (node-node, node-edge, edge-edge)
  const textLabels = boxes.filter(b => b.type === 'node-label' || b.type === 'edge-label');
  const overlappingPairs: string[] = [];

  for (let i = 0; i < textLabels.length; i++) {
    for (let j = i + 1; j < textLabels.length; j++) {
      if (boxesOverlap(textLabels[i], textLabels[j])) {
        overlappingPairs.push(`"${textLabels[i].text}" overlaps with "${textLabels[j].text}"`);
      }
    }
  }

  assert.deepEqual(
    overlappingPairs,
    [],
    `Expected zero overlapping label pairs in READY, found: ${overlappingPairs.join('; ')}`
  );
});

test('CompanyCube Label Overlaps: zero overlapping label pairs at 1920x1080 and 1280x800', () => {
  const html = renderToStaticMarkup(
    <CompanyCube data={readyFullData} runtime={{ phase: 'READY' } as any} />
  );

  const resolutions = [
    { name: '1920x1080', scaleX: 1920 / 400, scaleY: 1080 / 300 },
    { name: '1280x800', scaleX: 1280 / 400, scaleY: 800 / 300 },
  ];

  for (const res of resolutions) {
    const boxes = extractBoundingBoxes(html, res.scaleX, res.scaleY);
    const textLabels = boxes.filter(b => b.type === 'node-label' || b.type === 'edge-label');
    const overlappingPairs: string[] = [];

    for (let i = 0; i < textLabels.length; i++) {
      for (let j = i + 1; j < textLabels.length; j++) {
        if (boxesOverlap(textLabels[i], textLabels[j])) {
          overlappingPairs.push(`[${res.name}] "${textLabels[i].text}" overlaps with "${textLabels[j].text}"`);
        }
      }
    }

    assert.deepEqual(
      overlappingPairs,
      [],
      `Expected zero overlapping label pairs at ${res.name}, found: ${overlappingPairs.join('; ')}`
    );
  }
});
