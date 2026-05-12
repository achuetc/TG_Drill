<script>
  import { onMount, onDestroy } from 'svelte';
  import { Application, Graphics, Container, TilingSprite, RenderTexture } from 'pixi.js';
  import { currentLayer, isDrilling, activeEffects, activeIncident, currentDepth, boreholeLayers, deployStatus } from './stores.js';

  export let drillType = 'auger';

  let cachedDrilling = false;
  let cachedEffects  = { nitrogen: false, paste: false, obolon: false };
  let cachedIncident = null;
  let cachedDepth    = 0;
  let cachedDeploy   = 0;
  let cachedLayers   = [];

  let _needsLayerRebuild = false;
  let _buildLayersStr = "";

  const unsubs = [
    isDrilling    .subscribe(v => { cachedDrilling = v; }),
    activeEffects .subscribe(v => { cachedEffects  = v; }),
    activeIncident.subscribe(v => { cachedIncident = v; }),
    currentDepth  .subscribe(v => { cachedDepth    = v; }),
    deployStatus  .subscribe(v => { cachedDeploy   = v; }),
    boreholeLayers.subscribe(v => { 
      cachedLayers = v || []; 
      const newStr = JSON.stringify(cachedLayers);
      if (newStr !== _buildLayersStr) {
        _buildLayersStr = newStr;
        _needsLayerRebuild = true;
      }
    }),
  ];

  const SOIL_BASE = { fine_sand: 0x1a1400, soft_loam: 0x120c04, frozen_sand: 0x040c14, granite: 0x0c0c10 };
  const SOIL_PARTICLE = { fine_sand: 0x8a6a20, soft_loam: 0x6b4820, frozen_sand: 0x2a5878, granite: 0x3a3a48 };
  const TILE_SIZE = { fine_sand: 20, soft_loam: 16, frozen_sand: 24, granite: 20 };

  const PPM = 35; // Пикселей на метр глубины

  let hostEl, canvasEl, app, ro;
  let camera;
  let cameraScale = 1.0;
  let camPivotY = 0;

  let gSky, gSurface, gRig, gTruck, gMast;
  let layersContainer, layerSprites = [];
  let drillContainer, gShaft, gTip;
  let gParticles, gEffectGlow;

  let rigX = -200;
  let mastAngle = Math.PI / 2;

  let textures = {};
  const particles = [];
  const MAX_P = 45;

  onMount(async () => {
    const { clientWidth: W, clientHeight: H } = hostEl;
    app = new Application();
    await app.init({ canvas: canvasEl, width: W, height: H, backgroundColor: 0x06080c, antialias: false, resolution: window.devicePixelRatio || 1 });

    textures = {
      fine_sand:   genTex(drawSand, TILE_SIZE.fine_sand),
      soft_loam:   genTex(drawLoam, TILE_SIZE.soft_loam),
      frozen_sand: genTex(drawFrozen, TILE_SIZE.frozen_sand),
      granite:     genTex(drawGranite, TILE_SIZE.granite),
    };

    camera = new Container();
    app.stage.addChild(camera);

    gSky = new Graphics(); camera.addChild(gSky);
    gSurface = new Graphics(); camera.addChild(gSurface);
    
    layersContainer = new Container(); camera.addChild(layersContainer);

    gRig = new Container();
    gTruck = new Graphics(); gRig.addChild(gTruck);
    gMast = new Graphics(); gRig.addChild(gMast);
    camera.addChild(gRig);

    drillContainer = new Container();
    gShaft = new Graphics(); drillContainer.addChild(gShaft);
    gTip = new Graphics(); drillContainer.addChild(gTip);
    camera.addChild(drillContainer);

    gParticles = new Container(); camera.addChild(gParticles);
    gEffectGlow = new Graphics(); camera.addChild(gEffectGlow);

    _buildStatic();
    app.ticker.add(onTick);

    ro = new ResizeObserver(() => {
      const { clientWidth: rW, clientHeight: rH } = hostEl;
      app.renderer.resize(rW, rH);
    });
    ro.observe(hostEl);
  });

  onDestroy(() => {
    ro?.disconnect(); unsubs.forEach(u => u());
    Object.values(textures).forEach(t => t.destroy(true));
    app?.destroy(false, { children: true });
  });

  function genTex(drawFn, size) {
    const g = new Graphics(); drawFn(g, size);
    const rt = RenderTexture.create({ width: size, height: size });
    app.renderer.render({ container: g, target: rt });
    g.destroy();
    return rt;
  }

  function drawSand(g, size) { g.rect(0,0,size,size).fill(SOIL_BASE.fine_sand); const dots = [[3,5],[11,2],[7,14],[15,8],[2,16],[17,12],[9,18],[13,6],[5,10],[18,3],[1,7],[14,17],[8,1],[16,15],[4,12]]; for (const [x, y] of dots) g.circle(x, y, 1.2).fill({ color: 0xc09030, alpha: 0.75 }); }
  function drawLoam(g, size) { g.rect(0,0,size,size).fill(SOIL_BASE.soft_loam); for (let i = -size; i <= size * 2; i += 10) g.moveTo(i, 0).lineTo(i + size, size).stroke({ color: 0x8a6040, width: 1, alpha: 0.75 }); }
  function drawGranite(g, size) { g.rect(0,0,size,size).fill(SOIL_BASE.granite); for (let i = -size; i <= size * 2; i += 10) { g.moveTo(i, 0).lineTo(i + size, size).stroke({ color: 0x525265, width: 1, alpha: 0.65 }); g.moveTo(size - i, 0).lineTo(-i, size).stroke({ color: 0x404055, width: 1, alpha: 0.45 }); } }
  function drawFrozen(g, size) { g.rect(0,0,size,size).fill(SOIL_BASE.frozen_sand); const dots = [[3,6],[14,3],[7,15],[20,9],[2,20],[16,14],[9,21],[22,2],[5,11],[18,18],[11,8]]; for (const [x, y] of dots) g.circle(x, y, 1.2).fill({ color: 0x5590bb, alpha: 0.6 }); const cx=12, cy=12, arm=5; g.moveTo(cx-arm, cy).lineTo(cx+arm, cy).stroke({ color: 0x44bbee, width: 1.5, alpha: 0.8 }); g.moveTo(cx, cy-arm).lineTo(cx, cy+arm).stroke({ color: 0x44bbee, width: 1.5, alpha: 0.8 }); }

  function _buildStatic() {
    gSky.clear().rect(-2000, -2000, 4000, 2000).fill(0x0a0f16);
    gSurface.clear().moveTo(-2000, 0).lineTo(2000, 0).stroke({color: 0x3b3024, width: 6}).moveTo(-2000, -3).lineTo(2000, -3).stroke({color: 0x556050, width: 3});
    gTruck.clear().rect(-45, -30, 90, 30).fill(0x3a453a).rect(25, -45, 20, 15).fill(0x2a352a).circle(-25, 0, 10).fill(0x111).stroke({color: 0x333, width: 2}).circle(25, 0, 10).fill(0x111).stroke({color: 0x333, width: 2});
    gMast.clear().rect(-5, -140, 10, 140).fill(0x5a5a6a).moveTo(-5, -120).lineTo(5, -130).stroke({color: 0x3a3a4a, width: 2}).moveTo(5, -100).lineTo(-5, -110).stroke({color: 0x3a3a4a, width: 2});
    gMast.x = -20; gMast.y = -30;
  }

  function _rebuildLayers() {
    layersContainer.removeChildren();
    layerSprites = [];
    cachedLayers.forEach(l => {
      const y = l.from * PPM;
      const h = (l.to - l.from) * PPM;
      
      const spRev = new TilingSprite({ texture: textures[l.soilId] || textures.granite, width: 4000, height: h });
      spRev.x = -2000; spRev.y = y;
      
      const spHid = new Graphics().rect(-2000, y, 4000, h).fill(0x5a5a6a);
      const border = new Graphics().moveTo(-2000, y).lineTo(2000, y).stroke({color: 0x000000, width: 4, alpha: 0.4});

      layersContainer.addChild(spRev);
      layersContainer.addChild(spHid);
      layersContainer.addChild(border);
      layerSprites.push({ l, spRev, spHid });
    });
    _needsLayerRebuild = false;
  }

  function onTick({ deltaMS }) {
    const dt = Math.min(deltaMS / 1000, 0.05);
    const W = app.renderer.width, H = app.renderer.height;
    if (_needsLayerRebuild) _rebuildLayers();

    // БРОНЯ ОТ ЧЕРНОГО ЭКРАНА! Защита целевой координаты от NaN
    let targetY = cachedDepth * PPM;
    if (isNaN(targetY)) targetY = 0;

    let currentSoil = 'granite';
    layerSprites.forEach(item => {
      const revealed = cachedDepth >= item.l.from;
      item.spRev.visible = revealed;
      item.spHid.visible = !revealed;
      if (cachedDepth >= item.l.from && cachedDepth <= item.l.to) currentSoil = item.l.soilId;
    });

    if (cachedDeploy === 1) {
      rigX += 200 * dt;
      if (rigX >= 0) {
        rigX = 0;
        mastAngle -= 2 * dt;
        if (mastAngle <= 0) { mastAngle = 0; deployStatus.set(2); }
      }
      gRig.x = rigX; gMast.rotation = mastAngle; drillContainer.visible = false;
    } else if (cachedDeploy === 2) {
      gRig.x = 0; gMast.rotation = 0; drillContainer.visible = true;
    } else {
      rigX = -200; mastAngle = Math.PI / 2; gRig.x = rigX; gMast.rotation = mastAngle; drillContainer.visible = false;
    }

    // ИСПРАВЛЕННАЯ ОТРИСОВКА БУРА (С ТРУБОЙ)
    const bodyW = 20, TIP_H = 20;
    if (drillContainer.visible) {
      gShaft.clear();
      // Рисуем колонну от верха мачты (y = -130) до самого забоя (targetY)
      gShaft.rect(-6, -130, 12, targetY + 130).fill(0x1a1a24);
      for (let y = -120; y < targetY; y += 40) gShaft.rect(-9, y, 18, 4).fill(0x111118);

      gTip.clear().rect(-bodyW/2, targetY - 10, bodyW, 10).fill(0x2a2a38)
          .moveTo(-bodyW/2, targetY).lineTo(bodyW/2, targetY).lineTo(0, targetY + TIP_H).fill(0xdd9900);
    }

    const isJam = cachedIncident?.type === 'jam';
    let dx = 0, dy = 0;
    if (cachedDrilling) {
      dx = (Math.random() - 0.5) * (isJam ? 12 : 3);
      dy = (Math.random() - 0.5) * (isJam ? 12 : 3);
    }
    drillContainer.x = dx;
    drillContainer.y = dy;

    let zoomTarget = 1.0;
    let pivotYTarget = 0;
    
    if (cachedDeploy === 2) {
      zoomTarget = 1.6;
      pivotYTarget = targetY + (H * 0.2) / zoomTarget;
    } else if (cachedDeploy === 1) {
      zoomTarget = 1.2;
      pivotYTarget = 0;
    }

    cameraScale += (zoomTarget - cameraScale) * dt * 3;
    camPivotY += (pivotYTarget - camPivotY) * dt * 4;

    camera.scale.set(cameraScale);
    camera.pivot.set(0, camPivotY);
    camera.x = W / 2;
    camera.y = H * 0.35;

    if (cachedDrilling && particles.length < MAX_P) {
      const n = Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < n; i++) spawnParticle(SOIL_PARTICLE[currentSoil] || 0x3a3a48, targetY + TIP_H);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt * 1.6; p.vy += 220 * dt; p.gfx.x += p.vx * dt; p.gfx.y += p.vy * dt;
      p.gfx.alpha = Math.max(0, p.life);
      if (p.life <= 0) { gParticles.removeChild(p.gfx); p.gfx.destroy(); particles.splice(i, 1); }
    }

    if (gEffectGlow) {
      gEffectGlow.clear();
      const gy = targetY + TIP_H;
      if (cachedEffects.paste) { gEffectGlow.circle(0, gy, 50).fill({ color: 0x00ccdd, alpha: 0.1 }); }
      if (cachedEffects.obolon) { gEffectGlow.circle(0, gy, 55).fill({ color: 0xbb1100, alpha: 0.1 }); }
      if (cachedIncident?.type === 'jam') { gEffectGlow.circle(0, gy, 60).fill({ color: 0xff0000, alpha: 0.15 }); }
      if (cachedIncident?.type === 'water') { gEffectGlow.circle(0, gy, 60).fill({ color: 0x0055ff, alpha: 0.15 }); }
    }
  }

  function spawnParticle(color, yPos) {
    const size = 3 + Math.random() * 4;
    const gfx = new Graphics().rect(-size/2, -size/2, size, size).fill(color);
    gfx.x = (Math.random() - 0.5) * 20;
    gfx.y = yPos;
    gParticles.addChild(gfx);
    particles.push({ gfx, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 60, life: 0.5 + Math.random() * 0.5 });
  }
</script>

<div class="host" bind:this={hostEl}>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .host { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  canvas { display: block; width: 100%; height: 100%; }
</style>