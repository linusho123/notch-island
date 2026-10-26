import AVFoundation
import Foundation

/// Decides whether a file was created by macOS's own screenshot or screen
/// recording tool (D64, D105), from what macOS itself records, never the file
/// name alone.
///
/// macOS marks screenshots with the `kMDItemIsScreenCapture` extended attribute.
/// Screen recordings made by macOS carry the QuickTime author `ReplayKitRecording`
/// (or `kMDItemIsScreenCapture`). Regular images, files copied into the folder,
/// and files produced by other screenshot tools lack these marks.
public enum CaptureDetector {
  public static let screenCaptureAttr = "com.apple.metadata:kMDItemIsScreenCapture"
  public static let screenCaptureTypeAttr = "com.apple.metadata:kMDItemScreenCaptureType"
  public static let screenCaptureRectAttr = "com.apple.metadata:kMDItemScreenCaptureGlobalRect"
  public static let replayKitAuthor = "ReplayKitRecording"

  /// Returns true if the file at `url` was created by macOS's own capture tool.
  public static func isMacOSCapture(url: URL) -> Bool {
    guard FileManager.default.fileExists(atPath: url.path) else { return false }

    if hasScreenCaptureXattr(at: url) {
      return true
    }

    let ext = url.pathExtension.lowercased()
    if ext == "mov" || ext == "mp4" {
      if isReplayKitRecording(at: url) {
        return true
      }
    }

    return false
  }

  /// Checks for macOS screenshot extended attributes on the file.
  public static func hasScreenCaptureXattr(at url: URL) -> Bool {
    let path = url.path
    var buffer = [CChar](repeating: 0, count: 256)
    let isCap = getxattr(path, screenCaptureAttr, &buffer, buffer.count, 0, 0)
    if isCap > 0 { return true }
    let typeCap = getxattr(path, screenCaptureTypeAttr, &buffer, buffer.count, 0, 0)
    if typeCap > 0 { return true }
    let rectCap = getxattr(path, screenCaptureRectAttr, &buffer, buffer.count, 0, 0)
    if rectCap > 0 { return true }
    return false
  }

  /// Checks if a movie file contains the ReplayKitRecording author metadata
  /// that macOS's screencapture sets.
  public static func isReplayKitRecording(at url: URL) -> Bool {
    let asset = AVURLAsset(url: url)
    for item in asset.metadata {
      let keyStr = (item.key as? String) ?? item.commonKey?.rawValue
      if keyStr == "com.apple.quicktime.author" || keyStr == "author" {
        if let author = item.value as? String, author == replayKitAuthor {
          return true
        }
      }
    }
    return false
  }
}
