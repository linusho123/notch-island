import HarnessCore
import Testing

@Suite struct CaptureFrameClockTests {
  @Test func queuedOldFrameDoesNotBecomeFreshWhenDeliveredLate() {
    var clock = CaptureFrameClock()
    let accepted1 = clock.accept(displayTime: 10, receivedTime: 30)
    #expect(accepted1)
    #expect(!clock.isFresh(after: 20))
    let accepted2 = clock.accept(displayTime: 21, receivedTime: 31)
    #expect(accepted2)
    #expect(clock.isFresh(after: 20))
  }

  @Test func duplicateReorderedAndFutureFramesCannotReplaceTheCurrentFrame() {
    var clock = CaptureFrameClock()
    let accepted3 = clock.accept(displayTime: 20, receivedTime: 30)
    #expect(accepted3)
    let accepted4 = clock.accept(displayTime: 20, receivedTime: 31)
    #expect(!accepted4)
    let accepted5 = clock.accept(displayTime: 19, receivedTime: 32)
    #expect(!accepted5)
    let accepted6 = clock.accept(displayTime: 99, receivedTime: 33)
    #expect(!accepted6)
    #expect(clock.displayed == 20)
  }
}
