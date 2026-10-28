/// A movie's reference must come from its own pre-action frames, because
/// screenshot and movie colour conversion can differ on the same display.
public struct CaptureRecordingReference<Frame> {
  public private(set) var frame: Frame?
  private var latest = -Double.infinity
  private var actionSeen = false
  public init() {}

  public mutating func observe(_ frame: Frame, captured: Double, actionStart: Double) {
    guard captured.isFinite else { return }
    if captured >= actionStart {
      actionSeen = true
      return
    }
    guard !actionSeen, captured >= latest else { return }
    self.frame = frame
    latest = captured
  }
}
