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
    // 手机端保持 APlayer 默认的 aplayer-narrow 小方块，点右下角按钮再展开。
  }
})();