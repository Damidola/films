(function (root) {
  "use strict";
  function placeReadingPanel(panel) {
    const shell = document.querySelector(".feed-shell").getBoundingClientRect(),
      video = (document.querySelector(".video-slot.is-active") || document.getElementById("video-box")).getBoundingClientRect();
    const sidePanel = matchMedia("(min-width: 1000px), (min-width: 600px) and (max-height: 500px)").matches;
    const toolbar = document.querySelector(".feed-top").getBoundingClientRect();
    const left = sidePanel ? video.right : shell.left,
      top = sidePanel
        ? (innerHeight < 500 ? toolbar.bottom : video.top)
        : Math.max(toolbar.bottom, video.bottom);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.bottom = "auto";
    panel.style.width = (sidePanel ? shell.right - left : shell.width) + "px";
    panel.style.height = Math.max(80, shell.bottom - top) + "px";
    return Math.max(80, shell.bottom - top);
  }
  root.placeReadingPanel = placeReadingPanel;
})(window);
