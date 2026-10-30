(function (root) {
  "use strict";
  function card(i, ctx, h) {
    const { esc, icon, rating, totalDuration } = h,
      decision = ctx.decision;
    const duration = i.seriesStats
      ? "≈" + totalDuration(i.seriesStats)
      : i.runtime
        ? i.runtime + " мин"
        : "";
    const remove =
      ctx.view === "good"
        ? `data-good="${i.rank}" aria-label="Убрать из годноты"`
        : `data-no="${i.rank}" aria-label="Больше не предлагать"`;
    const posterTag = i.trailer ? "button" : "div";
    const posterAction = i.trailer ? `type="button" data-trailer="${i.rank}" aria-label="Открыть ${esc(i.ru)} в ленте"` : "";
    return `<article class="card library-card ${decision === "like" ? "decision-like" : decision === "dislike" ? "decision-dislike" : ""}" data-rank="${i.rank}"><${posterTag} class="poster-wrap" ${posterAction}><img loading="${ctx.index < 8 ? "eager" : "lazy"}" decoding="async" class="poster" data-poster-source="${esc(i.image || "assets/series-fallback.svg")}" alt="Постер ${esc(i.ru)}"><span class="poster-number">№${i.rank}</span></${posterTag}><div class="card-copy"><h2><button class="title-button" data-info="${i.rank}">${esc(i.ru)}${i.title && i.title !== i.ru ? ` <span class="original-title">(${esc(i.title)})</span>` : ""}</button></h2><div class="card-meta">${esc(i.year)}${duration ? " · " + esc(duration) : ""}</div></div><div class="card-footer"><div class="ratings">${rating(i)}${ctx.papich ? h.papichRating(i) : ""}</div><div class="card-actions">${i.trailer ? `<button class="smallbtn video-button" data-trailer="${i.rank}" title="${esc(i.trailer.note || i.trailer.title || "Трейлер")}" aria-label="Смотреть видео ${esc(i.ru)}">${icon("play")}</button>` : `<span class="smallbtn video-missing" title="Английский трейлер пока не найден" aria-label="Английский трейлер пока не найден">${icon("play")}</span>`}${ctx.rejected ? `<button class="smallbtn restore-button" data-restore="${i.rank}" aria-label="Вернуть ${esc(i.ru)} в каталог">${icon("undo")}<span>В каталог</span></button><button class="smallbtn" data-save="${i.rank}" aria-label="Добавить ${esc(i.ru)} в «Буду смотреть»">${icon("heart")}</button>` : `<button class="smallbtn ${decision === "dislike" ? "selected negative" : ""}" ${remove}>${icon("x")}</button><button class="smallbtn ${decision === "like" ? "selected positive" : ""}" data-save="${i.rank}" aria-label="${decision === "like" ? "Убрать из «Буду смотреть»" : "Добавить в «Буду смотреть»"}" aria-pressed="${decision === "like"}">${icon("heart")}</button>`}</div></div></article>`;
  }
  function details(i, match, h) {
    const { esc, icon, rating, seriesStats, watchLinks } = h;
    const related = match.because ? (match.because.ru || match.because.title) : null;
    const reason = match.because
      ? match.explanation ? `Ты отметил «${related}». ${match.explanation}` :
        `По твоим отметкам: «${match.because.ru || match.because.title}». Здесь могут сработать знакомые тебе элементы: ${match.common.join(", ")}. Это сходство по теме и тону; сюжет и темп могут отличаться.`
      : Number.isFinite(i.papichScore)
        ? `Из списка Папича · ${i.papichScore}/10. Это оценка Папича, а не совпадение с твоими вкусами.`
        : "";
    return `${h.inFeed ? "" : `<h2>${esc(i.ru)}</h2>`}<p class="detail-synopsis">${esc(i.syn || "Описание пока уточняется.")}</p><p class="detail-meta">${esc(i.title)} · ${i.year} · ${i.kind?.includes("Анимац") ? "Анимация" : i.type === "film" ? "Фильм" : "Сериал"}</p>${seriesStats(i)}<div class="ratings">${rating(i)}</div>${i.trailer?.note ? `<p class="detail-meta">${esc(i.trailer.note)}</p>` : ""}${reason ? `<section class="detail-reason"><h3>${match.because ? "Почему тебе может зайти" : "Источник подборки"}</h3><p>${esc(reason)}</p>${match.caveat || i.caveat ? `<p><strong>Что может не зайти:</strong> ${esc(match.caveat || i.caveat)}</p>` : ""}</section>` : ""}${h.inFeed ? "" : `<div class="watch-links">${watchLinks(i)}</div>`}`;
  }
  root.LibraryViews = { card, details };
})(window);
