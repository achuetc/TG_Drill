// stores/saveSystem.js - Система сохранений
import { get } from 'svelte/store';
import { playerMoney, playerXP, playerOwnedVehicles, playerVehicleId, fuelTank, prestigeLevel, doPrestige as playerDoPrestige } from './playerStore.js';
import { playerInventory, equippedBitInstanceId, drillHealth, playerConsumables, purchasedUpgrades } from './inventoryStore.js';
import { playerPosition, revealedHexes, currentDay, completedContracts, failedContracts, activeContract } from './mapStore.js';
import { boreholeLayers, currentDepth } from './drillStore.js';

const SAVE_KEY = 'tg_drill_save_v4';

export function saveGameState() {
  const state = {
    money: get(playerMoney),
    xp: get(playerXP),
    ownedVehicles: get(playerOwnedVehicles),
    vehicleId: get(playerVehicleId),
    fuel: get(fuelTank),
    inventory: get(playerInventory),
    equippedBitId: get(equippedBitInstanceId),
    health: get(drillHealth),
    pos: get(playerPosition),
    revealed: Array.from(get(revealedHexes)),
    day: get(currentDay),
    consumables: get(playerConsumables),
    completed: Array.from(get(completedContracts)),
    failed: Array.from(get(failedContracts)),
    prestige: get(prestigeLevel),
    upgrades: Array.from(get(purchasedUpgrades)),
    // Текущий контракт (без слоев, они восстанавливаются)
    activeContract: get(activeContract) ? {
      ...get(activeContract),
      layers: undefined // Слои не сохраняем, генерируются заново
    } : null,
    // Состояние бурения если активное
    drilling: get(currentDepth) > 0 ? {
      depth: get(currentDepth),
      layers: get(boreholeLayers)
    } : null
  };
  try { 
    localStorage.setItem(SAVE_KEY, JSON.stringify(state)); 
  } catch (e) { 
    console.error("Save failed", e); 
  }
}

export function loadGameState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    
    if (state.money !== undefined) playerMoney.set(state.money);
    if (state.xp !== undefined) playerXP.set(state.xp);
    if (state.ownedVehicles) playerOwnedVehicles.set(state.ownedVehicles);
    if (state.vehicleId) playerVehicleId.set(state.vehicleId);
    if (state.fuel !== undefined) fuelTank.set(state.fuel);
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
    if (state.upgrades) purchasedUpgrades.set(new Set(state.upgrades));
    if (state.activeContract) activeContract.set(state.activeContract);
    if (state.drilling) {
      currentDepth.set(state.drilling.depth);
      boreholeLayers.set(state.drilling.layers);
    }
    
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
fuelTank.subscribe(() => saveGameState());
purchasedUpgrades.subscribe(() => saveGameState());

// Престиж с полным сбросом
export function doPrestige() {
  playerDoPrestige();
  playerMoney.set(15000);
  playerXP.set(0);
  playerInventory.set([{ instanceId: 'init_bit_' + Date.now(), bitId: 'basic_steel', health: 100 }]);
  equippedBitInstanceId.set('init_bit_' + Date.now());
  drillHealth.set(100);
  currentDay.set(1);
  playerPosition.set(null);
  revealedHexes.set(new Set());
  completedContracts.set(new Set());
  failedContracts.set(new Set());
  activeContract.set(null);
  purchasedUpgrades.set(new Set());
  fuelTank.set(100);
  saveGameState();
}
