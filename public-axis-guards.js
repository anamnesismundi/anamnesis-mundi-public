(() => {
  const boundaryMap = [
    ["--axis-rupture-fade", "--axis-rupture", "event-sophia-independent-generation", -180, 20],
    [null, "--axis-demiurgic", "event-yaldabaoth-emergence", 0, 20],
    ["--axis-material-fade", "--axis-material", "event-ordering-material-cosmos", -220, 20]
  ];

  const repairPublicAxis = () => {
    const timeline = document.querySelector(".timeline");
    if (!timeline) return;
    const axisStart = Number.parseFloat(
      getComputedStyle(timeline).getPropertyValue("--timeline-start")
    ) || 0;

    boundaryMap.forEach(([fadeProperty, anchorProperty, eventId, fadeOffset, anchorOffset]) => {
      const eventElement = timeline.querySelector(
        `[data-event-id="${eventId}"]`
      );
      const visible = eventElement && !eventElement.hidden &&
        getComputedStyle(eventElement).display !== "none";

      if (!visible) {
        if (fadeProperty) timeline.style.removeProperty(fadeProperty);
        timeline.style.removeProperty(anchorProperty);
        return;
      }

      const position = Math.max(0, eventElement.offsetTop + 70 - axisStart);
      if (fadeProperty) {
        const minimum = fadeProperty === "--axis-rupture-fade" ? 340 : 0;
        timeline.style.setProperty(
          fadeProperty,
          `${Math.max(minimum, position + fadeOffset)}px`
        );
      }
      timeline.style.setProperty(anchorProperty, `${position + anchorOffset}px`);
    });
  };

  const scheduleRepair = () => {
    requestAnimationFrame(() => requestAnimationFrame(repairPublicAxis));
  };

  window.addEventListener("load", scheduleRepair);
  window.addEventListener("resize", scheduleRepair, { passive: true });
  document.addEventListener("click", scheduleRepair);

  const timeline = document.querySelector(".timeline");
  if (timeline) {
    new MutationObserver(scheduleRepair).observe(timeline, {
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "open", "style"]
    });
  }
  scheduleRepair();
})();
