<script>
  import { onDestroy } from 'svelte';
  import DrillCanvas from './DrillCanvas.svelte';
  import * as audio from './audio.js';
  import {
    currentDepth, drillHealth, currentLayer,
    contractProgress, contractTargetDepth,
    boreholeLayers, soilTypes,
    activeContract, currentScreen, playerMoney, playerXP,
    isDrilling, deployStatus,
    equippedBit, equippedItem, saveHealthToInventory,
    revealHexesAround,
    completedContracts, failedContracts,
    consumablesData, playerConsumables, activeEffects, activeIncident,
    prestigeLevel, prestigeBonus, doPrestige,
    DRILL_CLASSES, equippedDrillClass,
  } from './stores/index.js';

  const consItems = Object.values(consumablesData);

  let pasteEndTime  = 0;
  let obolonEndTime = 0;
  let _pasteActive  = false;
  let _obolonActive = false;

  function applyNitrogen() {
    if (($playerConsumables.nitrogen ?? 0) <= 0) return;
    playerConsumables.update(c => ({ ...c, nitrogen: Math.max(0, c.nitrogen - 1) }));
    drillHealth.update(h => Math.min(100, h + 20));
    activeEffects.update(e => ({ ...e, nitrogen: true }));
    setTimeout(() => activeEffects.update(e => ({ ...e, nitrogen: false })), 420);
  }

  function applyPaste() {
    if (($playerConsumables.paste ?? 0) <= 0 || _pasteActive) return;
    playerConsumables.update(c => ({ ...c, paste: Math.max(0, c.paste - 1) }));
    pasteEndTime = Date.now() + consumablesData.paste.duration;
    _pasteActive = true;
    activeEffects.update(e => ({ ...e, paste: true }));
  }

  function applyObolon() {
    if (($playerConsumables.obolon ?? 0) <= 0 || _obolonActive) return;
    playerConsumables.update(c => ({ ...c, obolon: Math.max(0, c.obolon - 1) }));
    obolonEndTime = Date.now() + consumablesData.obolon.duration;
    _obolonActive = true;
    activeEffects.update(e => ({ ...e, obolon: true }));
  }

  function applyConsumable(id) {
    if (!$isDrilling) return;
    if (id === 'nitrogen') applyNitrogen();
    else if (id === 'paste')   applyPaste();
    else if (id === 'obolon')  applyObolon();
  }

  const INC_DATA = {
    jam:   { icon: '⚙',  title: 'ПРИХВАТ КОЛОННЫ',  desc: 'Вращение заблокировано. Износ ×5!', btn: '🔧 РЕВЕРС РОТОРА'       },
    water: { icon: '💧', title: 'ВОДОПРИТОК',        desc: 'Скорость бурения ×0.2.',                    btn: '💧 ВКЛ. ГРЯЗЕВОЙ НАСОС' },
    void:  { icon: '⚠',  title: 'КАВЕРНА В ПЛАСТЕ', desc: 'Провал на 0.5 м. Немедленно затормозить!',            btn: '⛔ ТОРМОЗ ЛЕБЕДКИ'      },
  };

  let _voidTimerSec    = 0;
  let _voidOneShotDone = false;
  let _prevSoilId      = null;
  let _prevIncident    = false;

  function resolveIncident() {
    activeIncident.set(null);
    _voidTimerSec    = 0;
    _voidOneShotDone = false;
  }

  let intervalId = null;
  let _alive     = false;
  const TICK_MS  = 40;
  let _lastHealth = 100;
  $: _lastHealth = isNaN($drillHealth) ? 100 : $drillHealth;

  function toggleDrilling() {
    _alive ? stopDrilling() : startDrilling();
  }

  function startDrilling() {
    if (_alive || $drillHealth <= 0 || $currentDepth >= $contractTargetDepth) return;
    _alive = true;
    isDrilling.set(true);
    _prevSoilId = null; 
    audio.startDrill($currentLayer?.soil?.density ?? 1.65);
    intervalId = setInterval(tick, TICK_MS);
  }

  function stopDrilling() {
    _alive = false;
    isDrilling.set(false);
    clearInterval(intervalId);
    intervalId = null;
    audio.stopDrill();
    audio.stopAlarm();
    _prevIncident = false;
    if (_pasteActive || _obolonActive) {
      _pasteActive  = false;
      _obolonActive = false;
      activeEffects.update(e => ({ ...e, paste: false, obolon: false }));
    }
    if ($activeIncident) {
      activeIncident.set(null);
      _voidTimerSec    = 0;
      _voidOneShotDone = false;
    }
  }

  function tick() {
    if (!_alive) return;
    const now = Date.now();
    if (_pasteActive && now >= pasteEndTime) {
      _pasteActive = false;
      activeEffects.update(e => ({ ...e, paste: false }));
    }
    if (_obolonActive && now >= obolonEndTime) {
      _obolonActive = false;
      activeEffects.update(e => ({ ...e, obolon: false }));
    }

    const target = Math.max(0.1, $contractTargetDepth || 10);
    // БРОНЯ ОТ NaN
    let depth  = isNaN($currentDepth) ? 0 : $currentDepth;
    let health = isNaN($drillHealth) ? 100 : $drillHealth;
    const bit  = $equippedBit || { speedMult: 1.0, wearRate: 1.0 };

    if (health <= 0) {
      stopDrilling();
      showFailure = true;
      saveHealthToInventory(0);
      return;
    }

    if (depth >= target - 0.01) { 
      currentDepth.set(target);
      stopDrilling();
      if ($activeContract?.isPrestige) { showPrestige = true; }
      else                             { showCompletion = true; }
      saveHealthToInventory(health);
      return;
    }

    const layer = $currentLayer;
    if (!layer || !layer.soil) { stopDrilling(); showCompletion = true; saveHealthToInventory(health); return; }

    let effDens  = layer.soil.density;
    let effAbr   = layer.soil.abrasiveness;

    if (bit.specialTrait === 'heating' && layer.soil.isPermafrost) {
      effDens = soilTypes.fine_sand.density;
      effAbr  = soilTypes.fine_sand.abrasiveness;
    }
    if (bit.specialTrait === 'diamond' && layer.soil.id === 'granite') {
      effDens = soilTypes.soft_loam.density;
      effAbr  = soilTypes.soft_loam.abrasiveness;
    }

    if (layer.soilId !== _prevSoilId) {
      _prevSoilId = layer.soilId;
      audio.updateDrill(effDens); 
    }

    // ИСПРАВЛЕННЫЙ ПАРСИНГ КЛАССА БУРЕНИЯ
    const _cls  = DRILL_CLASSES[$equippedDrillClass] || DRILL_CLASSES['basic'];
    const _smod = _cls?.soilMods?.[layer.soilId] ?? { speed: 1.0, wear: 1.0 };
    effAbr     *= _smod.wear;

    let effSpeed = _smod.speed;
    if (_pasteActive)  { effAbr = 0; }                          
    if (_obolonActive) { effSpeed *= 1.6; effAbr *= 1.5; }      

    const dt  = TICK_MS / 1000;
    const inc       = $activeIncident;
    const incActive = inc !== null;

    if  (incActive && !_prevIncident) audio.playAlarm();
    if (!incActive &&  _prevIncident) audio.stopAlarm();
    _prevIncident = incActive;

    if (inc?.type === 'jam')   { effSpeed = 0; effAbr *= 5; }   
    if (inc?.type === 'water') { effSpeed *= 0.2; }              

    if (_cls.special === 'air_water_fail' && inc?.type === 'water') {
      const c = $activeContract;
      if (c?.id != null) failedContracts.update(s => { const n = new Set(s); n.add(c.id); return n; });
      stopDrilling();
      currentScreen.set('contracts');
      return;
    }
    if (_cls.special === 'mud_cost' && inc?.type === 'water') {
      effSpeed = _smod.speed;
    }

    let incDepth = depth;
    if (inc?.type === 'void') {
      if (!_voidOneShotDone) {                                   
        incDepth         = Math.min(target, depth + 0.5);
        currentDepth.set(incDepth);
        _voidOneShotDone = true;
      }
      _voidTimerSec -= dt;
      if (_voidTimerSec <= 0) {                                  
        const h2 = Math.max(0, health * 0.75);
        drillHealth.set(h2);
        activeIncident.set(null);
        _voidOneShotDone = false;
        if (h2 <= 0) { stopDrilling(); showFailure = true; saveHealthToInventory(0); }
        return; 
      }
    }

    if (!inc && Math.random() < 0.0015) {
      const types = ['jam', 'water', 'void'];
      const type  = types[Math.floor(Math.random() * types.length)];
      activeIncident.set({ type });
      if (type === 'void') { _voidTimerSec = 2.0; _voidOneShotDone = false; }
    }

    const baseDrillSpeed = 12.0; 
    const baseWear = 2.5;        

    const newD = Math.min(target, incDepth + (baseDrillSpeed * (bit.speedMult || 1) * effSpeed / effDens) * dt);
    const newH = Math.max(0, health - (effAbr * (bit.wearRate || 1) * baseWear / ($prestigeBonus || 1)) * dt);
    
    if (_cls.special === 'mud_cost') {
      const meters = newD - incDepth;
      if (meters > 0) playerMoney.update(m => Math.max(0, m - meters * 50));
    }

    currentDepth.set(newD);
    drillHealth .set(newH);

    if (newD >= target - 0.01) {
      currentDepth.set(target);
      stopDrilling();
      if ($activeContract?.isPrestige) { showPrestige = true; } else { showCompletion = true; }
      saveHealthToInventory(newH);
    }
    if (newH <= 0) { stopDrilling(); showFailure = true; saveHealthToInventory(0); }
  }

  function resetContract() {
    stopDrilling(); currentDepth.set(0); deployStatus.set(0);
    showCompletion = false; showFailure    = false;
  }

  function goToDispatch() {
    stopDrilling(); deployStatus.set(0); saveHealthToInventory(_lastHealth); currentScreen.set('contracts');
  }

  function goToGarage() {
    stopDrilling(); deployStatus.set(0); saveHealthToInventory(_lastHealth); currentScreen.set('garage');
  }

  let showCompletion = false;
  let showPrestige   = false;
  function collectReward() {
    const c = $activeContract;
    playerMoney.update(m => m + Math.round((c?.reward ?? 0) * $prestigeBonus));
    playerXP.update(xp => xp + (c?.targetDepth ?? 0) * 10);
    audio.playCash();
    saveHealthToInventory(_lastHealth);
    if (c?.col != null && c?.row != null) { revealHexesAround(c.col, c.row, 3); }
    if (c?.id != null) { completedContracts.update(s => { const n = new Set(s); n.add(c.id); return n; }); }
    showCompletion = false; currentDepth.set(0); deployStatus.set(0); currentScreen.set('contracts');
  }

  function handlePrestige() {
    audio.playCash();
    const c = $activeContract;
    if (c?.id != null) { completedContracts.update(s => { const n = new Set(s); n.add(c.id); return n; }); }
    doPrestige(); showPrestige = false; currentDepth.set(0); currentScreen.set('contracts');
  }

  let showFailure = false;
  function dismissFailure(dest) {
    const c = $activeContract;
    if (c?.id != null) { failedContracts.update(s => { const n = new Set(s); n.add(c.id); return n; }); }
    showFailure = false; currentDepth.set(0); deployStatus.set(0); currentScreen.set(dest);
  }

  onDestroy(() => { stopDrilling(); saveHealthToInventory(_lastHealth); });

  $: healthCls = isNaN($drillHealth) || $drillHealth > 60 ? 'good' : $drillHealth > 30 ? 'warn' : 'crit';
  $: drillOff  = $contractProgress >= 100 || $drillHealth <= 0;
  function healthColor(h) { if (isNaN(h) || h > 60) return 'bg-good'; if (h > 30) return 'bg-warn'; return 'bg-crit'; }
  const fmt = (n) => isNaN(n) ? '0' : (n ?? 0).toLocaleString('ru-RU');
</script>

<div class="root">
  <div class="scanlines" aria-hidden="true"></div>

  <header class="hdr">
    <span class="blink">█</span>
    DRILL_SYS v2.5.0 — {($activeContract?.name ?? 'ГЕОЛОГОРАЗВЕДКА').toUpperCase()}
    <span class="blink">█</span>
    <span class="hdr-depth">GLB:{isNaN($currentDepth) ? '0.00' : $currentDepth.toFixed(2)}М</span>
  </header>

  <main class="layout">
    <div class="render-win">
      <DrillCanvas />
      <span class="corner tl">┌</span><span class="corner tr">┐</span><span class="corner bl">└</span><span class="corner br">┘</span>
      <div class="win-tag">// RENDER OUTPUT //</div>
      {#if $isDrilling} <div class="drill-overlay blink-fast">▼ БУРЕНИЕ ▼</div> {/if}
      {#if _pasteActive || _obolonActive}
        <div class="fx-banner">
          {#if _pasteActive} <span class="fx-paste">💎 ПАСТА АКТИВНА</span> {/if}
          {#if _obolonActive} <span class="fx-obolon">🍺 ОБОЛОНЬ АКТИВНА</span> {/if}
        </div>
      {/if}
      {#if $activeIncident}
        <div class="inc-overlay inc-overlay-{$activeIncident.type} blink-fast">
          {INC_DATA[$activeIncident.type].icon}&nbsp;{INC_DATA[$activeIncident.type].title}&nbsp;{INC_DATA[$activeIncident.type].icon}
        </div>
      {/if}
    </div>

    <aside class="panel">

      <section class="sec">
        <div class="sec-title">◈ КОНТРАКТ</div>
        <div class="contract-name">{$activeContract?.name ?? '—'}</div>
        <div class="row"><span class="lbl">РЕГИОН</span><span class="val sm">{$activeContract?.region?.name ?? '—'}</span></div>
        <div class="row"><span class="lbl">ГЛУБИНА</span><span class="val amber big">{isNaN($currentDepth) ? '0.00' : $currentDepth.toFixed(2)}<em>М</em></span></div>
        <div class="bar-wrap"><div class="bar-fill amber-fill" style="width:{isNaN($contractProgress) ? 0 : $contractProgress}%"></div><span class="bar-lbl">{isNaN($contractProgress) ? 0 : $contractProgress.toFixed(1)}% / {$contractTargetDepth}М</span></div>
      </section>

      <section class="sec">
        <div class="sec-title">◈ ТЕЛЕМЕТРИЯ</div>
        <div class="row"><span class="lbl">ПЛАСТ</span><span class="val amber sm">{$currentLayer ? $currentLayer.soil.name.toUpperCase() : '— ЗАБОЙ —'}</span></div>
        {#if $currentLayer}
          <div class="row"><span class="lbl">ПЛОТН.</span><span class="val green">{$currentLayer.soil.density}<em>Г/СМ³</em></span></div>
          <div class="row"><span class="lbl">АБРАЗ.</span><span class="val green">{$currentLayer.soil.abrasiveness}<em>/10</em></span></div>
          {#if $currentLayer.soil.isPermafrost} <div class="badge-ice">❄ ВЕЧНАЯ МЕРЗЛОТА</div> {/if}
        {/if}
      </section>

      <section class="sec">
        <div class="sec-title">◈ БУРОВОЙ ИНСТРУМЕНТ</div>
        <div class="bit-id">{$equippedBit?.name ?? '—'}</div>
        <div class="health-num health-{healthCls}">{isNaN($drillHealth) ? 100 : $drillHealth.toFixed(1)}%</div>
        <div class="bar-wrap"><div class="bar-fill {healthColor($drillHealth)}" style="width:{isNaN($drillHealth) ? 100 : $drillHealth}%"></div></div>
        {#if $drillHealth <= 30 && $drillHealth > 0} <div class="alert blink-slow">⚠ КРИТИЧЕСКИЙ ИЗНОС</div> {/if}
        {#if $drillHealth <= 0} <div class="alert blink">▶ АВАРИЯ — ТРЕБУЕТСЯ ГАРАЖ</div> {/if}
      </section>

      <section class="sec controls" class:incident-active={!!$activeIncident}>
        {#if $activeIncident}
          {@const inc = $activeIncident}
          <div class="inc-header inc-{inc.type}"><span class="inc-icon">{INC_DATA[inc.type].icon}</span><span class="inc-title">{INC_DATA[inc.type].title}</span></div>
          <div class="inc-desc">{INC_DATA[inc.type].desc}</div>
          {#if inc.type === 'void'} <div class="inc-timer inc-void-timer">{_voidTimerSec.toFixed(1)}с</div> {/if}
          <button class="inc-btn inc-btn-{inc.type}" on:click={resolveIncident}>{INC_DATA[inc.type].btn}</button>
          <button class="aux-btn inc-stop-btn" on:click={stopDrilling}>⏸ СТОП БУРЕНИЯ</button>
        {:else}
          <div class="sec-title">◈ УПРАВЛЕНИЕ</div>
          {#if $deployStatus === 0}
            <button class="drill-btn" on:click={() => deployStatus.set(1)}>▼ ВЫСТАВИТЬ УСТАНОВКУ ▼</button>
          {:else if $deployStatus === 1}
            <button class="drill-btn" disabled style="background: #e67e22;"><span class="blink">РАЗВЕРТЫВАНИЕ...</span></button>
          {:else}
            <button class="drill-btn" class:active={$isDrilling} disabled={drillOff && !$isDrilling} on:click={toggleDrilling}>
              <span class="drill-led" class:led-on={$isDrilling}></span> {$isDrilling ? 'СТОП' : 'БУРИТЬ'} <span class="drill-state">{$isDrilling ? '[ВКЛ]' : '[ВЫКЛ]'}</span>
            </button>
          {/if}
          <div class="aux-row">
            <button class="aux-btn" on:click={goToGarage}>⚙ ГАРАЖ</button>
            <button class="aux-btn" on:click={resetContract}>↺ СБРОС</button>
          </div>
          <button class="aux-btn back-btn" on:click={goToDispatch}>← ДИСПЕТЧЕР</button>
        {/if}
      </section>

      <section class="sec cons-sec">
        <div class="sec-title">◈ РАСХОДНИКИ</div>
        {#each consItems as item (item.id)}
          {@const qty      = $playerConsumables[item.id] ?? 0}
          {@const isActive = (item.id === 'paste'  && _pasteActive) || (item.id === 'obolon' && _obolonActive)}
          {@const canUse   = $isDrilling && qty > 0 && !isActive}
          <div class="c-row" class:c-active={isActive}>
            <span class="c-icon">{item.icon ?? '📦'}</span>
            <span class="c-name">{item.name ?? 'Предмет'}</span>
            <span class="c-qty">×{qty}</span>
            <button class="c-btn" class:c-btn-active={isActive} class:disabled={!canUse} disabled={!canUse} on:click={() => applyConsumable(item.id)}>
              {isActive ? 'АКТИ..' : 'ИСПОЛЬ.'}
            </button>
          </div>
        {/each}
      </section>

      <section class="sec geo">
        <div class="sec-title">◈ РАЗРЕЗ СКВАЖИНЫ</div>
        {#each $boreholeLayers as layer}
          {@const soil   = soilTypes[layer.soilId]}
          {@const active = $currentLayer?.soilId === layer.soilId}
          <div class="geo-row" class:geo-active={active}>
            <span class="geo-d">{layer.from}–{layer.to}м</span>
            <span class="geo-n">{soil.name}</span>
            {#if soil.isPermafrost}<span class="geo-ice">❄</span>{/if}
            {#if active}<span class="geo-ptr">◄</span>{/if}
          </div>
        {/each}
      </section>
    </aside>
  </main>

  {#if showCompletion}
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-badge blink-slow">✓ КОНТРАКТ ВЫПОЛНЕН</div>
        <div class="modal-name">{$activeContract?.name}</div>
        <div class="modal-depth">Пробурено: <strong>{$activeContract?.targetDepth} М</strong></div>
        <div class="modal-reward">+{fmt($activeContract?.reward)} ₽</div>
        <div class="modal-balance">Новый баланс: {fmt(($playerMoney ?? 0) + ($activeContract?.reward ?? 0))} ₽</div>
        <button class="modal-btn" on:click={collectReward}>[ ПОЛУЧИТЬ ОПЛАТУ ]</button>
      </div>
    </div>
  {/if}

  {#if showFailure}
    <div class="modal-overlay failure-overlay">
      <div class="modal-box failure-box">
        <div class="fail-badge blink">⚠ АВАРИЯ В ЗАБОЕ</div>
        <div class="fail-title">ИНСТРУМЕНТ СЛОМАН</div>
        <div class="fail-sub">{$activeContract?.name ?? '—'}</div>
        <div class="fail-desc">Контракт аннулирован.<br>Вознаграждение не выплачено.<br>Ремонт обязателен перед следующим спуском.</div>
        <div class="fail-actions">
          <button class="modal-btn fail-btn-garage" on:click={() => dismissFailure('garage')}>[ ⚙ В ГАРАЖ — РЕМОНТ ]</button>
          <button class="modal-btn fail-btn-dispatch" on:click={() => dismissFailure('contracts')}>[ ← В ДИСПЕТЧЕР ]</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showPrestige}
    <div class="modal-overlay prestige-overlay">
      <div class="modal-box prestige-box">
        <div class="prestige-stars blink-slow">★ ★ ★</div>
        <div class="prestige-badge">ПРОЕКТ СГ-3 ЗАВЕРШЁН</div>
        <div class="prestige-depth">Пробурено: <strong>1 200 М</strong></div>
        <div class="prestige-headline">ПРЕСТИЖ {$prestigeLevel + 1}</div>
        <div class="prestige-desc">Вы достигли мирового рекорда глубины скважины.<br>Компания перезапускается с нуля — но теперь<br>каждый рубль и каждый метр стоит больше.</div>
        <div class="prestige-bonus">Новый бонус: ×{(1 + ($prestigeLevel + 1) * 0.15).toFixed(2)}</div>
        <button class="modal-btn prestige-btn" on:click={handlePrestige}>[ ★ ОСНОВАТЬ НОВУЮ КОМПАНИЮ ]</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .root { position: relative; width: 100vw; height: 100vh; background: #080a0e; color: #a0abb8; font-family: monospace; display: flex; flex-direction: column; overflow: hidden; }
  .scanlines { position: fixed; inset: 0; background: repeating-linear-gradient(0deg, transparent 0, transparent 3px, rgba(0,0,0,.06) 3px, rgba(0,0,0,.06) 4px); pointer-events: none; z-index: 50; }
  .hdr { flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-bottom: 2px solid #1a2233; font-weight: 800; font-size: 11px; background: #0c0f16; color: #fff; white-space: nowrap; overflow: hidden; }
  .hdr-depth { margin-left: auto; font-size: 12px; color: #00ffaa; text-shadow: 0 0 8px rgba(0,255,170,.5); }
  .layout { display: flex; flex: 1; overflow: hidden; }
  .render-win { flex: 7; position: relative; border-right: 3px solid #1a2233; overflow: hidden; }
  .win-tag { position: absolute; top: 10px; left: 14px; font-size: 9px; color: #5a6a82; pointer-events: none; z-index: 10; }
  .corner { position: absolute; font-size: 18px; color: #e67e22; opacity: .5; line-height: 1; pointer-events: none; z-index: 10; }
  .tl { top: 6px; left: 6px; } .tr { top: 6px; right: 8px; } .bl { bottom: 6px; left: 6px; } .br { bottom: 6px; right: 8px; }
  .drill-overlay { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); font-size: 11px; color: #e67e22; text-shadow: 0 0 10px rgba(230,126,34,.7); pointer-events: none; z-index: 10; }
  .panel { flex: 3; display: flex; flex-direction: column; overflow-y: auto; gap: 0; padding: 6px; background: #0c0f16; }
  .panel::-webkit-scrollbar { width: 4px; } .panel::-webkit-scrollbar-thumb { background: #2a3548; border-radius: 2px; }
  .sec { position: relative; padding: 10px 11px 12px; margin: 0 0 4px; background: #12161f; border-radius: 4px; border: 1px solid #1c2331; }
  .sec:last-child { margin-bottom: 0; }
  .sec-title { font-size: 10px; font-weight: 900; color: #7a8c9e; text-transform: uppercase; margin-bottom: 7px; text-shadow: none; }
  .contract-name { font-size: 12px; font-weight: 800; color: #e0e6ed; line-height: 1.3; margin-bottom: 7px; }
  .row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
  .lbl { font-size: 9px; font-weight: 700; color: #6a7c94; text-transform: uppercase; }
  .val { font-size: 12px; color: #e0e6ed; font-weight: 700; }
  .val.big { font-size: 22px; font-weight: 900; } .val.sm { font-size: 10px; max-width: 60%; text-align: right; }
  .val em { font-style: normal; font-size: 9px; margin-left: 2px; opacity: .7; }
  .green { color: #00ffaa; } .amber { color: #ffaa00; }
  .bar-wrap { position: relative; height: 10px; background: #06080c; border-radius: 99px; margin-bottom: 6px; overflow: hidden; border: 1px solid #1c2331; }
  .bar-fill { height: 100%; transition: width .12s linear; border-radius: 99px; }
  .bar-lbl { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); font-size: 8px; color: #a0abb8; font-weight: 700; }
  .amber-fill { background: #e67e22; } .bg-good { background: #2ecc71; } .bg-warn { background: #e67e22; } .bg-crit { background: #e74c3c; }
  .health-num { font-size: 26px; font-weight: 900; text-align: center; margin-bottom: 5px; }
  .health-good { color: #2ecc71; } .health-warn { color: #e67e22; } .health-crit { color: #e74c3c; }
  .alert { font-size: 9px; font-weight: 800; color: #e74c3c; text-align: center; margin-top: 4px; }
  .badge-ice { font-size: 9px; font-weight: 700; color: #3498db; margin-top: 4px; }
  .bit-id { font-size: 10px; font-weight: 700; color: #a0abb8; margin-bottom: -2px; }
  .controls { gap: 7px; }
  .drill-btn { width: 100%; padding: 15px 8px; background: #2ecc71; border: none; border-radius: 4px; border-bottom: 6px solid #27ae60; color: #fff; font-size: 14px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; }
  .drill-btn:hover:not(:disabled) { background: #2ecc71; filter: brightness(1.1); }
  .drill-btn:active:not(:disabled) { transform: translateY(4px); border-bottom-width: 2px; }
  .drill-btn.active { background: #e67e22; border-bottom-color: #d35400; animation: pulse-drill .5s ease-in-out infinite alternate; }
  .drill-btn:disabled { opacity: .3; cursor: not-allowed; }
  @keyframes pulse-drill { from { filter: brightness(1); } to { filter: brightness(1.3); } }
  .drill-led { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,.3); flex-shrink: 0; }
  .drill-led.led-on { background: #fff; box-shadow: 0 0 10px #fff; }
  .drill-state { font-size: 10px; font-weight: 700; opacity: .7; }
  .aux-row { display: flex; gap: 6px; margin-top: 8px; }
  .aux-btn { flex: 1; padding: 9px 4px; background: #1a2233; border: 2px solid #2a3548; color: #a0abb8; border-radius: 4px; font-size: 10px; font-weight: 800; cursor: pointer; }
  .aux-btn:hover { border-color: #3a4a63; color: #fff; }
  .back-btn { width: 100%; margin-top: 6px; }
  .geo-row { display: flex; align-items: center; gap: 5px; padding: 4px 6px; margin-bottom: 2px; border-left: 3px solid transparent; border-radius: 4px; }
  .geo-active { border-left-color: #e67e22; background: rgba(230,126,34,.15); }
  .geo-d { font-size: 9px; color: #7a8c9e; min-width: 44px; font-weight: 700; }
  .geo-n { font-size: 10px; color: #7a8c9e; flex: 1; font-weight: 700; }
  .geo-active .geo-n { color: #e67e22; } .geo-ice { font-size: 9px; color: #3498db; } .geo-ptr { font-size: 10px; color: #e67e22; }
  .cons-sec { display: flex; flex-direction: column; gap: 4px; }
  .c-row { display: flex; align-items: center; gap: 5px; padding: 5px; border: 1px solid #1c2331; background: #0c0f16; border-radius: 4px; }
  .c-row.c-active { background: rgba(0,255,170,.1); border-color: #00ffaa; }
  .c-icon { font-size: 16px; width: 20px; text-align: center; }
  .c-name { flex: 1; font-size: 10px; font-weight: 700; color: #a0abb8; }
  .c-qty { font-size: 11px; font-weight: 800; color: #e0e6ed; }
  .c-btn { padding: 5px 9px; background: #e67e22; border: none; border-radius: 4px; border-bottom: 3px solid #d35400; color: #fff; font-size: 9px; font-weight: 800; cursor: pointer; }
  .c-btn:active:not(.disabled) { transform: translateY(2px); border-bottom-width: 1px; }
  .c-btn.disabled { opacity: .3; cursor: not-allowed; background: #2a3548; border-bottom-color: transparent; color: #7a8c9e; }
  .c-btn.c-btn-active { background: #2ecc71; border-bottom-color: #27ae60; }
  .incident-active { border-color: #e74c3c !important; }
  .inc-header { display: flex; align-items: center; gap: 7px; padding: 6px 8px; margin-bottom: 7px; font-size: 10px; font-weight: 700; border: 1px solid; border-radius: 4px; }
  .inc-header.inc-jam { background: rgba(231,76,60,.15); border-color: #e74c3c; color: #e74c3c; }
  .inc-header.inc-water { background: rgba(52,152,219,.15); border-color: #3498db; color: #3498db; }
  .inc-header.inc-void { background: rgba(230,126,34,.15); border-color: #e67e22; color: #e67e22; }
  .inc-icon { font-size: 16px; } .inc-desc { font-size: 9px; color: #a0abb8; line-height: 1.6; margin-bottom: 8px; padding: 6px; background: #06080c; border: 1px solid #1c2331; border-radius: 4px;}
  .inc-timer { font-size: 34px; font-weight: 700; text-align: center; margin-bottom: 8px; } .inc-void-timer { color: #e67e22; animation: blink .35s step-start infinite; }
  .inc-btn { width: 100%; padding: 11px 8px; margin-bottom: 6px; border: 2px solid; font-size: 11px; cursor: pointer; font-weight: 700; border-radius: 4px;}
  .inc-btn-jam { background: rgba(231,76,60,.2); border-color: #e74c3c; color: #e74c3c; } .inc-btn-jam:hover { background: rgba(231,76,60,.4); }
  .inc-btn-water { background: rgba(52,152,219,.2); border-color: #3498db; color: #3498db; } .inc-btn-water:hover { background: rgba(52,152,219,.4); }
  .inc-btn-void { background: rgba(230,126,34,.2); border-color: #e67e22; color: #e67e22; } .inc-btn-void:hover { background: rgba(230,126,34,.4); }
  .inc-overlay { position: absolute; top: 42%; left: 50%; transform: translate(-50%, -50%); font-size: 12px; padding: 8px 18px; pointer-events: none; z-index: 12; border: 1px solid; border-radius: 4px;}
  .inc-overlay-jam { color: #e74c3c; border-color: #e74c3c; background: rgba(231,76,60,.2); }
  .inc-overlay-water { color: #3498db; border-color: #3498db; background: rgba(52,152,219,.2); }
  .inc-overlay-void { color: #e67e22; border-color: #e67e22; background: rgba(230,126,34,.2); }
  .fx-banner { position: absolute; top: 32px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 10; }
  .fx-paste, .fx-obolon { font-size: 9px; padding: 3px 9px; animation: blink 1.2s step-start infinite; border-radius: 4px;}
  .fx-paste { color: #3498db; border: 1px solid #3498db; background: rgba(52,152,219,.2); }
  .fx-obolon { color: #e74c3c; border: 1px solid #e74c3c; background: rgba(231,76,60,.2); }
  .modal-overlay { position: fixed; inset: 0; background: rgba(6,8,12,.9); display: flex; align-items: center; justify-content: center; z-index: 500; }
  .modal-box { background: #12161f; border-radius: 6px; padding: 28px 24px; width: 90%; max-width: 300px; text-align: center; border: 2px solid #2a3548; }
  .modal-badge { font-size: 11px; font-weight: 900; color: #2ecc71; border: 2px solid #2ecc71; border-radius: 4px; padding: 8px 0; margin-bottom: 12px; }
  .modal-name { font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 8px; }
  .modal-depth { font-size: 11px; color: #a0abb8; margin-bottom: 8px; } .modal-depth strong { color: #e67e22; }
  .modal-reward { font-size: 32px; font-weight: 900; color: #2ecc71; margin-bottom: 8px; }
  .modal-balance { font-size: 10px; color: #7a8c9e; margin-bottom: 16px; }
  .modal-btn { width: 100%; padding: 13px 8px; background: #2ecc71; border: none; border-radius: 4px; border-bottom: 6px solid #27ae60; color: #fff; font-size: 12px; font-weight: 800; cursor: pointer; }
  .modal-btn:active { transform: translateY(4px); border-bottom-width: 2px; }
  .failure-box { border-color: #e74c3c; } .fail-badge { color: #e74c3c; border-color: #e74c3c; } .fail-title { font-size: 20px; font-weight: 900; color: #e74c3c; margin-bottom: 4px;} .fail-sub { font-size: 12px; color: #a0abb8; margin-bottom: 12px;} .fail-desc { font-size: 10px; color: #e74c3c; background: rgba(231,76,60,.1); border: 1px solid rgba(231,76,60,.3); padding: 10px; border-radius: 4px; margin-bottom: 12px; }
  .fail-actions { display: flex; flex-direction: column; gap: 8px; }
  .fail-btn-garage { background: #e74c3c; border-bottom-color: #c0392b; } .fail-btn-dispatch { background: #1a2233; color: #a0abb8; border-bottom-color: #0c0f16; }
  .prestige-box { border-color: #f1c40f; } .prestige-stars { font-size: 26px; color: #f1c40f; margin-bottom: 8px; } .prestige-badge { color: #f1c40f; border-color: #f1c40f; margin-bottom: 12px; } .prestige-headline { font-size: 28px; font-weight: 900; color: #f1c40f; margin-bottom: 8px; } .prestige-desc { font-size: 10px; color: #a0abb8; margin-bottom: 12px; } .prestige-bonus { font-size: 20px; color: #f1c40f; margin-bottom: 16px; } .prestige-btn { background: #f1c40f; color: #000; border-bottom-color: #f39c12; }
  .blink { animation: blink 1s step-start infinite; } .blink-slow { animation: blink 1.6s step-start infinite; } .blink-fast { animation: blink .5s step-start infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  @media (max-width: 768px) { .layout { flex-direction: column; } .render-win { flex: 0 0 50%; border-right: none; border-bottom: 3px solid #1a2233; } .panel { flex: 0 0 50%; } }
</style>