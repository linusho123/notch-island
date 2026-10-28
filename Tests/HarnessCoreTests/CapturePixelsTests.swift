import CoreGraphics
import Foundation
import HarnessCore
import Testing

@Suite struct CapturePixelsTests {
  func image(
    width: Int, height: Int, patch: CGRect = .zero, shade: UInt8 = 0,
    rgb: [UInt8]? = nil, space: CGColorSpace = CGColorSpaceCreateDeviceRGB()
  ) -> CGImage {
    var data = [UInt8](repeating: 255, count: width * height * 4)
    for y in 0..<height {
      for x in 0..<width where patch.contains(CGPoint(x: x, y: y)) {
        for channel in 0..<3 { data[(y * width + x) * 4 + channel] = rgb?[channel] ?? shade }
      }
    }
    return CGImage(
      width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
      space: space,
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
      provider: CGDataProvider(data: Data(data) as CFData)!, decode: nil,
      shouldInterpolate: false, intent: .defaultIntent)!
  }

  @Test func panelSamplingLeavesTimeForTheControlClock() {
    let plain = image(width: 3420, height: 2214)
    let rect = CGRect(x: 617, y: 33, width: 476, height: 185)
    let display = CGRect(x: 0, y: 0, width: 1710, height: 1107)
    let start = Date()
    for _ in 0..<3 {
      #expect(CapturePixels.difference(plain, plain, rect, .zero, display: display) == 0)
    }
    #expect(Date().timeIntervalSince(start) < 0.3)
  }

  @Test func controlMaskAndLeakUseTheSameNonOriginScaledCoordinates() {
    let display = CGRect(x: 100, y: -50, width: 200, height: 100)
    let region = CGRect(x: 120, y: -40, width: 120, height: 80)
    let control = CGRect(x: 140, y: -30, width: 20, height: 10)
    let plain = image(width: 400, height: 200)
    let changedControl = image(
      width: 400, height: 200, patch: CGRect(x: 80, y: 40, width: 40, height: 20))
    let leak = image(width: 400, height: 200, patch: CGRect(x: 180, y: 80, width: 40, height: 40))
    #expect(CapturePixels.difference(plain, changedControl, region, control, display: display) == 0)
    #expect(CapturePixels.difference(plain, leak, region, control, display: display) > 0.015)
  }
  @Test func unchangedDifferenceThresholdAndEveryColourChannelAreChecked() {
    let region = CGRect(x: 0, y: 0, width: 40, height: 40)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let plain = image(width: 40, height: 40, space: space)
    for (shade, expected) in [(UInt8(235), 0.0), (UInt8(234), 1.0)] {
      let changed = image(width: 40, height: 40, patch: region, shade: shade, space: space)
      #expect(CapturePixels.difference(plain, changed, region, .zero, display: region) == expected)
    }
    for rgb: [UInt8] in [[0, 255, 255], [255, 0, 255], [255, 255, 0]] {
      let changed = image(width: 40, height: 40, patch: region, rgb: rgb, space: space)
      #expect(CapturePixels.difference(plain, changed, region, .zero, display: region) == 1)
    }
  }

}
