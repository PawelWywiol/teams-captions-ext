export const CAPTION_MARKER_SELECTOR = '[data-tid="closed-captions-v2-items-renderer"]';
export const CAPTION_AUTHOR_SELECTOR = '[data-tid="author"]';
export const CAPTION_TEXT_SELECTOR = '[data-tid="closed-caption-text"]';
export const LEGACY_MESSAGE_CLASS = "fui-ChatMessageCompact";

export function findCaptionMarkers(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll(CAPTION_MARKER_SELECTOR)) as HTMLElement[];
}

export function findCaptionTextNodes(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll(CAPTION_TEXT_SELECTOR)) as HTMLElement[];
}

export function countCaptionMarkers(element: Element): number {
  return element.querySelectorAll(CAPTION_MARKER_SELECTOR).length;
}

export function countCaptionTexts(element: Element): number {
  return element.querySelectorAll(CAPTION_TEXT_SELECTOR).length;
}

function hasRequiredCaptionNodes(element: Element): boolean {
  return countCaptionMarkers(element) === 1 && countCaptionTexts(element) === 1;
}

function isAllowedReadableTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return false;

  return Boolean(parent.closest(CAPTION_AUTHOR_SELECTOR) || parent.closest(CAPTION_TEXT_SELECTOR));
}

export function hasUnexpectedReadableText(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return true;

  const walker = element.ownerDocument.createTreeWalker(element, view.NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    if (
      current.nodeType === 3 &&
      current.textContent?.trim() &&
      !isAllowedReadableTextNode(current as Text)
    ) {
      return true;
    }

    current = walker.nextNode();
  }

  return false;
}

function isCaptionRelatedBranch(element: Element): boolean {
  return Boolean(
    element.matches(CAPTION_MARKER_SELECTOR) ||
    element.matches(CAPTION_TEXT_SELECTOR) ||
    element.matches(CAPTION_AUTHOR_SELECTOR) ||
    element.querySelector(CAPTION_MARKER_SELECTOR) ||
    element.querySelector(CAPTION_TEXT_SELECTOR) ||
    element.querySelector(CAPTION_AUTHOR_SELECTOR),
  );
}

export function hasBlockingSiblingBranches(element: Element): boolean {
  const relevantChildren = Array.from(element.children).filter((child) =>
    isCaptionRelatedBranch(child),
  );

  return relevantChildren.length > 0 && relevantChildren.length !== element.children.length;
}

export function isValidCaptionBoundary(element: Element): boolean {
  return (
    hasRequiredCaptionNodes(element) &&
    !hasBlockingSiblingBranches(element) &&
    !hasUnexpectedReadableText(element)
  );
}

export function isSingleCaptionItemContainer(element: Element): boolean {
  return isValidCaptionBoundary(element);
}
