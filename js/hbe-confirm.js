/**
 * 密码文章的「解锁」按钮。
 *
 * 主题自带的密码框只有 input + label，解锁逻辑挂在 #hexo-blog-encrypt 的
 * keydown 上（按回车触发）。手机键盘的「前往」不一定派发 Enter，所以我
 * 们补一个看得见的按钮，点它等同于按回车。
 */
(function () {
  var BTN_CLASS = "hbe-unlock-btn";

  function buildButton() {
    var box = document.getElementById("hexo-blog-encrypt");
    if (!box) return;

    var input = document.getElementById("hbePass");
    var wrap = box.querySelector(".hbe-input");
    if (!input || !wrap || box.querySelector("." + BTN_CLASS)) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.textContent = "解锁";
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      // 交给主题自己的 keydown 监听处理，避免重复实现一套解密逻辑。
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    // 放在输入框下面单独一行，不要挤进 .hbe-input 的浮动布局里。
    wrap.insertAdjacentElement("afterend", btn);
  }

  function init() {
    buildButton();
    // Swup 无刷新切页后 DOM 是新的，需要重新注入。
    document.addEventListener("swup:page:view", buildButton);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
