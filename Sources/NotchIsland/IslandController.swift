import AppKit
import IslandCore
import SwiftUI

/// The island's one window: a borderless panel that never activates the app
/// and never becomes key, so the frontmost app keeps its focus. It sits above
/// the menu bar on every space, fullscreen ones included, and is kept out of
/// every screen capture (D108, D110).
final class IslandPanel: NSPanel {
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
  }

  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

/// The root view: it reports where the pointer is over the island's window.
final class PointerTrackingView: NSView {
  var onPointer: () -> Void = {}

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
}

/// The island view's controller: it places the panel over the built-in notch,
/// runs the pointer rules (rest, sweep, click, grace, drags), pages between
/// music and shelf, and offers the right-click Quit.
final class IslandController: NSObject, NSMenuDelegate {
  private let panel = IslandPanel()
  private let rootView = PointerTrackingView()
  let model = IslandModel()
  private var machine: HoverMachine
  private var pager = PageScroller()
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
  private var pressStartedOnIsland = false
  private let contextGuard: ContextGuard
  private var notchRect: CGRect?
  private var openRect: CGRect?

  init(timing: IslandTiming, contextGuard: ContextGuard) {
    machine = HoverMachine(timing: timing)
    self.contextGuard = contextGuard
    super.init()
    let hosting = FirstClickHostingView(rootView: IslandView(model: model))
    hosting.translatesAutoresizingMaskIntoConstraints = false
    rootView.addSubview(hosting)
    NSLayoutConstraint.activate([
      hosting.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
      hosting.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
      hosting.topAnchor.constraint(equalTo: rootView.topAnchor),
      hosting.bottomAnchor.constraint(equalTo: rootView.bottomAnchor),
    ])
    panel.contentView = rootView
    rootView.onPointer = { [weak self] in self?.pointerChanged() }
    monitor = NSEvent.addLocalMonitorForEvents(
      matching: [.leftMouseDown, .leftMouseUp, .rightMouseDown, .scrollWheel]
    ) { [weak self] event in
      self?.handle(event) ?? event
    }
  }

  /// Place the island over the built-in notch; with no such screen there is
  /// no island at all (D16).
  func place() {
    guard let screen = contextGuard.homeScreen,
      let notch = NotchGeometry.notchRect(on: ContextGuard.describe(screen))
    else {
      notchRect = nil
      openRect = nil
      panel.orderOut(nil)
      return
    }
    notchRect = notch
    openRect = NotchGeometry.openRect(
      notch: notch, screen: screen.frame, size: IslandView.openSize)
    model.notchSize = notch.size
    applyFrame()
    panel.orderFrontRegardless()
  }

  private var shapeRect: CGRect? {
    machine.state == .open ? openRect : notchRect
  }

  private func applyFrame() {
    guard let rect = shapeRect else { return }
    panel.setFrame(rect, display: true)
  }

  /// Whether the pointer is on the island's drawn shape. The top edge counts:
  /// the pointer pushed against the top of the screen is on the notch.
  private func pointerInside() -> (CGPoint, Bool) {
    let p = Self.pointerLocation()
    guard let rect = shapeRect else { return (p, false) }
    let radius =
      machine.state == .open ? NotchGeometry.openBottomRadius : NotchGeometry.closedBottomRadius
    return (p, NotchGeometry.shapeContains(p, in: rect, bottomRadius: radius))
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

  /// Apply what the machine decided and arm its next deadline.
  private func settle() {
    let wasOpen = model.isOpen
    machine.tick(at: now)
    let isOpen = machine.state == .open
    if isOpen != wasOpen {
      #if ISLAND_TEST_INPUT
        NSLog(
          "notch-island: %@ (pointer %@)", isOpen ? "open" : "closed", "\(Self.pointerLocation())")
      #endif
      if !isOpen {
        pager.reset()
        model.page = .music
      }
      model.isOpen = isOpen
      applyFrame()
      watchPointerWhileOpen(isOpen)
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

  private func watchPointerWhileOpen(_ open: Bool) {
    if open, openPoll == nil {
      onOpenRefresh()
      var ticks = 0
      let timer = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
        guard let self else { return }
        ticks += 1
        if ticks % 20 == 0 { self.onOpenRefresh() }
        // A mouse-up that never reached us must not hold the island open.
        if self.pressStartedOnIsland, NSEvent.pressedMouseButtons & 1 == 0 {
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
        matching: [.mouseMoved, .leftMouseDragged, .leftMouseUp]
      ) { [weak self] event in
        guard let self else { return }
        if event.type == .leftMouseUp, self.pressStartedOnIsland {
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
      guard event.window === panel else { return event }
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
      guard event.window === panel else { return event }
      machine.secondaryClick()
      settle()
      showQuitMenu(with: event)
      return nil
    case .scrollWheel:
      guard event.window === panel, machine.state == .open else { return event }
      let began = event.phase.contains(.began) || event.phase.isEmpty
      if pager.scroll(
        deltaY: Double(event.scrollingDeltaY), continuous: event.hasPreciseScrollingDeltas,
        gestureBegan: began, momentum: !event.momentumPhase.isEmpty)
      {
        model.page = pager.page
      }
      return nil
    default:
      return event
    }
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

  @objc private func quit() {
    NSApp.terminate(nil)
  }
}
