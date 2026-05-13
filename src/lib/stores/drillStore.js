import { writable, derived, get } from 'svelte/store';
import { soilTypes, DRILL_CLASSES } from './soilData.js';
import { equippedBit, drillHealth, saveHealthToInventory, activeEffects } from './inventoryStore.js';
// Важно: берем activeContract из карты
import { activeContract } from './mapStore.js';

export const boreholeLayers = writable([]);
export const currentDepth = writable(0);
export const isDrilling = writable(false);
export const activeIncident = writable(null);
export const deployStatus = writable(0);

// Вычисляем целевую глубину из активного контракта
export const contractTargetDepth = derived(activeContract, $c => $c ? $c.targetDepth : 0);

// Прогресс бурения
export const contractProgress = derived([currentDepth, contractTargetDepth], ([$d, $t]) => 
    $t > 0 ? Math.min(100, ($d / $t) * 100) : 0
);

// Текущий слой грунта
export const currentLayer = derived([currentDepth, boreholeLayers], ([$d, $layers]) => {
  if (!$layers || $layers.length === 0) return null;
  const layer = $layers.find(l => $d >= l.from && $d < l.to) || $layers[$layers.length - 1];
  return layer ? { ...layer, soil: soilTypes[layer.soilId] } : null;
});

export function calculateDrilling(drillClassId = 'basic') {
  const bit = get(equippedBit);
  const health = get(drillHealth);
  const effects = get(activeEffects);
  const drillClass = DRILL_CLASSES[drillClassId] || DRILL_CLASSES['basic'];
  
  if (!bit || health <= 0) return { speed: 0, wear: 0, broken: true };
  
  const layer = get(currentLayer);
  if (!layer || !layer.soil) return { speed: 0.5, wear: 0.1, broken: false };
  
  const soil = layer.soil;
  let speed = drillClass.speedMult * bit.speedMult;
  const soilMod = drillClass.soilMods[soil.id];
  if (soilMod) speed *= (soilMod.speed || 1.0);
  
  speed /= (soil.density / 1.5);
  if (effects.obolon) speed *= 1.3;
  
  let wear = bit.wearRate * (soil.abrasiveness / 5);
  if (soilMod && soilMod.wear) wear *= soilMod.wear;
  if (effects.paste) wear *= 0.5;
  if (health < 20) wear *= 1.5;
  
  if (isNaN(speed)) speed = 0.1;
  if (isNaN(wear)) wear = 0.1;
  
  return { speed: Math.max(0.01, speed), wear: Math.max(0.001, wear), broken: false };
}

export function triggerIncident(type) {
  const incidents = {
    jam: { id: 'jam', name: 'Заклинивание!', desc: 'Бур застрял!', qte: true },
    overload: { id: 'overload', name: 'Перегрев', desc: 'Сбавьте обороты!', qte: false },
    collapse: { id: 'collapse', name: 'Обрушение', desc: 'Стенки не держат!', qte: true },
  };
  activeIncident.set(incidents[type] || incidents['jam']);
}

export function resolveIncident(success) {
  if (success) {
    activeIncident.set(null);
    return { success: true, damage: 0 };
  } else {
    const health = get(drillHealth);
    const damage = Math.floor(health * 0.3);
    drillHealth.update(h => Math.max(0, h - damage));
    saveHealthToInventory(get(drillHealth));
    activeIncident.set(null);
    return { success: false, damage };
  }
}

export function resetDrillingState() {
  currentDepth.set(0);
  boreholeLayers.set([]);
  isDrilling.set(false);
  activeIncident.set(null);
  deployStatus.set(0);
}