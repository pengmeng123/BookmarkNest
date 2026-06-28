// Chrome's built-in page translation (and other DOM-mutating extensions) swap
// text nodes in place. React still holds references to the original nodes, so
// when a re-render tries to remove or move one, it calls removeChild/insertBefore
// against a parent that no longer owns the node and throws NotFoundError —
// crashing the whole React tree (blank page until reload). This is a well-known
// React + Google Translate conflict.
//
// Making removeChild/insertBefore tolerant of that mismatch lets translation
// keep working while React no longer crashes. Idempotent and safe to import from
// every entry point; must run before React renders.
export function installTranslateGuard() {
  if (typeof Node !== 'function' || !Node.prototype) {
    return;
  }

  const proto = Node.prototype as Node & { __bookmarknestTranslateGuard?: boolean };
  if (proto.__bookmarknestTranslateGuard) {
    return;
  }
  proto.__bookmarknestTranslateGuard = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // The node was already detached/relocated by the translator. Treat the
      // removal as a no-op instead of throwing.
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore<T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // The reference node was moved by the translator; append instead of
      // throwing so React's update still lands.
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}

installTranslateGuard();
