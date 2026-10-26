import Foundation

/// The resolution status of a file pointer on disk (SF8, M2, Q3).
public enum FileResolution: Equatable, Sendable {
  case resolved(URL)
  case missing
  case volumeMissing
}

/// A pointer to a file or folder on disk, held as bookmark data that follows
/// moves and detects when the file is trashed or deleted (D36, D58, D106).
/// It never moves, copies or deletes the file it points at.
public struct FilePointer: Equatable, Sendable, Codable {
  public private(set) var bookmarkData: Data
  public private(set) var originalURL: URL
  public private(set) var isFolder: Bool

  public init(url: URL, isFolder: Bool? = nil) throws {
    let standardized = url.standardizedFileURL.resolvingSymlinksInPath()
    self.originalURL = standardized
    let folder =
      isFolder
      ?? ((try? standardized.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false)
    self.isFolder = folder
    self.bookmarkData = try standardized.bookmarkData(
      options: [],
      includingResourceValuesForKeys: [.isDirectoryKey],
      relativeTo: nil
    )
  }

  /// Resolves the bookmark to its current status on disk.
  public mutating func resolveStatus() -> FileResolution {
    var isStale = false
    guard
      let resolved = try? URL(
        resolvingBookmarkData: bookmarkData,
        options: [.withoutUI],
        relativeTo: nil,
        bookmarkDataIsStale: &isStale
      )
    else {
      if isVolumeMissing(originalURL) {
        return .volumeMissing
      }
      return .missing
    }
    let standardized = resolved.standardizedFileURL.resolvingSymlinksInPath()
    if isStale,
      let refreshed = try? standardized.bookmarkData(
        options: [],
        includingResourceValuesForKeys: [.isDirectoryKey],
        relativeTo: nil
      )
    {
      self.bookmarkData = refreshed
    }
    guard FileManager.default.fileExists(atPath: standardized.path) else {
      if isVolumeMissing(standardized) || isVolumeMissing(originalURL) {
        return .volumeMissing
      }
      return .missing
    }
    if Self.isInTrash(standardized) {
      return .missing
    }
    return .resolved(standardized)
  }

  private func isVolumeMissing(_ url: URL) -> Bool {
    let path = url.path
    if path.hasPrefix("/Volumes/") {
      let comps = path.split(separator: "/")
      if comps.count >= 2 {
        let volumePath = "/Volumes/" + comps[1]
        if !FileManager.default.fileExists(atPath: volumePath) {
          return true
        }
      }
    }
    return false
  }

  /// Resolves the bookmark to its current location on disk.
  /// Returns nil if the file has been trashed, deleted, or cannot be resolved.
  public mutating func resolve() -> URL? {
    if case .resolved(let url) = resolveStatus() {
      return url
    }
    return nil
  }

  /// Non-mutating URL resolution. Returns nil if the file is missing or in the Trash.
  public func resolvedURL() -> URL? {
    var copy = self
    return copy.resolve()
  }

  /// Checks whether a URL is inside a Trash folder (user or volume).
  public static func isInTrash(_ url: URL) -> Bool {
    let standardized = url.standardizedFileURL.resolvingSymlinksInPath()
    var rel: FileManager.URLRelationship = .other
    if (try? FileManager.default.getRelationship(
      &rel, of: .trashDirectory, in: .userDomainMask, toItemAt: standardized)) != nil,
      rel == .contains
    {
      return true
    }
    if (try? FileManager.default.getRelationship(
      &rel, of: .trashDirectory, in: .allDomainsMask, toItemAt: standardized)) != nil,
      rel == .contains
    {
      return true
    }
    let path = standardized.path
    if path.contains("/.Trash/") || path.hasSuffix("/.Trash") || path.contains("/.Trashes/") {
      return true
    }
    return false
  }
}

/// What kind of capture landed on the shelf (D64, D118).
public enum CaptureType: String, Equatable, Sendable, Codable {
  case screenshot
  case screenRecording

  public init(url: URL) {
    let ext = url.pathExtension.lowercased()
    if ext == "mov" || ext == "mp4" {
      self = .screenRecording
    } else {
      self = .screenshot
    }
  }
}

/// A single screenshot or screen recording that landed on the shelf (D64, D118).
public struct CaptureItem: Equatable, Sendable, Codable {
  public var pointer: FilePointer
  public var type: CaptureType
  public var landedAt: Date

  public init(pointer: FilePointer, type: CaptureType, landedAt: Date) {
    self.pointer = pointer
    self.type = type
    self.landedAt = landedAt
  }
}

/// Two or more captures taken within 60 seconds of each other (D118).
/// A stack has no maximum size.
public struct CaptureStack: Equatable, Sendable, Codable {
  public var captures: [CaptureItem]

  public init(captures: [CaptureItem] = []) {
    self.captures = captures
  }

  /// The timestamp of the stack's most recently added capture.
  public var lastCapture: CaptureItem? {
    captures.last
  }

  /// The summary label counting screenshots and recordings (D118).
  /// Examples: "2 screenshots", "30 screenshots", "1 screenshot, 1 recording".
  public var label: String {
    let screenshots = captures.filter { $0.type == .screenshot }.count
    let recordings = captures.filter { $0.type == .screenRecording }.count
    if screenshots > 0 && recordings > 0 {
      let s = screenshots == 1 ? "1 screenshot" : "\(screenshots) screenshots"
      let r = recordings == 1 ? "1 recording" : "\(recordings) recordings"
      return "\(s), \(r)"
    } else if screenshots > 0 {
      return screenshots == 1 ? "1 screenshot" : "\(screenshots) screenshots"
    } else if recordings > 0 {
      return recordings == 1 ? "1 recording" : "\(recordings) recordings"
    } else {
      return "0 captures"
    }
  }
}

/// Several files dropped together onto the notch from Finder (D65).
public struct FileStack: Equatable, Sendable, Codable {
  public var files: [FilePointer]

  public init(files: [FilePointer] = []) {
    self.files = files
  }

  public var label: String {
    let count = files.count
    return count == 1 ? "1 file" : "\(count) files"
  }
}

/// The kinds of items that can sit on the shelf (D65, D118, D57).
public enum ShelfItemKind: Equatable, Sendable, Codable {
  case file(FilePointer)
  case folder(FilePointer)
  case capture(CaptureItem)
  case captureStack(CaptureStack)
  case fileStack(FileStack)
  case link(url: URL, title: String?)
  case note(text: String, isReminder: Bool)
}

/// An item sitting on the shelf page (D30, D65, D57).
public struct ShelfItem: Identifiable, Equatable, Sendable, Codable {
  public let id: UUID
  public var landedAt: Date
  public var kind: ShelfItemKind

  public init(id: UUID = UUID(), landedAt: Date, kind: ShelfItemKind) {
    self.id = id
    self.landedAt = landedAt
    self.kind = kind
  }

  /// Display title or summary label on the shelf.
  public var title: String {
    switch kind {
    case .file(let ptr), .folder(let ptr):
      return ptr.resolvedURL()?.lastPathComponent ?? ptr.originalURL.lastPathComponent
    case .capture(let cap):
      return cap.pointer.resolvedURL()?.lastPathComponent
        ?? cap.pointer.originalURL.lastPathComponent
    case .captureStack(let stack):
      return stack.label
    case .fileStack(let stack):
      return stack.label
    case .link(let url, let title):
      if let title, !title.isEmpty { return title }
      let s = url.absoluteString
      if let range = s.range(of: "://") {
        return String(s[range.upperBound...])
      }
      return s
    case .note(let text, let isReminder):
      if isReminder {
        return text.hasPrefix("✎ ") ? String(text.dropFirst(2)) : text
      } else {
        return text.hasPrefix("✎ ") ? text : "✎ \(text)"
      }
    }
  }

  /// The raw text of a note or reminder, without any display prefix.
  public var noteText: String? {
    guard case .note(let text, _) = kind else { return nil }
    return text.hasPrefix("✎ ") ? String(text.dropFirst(2)) : text
  }

  /// All file URLs represented by this item (for dragging out to other apps).
  public var urls: [URL] {
    switch kind {
    case .file(let ptr), .folder(let ptr):
      return [ptr.resolvedURL() ?? ptr.originalURL]
    case .capture(let cap):
      return [cap.pointer.resolvedURL() ?? cap.pointer.originalURL]
    case .captureStack(let stack):
      return stack.captures.compactMap { $0.pointer.resolvedURL() ?? $0.pointer.originalURL }
    case .fileStack(let stack):
      return stack.files.compactMap { $0.resolvedURL() ?? $0.originalURL }
    case .link(let url, _):
      return [url]
    case .note:
      return []
    }
  }

  /// Whether this item represents a folder.
  public var isFolder: Bool {
    switch kind {
    case .folder:
      return true
    case .file(let ptr):
      return ptr.isFolder
    default:
      return false
    }
  }

  /// Whether this item is a stack of captures or files.
  public var isStack: Bool {
    switch kind {
    case .captureStack, .fileStack:
      return true
    default:
      return false
    }
  }

  /// Whether this item ages out after 24 hours (D57, D65).
  public var agesOut: Bool {
    switch kind {
    case .link, .note:
      return false
    default:
      return true
    }
  }
}
