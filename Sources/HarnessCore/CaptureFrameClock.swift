/// The window server's display timestamp identifies a captured frame. Callback
/// receipt time only bounds it; a queued old frame cannot satisfy a new request.
public struct CaptureFrameClock {
  public private(set) var displayed: UInt64 = 0
  public init() {}

  public mutating func accept(displayTime: UInt64, receivedTime: UInt64) -> Bool {
    guard displayTime > displayed, displayTime <= receivedTime else { return false }
    displayed = displayTime
    return true
  }

  public func isFresh(after requestTime: UInt64) -> Bool {
    displayed > requestTime
  }
}
