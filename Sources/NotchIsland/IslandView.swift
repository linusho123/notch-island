import AppKit
import IslandCore
import SwiftUI

/// What the island's drawn content shows; the controller keeps it current.
final class IslandModel: ObservableObject {
  @Published var isOpen = false
  @Published var page: IslandPage = .music
  @Published var music = MusicPage(
    content: .nothingPlayedYet, isPlaying: false, controlsEnabled: false)
  @Published var artwork: NSImage?
  /// The source's last report, for the progress bar.
  @Published var report: SourceReport?
  /// The notch's size, for the closed shape and the open panel's top strip.
  @Published var notchSize = CGSize(width: 185, height: 33)

  var onBack: () -> Void = {}
  var onPlayPause: () -> Void = {}
  var onSkip: () -> Void = {}
  var onSeek: (TimeInterval) -> Void = { _ in }
  var onBringForward: () -> Void = {}

  func position(at time: TimeInterval) -> TimeInterval? {
    guard let report, report.state != .stopped else { return nil }
    return report.position(at: time)
  }
}

/// A hosting view that takes the first click: the island's panel never
/// becomes key (it must not take focus from the frontmost app), so without
/// this the first click on a button would only be swallowed.
final class FirstClickHostingView<Content: View>: NSHostingView<Content> {
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

struct IslandView: View {
  @ObservedObject var model: IslandModel
  static let openSize = CGSize(width: 460, height: 190)

  private var radius: CGFloat {
    model.isOpen ? NotchGeometry.openBottomRadius : NotchGeometry.closedBottomRadius
  }

  var body: some View {
    ZStack(alignment: .top) {
      UnevenRoundedRectangle(
        bottomLeadingRadius: radius, bottomTrailingRadius: radius
      )
      .fill(Color.black)
      if model.isOpen {
        OpenPanel(model: model)
          .padding(.top, model.notchSize.height)
          .transition(.opacity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
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
            .frame(height: height)
          ShelfPageView()
            .frame(height: height)
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
    .accessibilityHidden(true)
  }
}

private struct MusicPageView: View {
  @ObservedObject var model: IslandModel

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
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
            if let artist = song.artist {
              Text(artist)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.7))
                .lineLimit(1)
            }
            Text(song.source)
              .font(.system(size: 11))
              .foregroundColor(.white.opacity(0.5))
              .lineLimit(1)
              .onTapGesture { model.onBringForward() }
          }
        }
        Spacer(minLength: 0)
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
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Music page")
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
/// dot or clicking the bar seeks (D25); once let go, the dot shows where the
/// app really is, never the island's own guess (D124).
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
                model.onSeek(target)
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

/// The shelf page. Its items arrive in P4; until then it is empty.
private struct ShelfPageView: View {
  var body: some View {
    VStack {
      Text("Shelf")
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(.white.opacity(0.5))
      Spacer()
    }
    .padding(.top, 12)
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Shelf page")
  }
}
