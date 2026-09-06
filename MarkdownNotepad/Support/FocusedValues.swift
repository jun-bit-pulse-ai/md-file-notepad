import MarkdownCore
import SwiftUI

/// Bridges the focused document window to the app-level menu bar, so Format
/// and View menu items act on whichever window is frontmost.
extension FocusedValues {
    @Entry var editorCommandAction: ((EditorCommand) -> Void)?
    @Entry var viewModeSelection: Binding<ViewMode>?
}
