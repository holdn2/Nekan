//
//  Two doors into the app, on the lock screen and the home screen.
//
//  This widget shows no tasks, and that is still a decision: the thing that is
//  actually hard about capturing a task is the four taps before the keyboard
//  appears, and a door removes those without anything else. Seeing tasks is a
//  second widget beside it (BoardWidget.swift, since 2026-09-24), which pays for
//  the shared container, the board written out in a second format, and a
//  timeline that is only as fresh as the last time the app was open.
//
//  The lock screen is the one that matters. A thought worth writing down tends
//  to arrive with the phone still locked, and the rectangular slot under the
//  clock is the largest place iOS gives a widget there -- there is no bigger
//  one to ask for. The home-screen size stays because it costs nothing more.
//
//  Nothing here is a colour literal. Nekan's accent *is* ink -- the ramp's
//  darkest step in light, its lightest in dark -- which is what `Color.primary`
//  already means on iOS, and the lock screen renders every widget in one tint
//  of its own choosing anyway. Reaching for the palette here would mean
//  hand-copying hex into a third place no check watches.
//

import SwiftUI
import WidgetKit

// The contract with the app. app/quick.tsx is the route and reads `mode`; an
// update over the air can change that screen but not these two strings, so
// moving the route means a build as well.
private let speakURL = URL(string: "nekan://quick?mode=voice")!
private let writeURL = URL(string: "nekan://quick?mode=text")!

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

/// A home-screen door: a filled tile with an icon.
///
/// The label is for VoiceOver only. The words come from the shared catalogue
/// via Localizable.xcstrings -- see tools/build-widget-strings.js -- so the
/// microphone says the same thing here as it does inside the app, and they are
/// looked up in the language chosen in the app (`appText`).
private struct TileDoor: View {
    let symbol: String
    let label: String
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
        .accessibilityLabel(Text(verbatim: label))
    }
}

/// A lock-screen door: icon over word, as large as half the slot allows.
///
/// Words here, unlike the tile. The slot is small and monochrome, and two bare
/// glyphs side by side under the clock read as decoration rather than as two
/// things to press. No colour and no background: the lock screen draws widgets
/// in its own vibrant tint and would override either.
///
/// Two `Link`s work in this family -- the kkume app measured it on a device --
/// where the small home-screen size and the circular lock-screen one send the
/// whole widget to a single URL. No `widgetURL` as a fallback, on purpose: with
/// one, a dead `Link` would still open the app, and nobody would know which
/// door had actually been used.
private struct LockDoor: View {
    let symbol: String
    let label: String
    let url: URL

    var body: some View {
        Link(destination: url) {
            VStack(spacing: 3) {
                Image(systemName: symbol)
                    .font(.system(size: 22, weight: .semibold))
                Text(verbatim: label)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
    }
}

struct QuickWidgetView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryRectangular:
            HStack(spacing: 0) {
                LockDoor(symbol: "mic.fill", label: appText("widget.speak"), url: speakURL)
                LockDoor(symbol: "keyboard", label: appText("widget.write"), url: writeURL)
            }
            // iOS 17 asks every family for a container background and draws a
            // "please adopt" placeholder instead of a widget that does not give
            // one. Clear is the lock screen's answer: it paints its own.
            .containerBackground(for: .widget) { Color.clear }
        default:
            HStack(spacing: 12) {
                TileDoor(symbol: "mic.fill", label: appText("widget.speak"), url: speakURL)
                TileDoor(symbol: "keyboard", label: appText("widget.write"), url: writeURL)
            }
            .containerBackground(.fill.tertiary, for: .widget)
        }
    }
}

struct QuickWidget: Widget {
    var body: some WidgetConfiguration {
        // `kind` names this widget inside its own extension; it is not a bundle
        // identifier, and writing one there invites the two to drift.
        StaticConfiguration(kind: "quick", provider: QuickProvider()) { _ in
            QuickWidgetView()
        }
        .configurationDisplayName(Text(verbatim: "Nekan"))
        .description(Text("widget.description"))
        // Two families, and the missing ones are constraints rather than taste:
        // iOS ignores `Link` in systemSmall and in accessoryCircular and sends
        // the whole widget to one URL, so either would have to pick which door
        // wins -- and both of them are the point.
        .supportedFamilies([.accessoryRectangular, .systemMedium])
    }
}

/// Both widgets. The extension has one entry point, so it lists them.
@main
struct NekanWidgets: WidgetBundle {
    var body: some Widget {
        QuickWidget()
        BoardWidget()
    }
}
