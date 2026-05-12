// stores/index.js - Единая точка экспорта всех сторов
export { 
  soilTypes, 
  regions, 
  drillBitsData, 
  vehicleData, 
  consumablesData, 
  DRILL_CLASSES,
  equippedDrillClass,
  GACHA_PRICE,
  baseUpgradesData
} from './soilData.js';

export {
  playerMoney,
  playerXP,
  playerLevel,
  nextLevelXP,
  playerOwnedVehicles,
  playerVehicleId,
  maxMovementPoints,
  movementPoints,
  fuelTank,
  maxFuelTank,
  canMove,
  consumeFuel,
  refuel,
  prestigeLevel,
  prestigeBonus,
  currentVehicle
} from './playerStore.js';

export {
  playerInventory,
  equippedBitInstanceId,
  equippedItem,
  equippedBit,
  drillHealth,
  playerConsumables,
  activeEffects,
  purchasedUpgrades,
  upgradeBonuses,
  getRepairCost,
  equipFromInventory,
  saveHealthToInventory,
  rollGacha,
  purchaseUpgrade,
  confirmUpgradePurchase
} from './inventoryStore.js';

export {
  playerPosition,
  revealedHexes,
  poiList,
  currentDay,
  currentScreen,
  activeContract,
  completedContracts,
  failedContracts,
  pendingEvent,
  triggerRandomEvent,
  revealHexesAround,
  maintainContracts,
  isMoving,
  movingFrom,
  movingTo,
  moveProgress,
  startMoveAnimation,
  updateMoveProgress
} from './mapStore.js';

export {
  boreholeLayers,
  currentDepth,
  isDrilling,
  activeIncident,
  deployStatus,
  contractTargetDepth,
  contractProgress,
  currentLayer,
  generateBorehole,
  calculateDrilling,
  triggerIncident,
  resolveIncident,
  resetDrillingState
} from './drillStore.js';

export {
  saveGameState,
  loadGameState,
  doPrestige
} from './saveSystem.js';
