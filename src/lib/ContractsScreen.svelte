<script>
  import {
    currentScreen, activeContract, boreholeLayers,
    currentDepth, drillHealth, isDrilling, playerMoney, playerXP, playerLevel, nextLevelXP,
    movementPoints, maxMovementPoints, currentDay,
    poiList, playerInventory, rollGacha,
    playerPosition, pendingEvent, revealHexesAround,
    saveHealthToInventory, playerConsumables, prestigeLevel, prestigeBonus,
  } from './stores/index.js';
  import MapCanvas from './MapCanvas.svelte';

  let selectedContract = null; let selectedPOI = null; let mineResult = null;  
  let autoMove = false; 

  function handleSelect(e) { selectedContract = e.detail; }
  function accept() { if (!selectedContract) return; const c = selectedContract; selectedContract = null; currentDepth.set(0); isDrilling.set(false); activeContract.set(c); boreholeLayers.set(c.layers); currentScreen.set('terminal'); }
  function dismiss() { selectedContract = null; }
  function handleArrivedPoi(e) { selectedPOI = e.detail; mineResult = null; }
  function dismissPOI() { selectedPOI = null; mineResult = null; }
  function enterVillage() { dismissPOI(); currentScreen.set('garage'); }

  function exploreMine() {
    if (!selectedPOI) return; poiList.update(list => list.map(p => p.id === selectedPOI.id ? { ...p, used: true } : p));
    const r = Math.random();
    if (r < 0.40) { const amount = 500 + Math.floor(Math.random() * 2000); playerMoney.update(m => m + amount); mineResult = { type: 'money', amount }; }
    else if (r < 0.72) { const newBit = rollGacha(); playerInventory.update(inv => [...inv, newBit]); mineResult = { type: 'bit', rarity: newBit.bitId }; }
    else { drillHealth.update(h => Math.max(0, h - 35)); mineResult = { type: 'damage' }; }
  }

  let qteActive = false, qteProgress = 0, qteDir = 1, qteTimer = null, qteSuccess = null;

  $: if ($pendingEvent && !qteActive && qteSuccess === null) {
    qteActive = true; qteProgress = 0; qteSuccess = null;
    qteTimer = setInterval(() => { qteProgress += qteDir * 3; if (qteProgress >= 100) { qteProgress = 100; qteDir = -1; } if (qteProgress <= 0) { qteProgress = 0; qteDir = 1; } }, 20);
  }

  function stopQTE() { clearInterval(qteTimer); qteActive = false; qteSuccess = (qteProgress >= 40 && qteProgress <= 60); }

  function applyEvent() {
    const ev = $pendingEvent; if (!ev) return;
    if (!qteSuccess && !ev.positive) {
      if (ev.effect === 'money_minus_2000') playerMoney.update(m => Math.max(0, m - 2000));
      if (ev.effect === 'money_minus_1500') playerMoney.update(m => Math.max(0, m - 1500));
      if (ev.effect === 'mp_minus') movementPoints.update(m => Math.max(0, m - 1));
    } else if (ev.positive) {
      let mult = qteSuccess ? 2 : 1;
      if (ev.effect === 'reveal_5' && qteSuccess) revealHexesAround(ev.col, ev.row, 5);
      if (ev.effect === 'reveal_4' && qteSuccess) revealHexesAround(ev.col, ev.row, 4);
      if (ev.effect === 'repair_10') { const newH = Math.min(100, $drillHealth + 10 * mult); drillHealth.set(newH); saveHealthToInventory(newH); }
      if (ev.effect === 'money_plus_1500') playerMoney.update(m => m + 1500 * mult);
      if (ev.effect === 'consumable_paste') playerConsumables.update(c => ({ ...c, paste: (c.paste ?? 0) + 1 * mult }));
      if (ev.effect === 'mp_bonus') movementPoints.update(m => Math.min($maxMovementPoints + 1, m + mult));
    }
    pendingEvent.set(null); qteSuccess = null;
  }

  let dayFlash = false, _flashTimer = null;
  function endDay() { movementPoints.set($maxMovementPoints); currentDay.update(d => d + 1); dayFlash = false; clearTimeout(_flashTimer); requestAnimationFrame(() => { dayFlash = true; _flashTimer = setTimeout(() => { dayFlash = false; }, 800); }); }

  $: brokenBit = $drillHealth <= 0;
  const fmt = (n) => n.toLocaleString('ru-RU');
</script>

<div class="root">
  <div class="scanlines" aria-hidden="true"></div>
  {#if dayFlash} <div class="day-flash" aria-hidden="true"></div> {/if}

  <header class="hdr">
    <span class="blink hdr-deco">█</span><span class="hdr-title">DRILL_SYS v2.4.1</span><span class="blink hdr-deco">█</span>
    {#if $prestigeLevel > 0}<span class="hdr-prestige">★{$prestigeLevel}</span>{/if}
    <span class="hdr-xp">УР.{$playerLevel}&nbsp;·&nbsp;XP&nbsp;{$playerXP}/{$nextLevelXP}</span>
    <span class="hdr-right">БАЛАНС:&nbsp;{fmt($playerMoney)}&nbsp;₽</span>
  </header>

  <nav class="nav">
    <button class="nav-tab active">◈ КОНТРАКТЫ</button>
    <button class="nav-tab" on:click={() => currentScreen.set('garage')}>⚙ ГАРАЖ</button>
    <button class="nav-tab" on:click={() => currentScreen.set('casino')}>🎰 КАЗИНО</button>
  </nav>

  {#if brokenBit} <div class="broken-warn blink-slow">⚠ ИНСТРУМЕНТ СЛОМАН — РЕМОНТ ОБЯЗАТЕЛЕН ПЕРЕД БУРЕНИЕМ</div> {/if}

  <div class="map-wrap">
    <MapCanvas {autoMove} on:select={handleSelect} on:arrivedPoi={handleArrivedPoi} />
    <div class="map-hint">◈ ПЕРЕМЕЩАЙТЕСЬ ПО КАРТЕ</div>

    {#if selectedPOI && !selectedContract}
      <div class="sheet-overlay" on:click|self={dismissPOI} role="dialog" aria-modal="true">
        <div class="sheet poi-sheet">
          <i class="rv tl"></i><i class="rv tr"></i><i class="rv bl"></i><i class="rv br"></i>
          {#if selectedPOI.type === 'village'}
            <div class="sheet-hdr"><span class="sheet-num">⌂</span><span class="sheet-name">ДЕРЕВНЯ</span><button class="sheet-close" on:click={dismissPOI}>✕</button></div>
            <p class="poi-desc">Здесь можно починить оборудование, улучшить буровую установку и купить расходники.</p>
            <div class="sheet-actions">
              <button class="btn-accept" on:click={enterVillage}>[ ⚙ ВОЙТИ В ДЕРЕВНЮ ]</button>
              <button class="btn-cancel" on:click={dismissPOI}>[ ПРОЙТИ МИМО ]</button>
            </div>
          {:else}
            <div class="sheet-hdr"><span class="sheet-num">✕</span><span class="sheet-name">ЗАБРОШЕННАЯ ШАХТА</span><button class="sheet-close" on:click={dismissPOI}>✕</button></div>
            {#if mineResult === null}
              <p class="poi-desc">Старая шахта. Говорят, иногда здесь находят что-то ценное. А иногда — только неприятности.</p>
              <div class="sheet-actions">
                <button class="btn-accept" on:click={exploreMine}>[ ИССЛЕДОВАТЬ ]</button>
                <button class="btn-cancel" on:click={dismissPOI}>[ УЙТИ ]</button>
              </div>
            {:else}
              {#if mineResult.type === 'money'} <p class="poi-desc loot-good">💰 Найдено: <strong>{fmt(mineResult.amount)} ₽</strong> в старой кассе!</p>
              {:else if mineResult.type === 'bit'} <p class="poi-desc loot-good">🔩 Найдена коронка: <strong>{mineResult.rarity}</strong>!</p>
              {:else} <p class="poi-desc loot-bad blink-slow">⚠ Обвал! Бур повреждён на 35%.</p> {/if}
              <div class="sheet-actions"><button class="btn-accept" on:click={dismissPOI}>[ ПРОДОЛЖИТЬ ]</button></div>
            {/if}
          {/if}
        </div>
      </div>
    {/if}

    {#if $pendingEvent}
      {@const ev = $pendingEvent}
      <div class="ev-overlay" role="dialog" aria-modal="true">
        <div class="ev-card">
          <i class="rv tl"></i><i class="rv tr"></i><i class="rv bl"></i><i class="rv br"></i>
          <div class="ev-icon">{ev.icon}</div><div class="ev-title">{ev.title}</div><div class="ev-desc">{ev.desc}</div>
          <div class="ev-effect" class:ev-pos={ev.positive} class:ev-neg={!ev.positive}>{ev.positive ? '▲' : '▼'}&nbsp;{ev.effectDesc} {qteSuccess && ev.positive ? '(БОНУС ×2)' : ''}</div>
          <div class="qte-container">
             <div class="qte-bar"><div class="qte-target"></div><div class="qte-cursor" style="left: {qteProgress}%"></div></div>
             {#if qteActive}
               <button class="btn-accept ev-accept-btn" style="background: var(--ui-warm); border-bottom-color: var(--ui-warm-dk);" on:click={stopQTE}>[ ОСТАНОВИТЬ БЕГУНОК ]</button>
             {:else}
               <div class="qte-result" class:qte-good={qteSuccess} class:qte-bad={!qteSuccess}>{qteSuccess ? (ev.positive ? 'УСПЕХ! БОНУС УДВОЕН!' : 'УСПЕХ! ШТРАФ ИЗБЕЖАН!') : 'ПРОВАЛ'}</div>
               <button class="btn-accept ev-accept-btn" on:click={applyEvent}>[ ПРОДОЛЖИТЬ ПУТЬ ]</button>
             {/if}
          </div>
        </div>
      </div>
    {/if}

    {#if selectedContract}
      {@const c = selectedContract} {@const _pos = $playerPosition} {@const onSite = _pos != null && _pos.col === c.col && _pos.row === c.row}
      <div class="sheet-overlay" on:click|self={dismiss} role="dialog" aria-modal="true">
        <div class="sheet" class:prestige-sheet={c.isPrestige}>
          <i class="rv tl"></i><i class="rv tr"></i><i class="rv bl"></i><i class="rv br"></i>
          {#if c.isPrestige} <div class="prestige-sheet-badge blink-slow">★ ПРЕСИЖ-КОНТРАКТ ★</div> {/if}
          <div class="sheet-hdr"><span class="sheet-num">{c.isPrestige ? '★' : `[${String(c.id + 1).padStart(2,'0')}]`}</span><span class="sheet-name" class:prestige-name={c.isPrestige}>{c.name}</span><button class="sheet-close" on:click={dismiss}>✕</button></div>
          <div class="sheet-specs">
            <div class="spec-row"><span class="lbl">РЕГИОН</span><span class="val">{c.region.name}{#if c.regionId === 'north'}<span class="ice">❄</span>{/if}</span></div>
            <div class="spec-row"><span class="lbl">ГЛУБИНА</span><span class="val amber">{c.targetDepth} М</span></div>
            <div class="spec-row"><span class="lbl">НАГРАДА</span>{#if c.isPrestige}<span class="val prestige-reward">ПРЕСИЖ ★{$prestigeLevel + 1}</span>{:else}<span class="val reward">{fmt(Math.round(c.reward * $prestigeBonus))} ₽</span>{/if}</div>
          </div>
          {#if c.isPrestige} <div class="prestige-sheet-desc">Достигните глубины 1 200 М, чтобы получить бонус.</div>
          {:else if c.regionId === 'north'} <div class="pf-warn blink-slow">⚠ ВЕЧНАЯ МЕРЗЛОТА С 0 М</div> {/if}
          <div class="layer-preview">
            {#each c.layers as l} {@const thick = ((l.to - l.from) / c.targetDepth * 100).toFixed(0)} <div class="layer-stripe" style="flex:{thick}; background:{l.soilId === 'frozen_sand' ? '#1a3a5a' : l.soilId === 'soft_loam' ? '#3d2b15' : l.soilId === 'fine_sand' ? '#4a3820' : '#1e1e25'}" title="{l.from}–{l.to}м"></div> {/each}
          </div>
          {#if !c.isPrestige}
            <div class="geo-forecast">
              <div class="geo-title">⛏ ГЕОЛОГИЧЕСКИЙ ПРОГНОЗ</div>
              {#each c.layers as l}
                {@const pct = Math.round((l.to - l.from) / c.targetDepth * 100)} {@const SNAME = { fine_sand:'Песок', soft_loam:'Суг', frozen_sand:'Мерзл', granite:'Гран' }} {@const SCOL  = { fine_sand:'#c09030', soft_loam:'#7a5c3a', frozen_sand:'#4a8ab4', granite:'#6a6a80' }}
                <div class="geo-row"><span class="geo-name">{SNAME[l.soilId] ?? l.soilId}</span><div class="geo-bar"><div class="geo-fill" style="width:{pct}%; background:{SCOL[l.soilId] ?? '#888'}"></div></div><span class="geo-pct">{pct}%</span></div>
              {/each}
              {#if c.layers.some((l, i) => i > 0 && l.soilId === 'fine_sand')} <div class="water-warn blink-slow">⚠ Возможен напорный водонос</div> {/if}
            </div>
          {/if}
          <div class="sheet-actions">
            {#if brokenBit} <div class="broken-inline blink-slow">⚠ РЕМОНТ ОБЯЗАТЕЛЕН</div> <button class="btn-garage" on:click={() => currentScreen.set('garage')}>[ ⚙ В ГАРАЖ ]</button>
            {:else if onSite} <button class="btn-accept" on:click={accept}>[ 🔩 НАЧАТЬ БУРЕНИЕ ]</button>
            {:else} <button class="btn-toofar" disabled>[ 🚛 СЛИШКОМ ДАЛЕКО ]</button> <div class="toofar-hint">Приблизьтесь к объекту для начала работ</div> {/if}
            <button class="btn-cancel" on:click={dismiss}>[ ОТМЕНА ]</button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="action-bar">
    <div class="mp-track">
      <span class="mp-label">ОЧД</span>
      {#each Array($maxMovementPoints) as _, i} <span class="mp-dot" class:mp-used={i >= $movementPoints}>◈</span> {/each}
      <span class="day-num">ДЕНЬ {$currentDay}</span>
    </div>
    <button class="btn-toggle-move" class:auto={autoMove} on:click={() => autoMove = !autoMove}>{autoMove ? 'АВТО' : 'РУЧНОЙ'}</button>
    <button class="btn-endday" on:click={endDay}>[ ЗАВЕРШИТЬ ДЕНЬ ]</button>
  </div>
</div>

<style>
  .root { position: relative; width: 100vw; height: 100vh; background: var(--bg-root); color: var(--txt); font-family: var(--f-ui); display: flex; flex-direction: column; overflow: hidden; }
  .scanlines { position: fixed; inset: 0; background: repeating-linear-gradient(0deg, transparent 0, transparent 3px, rgba(0,0,0,.06) 3px, rgba(0,0,0,.06) 4px); pointer-events: none; z-index: 999; }
  .hdr { flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--ui-ink); color: #fff; font-family: var(--f-ui); font-weight: 800; font-size: 12px; letter-spacing: .04em; box-shadow: 0 3px 10px rgba(42,92,145,.35); }
  .hdr-prestige { color: #ffd060; } .hdr-xp { margin-left: auto; font-size: 10px; color: rgba(255,255,255,.85); } .hdr-right { margin-left: 14px; font-family: var(--f-num); font-size: 11px; }
  .nav { flex-shrink: 0; display: flex; border-bottom: 3px solid rgba(42,92,145,.12); background: var(--ui-bg); }
  .nav-tab { flex: 1; padding: 10px 0; background: transparent; border: none; border-right: 1px solid rgba(42,92,145,.1); color: var(--ui-ink-lt); font-family: var(--f-ui); font-size: 10px; font-weight: 700; cursor: pointer; }
  .nav-tab:last-child { border-right: none; } .nav-tab:hover { color: var(--ui-ink); background: rgba(42,92,145,.06); } .nav-tab.active { color: var(--ui-ink); font-weight: 900; border-bottom: 3px solid var(--ui-ink); margin-bottom: -3px; }
  .broken-warn { flex-shrink: 0; padding: 7px 14px; font-size: 9px; font-weight: 800; color: var(--ui-red); border-bottom: 2px solid rgba(224,80,48,.2); background: rgba(224,80,48,.08); }
  .map-wrap { flex: 1; position: relative; overflow: hidden; }
  .map-hint { position: absolute; bottom: 10px; left: 0; right: 0; text-align: center; font-size: 9px; letter-spacing: .22em; color: var(--txt-dim); pointer-events: none; z-index: 2; }
  .sheet-overlay { position: absolute; inset: 0; background: rgba(6,4,2,.62); display: flex; align-items: flex-end; z-index: 10; }
  .sheet { position: relative; width: 100%; padding: 20px 20px 28px; display: flex; flex-direction: column; gap: 11px; background: var(--ui-bg); border-radius: var(--ui-radius) var(--ui-radius) 0 0; box-shadow: 0 -8px 40px rgba(0,0,0,.4); animation: slideUp .2s ease-out; }
  .sheet-hdr { display: flex; align-items: baseline; gap: 8px; } .sheet-num { font-family: var(--f-num); font-size: 9px; font-weight: 800; color: var(--ui-ink-lt); } .sheet-name { flex: 1; font-size: 18px; font-weight: 900; color: var(--ui-ink-dk); }
  .sheet-close { background: rgba(42,92,145,.1); border: none; border-radius: 50%; color: var(--ui-ink); font-size: 14px; cursor: pointer; padding: 2px 7px; }
  .sheet-specs { display: flex; flex-direction: column; gap: 5px; } .spec-row { display: flex; justify-content: space-between; align-items: baseline; }
  .lbl { font-size: 9px; font-weight: 700; color: var(--ui-ink-lt); text-transform: uppercase; } .val { font-family: var(--f-num); font-size: 12px; font-weight: 700; color: var(--ui-ink-dk); }
  .val.amber { color: var(--ui-warm-dk); } .val.reward { color: var(--ui-green-dk); } .pf-warn { font-size: 9px; font-weight: 700; color: #3a7ab5; }
  .layer-preview { display: flex; height: 8px; gap: 1px; border-radius: 99px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,.1); } .layer-stripe { min-width: 2px; }
  .sheet-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 3px; }
  .btn-accept, .btn-cancel, .btn-garage { width: 100%; padding: 13px 8px; font-family: var(--f-ui); font-weight: 800; font-size: 12px; cursor: pointer; border-radius: var(--ui-radius-sm); }
  .btn-accept { background: var(--ui-green); border: none; border-bottom: 6px solid var(--ui-green-dk); color: #fff; } .btn-cancel { background: var(--ui-bg); border: 2px solid rgba(42,92,145,.2); color: var(--ui-ink); }
  .btn-garage { background: var(--ui-red); border: none; border-bottom: 6px solid var(--ui-red-dk); color: #fff; } .btn-toofar { width: 100%; padding: 13px 8px; background: rgba(42,92,145,.06); border: 2px dashed rgba(42,92,145,.2); cursor: not-allowed; opacity: .6; }
  .poi-sheet { padding-bottom: 24px; } .poi-desc { font-size: 13px; line-height: 1.55; color: var(--ui-ink-lt); font-weight: 700; margin: 0; } .loot-good { color: var(--ui-green-dk); } .loot-bad { color: var(--ui-red); }
  .action-bar { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; background: var(--ui-bg); border-top: 2px solid rgba(42,92,145,.12); gap: 12px; }
  .mp-track { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; } .mp-dot { font-size: 14px; color: var(--ui-green); } .mp-dot.mp-used { color: rgba(42,92,145,.2); }
  .btn-toggle-move { padding: 8px 12px; font-family: var(--f-ui); font-size: 9px; font-weight: 800; letter-spacing: .08em; cursor: pointer; background: transparent; border: 2px solid rgba(42,92,145,.3); color: var(--ui-ink); border-radius: var(--ui-radius-sm); transition: all .15s; }
  .btn-toggle-move.auto { background: rgba(130,201,30,.15); border-color: var(--ui-green); color: var(--ui-green-dk); }
  .btn-endday { padding: 10px 16px; font-family: var(--f-ui); font-size: 10px; font-weight: 800; cursor: pointer; background: var(--ui-ink); border: none; border-radius: var(--ui-radius-sm); border-bottom: 4px solid var(--ui-ink-dk); color: #fff; }
  .ev-overlay { position: absolute; inset: 0; background: rgba(6,4,2,.72); display: flex; align-items: center; justify-content: center; z-index: 20; }
  .ev-card { position: relative; max-width: 310px; width: 90%; padding: 28px 22px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; background: var(--ui-bg); border-radius: var(--ui-radius); }
  .ev-icon { font-size: 44px; } .ev-title { font-size: 18px; font-weight: 900; } .ev-desc { font-size: 12px; }
  .ev-effect { font-size: 13px; font-weight: 800; padding: 8px 18px; border: 2px solid; border-radius: var(--ui-radius-sm); }
  .ev-pos { color: var(--ui-green-dk); border-color: var(--ui-green); background: rgba(130,201,30,.08); } .ev-neg { color: var(--ui-red); border-color: var(--ui-red); background: rgba(224,80,48,.06); }
  .qte-container { width: 100%; margin-top: 10px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .qte-bar { position: relative; width: 100%; height: 16px; background: rgba(0,0,0,.2); border-radius: 8px; border: 1px solid rgba(255,255,255,.1); }
  .qte-target { position: absolute; left: 40%; width: 20%; height: 100%; background: rgba(130,201,30,.4); border-left: 2px solid var(--ui-green); border-right: 2px solid var(--ui-green); }
  .qte-cursor { position: absolute; top: 0; width: 4px; height: 100%; background: #fff; box-shadow: 0 0 8px #fff; transform: translateX(-50%); }
  .qte-result { font-size: 11px; font-weight: 900; } .qte-good { color: var(--ui-green-dk); } .qte-bad { color: var(--ui-red); }
  .geo-forecast { background: rgba(42,92,145,.07); border: 1px solid rgba(42,92,145,.18); padding: 10px 12px 8px; display: flex; flex-direction: column; gap: 5px; }
  .geo-title { font-size: 10px; font-weight: 900; } .geo-row { display: grid; grid-template-columns: 48px 1fr 24px; align-items: center; gap: 6px; }
  .geo-name { font-size: 11px; } .geo-bar { height: 8px; background: rgba(0,0,0,.10); border-radius: 99px; } .geo-fill { height: 100%; border-radius: 99px; }
  .day-flash { position: absolute; inset: 0; pointer-events: none; z-index: 995; animation: dayFlash 0.8s ease-out forwards; }
  .blink { animation: blink 1s step-start infinite; } .blink-slow { animation: blink 1.6s step-start infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} } @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
  @keyframes dayFlash { 0% { background: rgba(4, 2, 1, 0.0); opacity: 1; } 18% { background: rgba(4, 2, 1, 0.85); } 100% { background: rgba(4, 2, 1, 0.0); opacity: 0; } }
</style>