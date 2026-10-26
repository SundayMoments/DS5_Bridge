const AUTO_FIT_TEXT_SELECTOR = '[data-auto-fit-text]';
const DEFAULT_MINIMUM_FONT_SIZE_PX = 7;
const DEFAULT_MINIMUM_FONT_SIZE_RATIO = 0.68;
const DEFAULT_PRECISION_PX = 0.125;
const OVERFLOW_TOLERANCE_PX = 0.5;

type AutoFitRoot = Document | HTMLElement;

function finitePositiveNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function autoFitTextElements(root: AutoFitRoot): HTMLElement[] {
  const descendants = Array.from(root.querySelectorAll<HTMLElement>(AUTO_FIT_TEXT_SELECTOR));
  return root instanceof HTMLElement && root.matches(AUTO_FIT_TEXT_SELECTOR)
    ? [root, ...descendants]
    : descendants;
}

function pixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function availableInlineWidth(element: HTMLElement): number {
  const ownWidth = element.clientWidth;
  const parent = element.parentElement;
  if (!parent) return ownWidth;

  const elementBounds = element.getBoundingClientRect();
  const parentBounds = parent.getBoundingClientRect();
  if (parentBounds.width <= 0) return ownWidth;

  const parentStyle = getComputedStyle(parent);
  const remainingWidth = parentStyle.direction === 'rtl'
    ? elementBounds.right - parentBounds.left
      - pixelValue(parentStyle.borderLeftWidth)
      - pixelValue(parentStyle.paddingLeft)
    : parentBounds.right - elementBounds.left
      - pixelValue(parentStyle.borderRightWidth)
      - pixelValue(parentStyle.paddingRight);
  if (remainingWidth <= 0) return ownWidth;
  return ownWidth > 0 ? Math.min(ownWidth, remainingWidth) : remainingWidth;
}

function fitsAvailableWidth(element: HTMLElement, availableWidth: number): boolean {
  return element.scrollWidth <= availableWidth + OVERFLOW_TOLERANCE_PX;
}

export function largestFittingFontSize(
  maximumPx: number,
  minimumPx: number,
  fits: (fontSizePx: number) => boolean,
  precisionPx = DEFAULT_PRECISION_PX
): number {
  const maximum = Math.max(maximumPx, minimumPx);
  const minimum = Math.min(maximumPx, minimumPx);
  const precision = Math.max(0.01, precisionPx);

  if (fits(maximum)) return maximum;
  if (!fits(minimum)) return minimum;

  let lower = minimum;
  let upper = maximum;
  while (upper - lower > precision) {
    const candidate = (lower + upper) / 2;
    if (fits(candidate)) lower = candidate;
    else upper = candidate;
  }

  return Math.max(minimum, Math.floor(lower / precision) * precision);
}

export function fitAutoFitTextElement(element: HTMLElement): number | null {
  element.style.removeProperty('font-size');
  const maximumPx = Number.parseFloat(getComputedStyle(element).fontSize);
  const availableWidth = availableInlineWidth(element);
  if (!Number.isFinite(maximumPx) || maximumPx <= 0 || availableWidth <= 0) return null;

  const requestedMinimum = finitePositiveNumber(element.dataset.autoFitMin);
  const minimumPx = Math.min(
    maximumPx,
    requestedMinimum ?? Math.max(DEFAULT_MINIMUM_FONT_SIZE_PX, maximumPx * DEFAULT_MINIMUM_FONT_SIZE_RATIO)
  );
  const fits = (fontSizePx: number) => {
    element.style.fontSize = `${fontSizePx}px`;
    return fitsAvailableWidth(element, availableWidth);
  };

  if (fits(maximumPx)) {
    element.style.removeProperty('font-size');
    return maximumPx;
  }

  const fittedPx = largestFittingFontSize(maximumPx, minimumPx, fits);
  element.style.fontSize = `${fittedPx}px`;
  return fittedPx;
}

export function fitAutoFitTextGroup(elements: readonly HTMLElement[]): number | null {
  if (elements.length === 0) return null;
  elements.forEach((element) => element.style.removeProperty('font-size'));

  const measurements = elements.map((element) => {
    const maximumPx = Number.parseFloat(getComputedStyle(element).fontSize);
    const requestedMinimum = finitePositiveNumber(element.dataset.autoFitMin);
    return {
      element,
      maximumPx,
      minimumPx: Math.min(
        maximumPx,
        requestedMinimum ?? Math.max(DEFAULT_MINIMUM_FONT_SIZE_PX, maximumPx * DEFAULT_MINIMUM_FONT_SIZE_RATIO)
      ),
      availableWidth: availableInlineWidth(element)
    };
  });
  if (measurements.some(({ maximumPx, availableWidth }) => (
    !Number.isFinite(maximumPx) || maximumPx <= 0 || availableWidth <= 0
  ))) return null;

  const maximumPx = Math.min(...measurements.map((measurement) => measurement.maximumPx));
  const minimumPx = Math.min(
    maximumPx,
    Math.max(...measurements.map((measurement) => measurement.minimumPx))
  );
  const fits = (fontSizePx: number) => {
    measurements.forEach(({ element }) => { element.style.fontSize = `${fontSizePx}px`; });
    return measurements.every(({ element, availableWidth }) => fitsAvailableWidth(element, availableWidth));
  };

  if (fits(maximumPx)) {
    measurements.forEach(({ element }) => element.style.removeProperty('font-size'));
    return maximumPx;
  }

  const fittedPx = largestFittingFontSize(maximumPx, minimumPx, fits);
  measurements.forEach(({ element }) => { element.style.fontSize = `${fittedPx}px`; });
  return fittedPx;
}

function fitAutoFitTextElements(elements: readonly HTMLElement[]): void {
  const groups = new Map<string, HTMLElement[]>();
  elements.forEach((element) => {
    const group = element.dataset.autoFitGroup;
    if (!group) {
      fitAutoFitTextElement(element);
      return;
    }
    const members = groups.get(group) ?? [];
    members.push(element);
    groups.set(group, members);
  });
  groups.forEach(fitAutoFitTextGroup);
}

export function fitAutoFitText(root: AutoFitRoot): void {
  fitAutoFitTextElements(autoFitTextElements(root));
}

export function installAutoFitText(root: AutoFitRoot): () => void {
  const documentRoot = root instanceof Document ? root : root.ownerDocument;
  const view = documentRoot.defaultView;
  const observationRoot = root instanceof Document ? root.documentElement : root;
  let disposed = false;
  let scheduledFrame: number | null = null;
  let observedContainers = new Set<Element>();
  // A scheduled frame refits everything unless only label containers changed.
  let fullRefitPending = false;
  const pendingContainers = new Set<Element>();
  const isHidden = () => documentRoot.visibilityState === 'hidden';
  const inRoot = (element: Element) => root instanceof Document || root.contains(element);

  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(() => schedule());

  const synchronizeResizeTargets = (elements: readonly HTMLElement[]) => {
    if (!resizeObserver) return;
    const nextContainers = new Set<Element>();
    elements.forEach((element) => nextContainers.add(element.parentElement ?? element));
    observedContainers.forEach((container) => {
      if (!nextContainers.has(container)) resizeObserver.unobserve(container);
    });
    nextContainers.forEach((container) => {
      if (!observedContainers.has(container)) resizeObserver.observe(container);
    });
    observedContainers = nextContainers;
  };

  const refit = () => {
    if (disposed) return;
    const elements = autoFitTextElements(root);
    // A visited, hidden page must not constrain visible members of its group.
    fitAutoFitTextElements(elements.filter((element) => element.getClientRects().length > 0));
    if (!isHidden()) synchronizeResizeTargets(elements);
    // The fit itself writes font-size repeatedly. Those writes are already
    // reflected in the completed measurement and must not enqueue another fit.
    mutationObserver?.takeRecords();
  };

  // Text or sibling changes inside known label containers only move those
  // labels, plus the members of any group they share a size with.
  const refitContainers = (containers: readonly Element[]) => {
    if (disposed) return;
    const elements = new Set<HTMLElement>();
    const groups = new Set<string>();
    containers.forEach((container) => {
      for (const child of container.children) {
        if (!(child instanceof HTMLElement) || !child.matches(AUTO_FIT_TEXT_SELECTOR) || !inRoot(child)) continue;
        elements.add(child);
        if (child.dataset.autoFitGroup) groups.add(child.dataset.autoFitGroup);
      }
    });
    if (groups.size > 0) {
      autoFitTextElements(root).forEach((element) => {
        const group = element.dataset.autoFitGroup;
        if (group && groups.has(group)) elements.add(element);
      });
    }
    fitAutoFitTextElements([...elements].filter((element) => element.getClientRects().length > 0));
    mutationObserver?.takeRecords();
  };

  const requestFrame = view?.requestAnimationFrame?.bind(view)
    ?? ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  const cancelFrame = view?.cancelAnimationFrame?.bind(view)
    ?? ((frame: number) => window.clearTimeout(frame));

  const clearPending = () => {
    fullRefitPending = false;
    pendingContainers.clear();
  };

  function requestRefitFrame(): void {
    if (scheduledFrame !== null) return;
    scheduledFrame = requestFrame(() => {
      scheduledFrame = null;
      const full = fullRefitPending;
      const containers = [...pendingContainers];
      clearPending();
      if (isHidden()) return;
      if (full) refit();
      else refitContainers(containers);
    });
  }

  function schedule(): void {
    if (disposed || isHidden()) return;
    fullRefitPending = true;
    pendingContainers.clear();
    requestRefitFrame();
  }

  function scheduleContainers(containers: ReadonlySet<Element>): void {
    if (disposed || isHidden() || fullRefitPending) return;
    containers.forEach((container) => pendingContainers.add(container));
    requestRefitFrame();
  }

  const containsAutoFitText = (node: Node) => node instanceof Element
    && (node.matches(AUTO_FIT_TEXT_SELECTOR) || node.querySelector(AUTO_FIT_TEXT_SELECTOR) !== null);
  // Observed containers are synchronized on every full refit, and any change
  // that adds or removes a label schedules one. Until then a pending full
  // refit short-circuits the observer, so the set is current whenever it is
  // consulted. Without ResizeObserver the set stays empty, as before.
  const containsObservedContainer = (target: Element) => {
    if (!resizeObserver) return target.querySelector(AUTO_FIT_TEXT_SELECTOR) !== null;
    if (target.firstElementChild === null) return false;
    for (const container of observedContainers) {
      if (target.contains(container)) return true;
    }
    return false;
  };
  const attributeTargetContainsAutoFitText = (target: Node) => target instanceof Element
    && (target.matches(AUTO_FIT_TEXT_SELECTOR) || containsObservedContainer(target));
  // Walks ancestors instead of testing every container, and measures only
  // the containers that actually hold the changed node.
  const collectVisibleContainers = (target: Node, into: Set<Element>) => {
    let found = false;
    for (let node: Node | null = target; node; node = node.parentNode) {
      if (node instanceof Element && observedContainers.has(node) && node.getClientRects().length > 0) {
        into.add(node);
        found = true;
      }
    }
    return found;
  };
  type MutationImpact = 'none' | 'containers' | 'full';
  const mutationImpact = (record: MutationRecord, containers: Set<Element>): MutationImpact => {
    if (record.type === 'attributes') {
      if (record.attributeName?.startsWith('data-auto-fit-')) return 'full';
      // Ancestor class/style/language changes can alter inherited font metrics.
      // Progress bars, focus frames, and other unrelated regions cannot.
      if (attributeTargetContainsAutoFitText(record.target)) return 'full';
      return collectVisibleContainers(record.target, containers) ? 'containers' : 'none';
    }
    if (record.type === 'childList'
      && [...record.addedNodes, ...record.removedNodes].some(containsAutoFitText)) return 'full';
    return collectVisibleContainers(record.target, containers) ? 'containers' : 'none';
  };

  const mutationObserver = typeof MutationObserver === 'undefined'
    ? null
    : new MutationObserver((records) => {
      if (fullRefitPending && scheduledFrame !== null) return;
      const containers = new Set<Element>();
      for (const record of records) {
        if (mutationImpact(record, containers) === 'full') {
          schedule();
          return;
        }
      }
      if (containers.size > 0) scheduleContainers(containers);
    });
  const observeMutations = () => mutationObserver?.observe(observationRoot, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'class', 'style', 'hidden', 'data-text-scale', 'lang', 'dir',
      'data-auto-fit-text', 'data-auto-fit-min', 'data-auto-fit-group'
    ]
  });

  const handleVisibilityChange = () => {
    if (isHidden()) {
      if (scheduledFrame !== null) cancelFrame(scheduledFrame);
      scheduledFrame = null;
      clearPending();
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      observedContainers.clear();
    } else {
      observeMutations();
      schedule();
    }
  };
  documentRoot.addEventListener('visibilitychange', handleVisibilityChange);
  void documentRoot.fonts?.ready.then(schedule);
  // Even a hidden startup window needs its first layout before it is presented.
  refit();
  if (!isHidden()) observeMutations();

  return () => {
    disposed = true;
    if (scheduledFrame !== null) cancelFrame(scheduledFrame);
    documentRoot.removeEventListener('visibilitychange', handleVisibilityChange);
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    autoFitTextElements(root).forEach((element) => element.style.removeProperty('font-size'));
  };
}
