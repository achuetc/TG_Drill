// stores/drillStore.js - Бурение, скважины, инциденты
import { writable, derived, get } from 'svelte/store';
import { soilTypes } from './soilData.js';
import { equippedBit, drillHealth, saveHealthToInventory, activeEffects } from './inventoryStore.js';
import { DRILL_CLASSES, equippedDrillClass } from './soilData.js';

export const boreholeLayers = writable([]);
export const currentDepth = writable(0);
export const isDrilling = writable(false);
export const activeIncident = writable(null);
export const deployStatus = writable(0);

// Целевая глубина контракта
export const contractTargetDepth = derived(activeContract, $c => $c ? $c.targetDepth : 0);
export const contractProgress = derived([currentDepth, contractTargetDepth], ([$d, $t]) => $t > 0 ? Math.min(100, ($d / $t) * 100) : 0);

// Текущий слой грунта
export const currentLayer = derived([currentDepth, boreholeLayers], ([$d, $layers]) => {
  if (!$layers || $layers.length === 0) return null;
  const layer = $layers.find(l => $d >= l.from && $d < l.to) || $layers[$layers.length - 1];
  return layer ? { ...layer, soil: soilTypes[layer.soilId] } : null;
});

// Генерация структуры скважины
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

// Расчет скорости бурения и износа
export function calculateDrilling(drillClassId = 'basic') {
  const bit = get(equippedBit);
  const health = get(drillHealth);
  const effects = get(activeEffects);
  const drillClass = DRILL_CLASSES[drillClassId] || DRILL_CLASSES['basic'];
  
  if (!bit || health <= 0) {
    return { speed: 0, wear: 0, broken: true };
  }
  
  const layer = get(currentLayer);
  if (!layer || !layer.soil) {
    return { speed: 0.5, wear: 0.1, broken: false };
  }
  
  const soil = layer.soil;
  
  // Базовая скорость от класса бура
  let speed = drillClass.speedMult * bit.speedMult;
  
  // Модификаторы от грунта (из drillClass.soilMods)
  const soilMod = drillClass.soilMods[soil.id];
  if (soilMod) {
    speed *= (soilMod.speed || 1.0);
  }
  
  // Штраф за плотность грунта
  speed /= (soil.density / 1.5);
  
  // Бонусы от эффектов
  if (effects.obolon) speed *= 1.3;
  
  // Износ
  let wear = bit.wearRate * (soil.abrasiveness / 5);
  
  // Модификаторы износа от грунта
  if (soilMod && soilMod.wear) {
    wear *= soilMod.wear;
  }
  
  // Защита от пасты
  if (effects.paste) wear *= 0.5;
  
  // Критический износ при низком здоровье
  if (health < 20) wear *= 1.5;
  
  // Проверка на NaN
  if (isNaN(speed)) speed = 0.1;
  if (isNaN(wear)) wear = 0.1;
  
  return { 
    speed: Math.max(0.01, speed), 
    wear: Math.max(0.001, wear), 
    broken: false 
  };
}

// Обработка инцидента
export function triggerIncident(type) {
  const incidents = {
    jam: { id: 'jam', name: 'Заклинивание!', desc: 'Бур застрял в породе! Быстро вращайте!', qte: true },
    overload: { id: 'overload', name: 'Перегрев двигателя', desc: 'Снизьте нагрузку!', qte: false },
    collapse: { id: 'collapse', name: 'Обрушение ствола', desc: 'Нужно закрепить стенки!', qte: true },
  };
  
  const incident = incidents[type] || incidents['jam'];
  activeIncident.set(incident);
}

export function resolveIncident(success) {
  if (success) {
    activeIncident.set(null);
    return { success: true, damage: 0 };
  } else {
    const health = get(drillHealth);
    const damage = Math.floor(health * 0.3);
    saveHealthToInventory(Math.max(0, health - damage));
    drillHealth.update(h => Math.max(0, h - damage));
    activeIncident.set(null);
    return { success: false, damage };
  }
}

// Сброс состояния бурения
export function resetDrillingState() {
  currentDepth.set(0);
  boreholeLayers.set([]);
  isDrilling.set(false);
  activeIncident.set(null);
  deployStatus.set(0);
  activeEffects.set({ nitrogen: false, paste: false, obolon: false });
}
