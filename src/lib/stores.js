import { writable, derived, get } from 'svelte/store';

export const soilTypes = {
  fine_sand: { id: 'fine_sand', name: 'Мелкий песок', density: 1.65, abrasiveness: 3, isPermafrost: false, color: '#c2a05a' },
  soft_loam: { id: 'soft_loam', name: 'Суглинок мягкопластичный', density: 1.85, abrasiveness: 1, isPermafrost: false, color: '#7a5c3a' },
  frozen_sand: { id: 'frozen_sand', name: 'Мёрзлый песок', density: 1.90, abrasiveness: 5, isPermafrost: true, color: '#a8d4f5' },
  granite: { id: 'granite', name: 'Гранит', density: 2.65, abrasiveness: 9, isPermafrost: false, color: '#555566' },
};

export const regions = {
  central: { id: 'central', name: 'Средняя полоса', depthRange: [15, 120], rewardMultiplier: 1.5 },
  north: { id: 'north', name: 'Северный предел', depthRange: [80, 400], rewardMultiplier: 3.8 },
};

export const drillBitsData = {
  'basic_steel': { bitId: 'basic_steel', name: 'Стальная коронка', tier: 1, hardness: 2, wearRate: 1.0, speedMult: 1.0, price: 1500 },
  'tungsten_carbide': { bitId: 'tungsten_carbide', name: 'Твердосплавная', tier: 2, hardness: 5, wearRate: 0.6, speedMult: 1.3, price: 12000 },
  'pcd_insert': { bitId: 'pcd_insert', name: 'PDC Резец', tier: 3, hardness: 8, wearRate: 0.3, speedMult: 1.8, price: 45000 },
  'diamond_core': { bitId: 'diamond_core', name: 'Алмазная матричная', tier: 4, hardness: 10, wearRate: 0.1, speedMult: 2.5, price: 150000 },
  'experimental_plasma': { bitId: 'experimental_plasma', name: 'Плазменный бур', tier: 5, hardness: 99, wearRate: 0.0, speedMult: 5.0, price: 600000 },
};

export const vehicleData = {
  'zil': { id: 'zil', name: 'ЗиЛ-131', desc: 'Стандартный грузовик. Тяжело идет по болотам.', price: 0, mp: 6, costs: { swamp: 3, taiga: 2, rock: 2, ice: 2, steppe: 1, water: 99 } },
  'ural': { id: 'ural', name: 'Урал-4320', desc: 'Мощный трехосный. Лес и грязь не помеха.', price: 35000, mp: 8, costs: { swamp: 2, taiga: 1, rock: 2, ice: 2, steppe: 1, water: 99 } },
  'mtlb': { id: 'mtlb', name: 'МТ-ЛБ', desc: 'Гусеничный вездеход. Идеально для Севера.', price: 120000, mp: 10, costs: { swamp: 1, taiga: 1, rock: 2, ice: 1, steppe: 1, water: 99 } },
  'vityaz': { id: 'vityaz', name: 'ДТ-30 «Витязь»', desc: 'Легенда Севера. Умеет плавать!', price: 450000, mp: 12, costs: { swamp: 1, taiga: 1, rock: 1, ice: 1, steppe: 1, water: 3 } },
};

// ── Инициализация хранилищ ──────────────────────────────────────────────────
export const playerMoney = writable(15000);
export const playerXP = writable(0);
export const playerLevel = derived(playerXP, $xp => Math.floor(Math.sqrt($xp / 100)) + 1);
export const nextLevelXP = derived(playerLevel, $lv => Math.pow($lv, 2) * 100);

export const playerOwnedVehicles = writable(['zil']);
export const playerVehicleId = writable('zil');
export const maxMovementPoints = derived(playerVehicleId, $id => vehicleData[$id]?.mp || 6);

export const movementPoints = writable(6);
maxMovementPoints.subscribe(m => { if (get(movementPoints) > m) movementPoints.set(m); });

export const playerInventory = writable([{ instanceId: 'init_bit', bitId: 'basic_steel', health: 100 }]);
export const equippedBitInstanceId = writable('init_bit');
export const equippedItem = derived([playerInventory, equippedBitInstanceId], ([$inv, $id]) => $inv.find(i => i.instanceId === $id) || null);
export const equippedBit = derived(equippedItem, $item => $item ? drillBitsData[$item.bitId] : null);
export const drillHealth = writable(100);

export const playerPosition = writable(null);
export const revealedHexes = writable(new Set());
export const poiList = writable([]);
export const currentDay = writable(1);
export const playerConsumables = writable({ nitrogen: 0, paste: 0, obolon: 0 });
export const consumablesData = { nitrogen: { name: 'Жидкий азот', desc: '+20% прочности', price: 1500, type: 'repair' }, paste: { name: 'Полимерная паста', desc: 'Защита от износа', price: 3000, type: 'protect' }, obolon: { name: 'Оболонь', desc: 'Бурение сквозь боль', price: 5000, type: 'buff' } };

export const currentScreen = writable('contracts');
export const activeContract = writable(null);
export const boreholeLayers = writable([]);
export const currentDepth = writable(0);
export const isDrilling = writable(false);
export const activeEffects = writable({ nitrogen: false, paste: false, obolon: false });
export const activeIncident = writable(null);
export const deployStatus = writable(0);
export const currentLayer = derived([currentDepth, boreholeLayers], ([$d, $layers]) => {
  if (!$layers || $layers.length === 0) return null;
  const layer = $layers.find(l => $d >= l.from && $d < l.to) || $layers[$layers.length - 1];
  return layer ? { ...layer, soil: soilTypes[layer.soilId] } : null;
});

export const completedContracts = writable(new Set());
export const failedContracts = writable(new Set());
export const prestigeLevel = writable(0);
export const prestigeBonus = derived(prestigeLevel, $p => 1 + $p * 0.15);

// ── СИСТЕМА СОХРАНЕНИЙ ──────────────────────────────────────────────────────
const SAVE_KEY = 'tg_drill_save_v3';

export function saveGameState() {
  const state = {
    money: get(playerMoney),
    xp: get(playerXP),
    ownedVehicles: get(playerOwnedVehicles),
    vehicleId: get(playerVehicleId),
    inventory: get(playerInventory),
    equippedBitId: get(equippedBitInstanceId),
    health: get(drillHealth),
    pos: get(playerPosition),
    revealed: Array.from(get(revealedHexes)),
    day: get(currentDay),
    consumables: get(playerConsumables),
    completed: Array.from(get(completedContracts)),
    failed: Array.from(get(failedContracts)),
    prestige: get(prestigeLevel)
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { console.error("Save failed", e); }
}

export function loadGameState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false; // Нет сохранений
    const state = JSON.parse(raw);
    
    if (state.money !== undefined) playerMoney.set(state.money);
    if (state.xp !== undefined) playerXP.set(state.xp);
    if (state.ownedVehicles) playerOwnedVehicles.set(state.ownedVehicles);
    if (state.vehicleId) playerVehicleId.set(state.vehicleId);
    if (state.inventory) playerInventory.set(state.inventory);
    if (state.equippedBitId) equippedBitInstanceId.set(state.equippedBitId);
    if (state.health !== undefined) drillHealth.set(state.health);
    if (state.pos) playerPosition.set(state.pos);
    if (state.revealed) revealedHexes.set(new Set(state.revealed));
    if (state.day) currentDay.set(state.day);
    if (state.consumables) playerConsumables.set(state.consumables);
    if (state.completed) completedContracts.set(new Set(state.completed));
    if (state.failed) failedContracts.set(new Set(state.failed));
    if (state.prestige !== undefined) prestigeLevel.set(state.prestige);
    return true;
  } catch (e) {
    console.error("Load failed", e);
    return false;
  }
}

// Авто-сохранение при важных изменениях
playerMoney.subscribe(() => saveGameState());
playerPosition.subscribe(() => saveGameState());
drillHealth.subscribe(() => saveGameState());
currentDay.subscribe(() => saveGameState());

// ────────────────────────────────────────────────────────────────────────────

export function doPrestige() {
  prestigeLevel.update(p => p + 1);
  playerMoney.set(15000); playerXP.set(0); playerInventory.set([{ instanceId: 'init_bit_' + Date.now(), bitId: 'basic_steel', health: 100 }]);
  equippedBitInstanceId.set('init_bit_' + Date.now()); drillHealth.set(100); currentDay.set(1);
  playerPosition.set(null); revealedHexes.set(new Set()); completedContracts.set(new Set()); failedContracts.set(new Set());
  poiList.set([]); playerConsumables.set({ nitrogen: 0, paste: 0, obolon: 0 }); activeContract.set(null); currentScreen.set('contracts');
  saveGameState();
}

export function saveHealthToInventory(h) {
  const currentId = get(equippedBitInstanceId);
  if (!currentId) return;
  playerInventory.update(inv => inv.map(i => i.instanceId === currentId ? { ...i, health: h } : i));
  saveGameState();
}

export const GACHA_PRICE = 5000;
export function rollGacha() {
  const r = Math.random();
  let bitId = 'basic_steel';
  if (r > 0.60) bitId = 'tungsten_carbide';
  if (r > 0.85) bitId = 'pcd_insert';
  if (r > 0.98) bitId = 'diamond_core';
  return { instanceId: `bit_${Date.now()}`, bitId, health: 100 };
}

export function getRepairCost(health, bitData) {
  if (health >= 100 || !bitData) return 0;
  const dmg = 100 - health;
  const t = bitData.tier;
  return Math.floor(dmg * (20 + t * 15));
}

export function equipFromInventory(instanceId) {
  const inv = get(playerInventory);
  const item = inv.find(i => i.instanceId === instanceId);
  if (item) { equippedBitInstanceId.set(instanceId); drillHealth.set(item.health); saveGameState(); }
}

export function generateBorehole(targetDepth, regionId, playerLevel = 1) {
  const layers = [];
  if (regionId === 'north') {
    const thawed = +(1.0 + Math.random() * 1.0).toFixed(1);
    const frozenTo = +(targetDepth - thawed).toFixed(1);
    layers.push({ from: 0, to: frozenTo, soilId: 'frozen_sand' });
    layers.push({ from: frozenTo, to: targetDepth, soilId: 'fine_sand' });
  } else {
    if (playerLevel < 3) {
      const cut1 = +(targetDepth * (0.4 + Math.random() * 0.2)).toFixed(1);
      layers.push({ from: 0, to: cut1, soilId: 'soft_loam' });
      layers.push({ from: cut1, to: targetDepth, soilId: 'fine_sand' });
    } else {
      const cut1 = +(targetDepth * (0.20 + Math.random() * 0.15)).toFixed(1);
      const cut2 = +(targetDepth * (0.45 + Math.random() * 0.20)).toFixed(1);
      layers.push({ from: 0, to: cut1, soilId: 'soft_loam' });
      layers.push({ from: cut1, to: cut2, soilId: 'fine_sand' });
      layers.push({ from: cut2, to: targetDepth, soilId: 'granite' });
    }
  }
  return layers;
}

export function revealHexesAround(col, row, radius) {
  revealedHexes.update(set => {
    const newSet = new Set(set);
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (Math.abs(dc) + Math.abs(dr) + Math.abs(-dc - dr) <= radius * 2) newSet.add(`${col + dc},${row + dr}`);
      }
    }
    return newSet;
  });
  saveGameState();
}

export const pendingEvent = writable(null);
export function triggerRandomEvent(col, row) {
  if (Math.random() > 0.25) return;
  const evs = [
    { id: 1, icon: '🚓', title: 'ДПС на трассе', desc: 'Местный патруль докопался до габаритов установки.', positive: false, effect: 'money_minus_2000', effectDesc: 'ШТРАФ 2 000 ₽' },
    { id: 2, icon: '🚜', title: 'Увязли в грязи', desc: 'Дорога оказалась хуже, чем на карте. Теряем время.', positive: false, effect: 'mp_minus', effectDesc: 'ПОТЕРЯ 1 ОЧД' },
    { id: 3, icon: '🔧', title: 'Старая СТО', desc: 'Местный механик подлатал ваш бур за пару бутылок.', positive: true, effect: 'repair_10', effectDesc: 'ПРОЧНОСТЬ +10%' },
    { id: 4, icon: '🗺', title: 'Забытая карта', desc: 'Нашли в бардачке старые геологоразведки.', positive: true, effect: 'reveal_5', effectDesc: 'ОТКРЫТА КАРТА ВОКРУГ' },
  ];
  const ev = evs[Math.floor(Math.random() * evs.length)];
  pendingEvent.set({ ...ev, col, row });
}

export function maintainContracts(active, playerPos, revealed) {
  const newOnes = [];
  const minActive = 8;
  if (active.length >= minActive) return newOnes;
  const _WC = 22, _WR = 30, _NR = 11;
  const usedKeys = new Set(active.map(c => `${c.col},${c.row}`));
  const hexDist = (c1, r1, c2, r2) => { const x1=c1-(r1-(r1&1))/2, z1=r1, y1=-x1-z1, x2=c2-(r2-(r2&1))/2, z2=r2, y2=-x2-z2; return Math.max(Math.abs(x1-x2), Math.abs(y1-y2), Math.abs(z1-z2)); };
  
  const boundary = [];
  for (let row = 0; row < _WR; row++) {
    for (let col = 0; col < _WC; col++) {
      const key = `${col},${row}`;
      if (!playerPos || usedKeys.has(key)) continue;
      const d = hexDist(playerPos.col, playerPos.row, col, row);
      if (d >= 3 && d <= 7) boundary.push([col, row]);
    }
  }
  if (!boundary.length) return newOnes;
  
  const needed = minActive - active.length;
  const lv = get(playerLevel) || 1;
  let nextId = active.length ? Math.max(...active.map(c => c.id)) + 1 : 1;
  
  for (let i = 0; i < needed; i++) {
    const [col, row] = boundary[Math.floor(Math.random() * boundary.length)];
    usedKeys.add(`${col},${row}`);
    const regionId = (row < _NR && lv >= 3) ? 'north' : 'central';
    const region = regions[regionId];
    const targetDepth = Math.round(region.depthRange[0] + Math.random() * (region.depthRange[1] - region.depthRange[0]));
    const reward = Math.round(targetDepth * 1200 * region.rewardMultiplier * (0.85 + Math.random() * 0.3));
    newOnes.push({ id: nextId++, name: `Объект-${String(nextId).padStart(3, '0')}`, regionId, region, targetDepth, reward, layers: generateBorehole(targetDepth, regionId, lv), col, row });
  }
  return newOnes;
}

export const contractTargetDepth = derived(activeContract, $c => $c ? $c.targetDepth : 0);
export const contractProgress = derived([currentDepth, contractTargetDepth], ([$d, $t]) => $t > 0 ? Math.min(100, ($d / $t) * 100) : 0);

export const DRILL_CLASSES = { 
  'basic': { id: 'basic', name: 'УБВ-1', speedMult: 1.0, soilMods: {} },
  'auger': { id: 'auger', name: 'Шнек', speedMult: 1.2, soilMods: { frozen_sand: { speed: 0.5, wear: 2.0 } } }
};
export const equippedDrillClass = writable('basic');