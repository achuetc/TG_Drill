<script>
  import { onDestroy } from 'svelte';
  import { currentScreen, playerMoney } from './stores.js';

  // ── Game state ─────────────────────────────────────────────────────────────
  let phase        = 'bet';    // 'bet' | 'drilling' | 'result'
  let playerChoice = null;     // 'more' | 'less'
  let rollResult   = null;     // 1–100
  let won          = null;     // boolean | null
  let bet          = 1000;
  let _drillTimer  = null;

  // Session stats (not persisted — resets on screen change)
  let gamesPlayed   = 0;
  let currentStreak = 0;
  let bestStreak    = 0;
  let totalWon      = 0;
  let totalLost     = 0;

  const BET_PRESETS = [500, 1000, 2000, 5000];

  // ── Reactive ───────────────────────────────────────────────────────────────
  $: canBet = phase === 'bet' && bet >= 100 && bet <= $playerMoney;
  $: resultClass = won === true ? 'res-win' : won === false ? 'res-lose' : '';

  // ── Betting helpers ────────────────────────────────────────────────────────
  function selectPreset(amount) {
    if (phase !== 'bet') return;
    bet = Math.min(amount, $playerMoney);
  }

  function handleBetInput(e) {
    if (phase !== 'bet') return;
    const v = parseInt(e.target.value, 10) || 0;
    bet = Math.max(0, Math.min($playerMoney, v));
  }

  // ── Core game flow ─────────────────────────────────────────────────────────
  function startGame(choice) {
    if (!canBet) return;
    playerChoice = choice;
    phase        = 'drilling';

    clearTimeout(_drillTimer);
    _drillTimer = setTimeout(() => {
      rollResult = 1 + Math.floor(Math.random() * 100);
      won = (choice === 'more' && rollResult > 50)
         || (choice === 'less' && rollResult <= 50);

      if (won) {
        playerMoney.update(m => m + bet);
        totalWon += bet;
        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        playerMoney.update(m => Math.max(0, m - bet));
        totalLost += bet;
        currentStreak = 0;
      }
      gamesPlayed++;
      phase = 'result';
    }, 1750);
  }

  function playAgain() {
    bet          = Math.min(bet, $playerMoney);
    phase        = 'bet';
    playerChoice = null;
    rollResult   = null;
    won          = null;
  }

  const fmt = (n) => (n ?? 0).toLocaleString('ru-RU');

  onDestroy(() => clearTimeout(_drillTimer));
</script>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="root">
  <div class="scanlines" aria-hidden="true"></div>

  <!-- HEADER -->
  <header class="hdr">
    <span class="blink">█</span>
    DRILL_SYS v2.4.1 — КАЗИНО «ЗОЛОТОЙ БУР»
    <span class="blink">█</span>
    <span class="hdr-right">БАЛАНС:&nbsp;{fmt($playerMoney)}&nbsp;₽</span>
  </header>

  <!-- NAV TABS -->
  <nav class="nav">
    <button class="nav-tab" on:click={() => currentScreen.set('contracts')}>◈ КОНТРАКТЫ</button>
    <button class="nav-tab" on:click={() => currentScreen.set('garage')}>⚙ ГАРАЖ</button>
    <button class="nav-tab active">🎰 КАЗИНО</button>
  </nav>

  <!-- BODY -->
  <main class="body">

    <!-- ── Neon sign ─────────────────────────────────────────────────────── -->
    <div class="neon-sign">
      <div class="neon-line">
        <span class="neon-amber blink-alt">◈</span>
        ЗОЛОТОЙ&nbsp;БУР
        <span class="neon-amber blink-alt">◈</span>
      </div>
      <div class="neon-sub">// РИСКОВОЕ БУРЕНИЕ · ПОПЫТАЙ СУДЬБУ //</div>
    </div>

    <!-- ── Main game card ─────────────────────────────────────────────────── -->
    <section class="game-card">
      <i class="rv tl"></i><i class="rv tr"></i><i class="rv bl"></i><i class="rv br"></i>

      <!-- ── RESULT DISPLAY (shown above bet controls when phase=result) ── -->
      {#if phase === 'result' && rollResult !== null}
        <div class="result-zone {resultClass}">
          <div class="result-badge">
            {won ? '✓&nbsp;ВЫИГРЫШ' : '✕&nbsp;ПРОИГРЫШ'}
          </div>
          <div class="result-depth-row">
            <span class="rd-label">ПРОБУРЕНО:</span>
            <span class="rd-val" class:rd-deep={rollResult > 50} class:rd-shallow={rollResult <= 50}>
              {rollResult}&nbsp;М
            </span>
            <span class="rd-target">
              {rollResult > 50 ? '(› 50)' : '(≤ 50)'}
            </span>
          </div>
          <div class="result-choice-row">
            Ваш выбор:&nbsp;
            <strong>{playerChoice === 'more' ? '▲ БОЛЬШЕ 50' : '▼ МЕНЬШЕ 50'}</strong>
          </div>
          <div class="result-amount {resultClass}">
            {won ? `+${fmt(bet)}&nbsp;₽` : `−${fmt(bet)}&nbsp;₽`}
          </div>
        </div>
      {/if}

      <!-- ── BET CONTROLS ──────────────────────────────────────────────── -->
      {#if phase === 'bet' || phase === 'result'}

        <div class="sec-label">◈ ВАША СТАВКА</div>

        <!-- Preset buttons -->
        <div class="preset-row">
          {#each BET_PRESETS as p}
            <button
              class="preset-btn"
              class:preset-active={bet === p}
              disabled={p > $playerMoney || phase !== 'bet'}
              on:click={() => selectPreset(p)}
            >{fmt(p)}&nbsp;₽</button>
          {/each}
        </div>

        <!-- Custom input -->
        <div class="custom-row">
          <span class="custom-lbl">СВОЯ:</span>
          <input
            class="bet-input"
            type="number"
            min="100"
            max={$playerMoney}
            step="100"
            value={bet}
            disabled={phase !== 'bet'}
            on:input={handleBetInput}
          />
          <span class="custom-curr">₽</span>
        </div>

        <!-- Rule line -->
        <div class="rule-line">
          Система пробурит <strong>1–100&nbsp;м</strong>.
          Больше <strong>50</strong> или меньше?
        </div>

        {#if phase === 'bet'}
          <!-- Choice buttons -->
          <div class="choice-row">
            <button
              class="choice-btn more-btn"
              class:disabled={!canBet}
              disabled={!canBet}
              on:click={() => startGame('more')}
            >
              <span class="choice-arrow">▲</span>
              <span class="choice-label">БОЛЬШЕ</span>
              <span class="choice-sub">› 50 М</span>
            </button>
            <div class="vs-div">VS</div>
            <button
              class="choice-btn less-btn"
              class:disabled={!canBet}
              disabled={!canBet}
              on:click={() => startGame('less')}
            >
              <span class="choice-arrow">▼</span>
              <span class="choice-label">МЕНЬШЕ</span>
              <span class="choice-sub">≤ 50 М</span>
            </button>
          </div>
        {:else}
          <!-- After result: play again / leave -->
          <div class="again-row">
            {#if $playerMoney >= 100}
              <button class="again-btn" on:click={playAgain}>
                [ ЕЩЁРАЗ — СТАВКА {fmt(Math.min(bet, $playerMoney))} ₽ ]
              </button>
            {:else}
              <div class="broke-msg blink-slow">⚠ БАНКРОТ — ПОРА В ГАРАЖ</div>
            {/if}
            <button class="leave-btn" on:click={() => currentScreen.set('contracts')}>
              [ ← НА КАРТУ ]
            </button>
          </div>
        {/if}

      <!-- ── DRILLING ANIMATION ──────────────────────────────────────────── -->
      {:else if phase === 'drilling'}
        <div class="drilling-zone">
          <div class="drill-rig-icon blink-fast">⛏</div>
          <div class="drill-text">БУРЕНИЕ В ПРОЦЕССЕ…</div>
          <div class="drill-bar-wrap">
            <div class="drill-bar-fill"></div>
          </div>
          <div class="drill-meta">
            Ставка: <strong>{fmt(bet)}&nbsp;₽</strong>
            &nbsp;·&nbsp;
            Выбор: <strong>{playerChoice === 'more' ? '▲ БОЛЬШЕ' : '▼ МЕНЬШЕ'}</strong>
          </div>
        </div>
      {/if}

      <!-- ── SESSION STATS ─────────────────────────────────────────────── -->
      <div class="stats-strip">
        <div class="st">
          <span class="st-l">ИГРЫ</span>
          <span class="st-v">{gamesPlayed}</span>
        </div>
        <div class="st">
          <span class="st-l">СЕРИЯ</span>
          <span class="st-v" class:st-hot={currentStreak >= 3}>{currentStreak}</span>
        </div>
        <div class="st">
          <span class="st-l">РЕКОРД</span>
          <span class="st-v">{bestStreak}</span>
        </div>
        <div class="st">
          <span class="st-l">ПРОФИТ</span>
          <span class="st-v" class:st-pos={totalWon > totalLost} class:st-neg={totalLost > totalWon}>
            {totalWon >= totalLost ? '+' : '−'}{fmt(Math.abs(totalWon - totalLost))}&nbsp;₽
          </span>
        </div>
      </div>
    </section>

    <!-- ── Disclaimer ─────────────────────────────────────────────────────── -->
    <div class="disclaimer">
      // КАЗИНО «ЗОЛОТОЙ БУР» — ИГРА НА ПИКСЕЛЬНЫЕ ДЕНЬГИ //
    </div>

  </main>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<style>
  /* ── Root ───────────────────────────────────────────────────────────────── */
  .root {
    position: relative; width: 100vw; height: 100vh;
    background: var(--bg-root); color: var(--txt);
    font-family: var(--f-ui);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .scanlines {
    position: fixed; inset: 0;
    background: repeating-linear-gradient(
      0deg, transparent 0, transparent 3px,
      rgba(0,0,0,.06) 3px, rgba(0,0,0,.06) 4px
    );
    pointer-events: none; z-index: 999;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .hdr {
    flex-shrink: 0; display: flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-bottom: 2px solid var(--rim-md);
    font-family: var(--f-deco); font-size: 10px; letter-spacing: .2em;
    background: linear-gradient(180deg, #241a0a 0%, var(--bg-iron) 100%);
    color: var(--txt); text-shadow: 0 0 10px rgba(212,160,40,.4);
    white-space: nowrap; overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,0,0,.8);
  }
  .hdr-right {
    margin-left: auto; font-family: var(--f-num); font-size: 11px;
    color: var(--txt-bright); text-shadow: 0 0 8px rgba(240,192,72,.5);
  }

  /* ── Nav ────────────────────────────────────────────────────────────────── */
  .nav { flex-shrink: 0; display: flex; border-bottom: 2px solid var(--rim-md); background: var(--bg-iron-md); }
  .nav-tab {
    flex: 1; padding: 8px 0; background: transparent; border: none;
    border-right: 1px solid var(--rim-md); color: var(--txt-dim);
    font-family: var(--f-ui); font-size: 10px; letter-spacing: .14em;
    cursor: pointer; transition: color .14s, background .14s;
  }
  .nav-tab:last-child { border-right: none; }
  .nav-tab:hover      { color: var(--txt); background: rgba(212,160,40,.06); }
  .nav-tab.active     { color: var(--gold-lt); font-weight: 700; text-shadow: 0 0 8px rgba(240,192,72,.4); border-bottom: 2px solid var(--gold); }

  /* ── Body ───────────────────────────────────────────────────────────────── */
  .body {
    flex: 1; overflow-y: auto; padding: 16px 14px;
    display: flex; flex-direction: column; align-items: center; gap: 14px;
  }
  .body::-webkit-scrollbar { width: 4px; }
  .body::-webkit-scrollbar-thumb { background: var(--rim-lt); border-radius: 2px; }

  /* ── Neon sign ──────────────────────────────────────────────────────────── */
  .neon-sign {
    text-align: center; padding: 10px 20px;
    display: flex; flex-direction: column; gap: 5px;
  }
  .neon-line {
    font-family: var(--f-deco); font-size: 22px; letter-spacing: .24em;
    color: var(--gold-lt);
    text-shadow:
      0 0 8px  rgba(240,192,72,.8),
      0 0 20px rgba(240,192,72,.5),
      0 0 40px rgba(240,192,72,.2);
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .neon-amber {
    color: var(--amber);
    text-shadow: 0 0 10px rgba(184,104,16,.9), 0 0 24px rgba(184,104,16,.5);
  }
  .neon-sub {
    font-size: 9px; letter-spacing: .2em; color: var(--txt-dim);
    font-style: italic;
  }

  /* ── Game card (parchment) ──────────────────────────────────────────────── */
  .game-card {
    position: relative; width: 100%; max-width: 440px;
    padding: 20px 20px 18px;
    display: flex; flex-direction: column; gap: 14px;
    background:
      var(--parch-noise),
      radial-gradient(ellipse at 35% 20%, var(--parch-lt) 0%, var(--parch) 45%, var(--parch-dk) 100%);
    border: 2px solid var(--rim-md);
    box-shadow: inset 0 0 24px rgba(0,0,0,.10), 0 4px 20px rgba(0,0,0,.7);
  }

  /* ── Result zone ─────────────────────────────────────────────────────────── */
  .result-zone {
    padding: 14px 16px;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    border: 2px solid; border-radius: 1px;
    animation: resultPop .35s cubic-bezier(.18,.89,.32,1.28);
  }
  .res-win  { border-color: #44cc66; background: rgba(40,160,70,.07); }
  .res-lose { border-color: var(--rust-lt); background: rgba(160,40,10,.07); }

  .result-badge {
    font-family: var(--f-deco); font-size: 11px; letter-spacing: .24em;
    padding: 4px 14px; border: 1px solid currentColor;
  }
  .res-win  .result-badge { color: #44cc66; }
  .res-lose .result-badge { color: var(--rust-lt); }

  .result-depth-row {
    display: flex; align-items: baseline; gap: 6px;
    font-family: var(--f-num);
  }
  .rd-label   { font-size: 9px; letter-spacing: .16em; color: var(--ink-md); }
  .rd-val     { font-size: 28px; font-weight: 700; }
  .rd-deep    { color: #44cc66; text-shadow: 0 0 12px rgba(60,200,90,.5); }
  .rd-shallow { color: var(--rust-lt); text-shadow: 0 0 12px rgba(200,60,30,.5); }
  .rd-target  { font-size: 11px; color: var(--ink-lt); }

  .result-choice-row { font-size: 11px; color: var(--ink-lt); }
  .result-choice-row strong { color: var(--ink); }

  .result-amount {
    font-family: var(--f-num); font-size: 22px; font-weight: 700; letter-spacing: .04em;
  }
  .res-win  .result-amount {
    color: #44dd66;
    text-shadow: 0 0 16px rgba(60,200,90,.6), 0 0 32px rgba(60,200,90,.25);
  }
  .res-lose .result-amount {
    color: var(--rust-lt);
    text-shadow: 0 0 16px rgba(200,60,30,.5);
  }

  /* ── Bet section ─────────────────────────────────────────────────────────── */
  .sec-label {
    font-family: var(--f-deco); font-size: 9px; letter-spacing: .22em;
    color: var(--ink-md); text-transform: uppercase;
  }

  .preset-row { display: flex; gap: 7px; }
  .preset-btn {
    flex: 1; padding: 8px 4px;
    background: linear-gradient(180deg, #2a1e0e 0%, #1a1208 100%);
    border: 1px solid var(--rim-lt); color: var(--txt-dim);
    font-family: var(--f-num); font-size: 10px; letter-spacing: .04em;
    cursor: pointer; transition: all .12s;
  }
  .preset-btn:hover:not(:disabled) { border-color: var(--amber); color: var(--gold-lt); }
  .preset-btn:disabled { opacity: .28; cursor: not-allowed; }
  .preset-btn.preset-active {
    border-color: var(--gold); color: var(--gold-lt);
    background: linear-gradient(180deg, #3a2a10 0%, #2a1a08 100%);
    box-shadow: 0 0 10px rgba(212,160,40,.18);
  }

  .custom-row {
    display: flex; align-items: center; gap: 8px;
  }
  .custom-lbl { font-size: 9px; letter-spacing: .14em; color: var(--ink-md); flex-shrink: 0; }
  .bet-input {
    flex: 1; padding: 7px 10px;
    background: rgba(0,0,0,.18); border: 1px solid var(--rim-lt);
    color: var(--txt-bright); font-family: var(--f-num); font-size: 13px;
    text-align: right; outline: none;
    transition: border-color .12s;
  }
  .bet-input:focus { border-color: var(--amber); }
  .bet-input:disabled { opacity: .3; }
  .bet-input::-webkit-inner-spin-button { display: none; }
  .custom-curr { font-size: 11px; color: var(--txt-dim); flex-shrink: 0; }

  .rule-line {
    font-size: 11px; line-height: 1.5; color: var(--ink-lt);
    text-align: center; padding: 2px 8px;
    border-top: 1px solid rgba(30,16,6,.15);
    border-bottom: 1px solid rgba(30,16,6,.15);
  }
  .rule-line strong { color: var(--amber); font-family: var(--f-num); }

  /* ── Choice buttons ──────────────────────────────────────────────────────── */
  .choice-row { display: flex; align-items: center; gap: 8px; }

  .choice-btn {
    flex: 1; padding: 16px 8px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    border: 2px solid; font-family: var(--f-ui); cursor: pointer;
    transition: all .15s; user-select: none;
  }
  .choice-btn.disabled { opacity: .28; cursor: not-allowed; }

  .more-btn {
    background: linear-gradient(180deg, #0a2a14 0%, #061808 100%);
    border-color: #226633; color: #66cc88;
    text-shadow: 0 0 8px rgba(80,200,100,.4);
  }
  .more-btn:hover:not(.disabled) {
    background: linear-gradient(180deg, #0e3a1c 0%, #0a2012 100%);
    border-color: #44cc66; color: #88ffaa;
    box-shadow: 0 0 20px rgba(60,180,80,.25), inset 0 0 12px rgba(60,180,80,.08);
  }

  .less-btn {
    background: linear-gradient(180deg, #2a0a08 0%, #180806 100%);
    border-color: #662222; color: #cc6666;
    text-shadow: 0 0 8px rgba(200,80,60,.4);
  }
  .less-btn:hover:not(.disabled) {
    background: linear-gradient(180deg, #3a100e 0%, #200c0a 100%);
    border-color: #cc4444; color: #ff8888;
    box-shadow: 0 0 20px rgba(180,50,40,.25), inset 0 0 12px rgba(180,50,40,.08);
  }

  .choice-arrow { font-size: 20px; line-height: 1; }
  .choice-label { font-size: 14px; font-weight: 700; letter-spacing: .14em; }
  .choice-sub   { font-size: 9px;  letter-spacing: .1em; opacity: .7; font-family: var(--f-num); }

  .vs-div {
    font-family: var(--f-deco); font-size: 11px; letter-spacing: .2em;
    color: var(--txt-dim); flex-shrink: 0; padding: 0 4px;
  }

  /* ── After-result actions ──────────────────────────────────────────────── */
  .again-row { display: flex; flex-direction: column; gap: 7px; }

  .again-btn {
    width: 100%; padding: 13px 8px;
    background: linear-gradient(180deg, #2a1e0e 0%, #1a1208 100%);
    border: 2px solid var(--gold); color: var(--gold-lt);
    font-family: var(--f-ui); font-size: 12px; letter-spacing: .16em;
    cursor: pointer;
    text-shadow: 0 0 8px rgba(240,192,72,.35);
    box-shadow: 0 0 18px rgba(212,160,40,.15), inset 0 1px 0 rgba(255,200,80,.08);
    transition: all .15s;
  }
  .again-btn:hover {
    background: linear-gradient(180deg, #3a2a10 0%, #2a1a08 100%);
    box-shadow: 0 0 28px rgba(212,160,40,.28);
    color: var(--txt-bright);
  }

  .leave-btn {
    width: 100%; padding: 9px 8px;
    background: transparent; border: 1px solid var(--rim-lt); color: var(--txt-dim);
    font-family: var(--f-ui); font-size: 10px; letter-spacing: .14em;
    cursor: pointer; transition: all .14s;
  }
  .leave-btn:hover { border-color: var(--rim-lt); color: var(--txt); }

  .broke-msg {
    text-align: center; font-size: 11px; letter-spacing: .14em;
    color: var(--rust-lt); padding: 8px;
  }

  /* ── Drilling animation ──────────────────────────────────────────────────── */
  .drilling-zone {
    padding: 20px 16px;
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    border: 1px solid rgba(212,160,40,.2);
    background: rgba(0,0,0,.12);
  }

  .drill-rig-icon {
    font-size: 36px; line-height: 1;
    animation: drillShake .08s linear infinite;
    text-shadow: 0 0 12px rgba(212,160,40,.7);
  }
  @keyframes drillShake {
    0%,100% { transform: translate(0,0) rotate(-2deg); }
    25%     { transform: translate(-2px,1px) rotate(1deg); }
    75%     { transform: translate(2px,-1px) rotate(-1deg); }
  }

  .drill-text {
    font-family: var(--f-deco); font-size: 10px; letter-spacing: .24em;
    color: var(--amber); text-shadow: 0 0 8px rgba(184,104,16,.6);
  }

  .drill-bar-wrap {
    width: 100%; height: 10px;
    background: rgba(0,0,0,.3); border: 1px solid rgba(212,160,40,.2);
    overflow: hidden;
  }
  .drill-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--amber) 0%, var(--gold-lt) 60%, #fff8e0 100%);
    box-shadow: 0 0 8px rgba(212,160,40,.6);
    animation: drillFill 1.7s ease-in forwards;
  }
  @keyframes drillFill {
    from { width: 2%; }
    to   { width: 100%; }
  }

  .drill-meta { font-size: 10px; color: var(--ink-lt); text-align: center; }
  .drill-meta strong { color: var(--amber); }

  /* ── Session stats strip ─────────────────────────────────────────────────── */
  .stats-strip {
    display: flex; gap: 0;
    border: 1px solid rgba(30,16,6,.25);
    background: rgba(0,0,0,.08);
    margin-top: 4px;
  }
  .st {
    flex: 1; padding: 8px 6px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    border-right: 1px solid rgba(30,16,6,.2);
  }
  .st:last-child { border-right: none; }
  .st-l { font-size: 7px; letter-spacing: .18em; color: var(--ink-md); text-transform: uppercase; }
  .st-v { font-family: var(--f-num); font-size: 13px; color: var(--ink); font-weight: 700; }
  .st-hot { color: var(--amber); text-shadow: 0 0 8px rgba(184,104,16,.6); }
  .st-pos { color: #44cc66; }
  .st-neg { color: var(--rust-lt); }
  .st-v.gold { color: var(--gold-lt); }

  /* ── Disclaimer ──────────────────────────────────────────────────────────── */
  .disclaimer {
    font-size: 8px; letter-spacing: .14em; color: var(--txt-dim);
    font-style: italic; text-align: center;
  }

  /* ── Animations ──────────────────────────────────────────────────────────── */
  .blink      { animation: blink 1s   step-start infinite; }
  .blink-alt  { animation: blink 1.4s step-start infinite; }
  .blink-slow { animation: blink 1.8s step-start infinite; }
  .blink-fast { animation: blink .45s step-start infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

  @keyframes resultPop {
    from { transform: scale(.92); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
</style>
