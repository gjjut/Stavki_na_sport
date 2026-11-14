export async function register() {
  // Встроенный серверный таймер автопилота (дублирует системный Cron на случай контейнеров без cron)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const g = globalThis as unknown as { __valuexAutopilotTimerStarted?: boolean };
    if (g.__valuexAutopilotTimerStarted) return;
    g.__valuexAutopilotTimerStarted = true;

    const runSafeTick = async () => {
      try {
        const mod = await import('./server/ai-autopilot');
        await mod.runScheduledAutopilotTick();
      } catch {
        // Игнорируем сетевые таймауты до следующего тика
      }
    };

    // Первый тик через 45 секунд после старта сервера, затем каждые 10 минут
    setTimeout(() => {
      void runSafeTick();
    }, 45_000).unref?.();

    setInterval(() => {
      void runSafeTick();
    }, 10 * 60_000).unref?.();
  }
}
