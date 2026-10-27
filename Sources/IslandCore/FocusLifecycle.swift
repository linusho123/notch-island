import Foundation

/// Coordinates keyboard focus lifecycle for note editing (M10, Ruling R4).
/// Keyboard focus is granted only while a note editor is open.
/// When editing ends (Return, Escape, page change, island closes),
/// key eligibility is revoked and focus is released back to the prior front app.
public struct FocusLifecycle: Sendable {
  public private(set) var isEditingNote: Bool = false
  public private(set) var keyEligible: Bool = false
  public private(set) var shouldRestoreFocus: Bool = false

  public init() {}

  public mutating func startEditing() {
    isEditingNote = true
    keyEligible = true
    shouldRestoreFocus = false
  }

  public mutating func endEditing() {
    guard isEditingNote else { return }
    isEditingNote = false
    keyEligible = false
    shouldRestoreFocus = true
  }

  public mutating func onPageChanged(to page: IslandPage) {
    if page == .music && isEditingNote {
      endEditing()
    }
  }

  public mutating func onIslandClosed() {
    if isEditingNote {
      endEditing()
    }
  }
}
