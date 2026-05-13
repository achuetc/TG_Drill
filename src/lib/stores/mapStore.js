import { writable, derived, get } from 'svelte/store';
import { playerVehicleId, fuelTank, consumeFuel, playerLevel } from './playerStore.js';
import { vehicleData, regions, generateBorehole } from './soilData.js';

export const playerPosition = writable(null);
export const revealedHexes = writable(new Set());
export const poiList = writable([]);
export const currentDay = writable(1);

export const currentScreen = writable('contracts');
export const activeContract = writable(null);
export const contractTargetDepth = derived(activeContract, $c => $c ? $c.targetDepth : 0);
export const completedContracts = writable(new Set());
export const failedContracts = writable(new Set());

// Очередь событий
export const pendingEvent = writable(null);

// Генерация случайных событий
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

// Раскрытие гексов вокруг позиции
export function revealHexesAround(col, row, radius) {
  revealedHexes.update(set => {
    const newSet = new Set(set);
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (Math.abs(dc) + Math.abs(dr) + Math.abs(-dc - dr) <= radius * 2) {
          newSet.add(`${col + dc},${row + dr}`);
        }
      }
    }
    return newSet;
  });
}

// Поддержка списка контрактов
export function maintainContracts(active, playerPos, revealed) {
  const newOnes = [];
  const minActive = 8;
  if (active.length >= minActive) return newOnes;
  const _WC = 22, _WR = 30, _NR = 11;
  const usedKeys = new Set(active.map(c => `${c.col},${c.row}`));
  const hexDist = (c1, r1, c2, r2) => { 
    const x1 = c1 - (r1 - (r1 & 1)) / 2, z1 = r1, y1 = -x1 - z1;
    const x2 = c2 - (r2 - (r2 & 1)) / 2, z2 = r2, y2 = -x2 - z2;
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
  };
  
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
    newOnes.push({ 
      id: nextId++, 
      name: `Объект-${String(nextId).padStart(3, '0')}`, 
      regionId, 
      region, 
      targetDepth, 
      reward, 
      layers: generateBorehole(targetDepth, regionId, lv), 
      col, 
      row 
    });
  }
  return newOnes;
}

// Расчет стоимости перемещения между гексами
export function getMovementCost(fromCol, fromRow, toCol, toRow, biomeCosts) {
  const vehicleId = get(playerVehicleId);
  const vehicle = vehicleData[vehicleId];
  if (!vehicle) return 99;
  
  // Базовая стоимость зависит от биома целевого гекса
  // biomeCosts передаются из MapCanvas
  const biomeKey = `hex_${toCol}_${toRow}`;
  // Упрощенно: считаем среднюю стоимость
  return 1; // Будет переопределено в MapCanvas с учетом биома
}

// Анимация движения (для визуализации в MapCanvas)
export const isMoving = writable(false);
export const movingFrom = writable(null);
export const movingTo = writable(null);
export const moveProgress = writable(0);

export function startMoveAnimation(from, to) {
  movingFrom.set(from);
  movingTo.set(to);
  moveProgress.set(0);
  isMoving.set(true);
}

export function updateMoveProgress(progress) {
  moveProgress.set(progress);
  if (progress >= 1) {
    isMoving.set(false);
  }
}
