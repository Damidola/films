(function (root) {
  "use strict";
  class ReviewsPanel {
    constructor(options) {
      this.options = options;
      this.repository = options.repository;
      this.provider = "hdrezka";
      this.session = null;
      this.dialog = document.getElementById("comments-panel");
      this.list = document.getElementById("comments-list");
      this.status = document.getElementById("comments-status");
      this.retry = document.getElementById("comments-retry");
      this.source = document.getElementById("comments-source");
      this.refresh = document.getElementById("comments-refresh");
      this.scroll = this.dialog.querySelector(".comments-scroll");
      this.scroll.tabIndex = 0;
      this.dialog.querySelector(".comments-close").onclick = () => this.close();
      this.retry.onclick = this.refresh.onclick = () => this.load(true);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isOpen) this.close();
      });
      this.repository.subscribe((context, provider, data) => {
        this.options.onData?.(context, provider, data);
        if (
          this.isOpen &&
          context.workId === this.session.context.workId &&
          provider === this.provider &&
          (provider !== "youtube" ||
            context.videoId === this.session.context.videoId)
        )
          this.render(data);
      });
    }
    get isOpen() {
      return !this.dialog.hidden;
    }
    layout() {
      return placeReadingPanel(this.dialog);
    }
    open(context = this.options.getContext()) {
      if (!Number.isInteger(context?.workId)) return false;
      const same =
        this.session?.context.workId === context.workId &&
        this.session?.context.videoId === context.videoId;
      this.session = { context: { ...context } };
      this.dialog.hidden = false;
      document.body.classList.add("comments-open");
      document.getElementById("comments-video").textContent =
        `№${context.number} · ${context.title}`;
      this.layout();
      this.options.onLayout?.();
      if (!same) {
        this.autoSource = true;
        this.provider = "hdrezka";
        this.load();
        this.scroll.scrollTop = 0;
      }
      return true;
    }
    close() {
      if (!this.isOpen) return;
      this.dialog.hidden = true;
      this.scroll.scrollTop = 0;
      this.session = null;
      document.body.classList.remove("comments-open");
      this.options.onLayout?.();
    }
    prefetch(context) {
      return this.repository.prefetch(context);
    }
    load(force = false) {
      if (!this.session) return;
      this.scroll.scrollTop = 0;
      const context = this.session.context,
        provider = this.provider;
      document.getElementById("comments-heading").textContent = "Комментарии";
      const cached = this.repository.peek(context, provider);
      this.refresh.disabled = true;
      this.retry.hidden = true;
      if (cached) this.render(cached);
      else {
        this.list.replaceChildren();
        this.source.replaceChildren();
        this.list.setAttribute("aria-busy", "true");
        this.status.hidden = false;
        this.status.textContent =
          provider === "hdrezka" ? "Загружаю отзывы…" : "Загружаю комментарии…";
      }
      this.repository.load(context, provider, { force }).finally(() => {
        if (
          this.session?.context.workId === context.workId &&
          this.provider === provider
        ) {
          this.refresh.disabled = false;
          this.list.setAttribute("aria-busy", "false");
        }
      });
    }
    render(data) {
      const comments = data.comments
        .filter(
          (c) => typeof c.text === "string" && typeof c.author === "string",
        )
        .slice(0, 20);
      this.list.setAttribute("aria-busy", "false");
      this.retry.hidden = data.status !== "unavailable";
      this.refresh.disabled = false;
      this.status.hidden = comments.length > 0;
      this.status.textContent =
        data.status === "unavailable"
          ? data.reason === "page-not-found"
            ? "Страница с отзывами пока не найдена. "
            : "Источник сейчас не отдаёт отзывы. Попробуй обновить комментарии."
          : data.status === "disabled"
            ? "Комментарии отключены."
            : data.provider === "hdrezka"
              ? "На этой странице пока нет отзывов."
              : "Под трейлером пока нет комментариев.";
      const fragment = document.createDocumentFragment();
      for (const c of comments) {
        const article = document.createElement("article");
        article.className = "review-comment";
        const depth = Math.max(0, Math.min(3, Number(c.depth) || 0));
        article.style.setProperty("--reply-depth", depth);
        article.classList.toggle("is-reply", depth > 0 || !!c.parentId);
        article.id = "review-comment-" + c.id;
        const header = document.createElement("div");
        header.className = "comment-heading";
        const avatar = document.createElement("span");
        avatar.className = "comment-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = Array.from(c.author.replace(/^@+/, ""))[0] || "●";
        const names = document.createElement("div"),
          author = document.createElement("b"),
          meta = document.createElement("span");
        author.textContent = c.author;
        meta.className = "comment-meta";
        meta.textContent = [c.pinned ? "Закреплён" : null, c.publishedText]
          .filter(Boolean)
          .join(" · ");
        names.append(author, meta);
        header.append(avatar, names);
        const text = document.createElement("p");
        text.className = "comment-text";
        text.textContent = c.text;
        article.append(header);
        if (c.replyTo) {
          const reply = document.createElement("a");
          reply.className = "comment-reply-to";
          reply.href = "#review-comment-" + c.parentId;
          reply.textContent = "↳ Ответ: " + c.replyTo;
          reply.onclick = (event) => {
            event.preventDefault();
            const parent = document.getElementById("review-comment-" + c.parentId);
            parent?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          };
          article.append(reply);
        }
        if (c.spoiler) {
          const details = document.createElement("details"),
            summary = document.createElement("summary");
          summary.textContent = "Показать отзыв со спойлером";
          details.append(summary, text);
          article.append(details);
        } else article.append(text);
        const footer = document.createElement("div");
        footer.className = "comment-footer";
        if (Number.isFinite(c.likes)) {
          const likes = document.createElement("span");
          likes.textContent =
            "♥ " + new Intl.NumberFormat("ru").format(c.likes);
          footer.append(likes);
        }
        if (c.url && /^https:\/\//.test(c.url)) {
          const link = document.createElement("a");
          link.className = "comment-original";
          link.href = c.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent =
            "Оригинал · " + (data.source?.host || data.provider);
          footer.append(link);
        }
        article.append(footer);
        fragment.append(article);
      }
      this.list.replaceChildren(fragment);
      this.source.replaceChildren();
      if (data.source?.url) {
        const link = document.createElement("a");
        link.href = data.source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = data.source.name + " · " + data.source.host;
        this.source.append(link);
      }
      const date = new Date(data.fetchedAt),
        stamp = Number.isNaN(date.getTime())
          ? ""
          : date.toLocaleDateString("ru");
      this.source.append(
        document.createTextNode(
          (data.source ? " · " : "") +
            (data.live
              ? "Обновлено с сайта"
              : "Сохранённая копия" + (stamp ? " · " + stamp : "")) +
            (comments.length
              ? " · " + comments.length + " в порядке источника."
              : ""),
        ),
      );
    }
  }
  root.ReviewsPanel = ReviewsPanel;
})(window);
