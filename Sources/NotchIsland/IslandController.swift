import AppKit
import IslandCore
import SwiftUI

/// One of the island's windows: a borderless panel that never activates the app
/// and never becomes key, so the frontmost app keeps its focus. It sits above
/// the menu bar on every space, fullscreen ones included, and is kept out of
/// every screen capture (D108, D110).
final class IslandPanel: NSPanel, NSWindowDelegate {
  var allowsKeyWindow: Bool = false
  let customEditor = CustomNoteTextView()

  init() {
    super.init(
      contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered,
      defer: false)
    isFloatingPanel = true
    level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 3)
    collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
    backgroundColor = .clear
    isOpaque = false
    hasShadow = false
    sharingType = .none
    hidesOnDeactivate = false
    isMovable = false
    acceptsMouseMovedEvents = true
    becomesKeyOnlyIfNeeded = true
    self.delegate = self
  }

  override var canBecomeKey: Bool { allowsKeyWindow }
  override var canBecomeMain: Bool { false }
  override var isKeyWindow: Bool { allowsKeyWindow && super.isKeyWindow }

  func windowWillReturnFieldEditor(_ sender: NSWindow, to client: Any?) -> Any? {
    if let field = client as? CustomNoteNSTextField {
      customEditor.isFieldEditor = true
      customEditor.activeField = field
      customEditor.onCommit = field.onCommit
      customEditor.onCancel = field.onCancel
      return customEditor
    }
    return nil
  }
}

/// The root view: it reports where the pointer is over the island's window.
final class PointerTrackingView: NSView {
  var onPointer: () -> Void = {}
  var onDragEntered: ((NSDraggingInfo) -> NSDragOperation)?
  var onDragUpdated: ((NSDraggingInfo) -> NSDragOperation)?
  var onDragExited: ((NSDraggingInfo) -> Void)?
  var onPerformDrop: ((NSDraggingInfo) -> Bool)?

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    registerForDraggedTypes([.fileURL, .URL, .string])
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    registerForDraggedTypes([.fileURL, .URL, .string])
  }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    trackingAreas.forEach(removeTrackingArea)
    addTrackingArea(
      NSTrackingArea(
        rect: .zero,
        options: [
          .mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect,
          .enabledDuringMouseDrag,
        ],
        owner: self))
  }

  override func mouseEntered(with event: NSEvent) { onPointer() }
  override func mouseMoved(with event: NSEvent) { onPointer() }
  override func mouseExited(with event: NSEvent) { onPointer() }

  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    onDragEntered?(sender) ?? []
  }

  override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
    onDragUpdated?(sender) ?? []
  }

  override func draggingExited(_ sender: NSDraggingInfo?) {
    if let sender { onDragExited?(sender) }
  }

  override func prepareForDragOperation(_ sender: NSDraggingInfo) -> Bool {
    true
  }

  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    onPerformDrop?(sender) ?? false
  }
}

/// The island view's controller: it places the island over the built-in
/// notch, runs the pointer rules (rest, sweep, click, grace, drags), drives
/// the opening and closing frame by frame, pages between music and shelf,
/// and offers the right-click Quit.
///
/// The island is drawn in two windows (D140, D136): the plain notch, over the
/// camera housing and never larger, and the card, a window of its own below
/// the menu bar strip that is sized to the card every frame of its motion.
/// Nothing of the island lies in the strip beside the notch or in the gap
/// between the notch and the card, so clicks there reach what is under them
/// by construction; the card window lets clicks through its rounded corners.
final class IslandController: NSObject, NSMenuDelegate {
  private let notchPanel = IslandPanel()
  private let cardPanel = IslandPanel()
  private let rootView = PointerTrackingView()
  private let cardRoot = PointerTrackingView()
  /// The opening's progress, 0 (the plain notch) to 1 (the open panel).
  private var motion = MotionValue(at: 0)
  private var displayLink: CADisplayLink?
  let model = IslandModel()
  private var machine: HoverMachine
  private var pager = PageScroller()
  private var focusLifecycle = FocusLifecycle()
  /// Whether a note editor has the card's keyboard focus, so it is given
  /// back only when it was taken: closing or turning the page with no note
  /// open leaves the card window alone.
  private var holdsKeyboardFocus = false
  private var deadlineTimer: Timer?
  private var monitor: Any?
  /// While the island is open, pointer moves anywhere are watched, so leaving
  /// it is seen however fast the pointer goes. Closed, nothing is watched
  /// beyond the notch itself.
  private var openMonitor: Any?
  /// While open, the pointer is also looked at ten times a second, so leaving
  /// is seen even when no event reaches the island (a pointer that jumps).
  /// Closed, there is no timer at all: the island at rest runs on events.
  private var openPoll: Timer?
  /// Called when the island opens, and every two seconds while it stays open,
  /// so what it shows is read fresh from the source.
  var onOpenRefresh: () -> Void = {}
  /// Called when the island opens or closes.
  var onOpenChanged: (Bool) -> Void = { _ in }
  var isOpen: Bool { machine.state == .open }
  /// The built-in notch and its screen (AppKit coordinates), while placed.
  var home: (notch: CGRect, screen: CGRect)? {
    guard let notchRect, let screen = contextGuard.homeScreen else { return nil }
    return (notchRect, screen.frame)
  }
  private var pressStartedOnIsland = false
  private let contextGuard: ContextGuard
  private var notchRect: CGRect?
  /// The shape, top-left based from the home screen's top-left corner.
  private var shape: IslandShape?
  private var screenFrame: CGRect?

  init(timing: IslandTiming, contextGuard: ContextGuard) {
    machine = HoverMachine(timing: timing)
    self.contextGuard = contextGuard
    super.init()
    if NSApp.mainMenu == nil {
      let mainMenu = NSMenu()
      let editMenuItem = NSMenuItem()
      let editMenu = NSMenu(title: "Edit")
      editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
      editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
      editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
      editMenu.addItem(
        withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
      mainMenu.addItem(editMenuItem)
      mainMenu.setSubmenu(editMenu, for: editMenuItem)
      NSApp.mainMenu = mainMenu
    }
    Self.host(FirstClickHostingView(rootView: NotchView()), in: rootView)
    Self.host(FirstClickHostingView(rootView: CardView(model: model)), in: cardRoot)
    notchPanel.contentView = rootView
    cardPanel.contentView = cardRoot
    rootView.onPointer = { [weak self] in self?.pointerChanged() }
    cardRoot.onPointer = { [weak self] in self?.pointerChanged() }
    rootView.onDragEntered = { [weak self] sender in self?.handleDragEntered(sender) ?? [] }
    rootView.onDragUpdated = { [weak self] sender in self?.handleDragUpdated(sender) ?? [] }
    rootView.onPerformDrop = { [weak self] sender in self?.handlePerformDrop(sender) ?? false }
    cardRoot.onDragEntered = { [weak self] sender in self?.handleDragEntered(sender) ?? [] }
    cardRoot.onDragUpdated = { [weak self] sender in self?.handleDragUpdated(sender) ?? [] }
    cardRoot.onPerformDrop = { [weak self] sender in self?.handlePerformDrop(sender) ?? false }
    model.onShelfDragBegan = { [weak self] item in
      self?.shelfItemDragBegan(item: item)
    }
    model.onShelfDragEnded = { [weak self] item, op, pt in
      self?.shelfItemDragEnded(item: item, operation: op, screenPoint: pt)
    }
    cardPanel.allowsKeyWindow = false
    // The card is a non-activating panel: it takes the keys while a note is
    // typed without the app in front ever stepping back, so there is no
    // second activation to hand the focus over, and nothing to race.
    model.onEditingNoteChanged = { [weak self] editing in
      guard let self else { return }
      if editing {
        self.focusLifecycle.startEditing()
        self.machine.editingBegan()
        self.holdsKeyboardFocus = true
        self.cardPanel.allowsKeyWindow = true
        self.cardPanel.makeKey()
        self.settle()
      } else {
        self.focusLifecycle.endEditing()
        self.releaseKeyboardFocus()
        if self.machine.isEditing {
          let (_, inside) = self.pointerInside()
          self.machine.editingEnded(inside: inside, at: self.now)
          self.settle()
        }
      }
    }
    monitor = NSEvent.addLocalMonitorForEvents(
      matching: [.leftMouseDown, .leftMouseUp, .rightMouseDown, .scrollWheel]
    ) { [weak self] event in
      self?.handle(event) ?? event
    }
  }

  private static func host<V: View>(_ hosting: NSHostingView<V>, in root: NSView) {
    // The motion sizes the windows; the content never pushes them larger.
    hosting.sizingOptions = []
    hosting.translatesAutoresizingMaskIntoConstraints = false
    root.addSubview(hosting)
    NSLayoutConstraint.activate([
      hosting.leadingAnchor.constraint(equalTo: root.leadingAnchor),
      hosting.trailingAnchor.constraint(equalTo: root.trailingAnchor),
      hosting.topAnchor.constraint(equalTo: root.topAnchor),
      hosting.bottomAnchor.constraint(equalTo: root.bottomAnchor),
    ])
  }

  /// Place the island over the built-in notch; with no such screen there is
  /// no island at all (D16).
  func place() {
    guard let screen = contextGuard.homeScreen,
      let notch = NotchGeometry.notchRect(on: ContextGuard.describe(screen))
    else {
      notchRect = nil
      shape = nil
      notchPanel.orderOut(nil)
      cardPanel.orderOut(nil)
      return
    }
    notchRect = notch
    screenFrame = screen.frame
    // The menu bar strip: as tall as the screen keeps above its visible
    // frame, never less than the notch (a hidden menu bar keeps none).
    let strip = max(notch.height, screen.frame.maxY - screen.visibleFrame.maxY)
    let local = CGRect(
      x: notch.minX, y: screen.frame.maxY - notch.maxY, width: notch.width, height: notch.height)
    let shape = IslandShape(
      notch: local, stripBottom: local.minY + strip, openCard: CardView.openSize)
    self.shape = shape
    notchPanel.setFrame(appKit(shape.notch), display: true)
    applyShape()
    notchPanel.orderFrontRegardless()
  }

  /// A top-left based rect of the shape in AppKit's global coordinates.
  private func appKit(_ r: CGRect) -> CGRect {
    let top = screenFrame?.maxY ?? 0
    return CGRect(x: r.minX, y: top - r.maxY, width: r.width, height: r.height)
  }

  private var progress: Double { motion.sample(at: now).x }

  /// Size the card's window to the card for the motion's progress now, or
  /// `ahead` seconds from now (the notch's window never changes), and show
  /// the content once the opening has settled.
  private func applyShape(ahead: TimeInterval = 0) {
    guard let shape else { return }
    if let card = shape.card(progress: motion.sample(at: now + ahead).x) {
      cardPanel.setFrame(appKit(card), display: true)
      if !cardPanel.isVisible { cardPanel.orderFrontRegardless() }
      _ = pointerInside()
    } else if cardPanel.isVisible {
      cardPanel.orderOut(nil)
    }
    let content =
      machine.state == .open && motion.swing(at: now) < IslandMotion.contentSwing
    if model.isOpen != content { model.isOpen = content }
  }

  /// Head the motion for the machine's state: spring out on opening, shrink
  /// back without a bounce on closing (D137), from wherever it is now.
  private func startMotion(open: Bool) {
    motion.retarget(
      to: open ? 1 : 0, curve: open ? IslandMotion.opening : IslandMotion.closing, at: now)
    if displayLink == nil, let screen = contextGuard.homeScreen {
      let link = screen.displayLink(target: self, selector: #selector(frame(_:)))
      link.add(to: .main, forMode: .common)
      displayLink = link
    }
    // The first frame goes up at once, as it will look when it reaches the
    // screen, rather than at the display link's first callback a frame or
    // two later: the opening is seen starting by the end of the rest (D137).
    applyShape(ahead: 1.0 / 60)
  }

  /// One display frame of the motion; the link stops once it is at rest, so
  /// the island at rest draws nothing (D79).
  @objc private func frame(_ link: CADisplayLink) {
    let resting = motion.settle(at: now)
    applyShape()
    if resting {
      displayLink?.invalidate()
      displayLink = nil
      watchPointer()
    }
  }

  /// Whether the pointer is on the island's drawn shape as it stands now. The
  /// top edge counts: the pointer pushed against the top of the screen is on
  /// the notch. Over the card's window, the window lets clicks through where
  /// the card is not drawn (its rounded corners); this is asked again on
  /// every pointer event and every frame of the motion, so it is never stale
  /// for a pointer that stays put while the card moves under it.
  private func pointerInside() -> (CGPoint, Bool) {
    let p = Self.pointerLocation()
    guard let shape, let screenFrame else { return (p, false) }
    let local = CGPoint(x: p.x, y: screenFrame.maxY - p.y)
    let progress = progress
    let inside = shape.contains(local, progress: progress)
    let overCardWindow = shape.card(progress: progress)?.contains(local) ?? false
    let passThrough = overCardWindow && !inside
    if cardPanel.ignoresMouseEvents != passThrough { cardPanel.ignoresMouseEvents = passThrough }
    return (p, inside)
  }

  /// Where the pointer is now, in AppKit's coordinates, asked of the event
  /// system itself (a freshly started app's own idea of it can be stale).
  static func pointerLocation() -> CGPoint {
    guard let p = CGEvent(source: nil)?.location,
      let primary = NSScreen.screens.first
    else { return NSEvent.mouseLocation }
    return CGPoint(x: p.x, y: primary.frame.maxY - p.y)
  }

  private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }

  private func pointerChanged() {
    let (p, inside) = pointerInside()
    machine.pointer(x: p.x, y: p.y, inside: inside, at: now)
    settle()
  }

  private var wasOpen = false

  /// Apply what the machine decided and arm its next deadline.
  private func settle() {
    machine.tick(at: now)
    let isOpen = machine.state == .open
    if isOpen != wasOpen {
      wasOpen = isOpen
      #if ISLAND_TEST_INPUT
        NSLog(
          "notch-island: %@ (pointer %@)", isOpen ? "open" : "closed", "\(Self.pointerLocation())")
      #endif
      if !isOpen {
        model.endAnyNoteEditing()
        focusLifecycle.onIslandClosed()
        releaseKeyboardFocus()
        pager.reset()
        model.page = .music
      }
      startMotion(open: isOpen)
      if isOpen { onOpenRefresh() }
      watchPointer()
      onOpenChanged(isOpen)
    }
    deadlineTimer?.invalidate()
    deadlineTimer = nil
    if let deadline = machine.nextDeadline {
      let timer = Timer(timeInterval: max(0, deadline - now) + 0.001, repeats: false) {
        [weak self] _ in
        self?.pointerChanged()
      }
      RunLoop.main.add(timer, forMode: .common)
      deadlineTimer = timer
    }
  }

  /// Whether the left button is down, as macOS reads it. A test build can be
  /// told the button reads released (a mouse-up that never arrived).
  private static func leftButtonHeld() -> Bool {
    TestInput.leftButtonReading ?? (NSEvent.pressedMouseButtons & 1 != 0)
  }

  /// Watch the pointer while the island is open or still moving (a pointer
  /// back on a closing island turns it round); at rest and closed, nothing.
  private func watchPointer() {
    let open = machine.state == .open || !motion.isResting
    if open, openPoll == nil {
      var ticks = 0
      let timer = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
        guard let self else { return }
        ticks += 1
        if ticks % 20 == 0, self.machine.state == .open { self.onOpenRefresh() }
        // A mouse-up that never reached us must not hold the island open.
        if self.pressStartedOnIsland, !Self.leftButtonHeld() {
          self.pressStartedOnIsland = false
          let (_, inside) = self.pointerInside()
          self.machine.leftButton(held: false, inside: inside, at: self.now)
        }
        self.pointerChanged()
      }
      RunLoop.main.add(timer, forMode: .common)
      openPoll = timer
    } else if !open {
      openPoll?.invalidate()
      openPoll = nil
    }
    if open, openMonitor == nil {
      openMonitor = NSEvent.addGlobalMonitorForEvents(
        matching: [.mouseMoved, .leftMouseDragged, .leftMouseUp, .leftMouseDown]
      ) { [weak self] event in
        guard let self else { return }
        if event.type == .leftMouseDown {
          // A click in another app ends the typing and keeps the note; the
          // island then closes after its grace as usual.
          if self.machine.isEditing { self.model.commitAnyNoteEditing() }
        } else if event.type == .leftMouseUp, self.pressStartedOnIsland {
          _ = self.handle(event)
        } else {
          self.pointerChanged()
        }
      }
    } else if !open, let monitor = openMonitor {
      NSEvent.removeMonitor(monitor)
      openMonitor = nil
    }
  }

  private func handle(_ event: NSEvent) -> NSEvent? {
    switch event.type {
    case .leftMouseDown:
      guard isIsland(event.window) else { return event }
      if machine.state == .closed {
        machine.click(at: now)
        settle()
        return nil
      }
      pressStartedOnIsland = true
      machine.dragBegan()
      settle()
      return event
    case .leftMouseUp:
      guard pressStartedOnIsland else { return event }
      pressStartedOnIsland = false
      let (_, inside) = pointerInside()
      machine.dragEnded(inside: inside, at: now)
      DispatchQueue.main.async { [weak self] in self?.pointerChanged() }
      return event
    case .rightMouseDown:
      guard isIsland(event.window) else { return event }
      machine.secondaryClick()
      settle()
      showQuitMenu(with: event)
      return nil
    case .scrollWheel:
      guard isIsland(event.window), machine.state == .open else { return event }
      let began = event.phase.contains(.began) || event.phase.isEmpty
      let action = ShelfScrollRouting.route(
        page: model.page,
        deltaX: Double(event.scrollingDeltaX),
        deltaY: Double(event.scrollingDeltaY),
        continuous: event.hasPreciseScrollingDeltas,
        gestureBegan: began,
        momentum: !event.momentumPhase.isEmpty,
        pager: &pager
      )
      switch action {
      case .changePage(let newPage):
        if newPage == .music {
          model.endAnyNoteEditing()
          focusLifecycle.onPageChanged(to: .music)
          releaseKeyboardFocus()
        }
        model.page = newPage
        return nil
      case .routeToContent:
        return event
      case .swallow:
        return nil
      }
    default:
      return event
    }
  }

  /// Gives keyboard focus back (R4): the card stops being key-capable, loses
  /// first responder and key status, and the app steps back. Only when a note
  /// took it: the re-ordering below would otherwise blink the card on every
  /// close and every turn back to the music page.
  private func releaseKeyboardFocus() {
    guard holdsKeyboardFocus else { return }
    holdsKeyboardFocus = false
    cardPanel.allowsKeyWindow = false
    cardPanel.makeFirstResponder(nil)
    cardPanel.resignKey()
    NSApp.deactivate()
    // The window server keeps reporting the card as the focused window until
    // it is re-ordered; cycling it in place clears that without a visible change.
    if cardPanel.isVisible {
      #if ISLAND_TEST_INPUT
        NSLog("notch-island: card re-ordered")
      #endif
      cardPanel.orderOut(nil)
      cardPanel.orderFrontRegardless()
    }
  }

  private func isIsland(_ window: NSWindow?) -> Bool {
    window === notchPanel || window === cardPanel
  }

  /// The right-click menu has one item, Quit (D86). Quitting stops the island
  /// until the next login; it leaves the login item as it is.
  private func showQuitMenu(with event: NSEvent) {
    let menu = NSMenu()
    menu.autoenablesItems = false
    let quit = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "")
    quit.target = self
    menu.addItem(quit)
    NSMenu.popUpContextMenu(menu, with: event, for: rootView)
  }

  private func isTextOnlyDrag(_ sender: NSDraggingInfo) -> Bool {
    let pb = sender.draggingPasteboard
    let fileURLs =
      pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL]
      ?? []
    if !fileURLs.isEmpty { return false }
    let allURLs = pb.readObjects(forClasses: [NSURL.self], options: nil) as? [URL] ?? []
    let hasWebURL = allURLs.contains { $0.scheme == "http" || $0.scheme == "https" }
    if hasWebURL { return false }
    if let str = pb.string(forType: .string), !str.isEmpty {
      return true
    }
    return false
  }

  private func isOverRemoveArea(_ sender: NSDraggingInfo) -> Bool {
    guard sender.draggingDestinationWindow === cardPanel else {
      return false
    }
    guard let view = model.removeAreaView, let window = view.window, window === cardPanel,
      !view.isHiddenOrHasHiddenAncestor, view.bounds.width > 0, view.bounds.height > 0
    else {
      return false
    }
    let loc = sender.draggingLocation
    let frameInWindow = view.convert(view.bounds, to: nil)
    return frameInWindow.insetBy(dx: -4, dy: -4).contains(loc)
  }

  private func handleDragEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    if isTextOnlyDrag(sender) {
      return []
    }
    if model.isDraggingShelfItem {
      if isOverRemoveArea(sender) {
        return .delete
      }
      return []
    }
    model.page = .shelf
    pager.show(.shelf)
    if machine.state != .open {
      machine.dropTargetOpened()
      settle()
    }
    return .copy
  }

  private func handleDragUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
    if isTextOnlyDrag(sender) {
      return []
    }
    if model.isDraggingShelfItem {
      if isOverRemoveArea(sender) {
        return .delete
      }
      return []
    }
    if model.page != .shelf {
      model.page = .shelf
      pager.show(.shelf)
    }
    if machine.state != .open {
      machine.dropTargetOpened()
      settle()
    }
    return .copy
  }

  private func handlePerformDrop(_ sender: NSDraggingInfo) -> Bool {
    if isTextOnlyDrag(sender) {
      if let str = sender.draggingPasteboard.string(forType: .string) {
        _ = model.shelfStore?.parkDroppedText(str)
      }
      return false
    }

    if model.isDraggingShelfItem {
      if isOverRemoveArea(sender) {
        if let item = model.currentDraggedItem {
          model.onRemoveShelfItem(item.id)
          return true
        }
      }
      return false
    }

    guard let shelfStore = model.shelfStore else { return false }
    let pb = sender.draggingPasteboard

    if let fileURLs = pb.readObjects(
      forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL],
      !fileURLs.isEmpty
    {
      do {
        if fileURLs.count == 1 {
          try shelfStore.parkFile(at: fileURLs[0])
        } else {
          try shelfStore.parkFiles(at: fileURLs)
        }
        model.refreshShelf()
        return true
      } catch {
        return false
      }
    }

    if let allURLs = pb.readObjects(forClasses: [NSURL.self], options: nil) as? [URL] {
      let webURLs = allURLs.filter { $0.scheme == "http" || $0.scheme == "https" }
      if let first = webURLs.first {
        var title = pb.string(forType: .string)
        if title == nil || title == first.absoluteString {
          let s = first.absoluteString
          if let r = s.range(of: "://") {
            title = String(s[r.upperBound...])
          }
        }
        shelfStore.parkLink(first, title: title)
        model.refreshShelf()
        return true
      }
    }

    return false
  }

  func shelfItemDragBegan(item: ShelfItem) {
    pressStartedOnIsland = true
    machine.dragBegan()
    settle()
  }

  func shelfItemDragEnded(item: ShelfItem, operation: NSDragOperation, screenPoint: NSPoint) {
    if operation == [] {
      model.shelfStore?.itemRefused(id: item.id)
    } else if operation.contains(.delete) {
      // The Trash in the Dock (D142): its files go there, as from Finder. A
      // drop on the island's own remove area already took the item off and
      // moves nothing; a file the Dock moved itself is no longer there.
      for url in model.shelfStore?.droppedOnTrash(id: item.id) ?? []
      where FileManager.default.fileExists(atPath: url.path) {
        try? FileManager.default.trashItem(at: url, resultingItemURL: nil)
      }
      model.refreshShelf()
    } else {
      model.shelfStore?.itemAccepted(id: item.id)
      model.refreshShelf()
    }
    pressStartedOnIsland = false
    let (_, inside) = pointerInside()
    machine.dragEnded(inside: inside, at: now)
    settle()
  }

  @objc private func quit() {
    NSApp.terminate(nil)
  }
}
