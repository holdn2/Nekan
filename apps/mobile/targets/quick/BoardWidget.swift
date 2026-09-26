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
//  The circle beside a task checks it off, also without opening the app. The
//  widget cannot write to the board -- it only reads a copy -- so a check is a
//  note in the same container, id to the moment it was pressed, and the app
//  completes those tasks the next time it comes to the front
//  (widget/publish.ts `takeWidgetChecks`). Until then the row stays, drawn
//  checked, and pressing again takes the note back: the circle is small, and a
//  row that vanished on a mis-tap could not be recovered from here.
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
// into this group, and reads and clears `doneKey`; the three state keys
// belong to the widget alone.
private let appGroup = "group.com.yoshi.nekan"
private let feedKey = "board.feed"
private let langKey = "app.lang"
private let doneKey = "board.done"
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
        let doneLabel: String?
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
        let undo: String?
    }

    let v: Int
    let space: String
    let labels: Labels
    /// The app's clock minus this phone's, in ms. Optional so that a feed
    /// without it still draws; a check then stamps the phone's own time.
    let offset: Double?
    let colors: [String: [String: String]]
    let boards: [String: [String: Quadrant]]

    /// The one shape this widget was built to read. widget/feed.ts writes
    /// `FEED_VERSION`, and the app can move ahead of the widget over the air;
    /// a feed from the future is shown as "open the app" rather than misread.
    static let supportedVersion = 1

    static func load() -> Feed? {
        guard let text = shared?.string(forKey: feedKey),
              let data = text.data(using: .utf8),
              let feed = try? JSONDecoder().decode(Feed.self, from: data),
              feed.v == supportedVersion
        else { return nil }
        return feed
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

/// The widget's checks: task id to when the circle was pressed, in ms on the
/// app's clock. Kept as a JSON string, the one shape both sides read the same.
private enum Checks {
    static func load() -> [String: Double] {
        guard let text = shared?.string(forKey: doneKey),
              let data = text.data(using: .utf8),
              let marks = try? JSONDecoder().decode([String: Double].self, from: data)
        else { return [:] }
        return marks
    }

    static func save(_ marks: [String: Double]) {
        guard !marks.isEmpty,
              let data = try? JSONEncoder().encode(marks),
              let text = String(data: data, encoding: .utf8)
        else {
            shared?.removeObject(forKey: doneKey)
            return
        }
        shared?.set(text, forKey: doneKey)
    }
}

// MARK: - The buttons

/// Check a task off, or take the check back.
///
/// Stamped with the moment of the tap, on the app's clock: the app completes
/// the task as of then, so an edit made on another device in between is
/// ordered correctly against it.
struct ToggleDoneIntent: AppIntent {
    static let title: LocalizedStringResource = "Check off task"

    @Parameter(title: "Task") var id: String

    init() {}
    init(id: String) { self.id = id }

    func perform() async throws -> some IntentResult {
        var marks = Checks.load()
        if marks[id] != nil {
            marks[id] = nil
        } else {
            let offset = Feed.load()?.offset ?? 0
            marks[id] = (Date().timeIntervalSince1970 * 1000 + offset).rounded()
        }
        Checks.save(marks)
        return .result()
    }
}

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
    /// Checked in the widget and not yet taken in by the app.
    let checked: Set<String>
}

private struct BoardProvider: TimelineProvider {
    func placeholder(in context: Context) -> BoardEntry {
        BoardEntry(
            date: Date(), feed: nil, choice: Choice(space: "work", quad: "q1", first: 0),
            checked: []
        )
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
        return BoardEntry(
            date: Date(), feed: feed, choice: Choice.current(feed),
            checked: Set(Checks.load().keys)
        )
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

/// Is `YYYY-MM-DD` before today, in this device's time zone?
///
/// Gregorian on purpose, not `Calendar.current`. The date is written in the
/// Gregorian calendar, and a phone set to the Buddhist or Japanese calendar
/// would read year 2026 as a different year -- every due date overdue, or
/// none. The time zone stays the device's, because "today" is.
private func isOverdue(_ due: String?) -> Bool {
    guard let due else { return false }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    let parts = due.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3,
          let date = calendar.date(
              from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    else { return false }
    return date < calendar.startOfDay(for: Date())
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
                    ForEach(rows, id: \.id) { row in taskLine(row, feed, choice.quad) }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func taskLine(_ row: Feed.Row, _ feed: Feed, _ quad: String) -> some View {
        let checked = entry.checked.contains(row.id)
        return HStack(spacing: 4) {
            // The row's height is the target, not the glyph's: it is the
            // smallest thing on the widget anyone has to hit.
            Button(intent: ToggleDoneIntent(id: row.id)) {
                Image(systemName: checked ? "checkmark.circle.fill" : "circle")
                    .font(.caption)
                    .foregroundStyle(checked ? color(feed, quad) : Color.secondary)
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: checked
                ? (feed.labels.undo ?? row.text)
                : (row.doneLabel ?? row.text)))
            Text(verbatim: row.text)
                .font(.footnote)
                .lineLimit(1)
                .strikethrough(checked)
                .foregroundStyle(checked ? Color.secondary : Color.primary)
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
