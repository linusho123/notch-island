import CoreGraphics
import Foundation

/// The capture-presence comparison shared by live frames and movie playback.
public enum CapturePixels {
  private struct Pixels {
    let width: Int
    let height: Int
    let rgba: [UInt8]
  }

  private static func pixels(_ image: CGImage, _ rect: CGRect, display: CGRect) -> Pixels? {
    let scale = Double(image.width) / display.width
    let crop = CGRect(
      x: (rect.minX - display.minX) * scale, y: (rect.minY - display.minY) * scale,
      width: rect.width * scale, height: rect.height * scale)
    guard let part = image.cropping(to: crop) else { return nil }
    let width = part.width
    let height = part.height
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    let converted = rgba.withUnsafeMutableBytes { bytes -> Bool in
      guard
        let context = CGContext(
          data: bytes.baseAddress, width: width, height: height,
          bitsPerComponent: 8, bytesPerRow: width * 4,
          space: CGColorSpace(name: CGColorSpace.sRGB)!,
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            | CGBitmapInfo.byteOrder32Big.rawValue)
      else { return false }
      context.interpolationQuality = .none
      context.draw(part, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    return converted ? Pixels(width: width, height: height, rgba: rgba) : nil
  }

  public static func difference(
    _ a: CGImage, _ b: CGImage, _ rect: CGRect, _ control: CGRect, display: CGRect
  ) -> Double {
    guard let first = pixels(a, rect, display: display),
      let second = pixels(b, rect, display: display),
      first.width == second.width, first.height == second.height
    else { return 1 }
    var changed = 0.0
    var total = 0.0
    for y in stride(from: 0, to: first.height, by: 2) {
      for x in stride(from: 0, to: first.width, by: 2) {
        let point = CGPoint(
          x: rect.minX + Double(x) / Double(first.width) * rect.width,
          y: rect.minY + Double(y) / Double(first.height) * rect.height)
        // The timestamp changes on purpose; its two-colour presence and code
        // are checked separately in every frame.
        if control.insetBy(dx: -1, dy: -1).contains(point) { continue }
        let index = (y * first.width + x) * 4
        // Convert each crop to sRGB once, rather than constructing and
        // converting two NSColors for every sampled pixel on the main actor.
        if (0..<3).contains(where: {
          Double(abs(Int(first.rgba[index + $0]) - Int(second.rgba[index + $0]))) > 0.08 * 255
        }) {
          changed += 1
        }
        total += 1
      }
    }
    return total > 0 ? changed / total : 1
  }

}
