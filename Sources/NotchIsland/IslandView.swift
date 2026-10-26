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
  var shelfStore: ShelfStore?

  var onBack: () -> Void = {}
  var onPlayPause: () -> Void = {}
  var onSkip: () -> Void = {}
  var onSeek: (TimeInterval) -> Void = { _ in }
  var onBringForward: () -> Void = {}
  var onFlip: () -> Void = {}
  var onRemoveShelfItem: (UUID) -> Void = { _ in }
  var onExpandShelfStack: (UUID) -> Void = { _ in }

  /// Refreshes shelf items from the store, pruning aged-out or trashed items (D57, D58).
  func refreshShelf() {
    shelfItems = shelfStore?.items() ?? []
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

  var body: some View {
    GeometryReader { proxy in
      let height = proxy.size.height
      ZStack(alignment: .trailing) {
        VStack(spacing: 0) {
          MusicPageView(model: model)
            .frame(width: proxy.size.width, height: height)
          ShelfPageView(model: model)
            .frame(width: proxy.size.width, height: height)
        }
        .offset(y: model.page == .music ? 0 : -height)
        .animation(.easeOut(duration: 0.3), value: model.page)
        PageBar(page: model.page)
          .padding(.trailing, 8)
      }
      .frame(width: proxy.size.width, height: height, alignment: .top)
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

private struct MusicPageView: View {
  @ObservedObject var model: IslandModel

  var body: some View {
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
    .padding(.horizontal, 22)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Music page")
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

/// The shelf page (D30, D64, D65). Displays parked captures, stacks, files,
/// links and notes.
private struct ShelfPageView: View {
  @ObservedObject var model: IslandModel

  var body: some View {
    ZStack(alignment: .topLeading) {
      // Invisible geometry anchor matching MusicPageView's accessible bounds (D30)
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .top, spacing: 8) {
          Rectangle()
            .fill(Color.white.opacity(0.001))
            .frame(width: 48, height: 48)
            .accessibilityElement()
            .accessibilityLabel("Shelf anchor top")
            .accessibilityIdentifier("shelf-anchor-top")
          Spacer()
          Rectangle()
            .fill(Color.white.opacity(0.001))
            .frame(width: 20, height: 20)
            .accessibilityElement()
            .accessibilityLabel("Shelf anchor right")
            .accessibilityIdentifier("shelf-anchor-right")
        }
        HStack(spacing: 8) {
          Rectangle()
            .fill(Color.white.opacity(0.001))
            .frame(width: 44, height: 14)
            .accessibilityElement()
            .accessibilityLabel("Shelf anchor mid-left")
            .accessibilityIdentifier("shelf-anchor-mid-left")
          GeometryReader { _ in
            Capsule().fill(Color.white.opacity(0.001)).frame(height: 4)
          }
          .frame(height: 14)
          Rectangle()
            .fill(Color.white.opacity(0.001))
            .frame(width: 44, height: 14)
            .accessibilityElement()
            .accessibilityLabel("Shelf anchor mid-right")
            .accessibilityIdentifier("shelf-anchor-mid-right")
        }
        HStack(spacing: 36) {
          Rectangle()
            .fill(Color.white.opacity(0.001))
            .frame(width: 32, height: 32)
            .accessibilityElement()
            .accessibilityLabel("Shelf anchor bottom")
            .accessibilityIdentifier("shelf-anchor-bottom")
        }
      }
      .opacity(0.001)

      // Actual shelf UI
      VStack {
        if model.shelfItems.isEmpty {
          Spacer()
          Text("Shelf")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.3))
          Spacer()
        } else {
          HStack(spacing: 12) {
            ForEach(model.shelfItems) { item in
              ShelfItemView(
                item: item,
                onRemove: {
                  model.onRemoveShelfItem(item.id)
                },
                onExpand: {
                  model.onExpandShelfStack(item.id)
                }
              )
            }
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 8)
          Spacer()
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .padding(.horizontal, 22)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Shelf page")
  }
}

private struct ShelfItemView: View {
  let item: ShelfItem
  let onRemove: () -> Void
  let onExpand: () -> Void

  @State private var isHovered = false

  var body: some View {
    VStack(spacing: 6) {
      ZStack(alignment: .topTrailing) {
        itemIcon
          .frame(width: 52, height: 52)
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
        .offset(x: 4, y: -4)
        .accessibilityLabel("Remove \(item.title)")
        .accessibilityIdentifier("remove-\(item.title)")
      }

      Text(item.title)
        .font(.system(size: 11, weight: .regular))
        .foregroundColor(.white)
        .lineLimit(2)
        .multilineTextAlignment(.center)
        .frame(width: 86)
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
    .frame(width: 90)
    .padding(.vertical, 4)
    .contentShape(Rectangle())
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
