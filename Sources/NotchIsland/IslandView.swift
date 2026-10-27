import AppKit
import IslandCore
import SwiftUI

/// What the island's drawn content shows; the controller keeps it current.
final class IslandModel: ObservableObject {
  /// The open panel's content is shown: the island is open and its opening
  /// has settled (D137).
  @Published var isOpen = false
  @Published var page: IslandPage = .music
  @Published var music = MusicPage(
    content: .nothingPlayedYet, isPlaying: false, controlsEnabled: false)
  @Published var artwork: NSImage?
  /// The source's last report, for the progress bar.
  @Published var report: SourceReport?
  /// The output device, for the source line's speaker part (D119, D120).
  @Published var output: OutputDevice?
  /// Which source's face the card shows; a change turns the card (D48).
  @Published var faceID: String?
  /// Items parked on the shelf (D30, D64, D65).
  @Published var shelfItems: [ShelfItem] = []
  @Published var isDraggingShelfItem: Bool = false
  weak var removeAreaView: NSView?
  var currentDraggedItem: ShelfItem?
  var shelfStore: ShelfStore?

  // P5 Notes writing and editing state (D37, D61, D62, D63)
  @Published var isEnteringNewNote: Bool = false
  @Published var newNoteText: String = ""
  @Published var editingNoteID: UUID? = nil
  @Published var editingNoteText: String = ""
  var onEditingNoteChanged: ((Bool) -> Void)?

  func startEnteringNewNote() {
    isEnteringNewNote = true
    newNoteText = ""
    editingNoteID = nil
    editingNoteText = ""
    onEditingNoteChanged?(true)
  }

  func cancelNewNote() {
    isEnteringNewNote = false
    newNoteText = ""
    onEditingNoteChanged?(false)
  }

  func commitNewNote(_ text: String) {
    let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if !clean.isEmpty {
      let capped = NoteCap.capped(text)
      shelfStore?.addNote(text: capped)
      refreshShelf()
    }
    isEnteringNewNote = false
    newNoteText = ""
    onEditingNoteChanged?(false)
  }

  func startEditingNote(id: UUID, currentText: String) {
    isEnteringNewNote = false
    newNoteText = ""
    editingNoteID = id
    editingNoteText = currentText
    onEditingNoteChanged?(true)
  }

  func cancelEditingNote() {
    editingNoteID = nil
    editingNoteText = ""
    onEditingNoteChanged?(false)
  }

  func commitEditingNote(id: UUID, newText: String) {
    let clean = newText.trimmingCharacters(in: .whitespacesAndNewlines)
    if clean.isEmpty {
      shelfStore?.remove(id: id)
    } else {
      let capped = NoteCap.capped(newText)
      shelfStore?.updateNoteText(id: id, text: capped)
    }
    refreshShelf()
    editingNoteID = nil
    editingNoteText = ""
    onEditingNoteChanged?(false)
  }

  var onBack: () -> Void = {}
  var onPlayPause: () -> Void = {}
  var onSkip: () -> Void = {}
  var onSeek: (TimeInterval) -> Void = { _ in }
  var onBringForward: () -> Void = {}
  var onFlip: () -> Void = {}
  var onRemoveShelfItem: (UUID) -> Void = { _ in }
  var onExpandShelfStack: (UUID) -> Void = { _ in }
  var onShelfDragBegan: ((ShelfItem) -> Void)?
  var onShelfDragEnded: ((ShelfItem, NSDragOperation, NSPoint) -> Void)?

  /// Refreshes shelf items from the store, pruning aged-out or trashed items (D57, D58).
  func refreshShelf() {
    shelfItems = shelfStore?.items() ?? []
  }

  func toggleNoteKind(id: UUID) {
    shelfStore?.toggleNoteKind(id: id)
    refreshShelf()
  }

  func checkOffReminder(id: UUID) {
    shelfStore?.checkOffReminder(id: id)
    refreshShelf()
  }

  /// The clicked position of a seek, held until Music confirms it.
  private var seekHold = SeekHold()

  /// The position to show: Music's, except just after a seek (see SeekHold).
  func position(at time: TimeInterval) -> TimeInterval? {
    guard let report, report.state != .stopped, let real = report.position(at: time) else {
      seekHold.cancel()
      return nil
    }
    return seekHold.shown(real: real, at: time)
  }

  /// The bar was let go at `target`: seek, and keep showing it meanwhile.
  func seek(to target: TimeInterval) {
    let now = ProcessInfo.processInfo.systemUptime
    seekHold.begin(target: target, at: now, playing: report?.state == .playing)
    onSeek(target)
  }

  /// A report from the source; a different song ends a seek's hold.
  func take(report new: SourceReport?) {
    if new?.song != report?.song { seekHold.cancel() }
    report = new
  }
}

/// A hosting view that takes the first click: the island's panel never
/// becomes key (it must not take focus from the frontmost app), so without
/// this the first click on a button would only be swallowed.
final class FirstClickHostingView<Content: View>: NSHostingView<Content> {
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// The plain notch: the island's only part inside the menu bar strip,
/// exactly the camera housing with rounded bottom corners, the same whether
/// the card below is open or not (D140).
struct NotchView: View {
  var body: some View {
    let radius = NotchGeometry.closedBottomRadius
    UnevenRoundedRectangle(bottomLeadingRadius: radius, bottomTrailingRadius: radius)
      .fill(Color.black)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// The card below the menu bar strip, apart from the notch (D140), its size
/// driven frame by frame by the controller. Its content is laid out at the
/// open size and fades in once the opening has settled (D137).
struct CardView: View {
  @ObservedObject var model: IslandModel
  /// The open card, as the open panel below the strip was before.
  static let openSize = CGSize(width: 460, height: 167)
  /// Room above the pages, inside the card.
  static let topInset: CGFloat = 10

  var body: some View {
    GeometryReader { proxy in
      ZStack(alignment: .top) {
        CardShape().fill(Color.black)
        if model.isOpen {
          OpenPanel(model: model)
            .frame(width: Self.openSize.width, height: Self.openSize.height - Self.topInset)
            .padding(.top, Self.topInset)
            .transition(.opacity.animation(.easeOut(duration: 0.15)))
        }
      }
      .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
      .clipShape(CardShape())
    }
  }
}

/// The card's outline, from IslandCore so drawing and the pointer agree.
struct CardShape: Shape {
  func path(in rect: CGRect) -> Path {
    Path(IslandShape.cardPath(size: rect.size)).offsetBy(dx: rect.minX, dy: rect.minY)
  }
}

/// The open island: the music page and the shelf page, one size, scrolled
/// between, with a small bar showing which page is up (D29, D30).
private struct OpenPanel: View {
  @ObservedObject var model: IslandModel

  /// The shared content size of the music and shelf pages inside the panel (D30).
  static let pageSize = CGSize(width: 394.5, height: 116)
  /// The height of the music page's controls row, mirrored by the shelf geometry anchor.
  static let controlsHeight: CGFloat = 34

  var body: some View {
    GeometryReader { proxy in
      let height = proxy.size.height
      let width = proxy.size.width
      ZStack(alignment: .trailing) {
        ZStack {
          MusicPageView(model: model)
            .frame(width: width, height: height)
            .offset(y: model.page == .music ? 0 : -height)
            .allowsHitTesting(model.page == .music)
          ShelfPageView(model: model)
            .frame(width: width, height: height)
            .offset(y: model.page == .shelf ? 0 : height)
            .allowsHitTesting(model.page == .shelf)
        }
        .animation(.easeOut(duration: 0.3), value: model.page)
        PageBar(page: model.page)
          .padding(.trailing, 8)
      }
      .frame(width: width, height: height, alignment: .top)
      .clipped()
    }
  }
}

private struct PageBar: View {
  var page: IslandPage

  var body: some View {
    VStack(spacing: 4) {
      Capsule().fill(Color.white.opacity(page == .music ? 0.9 : 0.3)).frame(width: 3, height: 12)
      Capsule().fill(Color.white.opacity(page == .shelf ? 0.9 : 0.3)).frame(width: 3, height: 12)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(page == .shelf ? "Shelf page showing" : "Music page showing")
    .accessibilityIdentifier("page-bar")
  }
}

/// An invisible anchor defining the shared accessible boundary of panel pages (D30).
private struct PageGeometryAnchor: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 8) {
        Rectangle()
          .fill(Color.white.opacity(0.001))
          .frame(width: 48, height: 48)
          .accessibilityElement()
          .accessibilityLabel("Page anchor top")
      }
      HStack(spacing: 8) {
        Rectangle()
          .fill(Color.white.opacity(0.001))
          .frame(width: 44, height: 14)
          .accessibilityElement()
          .accessibilityLabel("Page anchor mid-left")
        Spacer()
        Rectangle()
          .fill(Color.white.opacity(0.001))
          .frame(width: 44, height: 14)
          .accessibilityElement()
          .accessibilityLabel("Page anchor mid-right")
      }
      HStack(spacing: 36) {
        Rectangle()
          .fill(Color.white.opacity(0.001))
          .frame(width: 32, height: OpenPanel.controlsHeight)
          .accessibilityElement()
          .accessibilityLabel("Page anchor bottom")
      }
    }
    .frame(width: OpenPanel.pageSize.width, height: OpenPanel.pageSize.height)
    .opacity(0.001)
    .allowsHitTesting(false)
  }
}

private struct MusicPageView: View {
  @ObservedObject var model: IslandModel

  var body: some View {
    ZStack(alignment: .topLeading) {
      PageGeometryAnchor()
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .top, spacing: 8) {
          FlipCard(faceID: model.faceID) {
            SongCard(model: model)
          }
          if let flip = model.music.flip {
            FlipControl(count: flip.label, action: model.onFlip)
          }
        }
        if model.music.song != nil {
          ProgressBar(model: model)
        } else {
          Spacer().frame(height: 14)
        }
        Controls(model: model)
      }
      .frame(
        width: OpenPanel.pageSize.width,
        height: OpenPanel.pageSize.height,
        alignment: .topLeading
      )
    }
    .frame(width: OpenPanel.pageSize.width, height: OpenPanel.pageSize.height)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Music page")
    .padding(.horizontal, 22)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// The card's face: art, title, artist and the source line.
private struct SongCard: View {
  @ObservedObject var model: IslandModel
  /// A long title, such as a downloaded file's name, is cut short in the
  /// middle with an ellipsis (D24).
  static let titleWidth: CGFloat = 176

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      ArtworkView(image: model.music.song == nil ? nil : model.artwork)
        .onTapGesture { model.onBringForward() }
      VStack(alignment: .leading, spacing: 3) {
        switch model.music.content {
        case .nothingPlayedYet:
          Text("Nothing played yet")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(.white.opacity(0.7))
        case .current(let song), .lastSong(let song):
          Text(song.title)
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(.white)
            .lineLimit(1)
            .truncationMode(.middle)
            .frame(maxWidth: Self.titleWidth, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("song-title")
          if let artist = song.artist {
            Text(artist)
              .font(.system(size: 12))
              .foregroundColor(.white.opacity(0.7))
              .lineLimit(1)
          }
          Text(sourceLine(for: song, output: model.output))
            .font(.system(size: 11))
            .foregroundColor(.white.opacity(0.5))
            .lineLimit(1)
            .accessibilityIdentifier("source-line")
            .onTapGesture { model.onBringForward() }
        }
      }
      Spacer(minLength: 0)
    }
  }
}

/// Turns the card like a mirror, about its upright axis, whenever the face
/// changes (D48): the old face turns away and the new one turns in.
private struct FlipCard<Content: View>: View {
  var faceID: String?
  @ViewBuilder var content: () -> Content

  var body: some View {
    ZStack {
      content()
        .id(faceID ?? "")
        .transition(
          .asymmetric(
            insertion: .modifier(
              active: MirrorTurn(degrees: -90), identity: MirrorTurn(degrees: 0)),
            removal: .modifier(active: MirrorTurn(degrees: 90), identity: MirrorTurn(degrees: 0))
          ))
    }
    .animation(.easeInOut(duration: 0.4), value: faceID)
  }
}

private struct MirrorTurn: ViewModifier {
  var degrees: Double
  func body(content: Content) -> some View {
    content
      .rotation3DEffect(.degrees(degrees), axis: (x: 0, y: 1, z: 0), perspective: 0.4)
      .opacity(abs(degrees) >= 89 ? 0 : 1)
  }
}

/// The small flip control and its count (D48, D121).
private struct FlipControl: View {
  var count: String
  var action: () -> Void

  var body: some View {
    VStack(spacing: 2) {
      Button(action: action) {
        Image(systemName: "arrow.left.arrow.right")
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(.white.opacity(0.8))
          .frame(width: 26, height: 20)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Flip")
      Text(count)
        .font(.system(size: 9).monospacedDigit())
        .foregroundColor(.white.opacity(0.55))
        .fixedSize()
        .accessibilityIdentifier("flip-count")
    }
    .padding(.trailing, 10)
  }
}

private struct ArtworkView: View {
  var image: NSImage?

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.12))
      if let image {
        Image(nsImage: image).resizable().scaledToFill()
      } else {
        Image(systemName: "music.note")
          .font(.system(size: 22))
          .foregroundColor(.white.opacity(0.6))
      }
    }
    .frame(width: 56, height: 56)
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .accessibilityElement()
    .accessibilityLabel(image == nil ? "Music note" : "Cover art")
  }
}

/// The progress bar: elapsed, the bar with its dot, the length. Dragging the
/// dot or clicking the bar seeks (D25); once let go, the dot holds the chosen
/// spot until the app reports playback there, for about a second at most, and
/// then shows where the app really is (D130, amending D124).
private struct ProgressBar: View {
  @ObservedObject var model: IslandModel
  @State private var scrubFraction: Double?

  var body: some View {
    TimelineView(.periodic(from: .now, by: 0.25)) { _ in
      let now = ProcessInfo.processInfo.systemUptime
      let duration = model.music.song?.duration ?? 0
      let real = model.position(at: now) ?? 0
      let fraction =
        scrubFraction ?? (duration > 0 ? min(max(real / duration, 0), 1) : 0)
      let shown = scrubFraction.map { $0 * duration } ?? real
      HStack(spacing: 8) {
        Text(model.music.song == nil ? "" : formatPlaybackTime(shown))
          .font(.system(size: 10).monospacedDigit())
          .foregroundColor(.white.opacity(0.6))
          .frame(width: 44, alignment: .trailing)
        GeometryReader { proxy in
          let width = proxy.size.width
          ZStack(alignment: .leading) {
            Capsule().fill(Color.white.opacity(0.2)).frame(height: 4)
              .accessibilityElement()
              .accessibilityLabel("Progress bar")
            Capsule().fill(Color.white.opacity(0.8)).frame(width: width * fraction, height: 4)
              .accessibilityHidden(true)
            Circle().fill(Color.white).frame(width: 10, height: 10)
              .offset(x: width * fraction - 5)
              .accessibilityElement()
              .accessibilityLabel("Progress dot")
          }
          .frame(height: proxy.size.height)
          .contentShape(Rectangle())
          .gesture(
            DragGesture(minimumDistance: 0)
              .onChanged { value in
                guard duration > 0, model.music.controlsEnabled else { return }
                scrubFraction = min(max(value.location.x / width, 0), 1)
              }
              .onEnded { value in
                guard duration > 0, model.music.controlsEnabled else { return }
                let target = min(max(value.location.x / width, 0), 1) * duration
                scrubFraction = nil
                model.seek(to: target)
              }
          )
        }
        .frame(height: 14)
        Text(model.music.song?.duration.map(formatPlaybackTime) ?? "")
          .font(.system(size: 10).monospacedDigit())
          .foregroundColor(.white.opacity(0.6))
          .frame(width: 44, alignment: .leading)
      }
    }
  }
}

private struct Controls: View {
  @ObservedObject var model: IslandModel

  var body: some View {
    HStack(spacing: 36) {
      button("backward.fill", "Back", enabled: model.music.controlsEnabled, model.onBack)
      button(
        model.music.isPlaying ? "pause.fill" : "play.fill",
        model.music.isPlaying ? "Pause" : "Play", enabled: model.music.playEnabled,
        model.onPlayPause)
      button("forward.fill", "Skip", enabled: model.music.controlsEnabled, model.onSkip)
    }
    .frame(maxWidth: .infinity)
  }

  private func button(
    _ symbol: String, _ label: String, enabled: Bool, _ action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 18))
        .foregroundColor(.white.opacity(enabled ? 1 : 0.3))
        .frame(width: 34, height: 26)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .accessibilityLabel(label)
  }
}

/// The custom field editor used for note entry and editing on the island panel.
/// Supports standard key equivalents (Cmd+A, Cmd+C, Cmd+V, Cmd+X, Cmd+Z) in an LSUIElement app,
/// enforces the 140-character cap on pasting and typing (D62, D104, D123),
/// and routes Return to commit and Escape to cancel.
final class CustomNoteTextView: NSTextView {
  weak var activeField: CustomNoteNSTextField?
  var onCommit: ((String) -> Void)?
  var onCancel: (() -> Void)?

  override func keyDown(with event: NSEvent) {
    let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
    if flags.contains(.command) {
      if performKeyEquivalent(with: event) {
        return
      }
    }
    if event.keyCode == 36 {
      insertNewline(nil)
      return
    }
    if event.keyCode == 53 {
      cancelOperation(nil)
      return
    }
    super.keyDown(with: event)
  }

  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
    if flags.contains(.command) {
      switch event.keyCode {
      case 0:
        self.selectAll(nil)
        return true
      case 9:
        self.paste(nil)
        return true
      case 8:
        self.copy(nil)
        return true
      case 7:
        self.cut(nil)
        return true
      case 6:
        if flags.contains(.shift) {
          self.undoManager?.redo()
        } else {
          self.undoManager?.undo()
        }
        return true
      default:
        break
      }
    }
    return super.performKeyEquivalent(with: event)
  }

  override func paste(_ sender: Any?) {
    guard let pasteString = NSPasteboard.general.string(forType: .string) else { return }
    let sel = selectedRange()
    guard let r = Range(sel, in: self.string) else { return }
    let allowed = NoteCap.allowedInsertion(
      current: self.string, inserting: pasteString, replacing: r)
    if !allowed.isEmpty {
      self.insertText(allowed, replacementRange: sel)
    }
  }

  override func shouldChangeText(
    in affectedCharRange: NSRange, replacementString: String?
  ) -> Bool {
    guard let replacement = replacementString else { return true }
    guard let range = Range(affectedCharRange, in: self.string) else { return true }
    let allowed = NoteCap.allowedInsertion(
      current: self.string, inserting: replacement, replacing: range)
    if replacement.count > allowed.count {
      return false
    }
    return super.shouldChangeText(in: affectedCharRange, replacementString: replacementString)
  }

  override func insertNewline(_ sender: Any?) {
    let text = self.string
    if let commit = activeField?.onCommit ?? onCommit {
      commit(text)
    } else if let coord = self.delegate as? NoteTextFieldRepresentable.Coordinator {
      coord.parent.onCommit(text)
    }
  }

  override func cancelOperation(_ sender: Any?) {
    if let cancel = activeField?.onCancel ?? onCancel {
      cancel()
    } else if let coord = self.delegate as? NoteTextFieldRepresentable.Coordinator {
      coord.parent.onCancel()
    }
  }

  override func doCommand(by selector: Selector) {
    if selector == #selector(NSResponder.insertNewline(_:)) {
      insertNewline(nil)
      return
    } else if selector == #selector(NSResponder.cancelOperation(_:)) {
      cancelOperation(nil)
      return
    }
    super.doCommand(by: selector)
  }
}

final class CustomNoteNSTextField: NSTextField {
  var onCommit: ((String) -> Void)?
  var onCancel: (() -> Void)?

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    guard let window = self.window else { return }
    DispatchQueue.main.async { [weak self, weak window] in
      guard let self = self, let window = window else { return }
      window.makeFirstResponder(self)
      self.selectText(nil)
      if let editor = self.currentEditor() as? CustomNoteTextView {
        editor.activeField = self
        editor.onCommit = self.onCommit
        editor.onCancel = self.onCancel
        let len = (self.stringValue as NSString).length
        editor.setSelectedRange(NSRange(location: len, length: 0))
      }
    }
  }

  override func becomeFirstResponder() -> Bool {
    let ok = super.becomeFirstResponder()
    if ok {
      self.selectText(nil)
      if let editor = currentEditor() as? CustomNoteTextView {
        editor.activeField = self
        editor.onCommit = self.onCommit
        editor.onCancel = self.onCancel
        let len = (stringValue as NSString).length
        editor.setSelectedRange(NSRange(location: len, length: 0))
      }
    }
    return ok
  }
}

/// An AppKit NSTextField representable that enforces the 140-character cap (D62, D104, D123)
/// on typing and pasting, never truncates text that was already kept, and handles Return/Escape.
struct NoteTextFieldRepresentable: NSViewRepresentable {
  @Binding var text: String
  var accessibilityIdentifier: String
  var accessibilityLabel: String
  var onCommit: (String) -> Void
  var onCancel: () -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(self)
  }

  func makeNSView(context: Context) -> NSTextField {
    let field = CustomNoteNSTextField()
    field.isBordered = false
    field.drawsBackground = false
    field.textColor = .white
    field.font = .systemFont(ofSize: 11)
    field.focusRingType = .none
    field.delegate = context.coordinator
    field.stringValue = text
    field.onCommit = onCommit
    field.onCancel = onCancel
    field.setAccessibilityElement(true)
    field.setAccessibilityRole(.textField)
    field.setAccessibilityIdentifier(accessibilityIdentifier)
    field.setAccessibilityLabel(accessibilityLabel)
    context.coordinator.textField = field

    DispatchQueue.main.async {
      if let window = field.window {
        window.makeFirstResponder(field)
        field.selectText(nil)
        if let editor = field.currentEditor() as? CustomNoteTextView {
          editor.onCommit = onCommit
          editor.onCancel = onCancel
          let len = (field.stringValue as NSString).length
          editor.setSelectedRange(NSRange(location: len, length: 0))
        }
      }
    }
    return field
  }

  func updateNSView(_ nsView: NSTextField, context: Context) {
    if let custom = nsView as? CustomNoteNSTextField {
      custom.onCommit = onCommit
      custom.onCancel = onCancel
    }
    if nsView.stringValue != text && !context.coordinator.isEditing {
      nsView.stringValue = text
    }
    nsView.setAccessibilityIdentifier(accessibilityIdentifier)
    nsView.setAccessibilityLabel(accessibilityLabel)
  }

  final class Coordinator: NSObject, NSTextFieldDelegate, NSTextViewDelegate {
    var parent: NoteTextFieldRepresentable
    weak var textField: NSTextField?
    var isEditing = false

    init(_ parent: NoteTextFieldRepresentable) {
      self.parent = parent
    }

    func controlTextDidBeginEditing(_ obj: Notification) {
      isEditing = true
      if let field = obj.object as? NSTextField, let editor = field.currentEditor() as? NSTextView {
        editor.delegate = self
      }
    }

    func controlTextDidChange(_ obj: Notification) {
      guard let field = obj.object as? NSTextField else { return }
      parent.text = field.stringValue
    }

    func controlTextDidEndEditing(_ obj: Notification) {
      isEditing = false
    }

    func control(
      _ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector
    ) -> Bool {
      if commandSelector == #selector(NSResponder.insertNewline(_:)) {
        parent.onCommit(textView.string)
        return true
      } else if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
        parent.onCancel()
        return true
      }
      return false
    }

    func textView(_ textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
      if commandSelector == #selector(NSResponder.insertNewline(_:)) {
        parent.onCommit(textView.string)
        return true
      } else if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
        parent.onCancel()
        return true
      }
      return false
    }

    func textDidChange(_ notification: Notification) {
      if let textView = notification.object as? NSTextView {
        parent.text = textView.string
        textField?.stringValue = textView.string
      }
    }

    func textView(
      _ textView: NSTextView,
      shouldChangeTextIn affectedCharRange: NSRange,
      replacementString: String?
    ) -> Bool {
      guard let replacement = replacementString else { return true }
      let current = textView.string
      guard let range = Range(affectedCharRange, in: current) else { return true }
      let allowed = NoteCap.allowedInsertion(
        current: current, inserting: replacement, replacing: range)
      return replacement.count <= allowed.count
    }
  }
}

/// The shelf page (D30, D64, D65). Displays parked captures, stacks, files,
/// links and notes.
private struct ShelfPageView: View {
  @ObservedObject var model: IslandModel

  var body: some View {
    ZStack(alignment: .topLeading) {
      PageGeometryAnchor()

      // Actual shelf UI
      VStack(spacing: 2) {
        // Shelf header with title and "+ note" button
        HStack {
          Text("Shelf")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.white.opacity(0.4))
            .accessibilityIdentifier("shelf-header-title")

          Spacer()

          if !model.isEnteringNewNote {
            Button(action: {
              model.startEnteringNewNote()
            }) {
              HStack(spacing: 3) {
                Text("+ note")
                  .font(.system(size: 11, weight: .medium))
              }
              .foregroundColor(.white.opacity(0.85))
              .padding(.horizontal, 8)
              .padding(.vertical, 2)
              .background(Capsule().fill(Color.white.opacity(0.15)))
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("+ note")
            .accessibilityIdentifier("add-note")
          }
        }
        .padding(.horizontal, 16)

        // When entering a new note, show the one-line entry
        if model.isEnteringNewNote {
          HStack(spacing: 6) {
            Text("✎")
              .font(.system(size: 12))
              .foregroundColor(.white.opacity(0.7))
            NoteTextFieldRepresentable(
              text: $model.newNoteText,
              accessibilityIdentifier: "new-note-field",
              accessibilityLabel: "New note text",
              onCommit: { text in
                model.commitNewNote(text)
              },
              onCancel: {
                model.cancelNewNote()
              }
            )
            .frame(height: 20)
          }
          .padding(.horizontal, 8)
          .padding(.vertical, 3)
          .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.12)))
          .padding(.horizontal, 16)
        }

        if model.shelfItems.isEmpty && !model.isEnteringNewNote {
          Spacer()
          Text("Shelf")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.3))
          Spacer()
        } else if !model.shelfItems.isEmpty {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
              ForEach(model.shelfItems) { item in
                if model.editingNoteID == item.id {
                  ShelfItemView(
                    item: item,
                    model: model,
                    onRemove: {
                      model.onRemoveShelfItem(item.id)
                    },
                    onExpand: {
                      model.onExpandShelfStack(item.id)
                    }
                  )
                } else {
                  DraggableItemContainer(item: item, model: model) {
                    ShelfItemView(
                      item: item,
                      model: model,
                      onRemove: {
                        model.onRemoveShelfItem(item.id)
                      },
                      onExpand: {
                        model.onExpandShelfStack(item.id)
                      }
                    )
                  }
                }
              }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 1)
          }

          Spacer()

          if model.isDraggingShelfItem {
            RemoveAreaDropHost(model: model)
              .frame(height: 36)
              .padding(.horizontal, 16)
              .transition(.opacity)
          }
        }
      }
      .frame(
        width: OpenPanel.pageSize.width,
        height: OpenPanel.pageSize.height,
        alignment: .topLeading
      )
      .clipped()
    }
    .frame(width: OpenPanel.pageSize.width, height: OpenPanel.pageSize.height)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Shelf page")
    .padding(.horizontal, 22)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct ShelfItemView: View {
  let item: ShelfItem
  @ObservedObject var model: IslandModel
  let onRemove: () -> Void
  let onExpand: () -> Void

  @State private var isHovered = false

  var body: some View {
    switch item.kind {
    case .note:
      noteView
    default:
      standardItemView
    }
  }

  private var isEditingThisNote: Bool {
    model.editingNoteID == item.id
  }

  @ViewBuilder
  private var noteView: some View {
    let isReminder: Bool = {
      if case .note(_, let r) = item.kind { return r }
      return false
    }()

    HStack(alignment: .top, spacing: 2) {
      VStack(alignment: .leading, spacing: 4) {
        if isEditingThisNote {
          HStack(spacing: 4) {
            if isReminder {
              Image(systemName: "square")
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.8))
            } else {
              Text("✎")
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.7))
            }
            NoteTextFieldRepresentable(
              text: $model.editingNoteText,
              accessibilityIdentifier: "edit-note-field",
              accessibilityLabel: "Edit note text",
              onCommit: { newText in
                model.commitEditingNote(id: item.id, newText: newText)
              },
              onCancel: {
                model.cancelEditingNote()
              }
            )
            .frame(height: 20)
          }
          .frame(minWidth: 90, maxWidth: 200)
        } else {
          HStack(alignment: .top, spacing: 4) {
            if isReminder {
              // Reminder box (check-off, D40)
              Button(action: {
                model.checkOffReminder(id: item.id)
              }) {
                Image(systemName: "square")
                  .font(.system(size: 10))
                  .foregroundColor(.white.opacity(0.85))
                  .frame(width: 12, height: 12)
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("reminder-box")
              .accessibilityLabel("box")

              // Pencil beside reminder (toggle back to plain note, D39)
              Button(action: {
                model.toggleNoteKind(id: item.id)
              }) {
                Text("✎")
                  .font(.system(size: 10))
                  .foregroundColor(.white.opacity(0.7))
                  .frame(width: 12, height: 12)
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("reminder-pencil")
              .accessibilityLabel("pencil")
            } else {
              // Small box beside plain note (toggle to reminder, D39)
              Button(action: {
                model.toggleNoteKind(id: item.id)
              }) {
                Image(systemName: "square")
                  .font(.system(size: 10))
                  .foregroundColor(.white.opacity(0.6))
                  .frame(width: 12, height: 12)
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("note-toggle-box")
              .accessibilityLabel("small box")
            }

            Text(item.title)
              .font(.system(size: 10, weight: .regular))
              .foregroundColor(.white)
              .multilineTextAlignment(.leading)
              .lineLimit(2)
              .frame(maxWidth: 200, alignment: .topLeading)
              .contentShape(Rectangle())
              .onTapGesture {
                model.startEditingNote(id: item.id, currentText: item.noteText ?? item.title)
              }
              .accessibilityIdentifier("shelf-item-title")
          }
        }
      }
      .padding(4)
      .background(
        RoundedRectangle(cornerRadius: 8)
          .fill(Color.white.opacity(0.12))
      )
      .contentShape(Rectangle())
      .onTapGesture {
        if !isEditingThisNote {
          model.startEditingNote(id: item.id, currentText: item.noteText ?? item.title)
        }
      }

      // Dedicated remove gutter: separate from the note card (M3)
      Button(action: onRemove) {
        Image(systemName: "xmark.circle.fill")
          .font(.system(size: 14))
          .foregroundColor(.white.opacity(isHovered ? 0.9 : 0.01))
          .background(Circle().fill(Color.black.opacity(isHovered ? 0.6 : 0.01)))
      }
      .buttonStyle(.plain)
      .frame(width: 18, height: 18)
      .contentShape(Rectangle())
      .accessibilityLabel("Remove \(item.title)")
      .accessibilityIdentifier("remove-\(item.title)")
    }
    .onHover { isHovered = $0 }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(item.title)
    .accessibilityIdentifier("shelf-item")
  }

  private var standardItemView: some View {
    VStack(spacing: 2) {
      ZStack(alignment: .topTrailing) {
        itemIcon
          .frame(width: 40, height: 40)
          .background(Color.white.opacity(0.1))
          .clipShape(RoundedRectangle(cornerRadius: 8))

        Button(action: onRemove) {
          Image(systemName: "xmark.circle.fill")
            .font(.system(size: 14))
            .foregroundColor(.white.opacity(isHovered ? 0.9 : 0.01))
            .background(Circle().fill(Color.black.opacity(isHovered ? 0.6 : 0.01)))
        }
        .buttonStyle(.plain)
        .frame(width: 20, height: 20)
        .contentShape(Rectangle())
        .accessibilityLabel("Remove \(item.title)")
        .accessibilityIdentifier("remove-\(item.title)")
      }

      Text(item.title)
        .font(.system(size: 10, weight: .regular))
        .foregroundColor(.white)
        .lineLimit(2)
        .multilineTextAlignment(.center)
        .frame(width: 58)
        .accessibilityIdentifier("shelf-item-title")

      if item.isStack {
        Button(action: onExpand) {
          Text("Expand")
            .font(.system(size: 9, weight: .semibold))
            .foregroundColor(.white.opacity(0.8))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(Color.white.opacity(0.2)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Expand \(item.title)")
        .accessibilityIdentifier("expand-\(item.title)")
      }
    }
    .frame(width: 60)
    .padding(.vertical, 4)
    .onHover { hovering in
      isHovered = hovering
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(item.title)
    .accessibilityIdentifier("shelf-item")
  }

  @ViewBuilder
  private var itemIcon: some View {
    switch item.kind {
    case .capture(let cap):
      if cap.type == .screenRecording {
        Image(systemName: "video.fill")
          .font(.system(size: 22))
          .foregroundColor(.white.opacity(0.8))
      } else {
        Image(systemName: "photo.fill")
          .font(.system(size: 22))
          .foregroundColor(.white.opacity(0.8))
      }
    case .captureStack:
      Image(systemName: "square.stack.3d.up.fill")
        .font(.system(size: 22))
        .foregroundColor(.white.opacity(0.8))
    case .fileStack:
      Image(systemName: "doc.on.doc.fill")
        .font(.system(size: 22))
        .foregroundColor(.white.opacity(0.8))
    case .folder:
      Image(systemName: "folder.fill")
        .font(.system(size: 24))
        .foregroundColor(.blue.opacity(0.8))
    case .file:
      Image(systemName: "doc.fill")
        .font(.system(size: 22))
        .foregroundColor(.white.opacity(0.8))
    case .link:
      Image(systemName: "link")
        .font(.system(size: 20))
        .foregroundColor(.blue.opacity(0.8))
    case .note(_, let isReminder):
      Image(systemName: isReminder ? "bell.fill" : "note.text")
        .font(.system(size: 20))
        .foregroundColor(.yellow.opacity(0.8))
    }
  }
}

private struct RemoveAreaDropHost: NSViewRepresentable {
  let model: IslandModel

  func makeNSView(context: Context) -> RemoveAreaNSView {
    RemoveAreaNSView(model: model)
  }

  func updateNSView(_ nsView: RemoveAreaNSView, context: Context) {
    nsView.model = model
    if nsView.window != nil {
      model.removeAreaView = nsView
    }
  }
}

private final class RemoveAreaNSView: NSView {
  weak var model: IslandModel?

  init(model: IslandModel) {
    self.model = model
    super.init(frame: .zero)
    registerForDraggedTypes([.fileURL, .URL, .string])
    setAccessibilityElement(true)
    setAccessibilityRole(.group)
    setAccessibilityLabel("Remove area")
    setAccessibilityIdentifier("remove-area")
  }

  required init?(coder: NSCoder) { fatalError() }

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    if window != nil {
      model?.removeAreaView = self
    } else if model?.removeAreaView === self {
      model?.removeAreaView = nil
    }
  }

  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    .delete
  }

  override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
    .delete
  }

  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    guard let model = model, let item = model.currentDraggedItem else { return false }
    model.onRemoveShelfItem(item.id)
    return true
  }

  override func draw(_ dirtyRect: NSRect) {
    super.draw(dirtyRect)
    let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 2, dy: 2), xRadius: 6, yRadius: 6)
    NSColor.systemRed.withAlphaComponent(0.2).setFill()
    path.fill()
    NSColor.systemRed.withAlphaComponent(0.6).setStroke()
    path.lineWidth = 1
    path.stroke()

    let str = "Remove from shelf" as NSString
    let attrs: [NSAttributedString.Key: Any] = [
      .font: NSFont.systemFont(ofSize: 11, weight: .medium),
      .foregroundColor: NSColor.white.withAlphaComponent(0.8),
    ]
    let size = str.size(withAttributes: attrs)
    let p = NSPoint(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2)
    str.draw(at: p, withAttributes: attrs)
  }
}

private struct DraggableItemContainer<Content: View>: NSViewRepresentable {
  let item: ShelfItem
  let model: IslandModel
  let content: () -> Content

  func makeNSView(context: Context) -> DraggableContainerView<Content> {
    DraggableContainerView(item: item, model: model, rootView: content())
  }

  func updateNSView(_ nsView: DraggableContainerView<Content>, context: Context) {
    nsView.item = item
    nsView.model = model
    nsView.hosting.rootView = content()
  }
}

private final class DraggableContainerView<Content: View>: NSView, NSDraggingSource {
  var item: ShelfItem
  weak var model: IslandModel?
  let hosting: FirstClickHostingView<Content>
  private var dragStartLocation: NSPoint?

  init(item: ShelfItem, model: IslandModel, rootView: Content) {
    self.item = item
    self.model = model
    self.hosting = FirstClickHostingView(rootView: rootView)
    super.init(frame: .zero)
    self.hosting.translatesAutoresizingMaskIntoConstraints = false
    addSubview(hosting)
    NSLayoutConstraint.activate([
      hosting.leadingAnchor.constraint(equalTo: leadingAnchor),
      hosting.trailingAnchor.constraint(equalTo: trailingAnchor),
      hosting.topAnchor.constraint(equalTo: topAnchor),
      hosting.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  required init?(coder: NSCoder) { fatalError() }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
    true
  }

  override func hitTest(_ point: NSPoint) -> NSView? {
    guard let view = super.hitTest(point) else { return nil }
    if model?.editingNoteID == item.id {
      return view
    }
    if point.x >= bounds.width - 22 {
      return view
    }
    if item.isStack && point.y <= 26 {
      return view
    }
    if case .note = item.kind {
      if point.x <= 40 {
        return view
      }
    }
    return self
  }

  override func mouseDown(with event: NSEvent) {
    dragStartLocation = event.locationInWindow
  }

  override func mouseUp(with event: NSEvent) {
    if dragStartLocation != nil {
      dragStartLocation = nil
      switch item.kind {
      case .note:
        model?.startEditingNote(id: item.id, currentText: item.noteText ?? item.title)
      case _ where item.isStack:
        model?.onExpandShelfStack(item.id)
      default:
        break
      }
    }
  }

  override func mouseDragged(with event: NSEvent) {
    if let start = dragStartLocation {
      let dx = event.locationInWindow.x - start.x
      let dy = event.locationInWindow.y - start.y
      if (dx * dx + dy * dy) > 9 {
        dragStartLocation = nil
        startDragging(with: event)
        return
      }
    }
  }

  private func startDragging(with event: NSEvent) {
    var draggingItems: [NSDraggingItem] = []
    switch item.kind {
    case .file, .folder, .capture, .fileStack, .captureStack:
      for url in item.urls {
        let dragItem = NSDraggingItem(pasteboardWriter: url as NSURL)
        let img = snapshot()
        dragItem.setDraggingFrame(self.bounds, contents: img)
        draggingItems.append(dragItem)
      }
    case .link(let url, _):
      let dragItem = NSDraggingItem(pasteboardWriter: url as NSURL)
      let img = snapshot()
      dragItem.setDraggingFrame(self.bounds, contents: img)
      draggingItems.append(dragItem)
    case .note(let text, _):
      let dragText = (item.noteText ?? text) as NSString
      let dragItem = NSDraggingItem(pasteboardWriter: dragText)
      let img = snapshot()
      dragItem.setDraggingFrame(self.bounds, contents: img)
      draggingItems.append(dragItem)
    }

    guard !draggingItems.isEmpty else { return }

    model?.currentDraggedItem = item
    model?.isDraggingShelfItem = true
    model?.onShelfDragBegan?(item)

    let session = beginDraggingSession(with: draggingItems, event: event, source: self)
    _ = session
  }

  func draggingSession(
    _ session: NSDraggingSession, sourceOperationMaskFor context: NSDraggingContext
  ) -> NSDragOperation {
    [.copy, .move, .generic, .delete]
  }

  func draggingSession(
    _ session: NSDraggingSession, endedAt screenPoint: NSPoint, operation: NSDragOperation
  ) {
    model?.isDraggingShelfItem = false
    model?.removeAreaView = nil
    model?.onShelfDragEnded?(item, operation, screenPoint)
    model?.currentDraggedItem = nil
  }

  private func snapshot() -> NSImage {
    guard bounds.width > 0, bounds.height > 0 else { return NSImage() }
    let pdf = dataWithPDF(inside: bounds)
    return NSImage(data: pdf) ?? NSImage()
  }
}
