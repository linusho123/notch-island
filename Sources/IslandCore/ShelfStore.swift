import Foundation

/// The shelf's persistent store (D59). Holds bookmarks to files and folders,
/// captures and their stacks (D118), links (D65), and notes (D37).
///
/// It never copies, moves or deletes the files it points at (D36).
/// It survives restarts with original landing times (D59) and ages out
/// file items and captures after 24 hours (D57).
public final class ShelfStore: @unchecked Sendable {
  public let file: URL
  public var clock: @Sendable () -> Date
  private let lock = NSLock()
  private var storedItems: [ShelfItem] = []

  /// 24 hours in seconds (D57).
  public static let ageingDuration: TimeInterval = 24 * 3600

  /// Gap within which captures join into a stack (D118).
  public static let captureStackingGap: TimeInterval = 60.0

  public var fileResolver: (@Sendable (inout FilePointer) -> FileResolution)?

  public init(
    file: URL,
    clock: @escaping @Sendable () -> Date = { Date() },
    fileResolver: (@Sendable (inout FilePointer) -> FileResolution)? = nil
  ) {
    self.file = file
    self.clock = clock
    self.fileResolver = fileResolver
    self.storedItems = Self.loadFromDisk(file: file)
  }

  public convenience init(
    directory: URL,
    clock: @escaping @Sendable () -> Date = { Date() },
    fileResolver: (@Sendable (inout FilePointer) -> FileResolution)? = nil
  ) {
    self.init(
      file: directory.appendingPathComponent("shelf.json"), clock: clock,
      fileResolver: fileResolver)
  }

  public convenience init(
    clock: @escaping @Sendable () -> Date = { Date() }
  ) {
    let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("notch-island", isDirectory: true)
    self.init(directory: dir, clock: clock)
  }

  /// Returns the current active items on the shelf, resolving bookmarks
  /// and pruning any items whose files are trashed or deleted (D58, D106),
  /// or that have reached 24 hours of age (D57).
  public func items(at date: Date? = nil) -> [ShelfItem] {
    lock.lock()
    defer { lock.unlock() }

    let now = date ?? clock()
    var changed = false
    var active: [ShelfItem] = []

    for item in storedItems {
      guard let resolved = resolveAndAge(item: item, at: now, changed: &changed) else {
        changed = true
        continue
      }
      active.append(resolved)
    }

    if changed {
      self.storedItems = active
      try? saveLocked()
    }

    return active
  }

  /// Parks a screenshot or screen recording, joining an existing stack if taken
  /// within 60 seconds of the previous capture (D64, D118).
  @discardableResult
  public func parkCapture(
    at url: URL,
    type: CaptureType? = nil,
    landedAt: Date? = nil
  ) throws -> ShelfItem {
    lock.lock()
    defer { lock.unlock() }

    let now = landedAt ?? clock()
    let capType = type ?? CaptureType(url: url)
    let pointer = try FilePointer(url: url)
    let capture = CaptureItem(pointer: pointer, type: capType, landedAt: now)

    if let index = storedItems.lastIndex(where: {
      switch $0.kind {
      case .capture, .captureStack:
        return true
      default:
        return false
      }
    }) {
      let targetItem = storedItems[index]
      switch targetItem.kind {
      case .capture(let prevCapture):
        let gap = now.timeIntervalSince(prevCapture.landedAt)
        if gap >= -1.0 && gap <= Self.captureStackingGap {
          let stack = CaptureStack(captures: [prevCapture, capture])
          let updatedItem = ShelfItem(
            id: targetItem.id, landedAt: prevCapture.landedAt, kind: .captureStack(stack))
          storedItems[index] = updatedItem
          try? saveLocked()
          return updatedItem
        }
      case .captureStack(var stack):
        if let lastInStack = stack.lastCapture {
          let gap = now.timeIntervalSince(lastInStack.landedAt)
          if gap >= -1.0 && gap <= Self.captureStackingGap {
            stack.captures.append(capture)
            let updatedItem = ShelfItem(
              id: targetItem.id, landedAt: targetItem.landedAt, kind: .captureStack(stack))
            storedItems[index] = updatedItem
            try? saveLocked()
            return updatedItem
          }
        }
      default:
        break
      }
    }

    let newItem = ShelfItem(landedAt: now, kind: .capture(capture))
    storedItems.append(newItem)
    try? saveLocked()
    return newItem
  }

  /// Parks a single file or folder on the shelf (D33, D65).
  @discardableResult
  public func parkFile(at url: URL, landedAt: Date? = nil) throws -> ShelfItem {
    lock.lock()
    defer { lock.unlock() }

    let now = landedAt ?? clock()
    let pointer = try FilePointer(url: url)
    let kind: ShelfItemKind = pointer.isFolder ? .folder(pointer) : .file(pointer)
    let item = ShelfItem(landedAt: now, kind: kind)
    storedItems.append(item)
    try? saveLocked()
    return item
  }

  /// Parks several files selected together in Finder as one stack (D65).
  @discardableResult
  public func parkFiles(at urls: [URL], landedAt: Date? = nil) throws -> ShelfItem? {
    guard !urls.isEmpty else { return nil }
    if urls.count == 1 {
      return try parkFile(at: urls[0], landedAt: landedAt)
    }
    lock.lock()
    defer { lock.unlock() }

    let now = landedAt ?? clock()
    let pointers = try urls.map { try FilePointer(url: $0) }
    let stack = FileStack(files: pointers)
    let item = ShelfItem(landedAt: now, kind: .fileStack(stack))
    storedItems.append(item)
    try? saveLocked()
    return item
  }

  /// Parks a link on the shelf (D65). Links never age out.
  @discardableResult
  public func parkLink(_ url: URL, title: String? = nil, landedAt: Date? = nil) -> ShelfItem {
    lock.lock()
    defer { lock.unlock() }

    let now = landedAt ?? clock()
    let item = ShelfItem(landedAt: now, kind: .link(url: url, title: title))
    storedItems.append(item)
    try? saveLocked()
    return item
  }

  /// Adds a note or reminder to the shelf (D37, D57, D59).
  @discardableResult
  public func addNote(text: String, isReminder: Bool = false, landedAt: Date? = nil) -> ShelfItem {
    lock.lock()
    defer { lock.unlock() }

    let cappedText = NoteCap.capped(text)
    let now = landedAt ?? clock()
    let item = ShelfItem(landedAt: now, kind: .note(text: cappedText, isReminder: isReminder))
    storedItems.append(item)
    try? saveLocked()
    return item
  }

  /// Updates a note's text in place (D63).
  /// Emptying the text removes the note (D63).
  @discardableResult
  public func updateNoteText(id: UUID, text: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }

    guard let index = storedItems.firstIndex(where: { $0.id == id }) else { return false }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty {
      storedItems.remove(at: index)
      try? saveLocked()
      return true
    }

    let old = storedItems[index]
    guard case .note(_, let isReminder) = old.kind else { return false }
    let cappedText = NoteCap.capped(text)
    storedItems[index] = ShelfItem(
      id: old.id, landedAt: old.landedAt, kind: .note(text: cappedText, isReminder: isReminder))
    try? saveLocked()
    return true
  }

  /// Highlighted text dropped onto the notch is refused (D65, D102).
  /// Always returns false and leaves the shelf unchanged.
  @discardableResult
  public func parkDroppedText(_ text: String) -> Bool {
    return false
  }

  /// Expands a capture stack or file stack into individual items (D118, D65).
  @discardableResult
  public func expandStack(id: UUID) -> Bool {
    lock.lock()
    defer { lock.unlock() }

    guard let index = storedItems.firstIndex(where: { $0.id == id }) else { return false }
    let item = storedItems[index]

    switch item.kind {
    case .captureStack(let stack):
      let unstacked = stack.captures.map { capture in
        ShelfItem(landedAt: capture.landedAt, kind: .capture(capture))
      }
      storedItems.replaceSubrange(index...index, with: unstacked)
      try? saveLocked()
      return true
    case .fileStack(let stack):
      let unstacked = stack.files.map { file in
        ShelfItem(landedAt: item.landedAt, kind: file.isFolder ? .folder(file) : .file(file))
      }
      storedItems.replaceSubrange(index...index, with: unstacked)
      try? saveLocked()
      return true
    default:
      return false
    }
  }

  /// Removes an item by its ID (clicking x or dropping on remove area) (D66).
  /// Does not delete the file on disk.
  @discardableResult
  public func remove(id: UUID) -> Bool {
    lock.lock()
    defer { lock.unlock() }

    guard let index = storedItems.firstIndex(where: { $0.id == id }) else { return false }
    storedItems.remove(at: index)
    try? saveLocked()
    return true
  }

  /// Toggles an item between a plain note and a reminder (D39).
  /// Preserves the note's text and its position on the shelf.
  @discardableResult
  public func toggleNoteKind(id: UUID) -> Bool {
    lock.lock()
    defer { lock.unlock() }

    guard let index = storedItems.firstIndex(where: { $0.id == id }) else { return false }
    let old = storedItems[index]
    guard case .note(let text, let isReminder) = old.kind else { return false }

    storedItems[index] = ShelfItem(
      id: old.id,
      landedAt: old.landedAt,
      kind: .note(text: text, isReminder: !isReminder)
    )
    try? saveLocked()
    return true
  }

  /// Checks off a reminder and removes it from the shelf at once (D40).
  /// Plain notes and other items are never removed by check-off.
  @discardableResult
  public func checkOffReminder(id: UUID) -> Bool {
    lock.lock()
    defer { lock.unlock() }

    guard let index = storedItems.firstIndex(where: { $0.id == id }) else { return false }
    let item = storedItems[index]
    guard case .note(_, let isReminder) = item.kind, isReminder else {
      return false
    }

    storedItems.remove(at: index)
    try? saveLocked()
    return true
  }

  /// Removes an item after an accepted drop (D92, D116).
  /// Notes and reminders stay on the shelf unchanged (D93).
  @discardableResult
  public func itemAccepted(id: UUID) -> Bool {
    lock.lock()
    defer { lock.unlock() }

    guard let index = storedItems.firstIndex(where: { $0.id == id }) else { return false }
    if case .note = storedItems[index].kind {
      return false
    }
    storedItems.remove(at: index)
    try? saveLocked()
    return true
  }

  /// A refused drop leaves the item on the shelf unchanged (D92, D103).
  public func itemRefused(id: UUID) {
    // D92, D103: A refused or empty drop leaves it on the shelf as it was.
  }

  /// Clears all items from the shelf.
  public func clear() {
    lock.lock()
    defer { lock.unlock() }
    storedItems.removeAll()
    try? saveLocked()
  }

  /// Reloads items from disk (D59).
  public func reload() {
    lock.lock()
    defer { lock.unlock() }
    storedItems = Self.loadFromDisk(file: file)
  }

  /// Manually forces a save to disk.
  public func save() throws {
    lock.lock()
    defer { lock.unlock() }
    try saveLocked()
  }

  public var count: Int {
    items().count
  }

  public var isEmpty: Bool {
    items().isEmpty
  }

  // MARK: - Private helpers

  private func resolveAndAge(item: ShelfItem, at now: Date, changed: inout Bool) -> ShelfItem? {
    switch item.kind {
    case .file(var ptr):
      if now.timeIntervalSince(item.landedAt) >= Self.ageingDuration {
        return nil
      }
      let origBookmark = ptr.bookmarkData
      let status = fileResolver?(&ptr) ?? ptr.resolveStatus()
      switch status {
      case .resolved:
        if ptr.bookmarkData != origBookmark {
          changed = true
        }
        return ShelfItem(id: item.id, landedAt: item.landedAt, kind: .file(ptr))
      case .volumeMissing:
        // Volume unmounted: keep item and keep ageing (SF8, M2, Q3)
        return ShelfItem(id: item.id, landedAt: item.landedAt, kind: .file(ptr))
      case .missing:
        return nil
      }

    case .folder(var ptr):
      if now.timeIntervalSince(item.landedAt) >= Self.ageingDuration {
        return nil
      }
      let origBookmark = ptr.bookmarkData
      let status = fileResolver?(&ptr) ?? ptr.resolveStatus()
      switch status {
      case .resolved:
        if ptr.bookmarkData != origBookmark {
          changed = true
        }
        return ShelfItem(id: item.id, landedAt: item.landedAt, kind: .folder(ptr))
      case .volumeMissing:
        // Volume unmounted: keep item and keep ageing (SF8, M2, Q3)
        return ShelfItem(id: item.id, landedAt: item.landedAt, kind: .folder(ptr))
      case .missing:
        return nil
      }

    case .capture(var cap):
      if now.timeIntervalSince(cap.landedAt) >= Self.ageingDuration {
        return nil
      }
      let origBookmark = cap.pointer.bookmarkData
      let status = fileResolver?(&cap.pointer) ?? cap.pointer.resolveStatus()
      switch status {
      case .resolved:
        if cap.pointer.bookmarkData != origBookmark {
          changed = true
        }
        return ShelfItem(id: item.id, landedAt: item.landedAt, kind: .capture(cap))
      case .volumeMissing:
        // Volume unmounted: keep item and keep ageing (SF8, M2, Q3)
        return ShelfItem(id: item.id, landedAt: item.landedAt, kind: .capture(cap))
      case .missing:
        return nil
      }

    case .captureStack(var stack):
      let originalCount = stack.captures.count
      var remaining: [CaptureItem] = []
      for var cap in stack.captures {
        if now.timeIntervalSince(cap.landedAt) >= Self.ageingDuration {
          continue
        }
        let status = fileResolver?(&cap.pointer) ?? cap.pointer.resolveStatus()
        switch status {
        case .resolved, .volumeMissing:
          remaining.append(cap)
        case .missing:
          continue
        }
      }
      if remaining.count != originalCount {
        changed = true
      }
      if remaining.isEmpty {
        return nil
      } else if remaining.count == 1 {
        return ShelfItem(id: item.id, landedAt: remaining[0].landedAt, kind: .capture(remaining[0]))
      } else {
        stack.captures = remaining
        let survivorLandedAt = remaining.first?.landedAt ?? item.landedAt
        return ShelfItem(id: item.id, landedAt: survivorLandedAt, kind: .captureStack(stack))
      }

    case .fileStack(var stack):
      if now.timeIntervalSince(item.landedAt) >= Self.ageingDuration {
        return nil
      }
      let originalCount = stack.files.count
      var remaining: [FilePointer] = []
      for var f in stack.files {
        let status = fileResolver?(&f) ?? f.resolveStatus()
        switch status {
        case .resolved, .volumeMissing:
          remaining.append(f)
        case .missing:
          continue
        }
      }
      if remaining.count != originalCount {
        changed = true
      }
      if remaining.isEmpty {
        return nil
      } else if remaining.count == 1 {
        let f = remaining[0]
        return ShelfItem(
          id: item.id, landedAt: item.landedAt, kind: f.isFolder ? .folder(f) : .file(f))
      } else {
        stack.files = remaining
        return ShelfItem(id: item.id, landedAt: item.landedAt, kind: .fileStack(stack))
      }

    case .link, .note:
      // Links and notes never age off (D57, D65).
      return item
    }
  }

  private func saveLocked() throws {
    let dir = file.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(storedItems)
    try data.write(to: file, options: .atomic)
  }

  private static func loadFromDisk(file: URL) -> [ShelfItem] {
    guard FileManager.default.fileExists(atPath: file.path),
      let data = try? Data(contentsOf: file)
    else {
      return []
    }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    do {
      return try decoder.decode([ShelfItem].self, from: data)
    } catch {
      let dir = file.deletingLastPathComponent()
      let timestamp = Int(Date().timeIntervalSince1970)
      let prefix = UUID().uuidString.prefix(8)
      let corruptName = "\(file.lastPathComponent).corrupt-\(timestamp)-\(prefix)"
      let corruptURL = dir.appendingPathComponent(corruptName)
      try? FileManager.default.moveItem(at: file, to: corruptURL)
      return []
    }
  }
}
