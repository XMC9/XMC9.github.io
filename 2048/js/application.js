// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  // 暴露给排行榜 UI 和本地自动化测试用。
  window.game2048 = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
});
