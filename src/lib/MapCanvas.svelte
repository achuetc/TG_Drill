<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { Application, Graphics, Container, Text, TextStyle, RenderTexture, Sprite, BlurFilter } from 'pixi.js';
  import {
    regions, generateBorehole, revealedHexes, revealHexesAround, loadGameState,
    movementPoints, playerPosition,
    completedContracts, failedContracts, poiList, drillHealth,
    currentDay, rollGacha, playerInventory, playerMoney,
    triggerRandomEvent, pendingEvent, maintainContracts, playerLevel,
    playerVehicleId, vehicleData, maxMovementPoints
  } from './stores.js';
 
  const dispatch = createEventDispatcher();
  export let autoMove = false; 

  const WORLD_COLS   = 22;
  const WORLD_ROWS   = 30;
  const NORTH_ROWS   = 11; 

  let currentVeh = 'zil';
  playerVehicleId.subscribe(v => currentVeh = v);

  const FACILITY_NAMES = ['НИИ ЧАВО', 'Метеостанция №7', 'База «Арктика-3»', 'Дачный посёлок «Мечта»', 'Пост ГПН Г-17', 'Совхоз «Светлый путь»', 'Объект 113-Б', 'Деревня Ижма', 'Нефтебаза «Полярная»', 'Аэропорт «Чумикан»', 'Вахтовый посёлок 44А', 'Радиостанция «Сигнал-3»', 'Шахта «Коксовая-2»', 'КБ «Южмаш»', 'Вышка РТВ K-09', 'Карьер «Октябрьский»'];
  
  // КЛЮЧ ИЗМЕНЕН, ЧТОБЫ СБРОСИТЬ СТАРЫЕ КОНТРАКТЫ В ВОДЕ
  const CONTRACT_SAVE_KEY = 'drill_contracts_v2'; 
  let storedContracts = null;

  function generateContracts() {
    if (storedContracts) return storedContracts;
    try { const raw = localStorage.getItem(CONTRACT_SAVE_KEY); if (raw) { storedContracts = JSON.parse(raw); return storedContracts; } } catch {}
    
    const pool = [...FACILITY_NAMES].sort(() => Math.random() - 0.5);
    const contracts = [];
    const TOTAL = 8; // Создаем сразу 8 контрактов на старте
    
    for (let i = 0; i < TOTAL; i++) {
      const regionId = i < 3 ? 'north' : 'central';
      const targetDepth = Math.round(regions[regionId].depthRange[0] + Math.random() * 50);
      contracts.push({ id: i, name: pool[i] ?? `Объект-${i}`, regionId, region: regions[regionId], targetDepth, reward: targetDepth*1500, layers: generateBorehole(targetDepth, regionId, 1), col: 0, row: 0 });
    }
    
    const cells = [];
    for (let row = 0; row < WORLD_ROWS; row++) { for (let col = 0; col < WORLD_COLS; col++) cells.push([col, row]); }
    
    // ПЕРЕМЕШИВАЕМ КЛЕТКИ (чтобы не кучковались в одном углу)
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }

    const lv = get(playerLevel) || 1;
    for (const c of contracts) {
      for(let i = 0; i < cells.length; i++) {
        const b = getBiome(cells[i][0], cells[i][1]);
        // ЖЕСТКАЯ ФИЛЬТРАЦИЯ ДЛЯ 1 УРОВНЯ
        if ((lv < 4 && (b === 'water' || b === 'swamp')) || (lv < 3 && (b === 'rock' || b === 'ice'))) continue;
        
        [c.col, c.row] = cells.splice(i, 1)[0]; 
        break; 
      }
    }
    
    storedContracts = contracts;
    try { localStorage.setItem(CONTRACT_SAVE_KEY, JSON.stringify(storedContracts)); } catch {}
    return storedContracts;
  }

  function _getNeighbors(col, row) {
    const odd = row % 2 === 1;
    const dirs = odd ? [[-1,0],[1,0],[0,-1],[1,-1],[0,1],[1,1]] : [[-1,0],[1,0],[-1,-1],[0,-1],[-1,1],[0,1]];
    return dirs.map(([dc, dr]) => [col + dc, row + dr]).filter(([c, r]) => c >= 0 && c < WORLD_COLS && r >= 0 && r < WORLD_ROWS);
  }
  function _getNeighborByEdge(col, row, edgeIdx) {
    const odd = row % 2 === 1;
    const dirs = odd ? [[1,0], [1,1], [0,1], [-1,0], [0,-1], [1,-1]] : [[1,0], [0,1], [-1,1], [-1,0], [-1,-1], [0,-1]];
    return { c: col + dirs[edgeIdx][0], r: row + dirs[edgeIdx][1] };
  }

  function _hash(x, y) { let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)) >>> 0; h = (Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0; return (h ^ (h >>> 16)) / 0xffffffff; }
  function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function _lerp(a, b, t) { return a + (b - a) * t; }
  function _vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; return _lerp(_lerp(_hash(ix, iy), _hash(ix + 1, iy), _fade(fx)), _lerp(_hash(ix, iy + 1), _hash(ix + 1, iy + 1), _fade(fx)), _fade(fy)); }
  function terrainNoise(col, row) { 
    const offset = (mapSeed % 1000) * 10;
    return _vnoise((col + offset) * 0.13, (row + offset) * 0.13) * 0.60 + 
           _vnoise((col + offset) * 0.31 + 71, (row + offset) * 0.31 + 71) * 0.30 + 
           _vnoise((col + offset) * 0.63 + 144, (row + offset) * 0.63 + 144) * 0.10; 
  }

  const BIOMES = {
    water:  { fills: [0x3399ff, 0x44aaff, 0x2288ff], stroke: 0x1166cc },
    swamp:  { fills: [0x556b2f, 0x6b8e23, 0x4b5e26], stroke: 0x3b4d1a },
    ice:    { fills: [0xe2f3fc, 0xf0f9ff, 0xd0e8f5], stroke: 0xaad4ee },
    rock:   { fills: [0xb8c8d4, 0xc8d6e0, 0xa8b8c4], stroke: 0x8898a8 },
    taiga:  { fills: [0x72b87a, 0x84cc8e, 0x5e9e66], stroke: 0x4a8850 },
    steppe: { fills: [0xc8d870, 0xd4e480, 0xb8cc60], stroke: 0x90a840 },
  };
  let mapSeed = 12345;
  try {
    let saved = localStorage.getItem('drill_map_seed_v2');
    if (saved) { mapSeed = parseInt(saved); }
    else { mapSeed = Math.floor(Math.random() * 1000000); localStorage.setItem('drill_map_seed_v2', mapSeed); }
  } catch(e) {}
  let riverSet = new Set();
  function _generateRivers() {
    riverSet.clear();
    let currentSeed = mapSeed; // Берем сохраненный уникальный сид
    const rnd = () => { 
      let x = Math.sin(currentSeed++) * 10000; 
      return x - Math.floor(x); 
    };

    for (let i = 0; i < 3; i++) {
      let c = Math.floor(rnd() * WORLD_COLS), r = 0;
      for (let step = 0; step < 35; step++) {
        riverSet.add(`${c},${r}`);
        let nbrs = _getNeighbors(c, r).filter(n => n[1] >= r); 
        if (nbrs.length > 0) { 
          const n = nbrs[Math.floor(rnd() * nbrs.length)]; 
          c = n[0]; r = n[1]; 
        } else break;
      }
    }
  }

  function getBiome(col, row) {
    if (riverSet.has(`${col},${row}`)) return 'water';
    let v = terrainNoise(col, row);
    if (row < NORTH_ROWS) v = Math.min(1, v + 0.28);
    if (v < 0.16) return 'water'; if (v < 0.26) return 'swamp'; if (v > 0.75) return 'ice';
    if (v > 0.52) return 'rock'; if (v > 0.35) return 'taiga'; return 'steppe';
  }

  function hexElevation(col, row) {
    const b = getBiome(col, row);
    if (b === 'water') return 0; if (b === 'swamp') return 2; if (b === 'steppe') return 4;
    if (b === 'taiga') return 6; if (b === 'rock') return 14 + _hash(col*7, row*13) * 8;
    if (b === 'ice') return 8 + _hash(col*11, row*5) * 6; return 4;
  }

  function biomeFill(col, row) { const b = BIOMES[getBiome(col, row)]; return b.fills[(col * 3 + row * 7) % b.fills.length]; }
  function biomeStroke(col, row) { return BIOMES[getBiome(col, row)].stroke; }

  let bridgeSet = new Set();
  function _generateBridges() {
    bridgeSet.clear();
    const isLand = (c, r) => { if (c < 0 || c >= WORLD_COLS || r < 0 || r >= WORLD_ROWS) return false; const b = getBiome(c, r); return b !== 'water' && b !== 'swamp'; };
    for (let row = 0; row < WORLD_ROWS; row++) {
      for (let col = 0; col < WORLD_COLS; col++) {
        if (getBiome(col, row) === 'water') {
          const dirs = (row % 2 === 1) ? [[-1,0],[1,0], [0,-1],[1,1], [1,-1],[0,1]] : [[-1,0],[1,0], [-1,-1],[0,1], [0,-1],[-1,1]];
          const nbrs = dirs.map(([dc, dr]) => [col+dc, row+dr]);
          if ((isLand(...nbrs[0]) && isLand(...nbrs[1])) || (isLand(...nbrs[2]) && isLand(...nbrs[3])) || (isLand(...nbrs[4]) && isLand(...nbrs[5]))) {
            if (_hash(col * 3, row * 5) < 0.6) bridgeSet.add(`${col},${row}`);
          }
        }
      }
    }
  }

  function hexMoveCost(col, row) {
    if (bridgeSet.has(`${col},${row}`)) return 1;
    const b = getBiome(col, row);
    const costs = vehicleData[currentVeh].costs;
    return costs[b] || 1;
  }

  function hexPts(cx, cy, r) { const pts = []; for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 6; pts.push({x: cx + r * Math.cos(a), y: cy + r * Math.sin(a)}); } return pts; }
  function hexXY(col, row, r, hexW, ox, oy) { return { x: ox + col * hexW + (row % 2 === 1 ? hexW / 2 : 0), y: oy + row * r * 1.5 + r }; }
  function hexSizeFromWidth(W) { const hexW = W / 7.5; return { r: hexW / Math.sqrt(3), hexW }; }
  function _darken(hex, f) { return (((hex >> 16 & 0xff) * f | 0) << 16) | (((hex >> 8 & 0xff) * f | 0) << 8) | ((hex & 0xff) * f | 0); }

  function _drawHexSide(gfx, cx, cy, r, elevH, fill) {
    if (elevH <= 0) return;
    const c30 = 0.866, s30 = 0.5, p1x = cx + r * c30, p1y = cy + r * s30, p2x = cx, p2y = cy + r, p3x = cx - r * c30, p3y = cy + r * s30;
    gfx.poly([p1x, p1y, p2x, p2y, p2x, p2y + elevH, p1x, p1y + elevH]).fill({ color: _darken(fill, 0.48) });
    gfx.poly([p2x, p2y, p3x, p3y, p3x, p3y + elevH, p2x, p2y + elevH]).fill({ color: _darken(fill, 0.62) });
  }
  
  function _drawBiomeBlend(gfx, cx, cy, r, col, row) {
    const myBiome = getBiome(col, row);
    const hptsOuter = hexPts(cx, cy, r * 0.98);
    const hptsInner = hexPts(cx, cy, r * 0.68);
    for (let i = 0; i < 6; i++) {
        const n = _getNeighborByEdge(col, row, i);
        if (n.c >= 0 && n.c < WORLD_COLS && n.r >= 0 && n.r < WORLD_ROWS) {
            if (getBiome(n.c, n.r) !== myBiome) {
                const p1 = hptsOuter[i], p2 = hptsOuter[(i + 1) % 6], p3 = hptsInner[(i + 1) % 6], p4 = hptsInner[i];
                gfx.poly([p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y]).fill({ color: biomeFill(n.c, n.r), alpha: 0.5 });
            }
        }
    }
  }

  function _drawBridge(gfx, cx, cy, r) { gfx.rect(cx - r*0.75, cy - r*0.25, r*1.5, r*0.5).fill({color: 0x6e4a2d}).stroke({color: 0x3d2514, width: 3}); gfx.moveTo(cx - r*0.75, cy - r*0.25).lineTo(cx + r*0.75, cy - r*0.25).stroke({color: 0x8a603a, width: 2}); gfx.moveTo(cx - r*0.75, cy + r*0.25).lineTo(cx + r*0.75, cy + r*0.25).stroke({color: 0x8a603a, width: 2}); }
  function _drawSwampDecals(gfx, cx, cy, r, col, row) { const n = 3 + Math.floor(_hash(col*2, row*3) * 4); for(let i=0; i<n; i++) { const ox = ( _hash(col+i, row*i) - 0.5 ) * r * 1.2, oy = ( _hash(col*i, row+i) - 0.5 ) * r * 0.8, rad = r * 0.15 * (0.5 + _hash(col, row+i)); gfx.circle(cx + ox, cy + oy, rad).fill({color: 0x4a5d23, alpha: 0.6}); } }
  function _drawMountain(gfx, cx, cy, r, col, row) { const s1 = _hash(col * 13, row * 17), s2 = _hash(col * 31, row * 29), n = s1 > 0.55 ? 3 : 2, defs = [ { ox: r * (-0.22 + s1 * 0.10), oy: r * 0.12, sc: 0.85 + s1 * 0.30 }, { ox: r * ( 0.18 - s1 * 0.08), oy: r * 0.20, sc: 0.65 + s2 * 0.25 }, { ox: r * (-0.02 + s2 * 0.10), oy: r * -0.08, sc: 1.00 + s1 * 0.20 } ]; for (let i = 0; i < n; i++) { const d = defs[i], px = cx + d.ox, py = cy + d.oy, pw = r * 0.28 * d.sc, ph = r * 0.44 * d.sc; gfx.poly([px - pw, py, px + pw, py, px, py - ph]).fill({ color: 0x4a5060 }); gfx.poly([px, py - ph, px + pw, py, px + pw * 0.25, py - ph * 0.35]).fill({ color: 0x282e38, alpha: 0.65 }); const sw = pw * 0.28, sh = ph * 0.26; gfx.poly([px - sw, py - ph + sh, px + sw, py - ph + sh, px, py - ph]).fill({ color: 0xe8eeff, alpha: 0.90 }); } }
  function _drawTrees(gfx, cx, cy, r, col, row) { const seed = _hash(col * 11, row * 19), n = 2 + Math.floor(seed * 3), offs = [ { ox: -r * 0.30, oy: r * 0.14 }, { ox: r * 0.22, oy: r * 0.08 }, { ox: r * 0.02, oy: r * 0.26 }, { ox:-r * 0.14, oy:-r * 0.10 } ]; for (let i = 0; i < n; i++) { const o = offs[i], sc = 0.50 + _hash(col * i + 7, row * i + 3) * 0.35, tx = cx + o.ox, ty = cy + o.oy, tw = r * 0.20 * sc, th = r * 0.40 * sc; gfx.poly([tx - tw, ty, tx + tw, ty, tx, ty - th]).fill({ color: 0x2d6535 }); gfx.poly([tx - tw * 0.55, ty - th * 0.45, tx + tw * 0.55, ty - th * 0.45, tx, ty - th * 1.28]).fill({ color: 0x3d8540 }); gfx.poly([tx, ty - th, tx + tw, ty, tx + tw * 0.28, ty - th * 0.38]).fill({ color: 0x183820, alpha: 0.50 }); } }
  function _drawGrass(gfx, cx, cy, r, col, row) { const n = 6 + Math.floor(_hash(col * 9, row * 23) * 7); for (let i = 0; i < n; i++) { const h2 = _hash(col + i * 3 + 1, row + i * 7 + 2), h3 = _hash(col + i * 5 + 4, row + i * 9 + 6), gx = cx + (h2 - 0.5) * r * 1.15, gy = cy + (h3 * 0.6 - 0.1) * r, gh = r * (0.10 + h2 * 0.09), c2 = (i % 3 === 0) ? 0x9ab840 : 0x78a030; gfx.moveTo(gx, gy).lineTo(gx + (h2 - 0.5) * r * 0.07, gy - gh).stroke({ color: c2, width: 1, alpha: 0.85 }); } }

  function _drawAvatar(cont, r) { const g = new Graphics(), s = r * 0.52; g.circle(0, 0, s * 1.28).stroke({ color: 0xf0c840, width: 2.5 }).fill({ color: 0, alpha: 0 }); g.poly([-s*1.1, s*0.3, s*1.1, s*0.3, s*0.8, s*0.55, -s*0.8, s*0.55]).fill({ color: 0x000000, alpha: 0.22 }); g.rect(-s*1.08, -s*0.44, s*0.27, s*0.84).fill({ color: 0x1a0e06 }); g.rect(-s*1.00, -s*0.33, s*0.11, s*0.62).fill({ color: 0x3a2010 }); g.rect( s*0.81, -s*0.44, s*0.27, s*0.84).fill({ color: 0x1a0e06 }); g.rect( s*0.88, -s*0.33, s*0.11, s*0.62).fill({ color: 0x3a2010 }); g.rect(-s*0.82, -s*0.44, s*1.64, s*0.84).fill({ color: 0x8B5E34 }); g.rect(-s*0.72, -s*0.54, s*0.90, s*0.16).fill({ color: 0x5a3818 }); g.rect(-s*0.66, -s*0.80, s*0.80, s*0.46).fill({ color: 0x3a5e70 }); g.rect(-s*0.56, -s*0.72, s*0.26, s*0.22).fill({ color: 0x80c8e0 }); g.rect(-s*0.21, -s*0.72, s*0.26, s*0.22).fill({ color: 0x80c8e0 }); g.rect(s*0.12, -s*1.32, s*0.09, s*1.32).fill({ color: 0x3a2010 }); g.rect(s*0.29, -s*1.32, s*0.09, s*1.32).fill({ color: 0x3a2010 }); g.rect(s*0.06, -s*1.32, s*0.44, s*0.10).fill({ color: 0x5a3018 }); g.rect(s*0.10, -s*0.98, s*0.36, s*0.08).fill({ color: 0x5a3018 }); g.rect(s*0.14, -s*0.68, s*0.28, s*0.07).fill({ color: 0x5a3018 }); g.rect(s*0.08, -s*0.10, s*0.42, s*0.54).fill({ color: 0x5a3820 }); g.circle(s*0.29, s*0.46, s*0.24).fill({ color: 0xc87828 }); g.circle(s*0.29, s*0.46, s*0.12).fill({ color: 0x202018 }); g.rect(-s*0.55, -s*1.02, s*0.10, s*0.48).fill({ color: 0x2a2a2a }); cont.addChild(g); }
  function _drawVillage(cont, r) { const g = new Graphics(), s = r * 0.34; g.circle(0, 0, s * 1.6).fill({ color: 0xffcc44, alpha: 0.10 }); g.rect(-s*0.82, -s*0.38, s*1.64, s*1.10).fill({ color: 0xc89050 }); g.poly([-s*1.05, -s*0.38, s*1.05, -s*0.38, 0, -s*1.45]).fill({ color: 0x8a3820 }); g.rect(-s*0.25, s*0.22, s*0.50, s*0.50).fill({ color: 0x5a3010 }); g.rect(-s*0.68, -s*0.22, s*0.38, s*0.34).fill({ color: 0x80c8e0 }); g.rect( s*0.30, -s*0.22, s*0.38, s*0.34).fill({ color: 0x80c8e0 }); g.rect(-s*0.82, -s*0.38, s*1.64, s*1.10).stroke({ color: 0xc8a060, width: 1.5 }); cont.addChild(g); }
  function _drawMine(cont, r) { const g = new Graphics(), s = r * 0.32; g.circle(0, 0, s * 1.7).fill({ color: 0xff2020, alpha: 0.08 }); g.circle(0, 0, s * 1.1).fill({ color: 0x2a1a0a }); g.circle(0, 0, s * 0.9).fill({ color: 0x1a1010 }); g.rect(-s*1.02, -s*0.14, s*2.04, s*0.28).fill({ color: 0x9a2018 }); g.rect(-s*0.14, -s*1.02, s*0.28, s*2.04).fill({ color: 0x9a2018 }); g.circle(0, 0, s * 0.32).fill({ color: 0xcc3020 }); g.circle(0, 0, s * 0.15).fill({ color: 0x2a0a08 }); g.circle(0, 0, s * 1.1).stroke({ color: 0xaa2010, width: 1.5 }); cont.addChild(g); }

  let wrapper, app = null, worldCont = null, fogGfx = null, scanGfx = null, layout = null, resizeObs = null;
  let _alive = false, markers = [];
  let avatarCont = null, smokeGfx = null, adjGfx = null, adjHitConts = [];
  
  let pathGfx = null, pathTooltip = null, hoverPath = null, hoverKey = null, previewPath = null, previewKey = null, activePath = [], _moveAnim = null;
  const poiConts = [], clouds = [], winds = [];
  let weatherCont = null, treeGfx = null, _weatherTime = 0;
  let unsubFog, unsubPos, unsubMP, unsubHealth, unsubComplete, unsubFailed, unsubPending;
  const contractOverlays = new Map(), contractMarkerMap = new Map();

  let zoom = 1.0, _firstLoad = true, _isDragging = false, _panStarted = false, _tapX = 0, _tapY = 0, _dsx = 0, _dsy = 0, vpX = 0, vpY = 0, _wasPending = false;

  onMount(async () => {
    
    _alive = true; await _buildApp(wrapper.clientWidth, wrapper.clientHeight);
    unsubFog = revealedHexes.subscribe(set => { if (_alive && fogGfx && layout) _updateFog(set); });
    unsubPos = playerPosition.subscribe(pos => {
      if (!_alive || !worldCont || !layout || !pos || _moveAnim) return;
      const elev = hexElevation(pos.col, pos.row); const { x, y } = hexXY(pos.col, pos.row, layout.r, layout.hexW, layout.ox, layout.oy);
      if (avatarCont) { avatarCont.x = x; avatarCont.y = y - elev; } _updateReachable();
    });
    unsubMP = movementPoints.subscribe(mp => { if (!_alive || !worldCont || !layout || _moveAnim) return; _updateReachable(); });
    unsubHealth = drillHealth.subscribe(h => { _updateSmokeEffect(h <= 0); });
    unsubComplete = completedContracts.subscribe(ids => { for (const [id, gfx] of contractOverlays) gfx.tint = ids.has(id) ? 0x44cc44 : 0xffffff; _tryMaintainContracts(); });
    unsubFailed = failedContracts.subscribe(ids => { for (const [id, gfx] of contractOverlays) if (ids.has(id)) gfx.tint = 0xcc4444; _tryMaintainContracts(); });

    unsubPending = pendingEvent.subscribe(ev => {
      if (_wasPending && !ev && _alive) {
        if (activePath.length > 0) { setTimeout(_stepPath, 50); } 
        else {
          setTimeout(() => { 
            const pos = get(playerPosition);
            const contract = (storedContracts ?? []).find(c => c.col === pos.col && c.row === pos.row);
            if (contract) dispatch('select', contract);
            else { const poi = get(poiList).find(p => p.col === pos.col && p.row === pos.row && !p.used); if (poi) dispatch('arrivedPoi', poi); }
            _updateReachable();
          }, 50);
        }
      }
      _wasPending = !!ev;
    });

    resizeObs = new ResizeObserver(entries => { if (!_alive || !app) return; _rebuild(entries[0].contentRect.width, entries[0].contentRect.height); });
    resizeObs.observe(wrapper); wrapper.addEventListener('wheel', _onWheel, { passive: false });
  });

  onDestroy(() => {
    _alive = false; unsubFog?.(); unsubPos?.(); unsubMP?.(); unsubHealth?.(); unsubComplete?.(); unsubFailed?.(); unsubPending?.();
    resizeObs?.disconnect(); wrapper?.removeEventListener('wheel', _onWheel); app?.destroy(false, { children: true }); app = null;
  });

  async function _buildApp(W, H) {
    app = new Application(); await app.init({ width: W, height: H, backgroundColor: 0x2a3038, antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true });
    wrapper.appendChild(app.canvas); app.stage.eventMode = 'static'; app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', _onDown); app.stage.on('pointermove', _onMove); app.stage.on('pointerup', _onUp); app.stage.on('pointerupoutside', _onUp);
    _buildScene(W, H); app.ticker.add(_tick);
  }

  function _rebuild(W, H) {
    app.renderer.resize(W, H); app.stage.hitArea = app.screen; app.stage.removeChildren(); markers.length = 0; 
    avatarCont = null; smokeGfx = null; adjGfx = null; adjHitConts = []; _moveAnim = null; activePath = []; poiConts.length = 0; weatherCont = null; treeGfx = null; clouds.length = 0; winds.length = 0; contractOverlays.clear(); contractMarkerMap.clear(); pathGfx = null; pathTooltip = null;
    _buildScene(W, H); if (worldCont) { worldCont.scale.set(zoom); _constrainPan(); } _updateFog(get(revealedHexes));
  }

  function _buildScene(W, H) {
    const contracts = generateContracts();
    const { r, hexW } = hexSizeFromWidth(W); const ox = hexW / 2, oy = r; layout = { r, hexW, ox, oy };
    worldCont = new Container(); app.stage.addChild(worldCont);
    _generateRivers();
    _generateBridges();

    const terrainGfx = new Graphics(); worldCont.addChild(terrainGfx);
    const featGfx = new Graphics(); worldCont.addChild(featGfx);
    treeGfx = new Graphics(); worldCont.addChild(treeGfx);

    for (let row = 0; row < WORLD_ROWS; row++) {
      for (let col = 0; col < WORLD_COLS; col++) {
        const { x, y } = hexXY(col, row, r, hexW, ox, oy); const elev = hexElevation(col, row); const topY = y - elev; const biome = getBiome(col, row);
        _drawHexSide(terrainGfx, x, topY, r * 0.98, elev, biomeFill(col, row));
        terrainGfx.poly(hexPts(x, topY, r * 0.97).flatMap(p => [p.x, p.y])).fill({ color: biomeFill(col, row) });
        _drawBiomeBlend(terrainGfx, x, topY, r, col, row);
        terrainGfx.poly(hexPts(x, topY, r * 0.97).flatMap(p => [p.x, p.y])).stroke({ color: biomeStroke(col, row), width: 1.5, alpha: 0.6 });

        if (bridgeSet.has(`${col},${row}`)) _drawBridge(featGfx, x, topY, r);
        else if (biome === 'rock') _drawMountain(featGfx, x, topY, r, col, row);
        else if (biome === 'taiga') _drawTrees(treeGfx, x, topY, r, col, row);
        else if (biome === 'steppe') _drawGrass(featGfx, x, topY, r, col, row);
        else if (biome === 'swamp') _drawSwampDecals(featGfx, x, topY, r, col, row);
      }
    }

    const divY = hexXY(0, NORTH_ROWS, r, hexW, ox, oy).y - hexElevation(0, NORTH_ROWS) - r * 1.5 + r; const divGfx = new Graphics();
    for (let dx = 0; dx < WORLD_COLS * hexW + hexW; dx += 16) divGfx.moveTo(dx, divY).lineTo(dx + 10, divY).stroke({ color: 0x506070, width: 2 }); worldCont.addChild(divGfx);
    fogGfx = new Graphics(); worldCont.addChild(fogGfx);

    poiConts.length = 0; const currentPOI = get(poiList).length > 0 ? get(poiList) : _generateInitialPOI(contracts);
    for (const p of currentPOI) { if (p.used) continue; const elev = hexElevation(p.col, p.row); const { x, y } = hexXY(p.col, p.row, r, hexW, ox, oy); const cont = new Container(); cont.x = x; cont.y = y - elev; if (p.type === 'village') _drawVillage(cont, r); else _drawMine(cont, r); worldCont.addChild(cont); poiConts.push({ cont, p, t: Math.random() * Math.PI * 2 }); }

    adjGfx = new Graphics(); worldCont.addChild(adjGfx);
    pathGfx = new Graphics(); worldCont.addChild(pathGfx);
    pathTooltip = new Text({ text: '', style: new TextStyle({ fontFamily: 'Share Tech Mono, Courier New, monospace', fontSize: 16, fill: 0xffffff, fontWeight: '900', stroke: {color: 0x000000, width: 3}, dropShadow: { alpha: 0.8, blur: 2, distance: 0 } }) }); pathTooltip.anchor.set(0.5, 1); pathTooltip.visible = false; worldCont.addChild(pathTooltip);
    markers.length = 0; for (const contract of contracts) _buildContractMarker(contract);

    avatarCont = new Container(); worldCont.addChild(avatarCont); _drawAvatar(avatarCont, r);
    let initPos = get(playerPosition); 
    if (!initPos) { 
      // 1. Собираем все клетки суши на карте
      let landCells = new Set();
      for (let r = NORTH_ROWS; r < WORLD_ROWS; r++) {
        for (let c = 0; c < WORLD_COLS; c++) {
          if (getBiome(c, r) !== 'water') landCells.add(`${c},${r}`);
        }
      }
      
      // 2. Ищем самый большой материк (алгоритм Заливки)
      let bestRegion = [];
      let visited = new Set();
      
      for (let loc of landCells) {
         if (visited.has(loc)) continue;
         let queue = [loc];
         let region = [];
         visited.add(loc);
         
         let head = 0;
         while (head < queue.length) {
            let curr = queue[head++];
            region.push(curr);
            let [cc, cr] = curr.split(',').map(Number);
            
            for (let [nc, nr] of _getNeighbors(cc, cr)) {
               let nKey = `${nc},${nr}`;
               // Считаем соседней сушей, если это земля ИЛИ есть мост
               if (!visited.has(nKey) && (landCells.has(nKey) || bridgeSet.has(nKey))) {
                  visited.add(nKey);
                  queue.push(nKey);
               }
            }
         }
         // Запоминаем самый крупный кусок суши
         if (region.length > bestRegion.length) bestRegion = region;
      }
      
      // 3. Выбираем точку спавна ТОЛЬКО на найденном материке (и без болот/скал)
      let validCells = bestRegion.filter(loc => {
         let [c, r] = loc.split(',').map(Number);
         let b = getBiome(c, r);
         return b !== 'swamp' && b !== 'rock' && b !== 'ice' && b !== 'water';
      });
      
      if (validCells.length > 0) {
        let chosen = validCells[Math.floor(Math.random() * validCells.length)];
        let [c, r] = chosen.split(',').map(Number);
        initPos = { col: c, row: r };
      } else {
        initPos = { col: 10, row: 15 }; // Экстренный запасной вариант
      }
      
      playerPosition.set(initPos); 
    }
    const initXY = hexXY(initPos.col, initPos.row, r, hexW, ox, oy); avatarCont.x = initXY.x; avatarCont.y = initXY.y - hexElevation(initPos.col, initPos.row);
    revealHexesAround(initPos.col, initPos.row, 2); _updateReachable();

    weatherCont = new Container(); app.stage.addChild(weatherCont);
    for (let i = 0; i < 5; i++) _spawnCloud(W, H); for (let i = 0; i < 4; i++) _spawnWind(W, H);
    scanGfx = new Graphics(); scanGfx._scanY = 0; scanGfx._H = H; app.stage.addChild(scanGfx);

    if (_firstLoad) { vpX = Math.max(W - WORLD_COLS*hexW, Math.min(0, W/2 - initXY.x)); vpY = Math.max(H - WORLD_ROWS*r*1.5, Math.min(0, H/2 - initXY.y)); _firstLoad = false; }
    worldCont.x = vpX; worldCont.y = vpY; worldCont.scale.set(zoom); _constrainPan();
  }

  function _generateInitialPOI(contracts) {
    const keys = new Set(contracts.map(c => `${c.col},${c.row}`)); const res = []; let id = 0;
    for (let row = NORTH_ROWS + 3; row < WORLD_ROWS - 2; row += 5) { for (let col = 2; col < WORLD_COLS - 2; col += 7) { const c = col + Math.floor(Math.random() * 3), r = row + Math.floor(Math.random() * 2); if (!keys.has(`${c},${r}`)) { res.push({ id: id++, col: c, row: r, type: 'village', used: false }); keys.add(`${c},${r}`); } } }
    let mines = 0, attempts = 0; while (mines < 4 && attempts < 60) { attempts++; const c = 1 + Math.floor(Math.random() * (WORLD_COLS - 2)), r = NORTH_ROWS + 1 + Math.floor(Math.random() * (WORLD_ROWS - NORTH_ROWS - 3)); if (!keys.has(`${c},${r}`)) { res.push({ id: id++, col: c, row: r, type: 'mine', used: false }); keys.add(`${c},${r}`); mines++; } }
    poiList.set(res); return res;
  }

  function _updateReachable() {
    for (const c of adjHitConts) worldCont.removeChild(c); adjHitConts = []; if (adjGfx) adjGfx.clear();
    const pos = get(playerPosition); const mp = get(movementPoints); if (!pos || !layout || !worldCont) return;
    const { r, hexW, ox, oy } = layout; const costs = new Map(); const paths = new Map(); const pq = [{ col: pos.col, row: pos.row, cost: 0, path: [] }]; costs.set(`${pos.col},${pos.row}`, 0);

    while (pq.length > 0) {
      pq.sort((a, b) => a.cost - b.cost); const curr = pq.shift(); if (curr.cost > costs.get(`${curr.col},${curr.row}`)) continue;
      for (const [nc, nr] of _getNeighbors(curr.col, curr.row)) {
        const stepCost = hexMoveCost(nc, nr); if (stepCost >= 99) continue;
        const newCost = curr.cost + stepCost;
        if (newCost <= 999) { const key = `${nc},${nr}`; if (!costs.has(key) || newCost < costs.get(key)) { costs.set(key, newCost); const newPath = [...curr.path, {col: nc, row: nr, stepCost}]; paths.set(key, newPath); pq.push({ col: nc, row: nr, cost: newCost, path: newPath }); } }
      }
    }

    for (const [key, cost] of costs.entries()) {
      const [nc, nr] = key.split(',').map(Number); if (nc === pos.col && nr === pos.row) continue;
      const { x, y } = hexXY(nc, nr, r, hexW, ox, oy); const topY = y - hexElevation(nc, nr);
      if (cost <= mp) { const fillC = cost === 1 ? 0x1155cc : cost === 2 ? 0x886600 : 0x882200; const strC  = cost === 1 ? 0x88ddff : cost === 2 ? 0xffcc44 : 0xff8844; adjGfx.poly(hexPts(x, topY, r * 0.96).flatMap(p=>[p.x,p.y])).fill({ color: fillC, alpha: 0.28 }).stroke({ color: strC, width: 4 }); }

      const hit = new Container(); hit.x = x; hit.y = topY; hit.eventMode = 'static'; hit.cursor = 'pointer'; hit.addChild(new Graphics().poly(hexPts(0, 0, r * 0.95).flatMap(p=>[p.x,p.y])).fill({ color: 0, alpha: 0.001 }));
      const targetPath = paths.get(key);
      hit.on('pointerdown', e => { e.stopPropagation(); if (autoMove) { _startPath(targetPath); } else { if (previewKey === key) { _startPath(previewPath); previewPath = null; previewKey = null; hoverPath = null; hoverKey = null; } else { previewPath = targetPath; previewKey = key; } } });
      hit.on('pointerover', () => { hoverPath = targetPath; hoverKey = key; }); hit.on('pointerout', () => { if (hoverKey === key) { hoverPath = null; hoverKey = null; } });
      worldCont.addChild(hit); adjHitConts.push(hit);
    }
  }

  function _startPath(path) { if (_moveAnim || !avatarCont || !layout || get(pendingEvent) !== null) return; activePath = path; for (const c of adjHitConts) worldCont.removeChild(c); adjHitConts = []; if (adjGfx) adjGfx.clear(); _stepPath(); }

  function _stepPath() {
    if (activePath.length === 0) {
       const pos = get(playerPosition); const contract = (storedContracts ?? []).find(c => c.col === pos.col && c.row === pos.row);
       if (contract) dispatch('select', contract); else { const poi = get(poiList).find(p => p.col === pos.col && p.row === pos.row && !p.used); if (poi) dispatch('arrivedPoi', poi); }
       _updateReachable(); if (!autoMove) { previewPath = null; previewKey = null; hoverPath = null; hoverKey = null; } return;
    }
    const nextStep = activePath[0];
    if (get(movementPoints) < nextStep.stepCost) { _updateReachable(); if (!autoMove) { previewPath = activePath; } return; }
    activePath.shift(); const { r, hexW, ox, oy } = layout; const toXY = hexXY(nextStep.col, nextStep.row, r, hexW, ox, oy);
    _moveAnim = { x0: avatarCont.x, y0: avatarCont.y, x1: toXY.x, y1: toXY.y - hexElevation(nextStep.col, nextStep.row), t: 0, dur: 0.35, toCol: nextStep.col, toRow: nextStep.row, stepCost: nextStep.stepCost };
  }

  function _updateFog(revealed) {
    if (!fogGfx || !layout) return; const { r, hexW, ox, oy } = layout; fogGfx.clear();
    for (let row = 0; row < WORLD_ROWS; row++) { for (let col = 0; col < WORLD_COLS; col++) { if (revealed.has(`${col},${row}`)) continue; const elev = hexElevation(col, row); const { x, y } = hexXY(col, row, r, hexW, ox, oy); const topY = y - elev; _drawHexSide(fogGfx, x, topY, r * 0.985, elev, 0x060810); fogGfx.poly(hexPts(x, topY, r * 0.985).flatMap(p=>[p.x,p.y])).fill({ color: 0x060810, alpha: 0.93 }); } }
    for (const [id, { mc, hit, col, row }] of contractMarkerMap) { const vis = revealed.has(`${col},${row}`); mc.visible = true; mc.alpha = vis ? 1.0 : 0.50; hit.eventMode = 'static'; const hexHL = contractOverlays.get(id); if (hexHL) hexHL.visible = vis; }
    for (const entry of poiConts) entry.cont.visible = revealed.has(`${entry.p.col},${entry.p.row}`);
  }

  function _tryMaintainContracts() {
    if (!_alive || !worldCont) return; const newOnes = maintainContracts(storedContracts ?? [], get(playerPosition), get(revealedHexes)); if (!newOnes.length) return;
    
    // ПРОВЕРКА БИОМОВ ДЛЯ НОВЫХ КОНТРАКТОВ
    const lv = get(playerLevel) || 1;
    const cells = [];
    for (let r = 0; r < WORLD_ROWS; r++) { for (let c = 0; c < WORLD_COLS; c++) cells.push([c, r]); }
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }

    for (const c of newOnes) {
        const b = getBiome(c.col, c.row);
        if ((lv < 4 && (b === 'water' || b === 'swamp')) || (lv < 3 && (b === 'rock' || b === 'ice'))) {
             for(let i=0; i<cells.length; i++){
                 const altB = getBiome(cells[i][0], cells[i][1]);
                 if ((lv < 4 && (altB === 'water' || altB === 'swamp')) || (lv < 3 && (altB === 'rock' || altB === 'ice'))) continue;
                 c.col = cells[i][0]; c.row = cells[i][1];
                 cells.splice(i, 1);
                 break;
             }
        }
    }

    storedContracts = [...(storedContracts ?? []), ...newOnes]; try { localStorage.setItem(CONTRACT_SAVE_KEY, JSON.stringify(storedContracts)); } catch {}
    for (const c of newOnes) _buildContractMarker(c);
  }

  function _buildContractMarker(contract) {
    if (!layout || !worldCont || !adjGfx) return; const { r, hexW, ox, oy } = layout; const { col, row } = contract; const elev = hexElevation(col, row); const { x, y } = hexXY(col, row, r, hexW, ox, oy); const topY = y - elev; const hpts = hexPts(x, topY, r * 0.97).flatMap(p=>[p.x,p.y]);
    const hexHL = new Graphics().poly(hpts).fill({ color: biomeFill(col, row) }).stroke({ color: 0xffcc33, width: 2.5 }); worldCont.addChildAt(hexHL, worldCont.getChildIndex(adjGfx));
    const mc = new Container(); mc.x = x; mc.y = topY; mc.addChild(new Graphics().circle(0, 0, r * 0.40).stroke({ color: 0xffcc33, width: 1.5 })); mc.addChild(new Graphics().circle(0, 0, r * 0.22).stroke({ color: 0xcc8800, width: 2 })); mc.addChild(new Graphics().circle(0, 0, r * 0.08).fill({ color: 0xffdd66 }));
    const cs = r*0.14, cl = r*0.25, cx_ = new Graphics(); cx_.moveTo(-cl,0).lineTo(-cs,0).stroke({color:0xcc8800,width:1}); cx_.moveTo(cl,0).lineTo(cs,0).stroke({color:0xcc8800,width:1}); cx_.moveTo(0,-cl).lineTo(0,-cs).stroke({color:0xcc8800,width:1}); cx_.moveTo(0,cl).lineTo(0,cs).stroke({color:0xcc8800,width:1}); mc.addChild(cx_);
    const lbl = new Text({ text: `${contract.targetDepth}М`, style: new TextStyle({ fontFamily: 'Share Tech Mono, Courier New, monospace', fontSize: Math.max(7, r * 0.26), fill: 0x1a1200, letterSpacing: 1 }) }); lbl.anchor.set(0.5, 0); lbl.y = r * 0.25; mc.addChild(lbl); worldCont.addChildAt(mc, worldCont.getChildIndex(adjGfx) + 1);
    const hit = new Container(); hit.x = x; hit.y = topY; hit.eventMode = 'static'; hit.cursor = 'pointer'; hit.addChild(new Graphics().circle(0, 0, r * 0.9).fill({ color: 0, alpha: 0.001 }));
    hit.on('pointerdown', e => { e.stopPropagation(); if (_alive) dispatch('select', contract); }); hit.on('pointerover', () => { hexHL.clear().poly(hpts).fill({ color: biomeFill(col,row) }).stroke({ color: 0xffee88, width: 3 }); }); hit.on('pointerout', () => { hexHL.clear().poly(hpts).fill({ color: biomeFill(col,row) }).stroke({ color: 0xffcc33, width: 2.5 }); });
    worldCont.addChildAt(hit, worldCont.getChildIndex(adjGfx) + 2); markers.push({ ringO: mc.children[0], t: Math.random() * Math.PI * 2 }); contractOverlays.set(contract.id, hexHL); contractMarkerMap.set(contract.id, { mc, hit, col, row });
    const vis = get(revealedHexes).has(`${col},${row}`); mc.visible = true; mc.alpha = vis ? 1.0 : 0.5; hexHL.visible = vis; if (get(completedContracts).has(contract.id)) hexHL.tint = 0x44cc44; if (get(failedContracts).has(contract.id)) hexHL.tint = 0xcc4444;
  }

  function _updateSmokeEffect(broken) { if (!avatarCont) return; if (broken && !smokeGfx) { smokeGfx = new Graphics(); smokeGfx._t = 0; avatarCont.addChild(smokeGfx); } else if (!broken && smokeGfx) { avatarCont.removeChild(smokeGfx); smokeGfx.destroy(); smokeGfx = null; } }

  function _constrainPan() { if (!app || !layout) return; const W = app.renderer.width, H = app.renderer.height; const { r, hexW } = layout; const worldW = (WORLD_COLS * hexW + hexW / 2) * zoom; const worldH = ((WORLD_ROWS - 1) * r * 1.5 + r * 3) * zoom; vpX = Math.max(W - worldW, Math.min(0, vpX)); vpY = Math.max(H - worldH, Math.min(0, vpY)); if (worldCont) { worldCont.x = vpX; worldCont.y = vpY; } }
  function _onWheel(e) { if (!_alive || !worldCont) return; e.preventDefault(); const oldZoom = zoom; zoom = Math.max(0.5, Math.min(2.5, zoom + (e.deltaY > 0 ? -0.1 : 0.1))); const scaleRatio = zoom / oldZoom; const px = e.offsetX, py = e.offsetY; vpX = px - (px - vpX) * scaleRatio; vpY = py - (py - vpY) * scaleRatio; worldCont.scale.set(zoom); _constrainPan(); }
  function _onDown(e) { _isDragging = true; _panStarted = false; _tapX = e.global.x; _tapY = e.global.y; _dsx = e.global.x - vpX; _dsy = e.global.y - vpY; }
  function _onMove(e) { if (!_isDragging || !worldCont) return; if (!_panStarted && Math.hypot(e.global.x - _tapX, e.global.y - _tapY) < 8) return; _panStarted = true; vpX = e.global.x - _dsx; vpY = e.global.y - _dsy; _constrainPan(); }
  function _onUp() { _isDragging = false; }

  function _spawnCloud(W, H) { if (!weatherCont) return; const g = new Graphics(), scl = 0.5 + Math.random() * 1.1; for (let i = 0, n = 3 + Math.floor(Math.random() * 3); i < n; i++) g.circle((i - n / 2) * 28 * scl, (Math.random() - 0.5) * 14 * scl, (14 + Math.random() * 18) * scl).fill({ color: 0xffffff, alpha: 0.13 }); g.x = -120 - Math.random() * 200; g.y = Math.random() * H; g._vx = 16 + Math.random() * 20; weatherCont.addChild(g); clouds.push(g); }
  function _spawnWind(W, H) { if (!weatherCont) return; const g = new Graphics(), len = 55 + Math.random() * 95; g.moveTo(0, 0).lineTo(len, (Math.random() - 0.5) * 8).stroke({ color: 0xddeeff, width: 1 + Math.random() * 1.2, alpha: 0.28 }); g.x = -len; g.y = Math.random() * H; g._vx = 300 + Math.random() * 180; weatherCont.addChild(g); winds.push(g); }

  function _tick(ticker) {
    if (!_alive || !app) return;
    const dt = ticker.deltaMS / 1000;
    for (const m of markers) { m.t += dt * 2.2; m.ringO.scale.set(0.88 + 0.12 * ((Math.sin(m.t) + 1) / 2)); m.ringO.alpha = 0.40 + 0.60 * ((Math.sin(m.t) + 1) / 2); }
    for (const entry of poiConts) { entry.t += dt * 1.4; entry.cont.scale.set(1 + 0.06 * Math.sin(entry.t)); }

    if (_moveAnim && avatarCont) {
      _moveAnim.t = Math.min(1, _moveAnim.t + dt / _moveAnim.dur); const ease = _moveAnim.t < 0.5 ? 2 * _moveAnim.t * _moveAnim.t : -1 + (4 - 2 * _moveAnim.t) * _moveAnim.t;
      avatarCont.x = _moveAnim.x0 + (_moveAnim.x1 - _moveAnim.x0) * ease; avatarCont.y = _moveAnim.y0 + (_moveAnim.y1 - _moveAnim.y0) * ease;
      if (_moveAnim.t >= 1) {
        const { toCol, toRow, stepCost } = _moveAnim; _moveAnim = null; playerPosition.set({ col: toCol, row: toRow }); movementPoints.update(m => Math.max(0, m - stepCost)); revealHexesAround(toCol, toRow, 2);
        triggerRandomEvent(toCol, toRow); if (!get(pendingEvent)) { _stepPath(); }
      }
    }

    if (pathGfx && layout) {
      pathGfx.clear(); pathTooltip.visible = false; const pathToDraw = (!autoMove && previewPath) ? previewPath : hoverPath;
      if (pathToDraw && pathToDraw.length > 0) {
        const mp = get(movementPoints); let accCost = 0; let lastX = avatarCont.x, lastY = avatarCont.y; pathGfx.moveTo(lastX, lastY);
        for (let i = 0; i < pathToDraw.length; i++) {
          const step = pathToDraw[i]; accCost += step.stepCost; const {x, y} = hexXY(step.col, step.row, layout.r, layout.hexW, layout.ox, layout.oy); const topY = y - hexElevation(step.col, step.row);
          const color = accCost <= mp ? 0x44ff44 : 0xff4444; 
          pathGfx.lineTo(x, topY).stroke({ color, width: Math.max(3, layout.r * 0.15), alpha: 0.85 }); pathGfx.circle(x, topY, layout.r * 0.15).fill({ color }); pathGfx.moveTo(x, topY); lastX = x; lastY = topY;
        }
        if (accCost > mp) {
          const maxMP = get(maxMovementPoints); const days = Math.ceil((accCost - mp) / maxMP);
          pathTooltip.text = `В ПУТИ: ${days} ДН.`; pathTooltip.x = lastX; pathTooltip.y = lastY - layout.r * 0.8; pathTooltip.scale.set(1 / zoom); pathTooltip.visible = true;
        }
      }
    }

    if (smokeGfx && avatarCont && layout) { smokeGfx._t += dt; smokeGfx.clear(); for (let i = 0; i < 3; i++) { const phase = (smokeGfx._t * 1.2 + i * 0.7) % 1.8; smokeGfx.circle((-0.15 + i * 0.15) * layout.r, -(phase / 1.8) * layout.r * 1.0 - layout.r * 0.6, layout.r * 0.12 * (1 + phase / 1.8)).fill({ color: 0x888888, alpha: (1 - phase / 1.8) * 0.65 }); } }
    if (scanGfx) { scanGfx._scanY = (scanGfx._scanY + dt * 70) % scanGfx._H; scanGfx.clear().rect(0, scanGfx._scanY, app.renderer.width, 3).fill({ color: 0xffffff, alpha: 0.05 }); }
    _weatherTime += dt; if (treeGfx) treeGfx.skew.x = Math.sin(_weatherTime * 0.85) * 0.018;
    if (weatherCont) { const W2 = app.renderer.width, H2 = app.renderer.height; for (let i = clouds.length - 1; i >= 0; i--) { const c = clouds[i]; c.x += c._vx * dt; if (c.x > W2 + 220) { weatherCont.removeChild(c); c.destroy(); clouds.splice(i, 1); } } if (clouds.length < 7 && Math.random() < 0.006) _spawnCloud(W2, H2); for (let i = winds.length - 1; i >= 0; i--) { const w = winds[i]; w.x += w._vx * dt; if (w.x > W2 + 200) { weatherCont.removeChild(w); w.destroy(); winds.splice(i, 1); } } if (winds.length < 12 && Math.random() < 0.055) _spawnWind(W2, H2); }
  }
</script>
<div class="wrap" bind:this={wrapper}></div>
<style>
  .wrap { width: 100%; height: 100%; overflow: hidden; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
  .wrap:active { cursor: grabbing; }
  .wrap :global(canvas) { display: block; width: 100% !important; height: 100% !important; }
</style>