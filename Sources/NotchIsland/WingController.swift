import AppKit
import ApplicationServices
import IslandCore
import SwiftUI

/// Reads the free gap left of the notch live (D114): the frontmost app's
/// menu bar items through Accessibility, the status icons from the window
/// server. Never hard-coded; read again for every notice and on every app
/// switch while the wing is out.
enum MenuBarReader {
  /// The gap's width in points, or nil when it cannot be read (then nothing
  /// pops: a menu the island cannot see it could cover). Call off the main thread.
  static func freeGap(notch: CGRect, home: CGRect) -> CGFloat? {
    if let injected = TestInput.leftGap { return injected }
    guard AXIsProcessTrusted() else {
      NSLog("notch-island: no Accessibility permission, so the menu bar cannot be read")
      return nil
    }
    guard
      let app = NSWorkspace.shared.menuBarOwningApplication
        ?? NSWorkspace.shared.frontmostApplication
    else { return nil }
    let element = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetMessagingTimeout(element, 0.3)
    var bar: AnyObject?
    guard AXUIElementCopyAttributeValue(element, kAXMenuBarAttribute as CFString, &bar) == .success,
      let barElement = bar
    else { return nil }
    var children: AnyObject?
    guard
      AXUIElementCopyAttributeValue(
        barElement as! AXUIElement, kAXChildrenAttribute as CFString, &children) == .success,
      let items = children as? [AXUIElement]
    else { return nil }
    let frames = items.compactMap(frame(of:))
    let screens = topLeftScreens()
    let menuScreen = frames.first.flatMap { f in
      screens.first { $0.contains(CGPoint(x: f.midX, y: f.midY)) }
    }
    return MenuBarGap.width(
      notch: notch, home: home, menuItems: frames, menuScreen: menuScreen,
      statusItems: statusItems())
  }

  private static func frame(of element: AXUIElement) -> CGRect? {
    var p: AnyObject?
    var s: AnyObject?
    guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &p) == .success,
      AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &s) == .success
    else { return nil }
    var point = CGPoint.zero
    var size = CGSize.zero
    AXValueGetValue(p as! AXValue, .cgPoint, &point)
    AXValueGetValue(s as! AXValue, .cgSize, &size)
    return CGRect(origin: point, size: size)
  }

  /// The status icons in the menu bar, as the window server lists them
  /// (their windows sit at the status level), top-left based.
  private static func statusItems() -> [CGRect] {
    let list =
      (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]])
      ?? []
    let me = Int(getpid())
    return list.compactMap { info in
      guard (info[kCGWindowLayer as String] as? Int) == Int(CGWindowLevelForKey(.statusWindow)),
        (info[kCGWindowOwnerPID as String] as? Int) != me,
        let dict = info[kCGWindowBounds as String] as? NSDictionary,
        let r = CGRect(dictionaryRepresentation: dict)
      else { return nil }
      return r
    }
  }

  static func topLeftScreens() -> [CGRect] {
    let primary = NSScreen.screens.first?.frame.height ?? 0
    return NSScreen.screens.map {
      CGRect(
        x: $0.frame.minX, y: primary - $0.frame.maxY, width: $0.frame.width,
        height: $0.frame.height)
    }
  }

  /// A rect in AppKit's coordinates as a top-left based one.
  static func topLeft(_ r: CGRect) -> CGRect {
    let primary = NSScreen.screens.first?.frame.height ?? 0
    return CGRect(x: r.minX, y: primary - r.maxY, width: r.width, height: r.height)
  }
}

/// The wing's window: drawn only, never taking a click, so the menu bar
/// strip it lies on keeps working (D70). Kept out of captures like the island.
final class WingPanel: NSPanel {
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
    ignoresMouseEvents = true
  }

  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

final class WingModel: ObservableObject {
  @Published var fit: WingFit = .none
  @Published var image: NSImage?
  @Published var out = false
  @Published var height: CGFloat = 33
}

/// The new-song wing (D113, D114): a black wing left of the notch inside the
/// menu bar strip with the cover art and as much of the title as fits.
struct WingView: View {
  @ObservedObject var model: WingModel

  var body: some View {
    let width = model.fit.width ?? 0
    // The black wing fills the window as the motion sizes it; what it shows
    // keeps its full width from the wing's moving left edge, so it slides out
    // from under the notch and back.
    ZStack(alignment: .leading) {
      UnevenRoundedRectangle(bottomLeadingRadius: 8)
        .fill(Color.black)
      HStack(spacing: WingLayout.artTitleSpacing) {
        art
        if case .artAndTitle(let title, _) = model.fit {
          Text(title)
            .font(.system(size: WingLayout.titleSize))
            .foregroundColor(.white)
            .lineLimit(1)
            .fixedSize()
            .accessibilityIdentifier("wing-title")
        }
      }
      .padding(.leading, WingLayout.leadingPad)
      .padding(
        .trailing,
        model.fit == .artOnly(width: width) ? WingLayout.artTrailingPad : WingLayout.trailingPad
      )
      .frame(width: width, height: model.height, alignment: .trailing)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .clipped()
    .accessibilityElement(children: .contain)
    .accessibilityLabel("New-song wing")
  }

  private var art: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 4).fill(Color.white.opacity(0.15))
      if let image = model.image {
        Image(nsImage: image).resizable().scaledToFill()
      } else {
        Image(systemName: "music.note")
          .font(.system(size: 11))
          .foregroundColor(.white.opacity(0.7))
      }
    }
    .frame(width: WingLayout.art, height: WingLayout.art)
    .clipShape(RoundedRectangle(cornerRadius: 4))
    .accessibilityElement()
    .accessibilityLabel(model.image == nil ? "Music note" : "Cover art")
    .accessibilityIdentifier("wing-art")
  }
}

/// Shows the wing for a new song while the island is closed and nothing is
/// fullscreen, holds it four seconds after the last song started, updates it
/// in place on fast skips, and folds it when the island opens, an app goes
/// fullscreen, or an app switch leaves no room (D115, D44, D28, D125). A wing
/// comes out within the first second of its song or not at all (D134): an app
/// switch lays out a wing already out, and never brings out one that had not.
/// It grows leftward out of the notch's edge with the opening's spring and
/// folds back into it as the island closes, frame by frame, never wider than
/// its free gap (D139).
final class WingController: NSObject {
  private let panel = WingPanel()
  private let model = WingModel()
  private var hold = WingHold()
  private var foldTimer: Timer?
  private let queue = DispatchQueue(label: "notch-island.wing")
  private var current: (title: String, image: NSImage?)?
  /// How far out the wing is, 0 (folded into the notch) to 1 (its full width).
  private var motion = MotionValue(at: 0)
  private var displayLink: CADisplayLink?
  /// The wing's full width and the room its gap leaves (D114).
  private var fullWidth: CGFloat = 0
  private var room: CGFloat = 0
  /// Whether the island is open, and whether an app is fullscreen now.
  var islandOpen: () -> Bool = { false }
  var fullscreen: () -> Bool = { false }
  var home: () -> (notch: CGRect, screen: CGRect)? = { nil }

  override init() {
    super.init()
    let hosting = NSHostingView(rootView: WingView(model: model))
    // The motion sizes the window; the content never pushes it wider.
    hosting.sizingOptions = []
    panel.contentView = hosting
    NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.relayout()
      self?.recheckFullscreen()
    }
    NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.recheckFullscreen() }
  }

  /// A wing already out when its app goes fullscreen folds at once (D125):
  /// macOS reports the space change before the animation into fullscreen ends,
  /// so fullscreen is read again a few times, only while the wing is out.
  private func recheckFullscreen() {
    guard model.out else { return }
    for delay in WingHold.fullscreenRechecks {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
        guard let self,
          WingHold.foldsForFullscreen(wingOut: self.model.out, fullscreen: self.fullscreen())
        else { return }
        self.foldNow()
      }
    }
  }

  private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }

  /// A new song started at `startedAt` (the island's clock).
  func notify(title: String, image: NSImage?, startedAt: TimeInterval) {
    guard !islandOpen(), !fullscreen(), home() != nil else { return }
    current = (title, image)
    hold.songStarted(at: startedAt)
    measureForNotice(title: title, image: image, tries: 6)
  }

  /// Measure the gap and show the wing. A menu bar that cannot be read at
  /// that moment (an app coming to the front) is read again shortly, while
  /// the song's first second lasts (D134).
  private func measureForNotice(title: String, image: NSImage?, tries: Int) {
    measure { [weak self] gap in
      guard let self, self.hold.isOut(at: self.now), self.current?.title == title else { return }
      guard self.model.out || self.hold.mayCome(at: self.now) else { return }
      if gap == nil, tries > 1 {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
          self.measureForNotice(title: title, image: image, tries: tries - 1)
        }
        return
      }
      self.show(title: title, image: image, gap: gap)
    }
  }

  /// The island opened, or an app went fullscreen: fold at once.
  func foldNow() {
    hold.fold()
    fold()
  }

  /// Another app came to the front: lay a wing that is out again in its gap
  /// (folding it when none is left). One that had not come out stays away (D134).
  private func relayout() {
    guard let current, model.out else { return }
    measure { [weak self] gap in
      guard let self, self.model.out else { return }
      self.show(title: current.title, image: current.image, gap: gap)
    }
  }

  /// Read the gap off the main thread; `then` runs on the main thread.
  private func measure(_ then: @escaping (CGFloat?) -> Void) {
    guard let home = home() else { return }
    let notch = MenuBarReader.topLeft(home.notch)
    let screen = MenuBarReader.topLeft(home.screen)
    queue.async {
      let gap = MenuBarReader.freeGap(notch: notch, home: screen)
      DispatchQueue.main.async { then(gap) }
    }
  }

  private func show(title: String, image: NSImage?, gap: CGFloat?) {
    let font = NSFont.systemFont(ofSize: WingLayout.titleSize)
    let fit = WingLayout.fit(title: title, gap: gap ?? 0) {
      ($0 as NSString).size(withAttributes: [.font: font]).width.rounded(.up)
    }
    guard WingHold.pops(fit: fit, islandOpen: islandOpen(), fullscreen: fullscreen()),
      model.out || hold.mayCome(at: now),
      let width = fit.width, let home = home()
    else {
      #if ISLAND_TEST_INPUT
        NSLog("notch-island: no wing for %@ (gap %@)", title, "\(gap ?? -1)")
      #endif
      if model.out { fold() }
      return
    }
    model.height = home.notch.height
    model.fit = fit
    model.image = image
    fullWidth = width.rounded(.up)
    room = max(0, (gap ?? 0) - WingLayout.menuMargin)
    if !model.out {
      model.out = true
      move(out: true)
    } else {
      applyWidth()
    }
    #if ISLAND_TEST_INPUT
      NSLog("notch-island: wing for %@ (gap %@, %@)", title, "\(gap ?? -1)", "\(fit)")
    #endif
    armFold()
  }

  private func armFold() {
    foldTimer?.invalidate()
    guard let foldAt = hold.foldAt else { return }
    let timer = Timer(timeInterval: max(0, foldAt - now), repeats: false) { [weak self] _ in
      guard let self else { return }
      if self.hold.isOut(at: self.now + 0.001) { self.armFold() } else { self.fold() }
    }
    RunLoop.main.add(timer, forMode: .common)
    foldTimer = timer
  }

  private func fold() {
    foldTimer?.invalidate()
    foldTimer = nil
    guard model.out || panel.isVisible else { return }
    model.out = false
    move(out: false)
  }

  /// Spring out of the notch's edge, or fold back into it without a bounce,
  /// from wherever the wing is now.
  private func move(out: Bool) {
    motion.retarget(
      to: out ? 1 : 0, curve: out ? IslandMotion.opening : IslandMotion.closing, at: now)
    // The link follows the home screen, not the wing's window, which is not
    // on screen yet when the wing starts out.
    if displayLink == nil,
      let home = home(),
      let screen = NSScreen.screens.first(where: { $0.frame == home.screen })
    {
      let link = screen.displayLink(target: self, selector: #selector(frame(_:)))
      link.add(to: .main, forMode: .common)
      displayLink = link
    }
    applyWidth()
  }

  @objc private func frame(_ link: CADisplayLink) {
    let resting = motion.settle(at: now)
    applyWidth()
    if resting {
      displayLink?.invalidate()
      displayLink = nil
    }
  }

  /// The wing's window, right edge at the notch's left edge, as wide as the
  /// motion has it now; folded all the way, gone.
  private func applyWidth() {
    guard let home = home() else { return }
    let notch = home.notch
    let w = IslandMotion.wingWidth(full: fullWidth, room: room, progress: motion.sample(at: now).x)
    guard w >= 0.5 else {
      if panel.isVisible { panel.orderOut(nil) }
      if !model.out { model.fit = .none }
      return
    }
    panel.setFrame(
      CGRect(x: notch.minX - w, y: notch.minY, width: w, height: notch.height), display: true)
    if !panel.isVisible { panel.orderFrontRegardless() }
  }
}
