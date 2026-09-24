//
//  One quadrant of the board, on the home screen.
//
//  The app writes both boards into the App Group as JSON (widget/publish.ts),
//  and this only chooses which slice to draw. Switching board, quadrant and
//  page are buttons backed by AppIntents: they run here, in the widget's own
//  process, write the choice back into the same container and let WidgetKit
//  redraw -- the app is never opened for them. Tapping anywhere else opens the
//  app on the same board with that quadrant's list open (app/board.tsx).
//
//  What the widget cannot do, and why the controls look the way they do: a
//  widget is a still picture that answers taps and nothing else. There is no
//  scrolling and no swiping, so a longer list is paged with two buttons, and
//  the quadrants are four dots rather than a swipe between them.
//
//  The words are not this target's. Everything the board says -- quadrant
//  names, the two boards, the empty line, the page buttons' labels -- arrives
//  inside the feed in the language chosen in the app, and the four colours
//  arrive from theme.ts the same way. The string catalogue beside this file
//  holds only what has to exist before the app has ever written a feed: the
//  gallery description and the line asking to open the app once.
//
//  Fresh as of the last time the app was open. There is no background fetch:
//  that would need the session in a shared keychain and a second sync client,
//  a great deal of machinery for "a few minutes behind until you open Nekan".
//

import AppIntents
import SwiftUI
import WidgetKit

// The contract with the app. widget/publish.ts writes `feedKey` and `langKey`
// into this group; the three state keys belong to the widget alone.
private let appGroup = "group.com.yoshi.nekan"
private let feedKey = "board.feed"
private let langKey = "app.lang"
private let spaceKey = "board.space"
private let quadKey = "board.quad"
private let firstKey = "board.first"

private let spaces = ["work", "life"]
private let quads = ["q1", "q2", "q3", "q4"]

private var shared: UserDefaults? { UserDefaults(suiteName: appGroup) }

/// A catalogue string in the language chosen in the app, not the phone's.
///
/// The catalogue is compiled into one .lproj per language, so the app's choice
/// picks the folder. Before the app has written a language -- or for one this
/// target does not carry -- it falls back to the system's pick.
func appText(_ key: String) -> String {
    if let lang = shared?.string(forKey: langKey),
       let path = Bundle.main.path(forResource: lang, ofType: "lproj"),
       let bundle = Bundle(path: path) {
        return bundle.localizedString(forKey: key, value: nil, table: nil)
    }
    return Bundle.main.localizedString(forKey: key, value: nil, table: nil)
}

// MARK: - The feed

/// The app's snapshot. Mirrors `Feed` in widget/feed.ts.
private struct Feed: Decodable {
    struct Row: Decodable {
        let id: String
        let text: String
        let due: String?
        let dueText: String?
    }

    struct Quadrant: Decodable {
        let count: Int
        let rows: [Row]
    }

    struct Labels: Decodable {
        let spaces: [String: String]
        let quads: [String: String]
        let empty: String
        let previous: String
        let next: String
    }

    let v: Int
    let space: String
    let labels: Labels
    let colors: [String: [String: String]]
    let boards: [String: [String: Quadrant]]

    static func load() -> Feed? {
        guard let text = shared?.string(forKey: feedKey),
              let data = text.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(Feed.self, from: data)
    }

    func quadrant(_ space: String, _ quad: String) -> Quadrant {
        boards[space]?[quad] ?? Quadrant(count: 0, rows: [])
    }
}

/// What the widget is showing: its own choice once somebody has tapped, the
/// app's board and the first quadrant until then.
private struct Choice {
    let space: String
    let quad: String
    let first: Int

    static func current(_ feed: Feed?) -> Choice {
        let stored = shared?.string(forKey: spaceKey)
        let space = stored.flatMap { spaces.contains($0) ? $0 : nil }
            ?? feed.flatMap { spaces.contains($0.space) ? $0.space : nil }
            ?? "work"
        let quad = shared?.string(forKey: quadKey).flatMap {
            quads.contains($0) ? $0 : nil
        } ?? "q1"
        return Choice(space: space, quad: quad, first: max(0, shared?.integer(forKey: firstKey) ?? 0))
    }
}

// MARK: - The buttons

/// Show one board. Starts its list from the top.
struct ShowBoardIntent: AppIntent {
    static let title: LocalizedStringResource = "Show board"

    @Parameter(title: "Board") var space: String

    init() {}
    init(space: String) { self.space = space }

    func perform() async throws -> some IntentResult {
        shared?.set(space, forKey: spaceKey)
        shared?.set(0, forKey: firstKey)
        return .result()
    }
}

/// Show one quadrant. Starts its list from the top.
struct ShowQuadrantIntent: AppIntent {
    static let title: LocalizedStringResource = "Show quadrant"

    @Parameter(title: "Quadrant") var quad: String

    init() {}
    init(quad: String) { self.quad = quad }

    func perform() async throws -> some IntentResult {
        shared?.set(quad, forKey: quadKey)
        shared?.set(0, forKey: firstKey)
        return .result()
    }
}

/// Move the list by one page.
///
/// The step is the page size of the widget that was tapped, passed in, because
/// only the view knows how many rows it draws. The position is kept as the
/// first row shown rather than a page number: a medium and a large widget on
/// the same home screen share it, and a page number would mean different rows
/// to each.
struct TurnPageIntent: AppIntent {
    static let title: LocalizedStringResource = "Turn page"

    @Parameter(title: "Rows") var by: Int

    init() {}
    init(by: Int) { self.by = by }

    func perform() async throws -> some IntentResult {
        let feed = Feed.load()
        let choice = Choice.current(feed)
        let shown = feed?.quadrant(choice.space, choice.quad).rows.count ?? 0
        let first = min(max(0, choice.first + by), max(0, shown - 1))
        shared?.set(first, forKey: firstKey)
        return .result()
    }
}

// MARK: - The timeline

private struct BoardEntry: TimelineEntry {
    let date: Date
    let feed: Feed?
    let choice: Choice
}

private struct BoardProvider: TimelineProvider {
    func placeholder(in context: Context) -> BoardEntry {
        BoardEntry(date: Date(), feed: nil, choice: Choice(space: "work", quad: "q1", first: 0))
    }

    func getSnapshot(in context: Context, completion: @escaping (BoardEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BoardEntry>) -> Void) {
        // Once more at midnight: whether a date is overdue is worked out here
        // against today, and today changes then. Everything else changes only
        // when the app writes or a button is pressed, and both reload us.
        let calendar = Calendar.current
        let tomorrow = calendar.date(
            byAdding: .day, value: 1, to: calendar.startOfDay(for: Date())
        ) ?? Date().addingTimeInterval(86_400)
        completion(Timeline(entries: [entry()], policy: .after(tomorrow)))
    }

    private func entry() -> BoardEntry {
        let feed = Feed.load()
        return BoardEntry(date: Date(), feed: feed, choice: Choice.current(feed))
    }
}

// MARK: - The view

private extension Color {
    /// `#rrggbb` from the feed. Not a literal: theme.ts is where the value
    /// lives, and it reaches here as data.
    init?(hex: String) {
        var digits = hex
        if digits.hasPrefix("#") { digits.removeFirst() }
        guard digits.count == 6, let value = UInt64(digits, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

/// Is `YYYY-MM-DD` before today, by this device's calendar?
private func isOverdue(_ due: String?) -> Bool {
    guard let due else { return false }
    let parts = due.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3,
          let date = Calendar.current.date(
              from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    else { return false }
    return date < Calendar.current.startOfDay(for: Date())
}

private struct BoardWidgetView: View {
    let entry: BoardEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme

    /// Rows per page. Worked out from the families' heights (medium 158pt,
    /// large 354pt), the 16pt margins, the two control lines and a footnote
    /// row of about 22pt -- not measured on a device. Three fill the medium
    /// and a fourth would not; the large could take about eleven, so eight
    /// leaves it partly empty (issue 144).
    private var perPage: Int { family == .systemLarge ? 8 : 3 }

    var body: some View {
        Group {
            if let feed = entry.feed {
                board(feed)
            } else {
                Text("widget.openApp")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(link)
    }

    /// The same slice, opened in the app. The route is app/board.tsx.
    private var link: URL {
        URL(string: "nekan://board?space=\(entry.choice.space)&quad=\(entry.choice.quad)")!
    }

    private func color(_ feed: Feed, _ quad: String) -> Color {
        let theme = scheme == .dark ? "dark" : "light"
        return feed.colors[theme]?[quad].flatMap { Color(hex: $0) } ?? .secondary
    }

    @ViewBuilder
    private func board(_ feed: Feed) -> some View {
        let choice = entry.choice
        let list = feed.quadrant(choice.space, choice.quad)
        // A stored position past the end -- the list shrank since -- shows the
        // last page rather than nothing.
        let first = min(choice.first, max(0, list.rows.count - 1))
        let rows = Array(list.rows.dropFirst(first).prefix(perPage))

        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 0) {
                appDoor
                quadrantDots(feed, choice.quad)
                Spacer(minLength: 8)
                boardSwitch(feed, choice.space)
            }

            HStack(spacing: 6) {
                Circle()
                    .fill(color(feed, choice.quad))
                    .frame(width: 8, height: 8)
                Text(verbatim: feed.labels.quads[choice.quad] ?? choice.quad)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(verbatim: "\(list.count)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 4)
                pageButton("chevron.up", feed.labels.previous, by: -perPage, enabled: first > 0)
                pageButton(
                    "chevron.down", feed.labels.next, by: perPage,
                    enabled: first + perPage < list.rows.count
                )
            }

            if rows.isEmpty {
                Text(verbatim: feed.labels.empty)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(rows, id: \.id) { row in taskLine(row) }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func taskLine(_ row: Feed.Row) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "circle")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(verbatim: row.text)
                .font(.footnote)
                .lineLimit(1)
            Spacer(minLength: 4)
            if let due = row.dueText {
                Text(verbatim: due)
                    .font(.caption2)
                    .foregroundStyle(isOverdue(row.due) ? Color.red : Color.secondary)
                    .lineLimit(1)
            }
        }
    }

    /// The Nekan mark, and the one door into the app you can see.
    ///
    /// Everything that is not a button already opens the app (`widgetURL`),
    /// but nothing said so -- a tap on a row opening the whole app was a thing
    /// to discover. The mark is where people look for "open this", and it goes
    /// to the same place the rest of the widget does: this board, this
    /// quadrant's list open. A `Link` rather than leaning on `widgetURL`, so the
    /// mark stays a door even if the background's destination changes later.
    private var appDoor: some View {
        Link(destination: link) {
            Image("NekanMark")
                .resizable()
                .interpolation(.high)
                .frame(width: 20, height: 20)
                .frame(width: 28, height: 24, alignment: .leading)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(verbatim: "Nekan"))
    }

    /// Four dots, one per quadrant. The shown one is filled.
    private func quadrantDots(_ feed: Feed, _ shown: String) -> some View {
        HStack(spacing: 2) {
            ForEach(quads, id: \.self) { quad in
                Button(intent: ShowQuadrantIntent(quad: quad)) {
                    Circle()
                        .strokeBorder(color(feed, quad), lineWidth: 2)
                        .background(Circle().fill(quad == shown ? color(feed, quad) : .clear))
                        .frame(width: 14, height: 14)
                        .frame(width: 26, height: 22)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(verbatim: feed.labels.quads[quad] ?? quad))
            }
        }
    }

    /// 업무 | 일상, drawn the way the app's switch is: the shown one in ink.
    private func boardSwitch(_ feed: Feed, _ shown: String) -> some View {
        HStack(spacing: 0) {
            ForEach(spaces, id: \.self) { space in
                Button(intent: ShowBoardIntent(space: space)) {
                    Text(verbatim: feed.labels.spaces[space] ?? space)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 3)
                        .foregroundStyle(space == shown ? Color(.systemBackground) : Color.secondary)
                        .background(
                            Capsule().fill(space == shown ? Color.primary : Color.clear)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(Capsule().fill(.fill.secondary))
    }

    @ViewBuilder
    private func pageButton(_ symbol: String, _ label: String, by: Int, enabled: Bool) -> some View {
        let face = Image(systemName: symbol)
            .font(.caption.weight(.semibold))
            .frame(width: 26, height: 20)
            .contentShape(Rectangle())
        if enabled {
            Button(intent: TurnPageIntent(by: by)) { face }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(verbatim: label))
        } else {
            // Not a button at the ends: a control that does nothing when
            // pressed is worse than one that is plainly not there to press.
            face.foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
    }
}

struct BoardWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "board", provider: BoardProvider()) { entry in
            BoardWidgetView(entry: entry)
        }
        .configurationDisplayName(Text(verbatim: "Nekan"))
        .description(Text("widget.boardDescription"))
        // Home screen only. On the lock screen the task text would be readable
        // by anyone holding the phone, without unlocking it; the lock screen
        // keeps the two doors.
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
