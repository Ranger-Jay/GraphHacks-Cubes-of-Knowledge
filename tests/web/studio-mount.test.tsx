import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnalysisResponse, GraphStatusResponse, ScenePhase } from '@cubes/contracts';
import { Shell } from '../../apps/web/src/App';
import { StudioPanel, POOL_WAITING_COPY } from '../../apps/web/src/studio/StudioPanel';
import { ACCESS_COPY, READY_REQUIRED_COPY } from '../../apps/web/src/studio/studioGuard';
import { IdeaStudioController } from '../../apps/web/src/studio/studioController';
import { makeStudio, openIdea, ready, settleAll } from './studio-harness';
import { UNCERTAIN_COPY } from '../../apps/web/src/studio/ideaImport';

const route = { name: 'release', releaseId: 'rel-wad' } as const;
const healthy: { state: 'done'; result: { kind: 'ok'; httpStatus: 200; data: GraphStatusResponse } } = { state: 'done', result: { kind: 'ok', httpStatus: 200, data: { status: 'AVAILABLE', ready: true, requestId: 'r' } as GraphStatusResponse } };
const available = { kind: 'ok', httpStatus: 200, data: { status: 'AVAILABLE', requestId: 'r', revision: 'v1', clearance: 'GAP', evidence: [], nodes: [], edges: [], sources: [], proposedActions: [] } as unknown as AnalysisResponse } as const;
const shell = (studio?: Parameters<typeof Shell>[0]['studio'], analysis: Parameters<typeof Shell>[0]['analysis'] = available, graph: Parameters<typeof Shell>[0]['graph'] = healthy) =>
  renderToStaticMarkup(<Shell route={route} health={{ state: 'loading' }} graph={graph} analysis={analysis} Scene={null} reducedMotion={false} selected={null} onSelect={() => {}} {...(studio ? { studio } : {})} />);
const cards = (html: string) => (html.match(/data-testid="idea-card"/g) ?? []).length;
const panel = (c: IdeaStudioController, phase: ScenePhase | null, access?: 'OWNER') => renderToStaticMarkup(<StudioPanel controller={c} phase={phase} {...(access ? { access } : {})} />);

test('production default: no studio binding means no panel, no card, no import surface at all', () => {
  const html = shell();
  assert.ok(!html.includes('studio-panel') && !html.includes('idea-card') && !html.includes('IdeaVerse ideas'));
  assert.ok(html.includes('data-phase="READY"'), 'the rest of the shell is unchanged');
});

test('mount behind the READY guard: unready phases and the first (effect-less) render show no pool and no card', async () => {
  const { ctl } = makeStudio();
  const first = shell({ controller: ctl, access: 'OWNER' });
  assert.ok(first.includes('data-studio-ready="false"') && first.includes(POOL_WAITING_COPY), 'READY props alone are not enough: the controller has not reported READY yet');
  assert.equal(cards(first), 0);
  const down = shell({ controller: ctl, access: 'OWNER' }, { kind: 'unavailable', httpStatus: 503, data: { status: 'UNAVAILABLE', reason: 'CONNECTION_FAILED', requestId: 'r', evidence: [], nodes: [], edges: [], sources: [], proposedActions: [] } as unknown as AnalysisResponse });
  assert.ok(down.includes('data-phase="GRAPH_UNAVAILABLE"') && down.includes('data-studio-ready="false"'));
  assert.ok(!down.includes('idea-pool-item') && cards(down) === 0);
});

test('ready + owner: pool list and exactly ONE card; Add enabled only with owner access', async () => {
  const { ctl } = makeStudio();
  await ready(ctl, 'OWNER'); await openIdea(ctl, 'idea-001');
  const html = panel(ctl, 'READY', 'OWNER');
  assert.ok(html.includes('data-studio-ready="true"') && html.includes('idea-001.txt') && html.includes('idea-002.txt'));
  assert.equal(cards(html), 1, 'one card only');
  assert.match(html, /<button[^>]*class="idea-card-add"(?![^>]*disabled)[^>]*>/);
  assert.ok(html.includes('A fictional proposal for idea-001.'), 'verified text from the detail read');
  const reader = renderToStaticMarkup(<StudioPanel controller={ctl} phase="READY" access="UNKNOWN" />);
  ctl.setAccess('READER'); const rd = panel(ctl, 'READY');
  assert.match(rd, /<button[^>]*class="idea-card-add"[^>]*disabled/);
  assert.ok(rd.includes(ACCESS_COPY.READER));
  void reader;
});

test('a stale READY controller cannot enable Add when THIS render\'s phase is not READY (one-render lag fails closed)', async () => {
  const { ctl } = makeStudio();
  await ready(ctl, 'OWNER'); await openIdea(ctl, 'idea-001');
  for (const phase of ['CHECKING', 'GRAPH_UNAVAILABLE', 'ACCESS_DENIED', 'UNAVAILABLE', 'NOT_FOUND', null] as const) {
    const html = panel(ctl, phase);
    assert.ok(html.includes('data-studio-ready="false"'), String(phase));
    assert.ok(!html.includes('idea-pool-item'), `${phase}: pool hidden`);
    if (cards(html)) {
      assert.match(html, /<button[^>]*class="idea-card-add"[^>]*disabled/, String(phase));
      assert.ok(html.includes(READY_REQUIRED_COPY), String(phase));
    }
  }
});

test('unconfirmed card: the ruled sentence, read-only Re-check and same-tuple Retry are shown; never "Nothing was saved"', async () => {
  const { ctl, server } = makeStudio();
  await ready(ctl, 'OWNER'); await openIdea(ctl, 'idea-001');
  server.dropReplyOnce = true; ctl.add(); await settleAll();
  const html = panel(ctl, 'READY');
  for (const t of [UNCERTAIN_COPY, 'Re-check', 'Retry Add to cube', 'data-import-phase="error"']) assert.ok(html.includes(t), t);
  assert.doesNotMatch(html, /nothing was saved|disconnected|reconnect/i);
  // The write really committed, so the fresh pool no longer lists the idea: nothing can be resubmitted from a second card.
  ctl.close(); await openIdea(ctl, 'idea-001');
  const reopened = panel(ctl, 'READY');
  assert.equal(cards(reopened), 0);
  assert.ok(!reopened.includes('idea-001.txt'));
});
