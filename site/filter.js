(() => {
  const grid = document.querySelector(".works-grid");
  const works = [...grid.querySelectorAll(".work")];
  const filters = [...document.querySelectorAll("[data-filter]")];
  const views = [...document.querySelectorAll("[data-view]")];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const transitionSupported =
    typeof document.startViewTransition === "function";
  let activeTransition = null;

  // Preserve each card's position across filter/layout changes, including rapid clicks.
  function rearrange(update) {
    works.forEach((work) =>
      work.getAnimations().forEach((animation) => animation.cancel()),
    );
    const before = new Map(
      works
        .filter((work) => !work.hidden)
        .map((work) => [work, work.getBoundingClientRect()]),
    );
    update();
    const visible = works.filter((work) => !work.hidden);
    visible.forEach((work, index) => {
      work.dataset.order = String(index % 4);
    });
    if (reducedMotion.matches) return;
    visible.forEach((work) => {
      const previous = before.get(work),
        next = work.getBoundingClientRect();
      const start = previous
        ? {
            transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px) scale(${previous.width / next.width}, ${previous.height / next.height})`,
            opacity: 1,
          }
        : { transform: "translateY(18px)", opacity: 0 };
      work.animate([start, { transform: "none", opacity: 1 }], {
        duration: 440,
        easing: "cubic-bezier(.2,.7,.2,1)",
        transformOrigin: "top left",
      });
    });
  }
  if (works.length) {
    document.querySelector(".filters").hidden = false;
    document.querySelector("[data-view-controls]").hidden = false;
    works.forEach((work, index) => {
      work.dataset.order = String(index % 4);
    });
  } else {
    document.querySelector(".collection-toolbar").hidden = true;
  }
  filters.forEach((button) =>
    button.addEventListener("click", () => {
      rearrange(() => {
        filters.forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
        works.forEach((work) => {
          work.hidden =
            button.dataset.filter !== "all" &&
            work.dataset.kind !== button.dataset.filter;
        });
      });
      const visible = works.filter((work) => !work.hidden).length;
      document.querySelector(".filter-empty").hidden = visible !== 0;
      document.querySelector("#filter-status").textContent =
        `显示 ${visible} 件作品`;
    }),
  );
  views.forEach((button) =>
    button.addEventListener("click", () => {
      if (grid.dataset.layout === button.dataset.view) return;
      rearrange(() => {
        grid.dataset.layout = button.dataset.view;
        views.forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
      });
    }),
  );

  function imageTransition(from, to, update) {
    if (activeTransition) {
      activeTransition.skipTransition();
      activeTransition = null;
    }
    document.querySelectorAll("[data-shared-image]").forEach((image) => {
      image.style.viewTransitionName = "";
      delete image.dataset.sharedImage;
    });
    if (!transitionSupported || reducedMotion.matches) {
      update();
      return;
    }
    from.style.viewTransitionName = "work-preview";
    from.dataset.sharedImage = "";
    const transition = document.startViewTransition(() => {
      from.style.viewTransitionName = "";
      delete from.dataset.sharedImage;
      update();
      to.style.viewTransitionName = "work-preview";
      to.dataset.sharedImage = "";
    });
    activeTransition = transition;
    transition.finished
      .catch(() => {})
      .finally(() => {
        if (activeTransition !== transition) return;
        to.style.viewTransitionName = "";
        delete to.dataset.sharedImage;
        activeTransition = null;
      });
  }

  document.querySelectorAll("[data-detail]").forEach((trigger) => {
    const dialog = document.getElementById(trigger.dataset.detail);
    if (!dialog || typeof dialog.showModal !== "function") return;
    const preview = trigger.querySelector("img");
    const image = dialog.querySelector(".detail-image");
    let savedScroll = 0;
    let opening = false;
    let closing = false;
    trigger.setAttribute("aria-haspopup", "dialog");
    function restore() {
      document.documentElement.classList.remove("dialog-open");
      window.scrollTo({ top: savedScroll, behavior: "instant" });
      trigger.focus({ preventScroll: true });
      closing = false;
    }
    function close() {
      if (!dialog.open || closing) return;
      closing = true;
      imageTransition(image, preview, () => {
        dialog.close();
        restore();
      });
    }
    trigger.addEventListener("click", async (event) => {
      // Preserve native links for new tabs and for browsers without dialog support.
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      if (opening || dialog.open) return;
      opening = true;
      image.loading = "eager";
      // The card stays visible while the full image is decoded; broken media cannot block opening.
      try {
        await Promise.race([
          image.decode(),
          new Promise((resolve) => setTimeout(resolve, 800)),
        ]);
      } catch {
        /* use alt text */
      }
      savedScroll = window.scrollY;
      imageTransition(preview, image, () => {
        document.documentElement.classList.add("dialog-open");
        dialog.showModal();
        dialog.scrollTop = 0;
        opening = false;
      });
    });
    dialog.querySelector("[data-close]").addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener("close", restore);
    let backdropDown = false;
    const outside = (event) => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };
    dialog.addEventListener("pointerdown", (event) => {
      backdropDown = event.target === dialog && outside(event);
    });
    dialog.addEventListener("click", (event) => {
      if (backdropDown && event.target === dialog && outside(event)) close();
      backdropDown = false;
    });
  });
})();
