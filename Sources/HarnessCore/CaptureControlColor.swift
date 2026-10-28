/// The two-colour, normally shared control distinguishes real captured pixels
/// from an absent window. Keep the coverage requirement in the caller.
public enum CaptureControlColor {
  public static func matches(red: Double, green: Double, blue: Double, left: Bool) -> Bool {
    // Native screenshots on this display retain the hue but mix channels
    // during colour conversion. Require bright, distinct opposite hues;
    // grey, black, white and swapped halves still provide no control.
    left
      ? green > 0.85 && green - max(red, blue) > 0.25
      : min(red, blue) > 0.85 && min(red, blue) - green > 0.25
  }
}
