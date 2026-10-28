/// Blocking screenshot workers must not stop the main actor's control clock.
@MainActor
public enum CaptureWork {
  public static func run<Value: Sendable>(
    _ operation: @escaping @Sendable () -> Value
  ) async -> Value {
    await Task.detached(operation: operation).value
  }
}
