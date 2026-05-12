<script>
  import {
    currentScreen, playerMoney, drillHealth, playerInventory, equippedBitInstanceId,
    equippedItem, equippedBit, drillBitsData, getRepairCost, equipFromInventory,
    consumablesData, playerConsumables, playerOwnedVehicles, playerVehicleId, vehicleData
  } from './stores.js';

  let currentTab = 'vehicles'; // 'vehicles', 'bits', 'repair'

  $: repairCost = getRepairCost($drillHealth, $equippedBit);
  $: canRepair  = $drillHealth < 100 && $playerMoney >= repairCost;

  function repair() {
    if ($drillHealth >= 100 || $playerMoney < repairCost) return;
    playerMoney.update(m => m - repairCost); drillHealth.set(100);
    playerInventory.update(inv => inv.map(i => i.instanceId === $equippedBitInstanceId ? { ...i, health: 100 } : i));
  }

  function buyConsumable(id, price) {
    if ($playerMoney >= price) { playerMoney.update(m => m - price); playerConsumables.update(c => ({ ...c, [id]: (c[id] || 0) + 1 })); }
  }

  function buyVehicle(vid) {
    const v = vehicleData[vid];
    if ($playerOwnedVehicles.includes(vid) || $playerMoney < v.price) return;
    playerMoney.update(m => m - v.price); playerOwnedVehicles.update(ov => [...ov, vid]); playerVehicleId.set(vid);
  }

  function buyBit(bitId) {
    const b = drillBitsData[bitId];
    if ($playerMoney < b.price) return;
    playerMoney.update(m => m - b.price);
    const newId = `bit_${Date.now()}`;
    playerInventory.update(inv => [...inv, { instanceId: newId, bitId, health: 100 }]);
    equipFromInventory(newId);
  }

  const fmt = (n) => n.toLocaleString('ru-RU');
</script>

<div class="root">
  <div class="scanlines"></div>
  <header class="hdr"><button class="btn-back" on:click={() => currentScreen.set('contracts')}>◀ НАЗАД</button><div class="hdr-title">ГАРАЖ И СКЛАД</div><div class="hdr-bal">{fmt($playerMoney)} ₽</div></header>

  <nav class="g-tabs">
    <button class:active={currentTab === 'vehicles'} on:click={() => currentTab = 'vehicles'}>ТЕХНИКА</button>
    <button class:active={currentTab === 'bits'} on:click={() => currentTab = 'bits'}>БУРЫ</button>
    <button class:active={currentTab === 'repair'} on:click={() => currentTab = 'repair'}>ОБСЛУЖИВАНИЕ</button>
  </nav>

  <div class="content">
    {#if currentTab === 'vehicles'}
      <div class="section-title">АВТОПАРК</div>
      <div class="list">
        {#each Object.values(vehicleData) as v}
          {@const owned = $playerOwnedVehicles.includes(v.id)}
          <div class="item-card" class:owned>
            <div class="v-info">
              <div class="v-name">{v.name} <span class="v-mp">({v.mp} ОЧД)</span></div>
              <div class="v-desc">{v.desc}</div>
              <div class="v-stats">Штрафы: Болото {v.costs.swamp} | Вода {v.costs.water === 99 ? 'НЕТ' : v.costs.water}</div>
            </div>
            {#if owned}
              {#if $playerVehicleId === v.id} <button class="btn-equip active" disabled>ИСПОЛЬЗУЕТСЯ</button>
              {:else} <button class="btn-equip" on:click={() => playerVehicleId.set(v.id)}>ВЫБРАТЬ</button> {/if}
            {:else}
              <button class="btn-buy" class:disabled={$playerMoney < v.price} on:click={() => buyVehicle(v.id)}>{fmt(v.price)} ₽</button>
            {/if}
          </div>
        {/each}
      </div>

    {:else if currentTab === 'bits'}
      <div class="section-title">МАГАЗИН БУРОВ</div>
      <div class="list">
        {#each Object.values(drillBitsData) as b}
          <div class="item-card">
            <div class="v-info">
              <div class="v-name">{b.name} <span class="b-tier">T{b.tier}</span></div>
              <div class="v-stats">Твердость: {b.hardness} | Износ: {b.wearRate}x | Скорость: {b.speedMult}x</div>
            </div>
            <button class="btn-buy" class:disabled={$playerMoney < b.price} on:click={() => buyBit(b.bitId)}>{fmt(b.price)} ₽</button>
          </div>
        {/each}
      </div>

    {:else}
      <div class="repair-block">
        <div class="r-title">ТЕКУЩИЙ БУР: {$equippedBit?.name || 'Нет'}</div>
        <div class="r-bar-bg"><div class="r-bar-fg" style="width: {$drillHealth}%" class:critical={$drillHealth < 30}></div></div>
        <div class="r-status">Состояние: {Math.floor($drillHealth)}%</div>
        <button class="btn-repair" class:disabled={!canRepair} on:click={repair}>
          {#if $drillHealth >= 100} ОБОРУДОВАНИЕ В НОРМЕ {:else} ПОЧИНИТЬ ЗА {fmt(repairCost)} ₽ {/if}
        </button>
      </div>
      <div class="section-title" style="margin-top:20px;">РАСХОДНИКИ</div>
      <div class="list">
        {#each Object.entries(consumablesData) as [id, c]}
          <div class="item-card">
            <div class="v-info"><div class="v-name">{c.name}</div><div class="v-desc">{c.desc}</div></div>
            <div class="c-right"><span class="c-qty">В наличии: {$playerConsumables[id] || 0}</span><button class="btn-buy" class:disabled={$playerMoney < c.price} on:click={() => buyConsumable(id, c.price)}>{fmt(c.price)} ₽</button></div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .root { position: relative; width: 100vw; height: 100vh; background: var(--bg-root); color: var(--txt); font-family: var(--f-ui); display: flex; flex-direction: column; overflow: hidden; }
  .scanlines { position: fixed; inset: 0; background: repeating-linear-gradient(0deg, transparent 0, transparent 3px, rgba(0,0,0,.06) 3px, rgba(0,0,0,.06) 4px); pointer-events: none; z-index: 999; }
  .hdr { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--ui-ink); color: #fff; box-shadow: 0 3px 10px rgba(0,0,0,.2); }
  .hdr-title { font-weight: 900; font-size: 14px; letter-spacing: .1em; } .hdr-bal { font-family: var(--f-num); font-weight: 700; color: var(--ui-green-lt); }
  .btn-back { background: rgba(255,255,255,.1); border: none; color: #fff; padding: 6px 12px; border-radius: 4px; font-weight: 700; cursor: pointer; }
  .g-tabs { display: flex; background: var(--ui-bg); border-bottom: 2px solid rgba(42,92,145,.1); }
  .g-tabs button { flex: 1; padding: 12px 0; background: transparent; border: none; color: var(--ui-ink-lt); font-weight: 800; font-size: 11px; cursor: pointer; }
  .g-tabs button.active { color: var(--ui-ink); border-bottom: 3px solid var(--ui-ink); margin-bottom: -2px; }
  .content { flex: 1; overflow-y: auto; padding: 20px; }
  .section-title { font-weight: 900; font-size: 11px; color: var(--ui-ink-lt); letter-spacing: .1em; margin-bottom: 10px; }
  .list { display: flex; flex-direction: column; gap: 10px; }
  .item-card { display: flex; align-items: center; justify-content: space-between; background: rgba(42,92,145,.05); border: 1px solid rgba(42,92,145,.15); padding: 12px; border-radius: 6px; }
  .item-card.owned { border-color: rgba(130,201,30,.4); background: rgba(130,201,30,.05); }
  .v-info { display: flex; flex-direction: column; gap: 4px; } .v-name { font-weight: 900; font-size: 14px; color: var(--ui-ink-dk); } .v-desc { font-size: 10px; color: var(--ui-ink-lt); } .v-stats { font-size: 9px; color: var(--ui-ink); font-weight: 700; }
  .v-mp { color: var(--ui-green-dk); } .b-tier { background: var(--ui-ink); color: #fff; padding: 2px 4px; border-radius: 4px; font-size: 9px; }
  .btn-buy, .btn-equip { padding: 8px 12px; font-weight: 800; font-size: 11px; border-radius: 4px; border: none; cursor: pointer; }
  .btn-buy { background: var(--ui-warm); color: #fff; border-bottom: 3px solid var(--ui-warm-dk); } .btn-buy.disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-equip { background: var(--ui-ink); color: #fff; } .btn-equip.active { background: rgba(42,92,145,.2); color: var(--ui-ink); cursor: default; }
  .c-right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; } .c-qty { font-size: 10px; font-weight: 700; color: var(--ui-ink-lt); }
  .repair-block { background: rgba(224,80,48,.05); border: 1px solid rgba(224,80,48,.2); padding: 16px; border-radius: 6px; text-align: center; }
  .r-title { font-weight: 900; font-size: 12px; color: var(--ui-ink-dk); margin-bottom: 10px; }
  .r-bar-bg { height: 12px; background: rgba(0,0,0,.1); border-radius: 6px; overflow: hidden; margin-bottom: 6px; }
  .r-bar-fg { height: 100%; background: var(--ui-green); transition: width 0.3s; } .r-bar-fg.critical { background: var(--ui-red); }
  .r-status { font-size: 10px; font-weight: 700; color: var(--ui-ink-lt); margin-bottom: 12px; }
  .btn-repair { width: 100%; padding: 12px; background: var(--ui-green); color: #fff; font-weight: 800; border: none; border-bottom: 4px solid var(--ui-green-dk); border-radius: 4px; cursor: pointer; } .btn-repair.disabled { background: rgba(0,0,0,.2); border-color: rgba(0,0,0,.1); color: rgba(255,255,255,.5); cursor: not-allowed; }
</style>