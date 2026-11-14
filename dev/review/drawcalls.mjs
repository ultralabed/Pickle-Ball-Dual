import { launch, sleep } from '../playtest/lib.mjs';
const t = await launch({ width: 1440, height: 900, log: false });
const r = await t.page.evaluate(async () => {
  const g = __game; g.startMatch({ mode: 'doubles', scoring: 'sideout', opp: 4, mate: 4, handed: 'R', quality: 'high', seed: 2, autoplay: true });
  g.setRender(false); g.advance(3); g.setRender(true);
  await new Promise((r) => setTimeout(r, 500));
  const i = g.view.renderer.info; i.autoReset = true;
  g.view.render();
  const casters = []; g.view.scene.traverse((o) => { if (o.isMesh && o.castShadow && o.visible) casters.push(o); });
  return { calls: i.render.calls, tris: i.render.triangles, programs: i.programs.length, shadowCasters: casters.length, pr: g.view.renderer.getPixelRatio() };
});
console.log(JSON.stringify(r)); await t.close();
