(function() {
  const audioList = [];
  const isFixed = theme.plugins.aplayer.type === "fixed";
  const isMini = theme.plugins.aplayer.type === "mini";

  for (const audio of theme.plugins.aplayer.audios) {
    const audioObj = {
      name: audio.name,
      artist: audio.artist,
      url: audio.url,
      cover: audio.cover,
      lrc: audio.lrc,
      theme: audio.theme,
    };
    audioList.push(audioObj);
  }

  if (isMini) {
    new APlayer({
      container: document.getElementById("aplayer"),
      mini: true,
      order: "random",
      audio: audioList,
    });
  } else if (isFixed) {
    const player = new APlayer({
      container: document.getElementById("aplayer"),
      fixed: true,
      lrcType: 3,
      order: "random",
      audio: audioList,
    });
    document.querySelector(".aplayer-icon-lrc").click();
    // 手机端默认展开成完整的音乐盒，避免只显示一个专辑封面
    if (window.matchMedia("(max-width: 640px)").matches) {
      const playerElement = document.getElementById("aplayer");
      if (playerElement) playerElement.classList.remove("aplayer-narrow");
    }
  }
})();