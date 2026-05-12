// stores/soilData.js - Данные о грунтах, регионах и оборудовании
import { writable } from 'svelte/store';

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
  'zil': { id: 'zil', name: 'ЗиЛ-131', desc: 'Стандартный грузовик. Тяжело идет по болотам.', price: 0, mp: 6, costs: { swamp: 3, taiga: 2, rock: 2, ice: 2, steppe: 1, water: 99 }, fuelConsumption: 1.0 },
  'ural': { id: 'ural', name: 'Урал-4320', desc: 'Мощный трехосный. Лес и грязь не помеха.', price: 35000, mp: 8, costs: { swamp: 2, taiga: 1, rock: 2, ice: 2, steppe: 1, water: 99 }, fuelConsumption: 1.3 },
  'mtlb': { id: 'mtlb', name: 'МТ-ЛБ', desc: 'Гусеничный вездеход. Идеально для Севера.', price: 120000, mp: 10, costs: { swamp: 1, taiga: 1, rock: 2, ice: 1, steppe: 1, water: 99 }, fuelConsumption: 1.5 },
  'vityaz': { id: 'vityaz', name: 'ДТ-30 «Витязь»', desc: 'Легенда Севера. Умеет плавать!', price: 450000, mp: 12, costs: { swamp: 1, taiga: 1, rock: 1, ice: 1, steppe: 1, water: 3 }, fuelConsumption: 2.0 },
};

export const consumablesData = { 
  nitrogen: { name: 'Жидкий азот', desc: '+20% прочности', price: 1500, type: 'repair' }, 
  paste: { name: 'Полимерная паста', desc: 'Защита от износа', price: 3000, type: 'protect' }, 
  obolon: { name: 'Оболонь', desc: 'Бурение сквозь боль', price: 5000, type: 'buff' },
  fuel: { name: 'Топливо (канистра)', desc: '20 литров ДТ', price: 800, type: 'fuel', amount: 20 }
};

export const DRILL_CLASSES = { 
  'basic': { id: 'basic', name: 'УБВ-1', speedMult: 1.0, soilMods: {} },
  'auger': { id: 'auger', name: 'Шнек', speedMult: 1.2, soilMods: { frozen_sand: { speed: 0.5, wear: 2.0 } } }
};
export const equippedDrillClass = writable('basic');

export const GACHA_PRICE = 5000;

// Система апгрейдов базы
export const baseUpgradesData = {
  'workshop_l1': { id: 'workshop_l1', name: 'Ремонтная яма I', desc: '-10% к стоимости ремонта', price: 25000, effect: { repairDiscount: 0.10 } },
  'workshop_l2': { id: 'workshop_l2', name: 'Ремонтная яма II', desc: '-20% к стоимости ремонта', price: 60000, effect: { repairDiscount: 0.20 }, requires: 'workshop_l1' },
  'logistics_l1': { id: 'logistics_l1', name: 'Логистика I', desc: '+10% к награде контрактов', price: 35000, effect: { contractBonus: 0.10 } },
  'logistics_l2': { id: 'logistics_l2', name: 'Логистика II', desc: '+20% к награде контрактов', price: 80000, effect: { contractBonus: 0.20 }, requires: 'logistics_l1' },
  'fuel_storage_l1': { id: 'fuel_storage_l1', name: 'Топливный склад I', desc: '-15% цена топлива', price: 40000, effect: { fuelDiscount: 0.15 } },
  'fuel_storage_l2': { id: 'fuel_storage_l2', name: 'Топливный склад II', desc: '-30% цена топлива', price: 90000, effect: { fuelDiscount: 0.30 }, requires: 'fuel_storage_l1' },
};
