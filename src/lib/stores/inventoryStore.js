// stores/inventoryStore.js - Инвентарь, оборудование, расходники
import { writable, derived, get } from 'svelte/store';
import { drillBitsData, consumablesData, GACHA_PRICE, baseUpgradesData } from './soilData.js';

export const playerInventory = writable([{ instanceId: 'init_bit', bitId: 'basic_steel', health: 100 }]);
export const equippedBitInstanceId = writable('init_bit');
export const equippedItem = derived([playerInventory, equippedBitInstanceId], ([$inv, $id]) => $inv.find(i => i.instanceId === $id) || null);
export const equippedBit = derived(equippedItem, $item => $item ? drillBitsData[$item.bitId] : null);
export const drillHealth = writable(100);

export const playerConsumables = writable({ nitrogen: 0, paste: 0, obolon: 0, fuel: 100 });
export const activeEffects = writable({ nitrogen: false, paste: false, obolon: false });

// Система апгрейдов базы
export const purchasedUpgrades = writable(new Set());

// Вычисление бонусов от апгрейдов
export const upgradeBonuses = derived(purchasedUpgrades, ($upgrades) => {
  let repairDiscount = 0;
  let contractBonus = 0;
  let fuelDiscount = 0;
  
  for (const upgradeId of $upgrades) {
    const upgrade = baseUpgradesData[upgradeId];
    if (upgrade) {
      if (upgrade.effect.repairDiscount) repairDiscount = Math.max(repairDiscount, upgrade.effect.repairDiscount);
      if (upgrade.effect.contractBonus) contractBonus = Math.max(contractBonus, upgrade.effect.contractBonus);
      if (upgrade.effect.fuelDiscount) fuelDiscount = Math.max(fuelDiscount, upgrade.effect.fuelDiscount);
    }
  }
  
  return { repairDiscount, contractBonus, fuelDiscount };
});

export function getRepairCost(health, bitData, discount = 0) {
  if (health >= 100 || !bitData) return 0;
  const dmg = 100 - health;
  const t = bitData.tier;
  const baseCost = Math.floor(dmg * (20 + t * 15));
  return Math.floor(baseCost * (1 - discount));
}

export function equipFromInventory(instanceId) {
  const inv = get(playerInventory);
  const item = inv.find(i => i.instanceId === instanceId);
  if (item) { 
    equippedBitInstanceId.set(instanceId); 
    drillHealth.set(item.health); 
  }
}

export function saveHealthToInventory(h) {
  const currentId = get(equippedBitInstanceId);
  if (!currentId) return;
  playerInventory.update(inv => inv.map(i => i.instanceId === currentId ? { ...i, health: h } : i));
}

export function rollGacha() {
  const r = Math.random();
  let bitId = 'basic_steel';
  if (r > 0.60) bitId = 'tungsten_carbide';
  if (r > 0.85) bitId = 'pcd_insert';
  if (r > 0.98) bitId = 'diamond_core';
  return { instanceId: `bit_${Date.now()}`, bitId, health: 100 };
}

export function purchaseUpgrade(upgradeId) {
  const upgrade = baseUpgradesData[upgradeId];
  if (!upgrade) return { success: false, error: 'Неверный ID апгрейда' };
  
  const currentUpgrades = get(purchasedUpgrades);
  if (currentUpgrades.has(upgradeId)) {
    return { success: false, error: 'Уже куплено' };
  }
  
  if (upgrade.requires && !currentUpgrades.has(upgrade.requires)) {
    return { success: false, error: 'Требуется предыдущий уровень' };
  }
  
  return { success: true, price: upgrade.price, upgrade };
}

export function confirmUpgradePurchase(upgradeId) {
  purchasedUpgrades.update(set => {
    const newSet = new Set(set);
    newSet.add(upgradeId);
    return newSet;
  });
}
