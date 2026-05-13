<script>
  import { onMount } from 'svelte';
  import { currentScreen } from './lib/stores/index.js';
  
  // Импорт всех экранов
  import ContractsScreen from './lib/ContractsScreen.svelte';
  import TerminalScreen  from './lib/TerminalScreen.svelte';
  import GarageScreen    from './lib/GarageScreen.svelte';
  import CasinoScreen    from './lib/CasinoScreen.svelte';
  import MapCanvas       from './lib/MapCanvas.svelte';
  import DrillCanvas     from './lib/DrillCanvas.svelte';
  
  import { init, playClick } from './lib/audio.js';

  onMount(() => {
    function onDocClick(e) {
      init();
      if (e.target.closest('button')) playClick();
    }
    document.addEventListener('click', onDocClick, { capture: true });
    return () => document.removeEventListener('click', onDocClick, { capture: true });
  });
</script>

{#if $currentScreen === 'map'}
  <MapCanvas />
{:else if $currentScreen === 'terminal'}
  <TerminalScreen />
{:else if $currentScreen === 'garage'}
  <GarageScreen />
{:else if $currentScreen === 'casino'}
  <CasinoScreen />
{:else}
  <ContractsScreen />
{/if}