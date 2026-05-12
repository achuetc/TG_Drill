// stores/playerStore.js - Состояние игрока: деньги, опыт, уровень, транспорт
import { writable, derived, get } from 'svelte/store';
import { vehicleData } from './soilData.js';

export const playerMoney = writable(15000);
export const playerXP = writable(0);
export const playerLevel = derived(playerXP, $xp => Math.floor(Math.sqrt($xp / 100)) + 1);
export const nextLevelXP = derived(playerLevel, $lv => Math.pow($lv, 2) * 100);

export const playerOwnedVehicles = writable(['zil']);
export const playerVehicleId = writable('zil');
export const maxMovementPoints = derived(playerVehicleId, $id => vehicleData[$id]?.mp || 6);

// Очки действия (ОЧД) теперь зависят от топлива
export const movementPoints = writable(6);

// Подписка: если сменили транспорт, корректируем текущие ОЧД
maxMovementPoints.subscribe(m => { 
  const current = get(movementPoints);
  if (current > m) movementPoints.set(m); 
});

// Топливная система
export const fuelTank = writable(100); // Литры в баке
export const maxFuelTank = derived(playerVehicleId, $id => {
  const vehicle = vehicleData[$id];
  // Разные машины имеют разный объем бака
  return vehicle?.id === 'vityaz' ? 300 : vehicle?.id === 'mtlb' ? 250 : vehicle?.id === 'ural' ? 200 : 150;
});

// Проверка, хватает ли топлива на перемещение
export function canMove(fuelCost) {
  const fuel = get(fuelTank);
  return fuel >= fuelCost;
}

// Расход топлива при перемещении
export function consumeFuel(amount) {
  fuelTank.update(f => Math.max(0, f - amount));
}

// Заправка
export function refuel(amount) {
  const maxFuel = get(maxFuelTank);
  fuelTank.update(f => Math.min(maxFuel, f + amount));
}

// Престиж
export const prestigeLevel = writable(0);
export const prestigeBonus = derived(prestigeLevel, $p => 1 + $p * 0.15);

export function doPrestige() {
  prestigeLevel.update(p => p + 1);
  // Сброс прогресса (вызывается извне)
}

// Текущий транспорт
export const currentVehicle = derived(playerVehicleId, $id => vehicleData[$id] || vehicleData['zil']);
