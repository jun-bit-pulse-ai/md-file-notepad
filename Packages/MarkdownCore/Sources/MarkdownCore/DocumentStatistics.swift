import Foundation

public struct DocumentStatistics: Equatable, Sendable {
    public var words: Int
    public var characters: Int
    public var lines: Int

    /// At the usual 200 wpm, rounded up so a short note reads as "1 min".
    public var readingMinutes: Int { max(1, Int((Double(words) / 200.0).rounded(.up))) }

    public init(text: String) {
        characters = text.count
        lines = text.isEmpty ? 1 : text.components(separatedBy: "\n").count
        words = text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).count
    }
}
