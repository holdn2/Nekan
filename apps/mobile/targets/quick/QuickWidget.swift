//
//  Two doors into the app, on the home screen.
//
//  The widget shows no tasks. That is a decision, not a stage: showing them
//  would mean a shared container, the board written out in a second format,
//  and a timeline that goes stale between refreshes the system decides on. The
//  thing that is actually hard about capturing a task is the four taps before
//  the keyboard appears, and a door removes those without any of it.
//
//  Nothing here is a colour literal. Nekan's accent *is* ink -- the ramp's
//  darkest step in light, its lightest in dark -- which is exactly what
//  `Color.primary` already means on iOS, and a home-screen widget sits among
//  system widgets rather than inside the app. Reaching for the palette here
//  would mean hand-copying hex into a third place no check watches.
//

import SwiftUI
import WidgetKit

/// Nothing here changes with time, so the entry carries only what TimelineEntry
/// demands.
private struct QuickEntry: TimelineEntry {
    let date: Date
}

private struct QuickProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickEntry {
        QuickEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (QuickEntry) -> Void) {
        completion(QuickEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<QuickEntry>) -> Void) {
        // One entry, never reloaded. A widget that is two buttons has nothing
        // to say later, and a refresh policy would spend the system's budget
        // redrawing the same two buttons.
        completion(Timeline(entries: [QuickEntry(date: Date())], policy: .never))
    }
}

/// One tap target: an icon that opens the app at a URL.
///
/// The label is for VoiceOver only. The words come from the shared catalogue
/// via Localizable.xcstrings -- see tools/build-widget-strings.js -- so the
/// microphone says the same thing here as it does inside the app.
private struct Door: View {
    let symbol: String
    let label: LocalizedStringKey
    let url: URL

    var body: some View {
        Link(destination: url) {
            Image(systemName: symbol)
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(Color(.systemBackground))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(
                    Color.primary,
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )
        }
        .accessibilityLabel(label)
    }
}

struct QuickWidgetView: View {
    var body: some View {
        HStack(spacing: 12) {
            Door(
                symbol: "mic.fill",
                label: "widget.speak",
                url: URL(string: "nekan://quick?mode=voice")!
            )
            Door(
                symbol: "keyboard",
                label: "widget.write",
                url: URL(string: "nekan://quick?mode=text")!
            )
        }
    }
}

@main
struct QuickWidget: Widget {
    var body: some WidgetConfiguration {
        // `kind` names this widget inside its own extension; it is not a bundle
        // identifier, and writing one there invites the two to drift.
        StaticConfiguration(kind: "quick", provider: QuickProvider()) { _ in
            QuickWidgetView()
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(Text(verbatim: "Nekan"))
        .description(Text("widget.description"))
        // Medium only, and this is a constraint rather than a preference: iOS
        // ignores `Link` in a systemSmall widget and sends the whole tile to
        // one `widgetURL`. A small size would therefore have to pick which of
        // the two doors wins, and both of them are the point.
        .supportedFamilies([.systemMedium])
    }
}

#Preview(as: .systemMedium) {
    QuickWidget()
} timeline: {
    QuickEntry(date: Date())
}
