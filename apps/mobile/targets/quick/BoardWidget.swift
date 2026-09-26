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
    /// The theme chosen in the app; nil follows the phone.
    let theme: String?
    /// Palette roles by theme, from theme.ts (widget/feed.ts WIDGET_ROLES).
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

/// The app's scale (theme.ts SPACING / FONT_SIZE), in the steps the widget uses.
/// Written out rather than sent: they are sizes, not colours, and the layout
/// arithmetic below needs them before any feed has been read.
private enum Scale {
    static let gap: CGFloat = 6        // SPACING.sm, between the three bands
    static let rowGap: CGFloat = 4     // SPACING.xs, the least between rows
    static let headerHeight: CGFloat = 22
    static let titleHeight: CGFloat = 20
    /// The title dot starts this far in, so its centre falls on the same
    /// vertical line as the mark's coloured tile (its ink starts 2.7pt into
    /// the 20pt image) and the row numbers -- about 10pt in. At the edge it
    /// stuck out past both.
    static let titleInset: CGFloat = 6     // SPACING.sm
    static let rowHeight: CGFloat = 20
    static let xs: CGFloat = 11        // FONT_SIZE.xs
    static let md: CGFloat = 13        // FONT_SIZE.md
    static let lg: CGFloat = 14        // FONT_SIZE.lg
    /// The board switch. One step under the scale on purpose: the switch was
    /// made smaller than the app header's, and 11pt read too big inside it.
    static let switchText: CGFloat = 10
    /// The due pill: 10pt in a 17pt capsule, so the date has air above and
    /// below it inside a 20pt row. Under the scale for the same reason.
    static let dueText: CGFloat = 10
    static let dueHeight: CGFloat = 17
}

/// How many rows fit, and how far apart they sit so the last one ends at the
/// bottom edge. Worked out from the space the widget is given rather than a
/// count per size: the same size is a different height on every phone, and a
/// fixed count either leaves a band empty at the bottom or pushes the header
/// off the top.
private struct RowFit: Equatable {
    let count: Int
    let spacing: CGFloat

    static func of(height: CGFloat, shown available: Int) -> RowFit {
        let room = height - Scale.headerHeight - Scale.titleHeight - Scale.gap * 2
        let count = max(1, Int((room + Scale.rowGap) / (Scale.rowHeight + Scale.rowGap)))
        // Spread what is left over the gaps only on a full page. A short last
        // page keeps its rows together at the top, as a list does.
        guard available >= count, count > 1 else {
            return RowFit(count: count, spacing: Scale.rowGap)
        }
        let used = CGFloat(count) * Scale.rowHeight + CGFloat(count - 1) * Scale.rowGap
        return RowFit(count: count, spacing: Scale.rowGap + max(0, room - used) / CGFloat(count - 1))
    }
}

private struct BoardWidgetView: View {
    let entry: BoardEntry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Group {
            if let feed = entry.feed {
                GeometryReader { geo in board(feed, height: geo.size.height) }
            } else {
                Text("widget.openApp")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .containerBackground(for: .widget) {
            if let feed = entry.feed {
                paint(feed, "panel")
            } else {
                Color.clear.background(.fill.tertiary)
            }
        }
        .widgetURL(link)
    }

    /// The same slice, opened in the app. The route is app/board.tsx.
    private var link: URL {
        URL(string: "nekan://board?space=\(entry.choice.space)&quad=\(entry.choice.quad)")!
    }

    /// A palette role in the theme the app is showing. The app's own choice
    /// wins over the phone's, as it does on the app's screens.
    private func paint(_ feed: Feed, _ role: String) -> Color {
        let theme = feed.theme ?? (scheme == .dark ? "dark" : "light")
        return feed.colors[theme]?[role].flatMap { Color(hex: $0) } ?? .secondary
    }

    @ViewBuilder
    private func board(_ feed: Feed, height: CGFloat) -> some View {
        let choice = entry.choice
        let list = feed.quadrant(choice.space, choice.quad)
        // A stored position past the end -- the list shrank since -- shows the
        // last page rather than nothing.
        let first = min(choice.first, max(0, list.rows.count - 1))
        let fit = RowFit.of(height: height, shown: list.rows.count - first)
        let rows = Array(list.rows.dropFirst(first).prefix(fit.count))

        VStack(alignment: .leading, spacing: Scale.gap) {
            HStack(spacing: 0) {
                appDoor
                quadrantDots(feed, choice)
                Spacer(minLength: 8)
                boardSwitch(feed, choice.space)
            }
            .frame(height: Scale.headerHeight)

            HStack(spacing: 6) {
                Circle()
                    .fill(paint(feed, choice.quad))
                    .frame(width: 8, height: 8)
                Text(verbatim: feed.labels.quads[choice.quad] ?? choice.quad)
                    .font(.system(size: Scale.lg, weight: .semibold))
                    .foregroundStyle(paint(feed, "text"))
                    .lineLimit(1)
                Text(verbatim: "\(list.count)")
                    .font(.system(size: Scale.md).monospacedDigit())
                    .foregroundStyle(paint(feed, "faint"))
                Spacer(minLength: 4)
                pageButton(feed, "chevron.up", feed.labels.previous, by: -fit.count, enabled: first > 0)
                pageButton(
                    feed, "chevron.down", feed.labels.next, by: fit.count,
                    enabled: first + fit.count < list.rows.count
                )
            }
            .padding(.leading, Scale.titleInset)
            .frame(height: Scale.titleHeight)

            if rows.isEmpty {
                Text(verbatim: feed.labels.empty)
                    .font(.system(size: Scale.xs))
                    .foregroundStyle(paint(feed, "faint"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(alignment: .leading, spacing: fit.spacing) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { offset, row in
                        taskLine(row, number: first + offset + 1, feed, choice.quad)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .top)
            }
        }
    }

    /// One row, drawn the way the app's list draws it: the number, the circle,
    /// the text in the light weight, the due date as an outlined pill.
    private func taskLine(_ row: Feed.Row, number: Int, _ feed: Feed, _ quad: String) -> some View {
        let checked = entry.checked.contains(row.id)
        return HStack(spacing: 8) {
            Text(verbatim: "\(number).")
                .font(.system(size: Scale.xs).monospacedDigit())
                .foregroundStyle(paint(feed, "faint"))
                .frame(minWidth: 15, alignment: .trailing)
            // The whole row's height is the target, not the circle's: it is
            // the smallest thing on the widget anyone has to hit.
            Button(intent: ToggleDoneIntent(id: row.id)) {
                CheckCircle(
                    checked: checked,
                    stroke: paint(feed, "muted"),
                    fill: paint(feed, "\(quad)-fill"),
                    tick: paint(feed, "on-quad")
                )
                .frame(width: 20, height: Scale.rowHeight)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: checked
                ? (feed.labels.undo ?? row.text)
                : (row.doneLabel ?? row.text)))
            Text(verbatim: row.text)
                .font(.system(size: Scale.md, weight: .light))
                .foregroundStyle(paint(feed, checked ? "muted" : "text"))
                .strikethrough(checked)
                .lineLimit(1)
            Spacer(minLength: 4)
            if let due = row.dueText {
                Text(verbatim: due)
                    .font(.system(size: Scale.dueText))
                    .foregroundStyle(paint(feed, isOverdue(row.due) ? "danger" : "muted"))
                    .lineLimit(1)
                    .padding(.horizontal, 7)
                    .frame(height: Scale.dueHeight)
                    .overlay(Capsule().strokeBorder(paint(feed, "line"), lineWidth: 0.5))
            }
        }
        .frame(height: Scale.rowHeight)
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
                .frame(width: 26, height: Scale.headerHeight, alignment: .leading)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(verbatim: "Nekan"))
    }

    /// Four dots, one per quadrant, each with its count beside it in its own
    /// colour -- small, because the list below is the content. The shown one
    /// is filled.
    private func quadrantDots(_ feed: Feed, _ choice: Choice) -> some View {
        HStack(spacing: 2) {
            ForEach(quads, id: \.self) { quad in
                let count = feed.quadrant(choice.space, quad).count
                Button(intent: ShowQuadrantIntent(quad: quad)) {
                    HStack(spacing: 3) {
                        Circle()
                            .strokeBorder(paint(feed, quad), lineWidth: 2)
                            .background(Circle().fill(quad == choice.quad ? paint(feed, quad) : .clear))
                            .frame(width: 12, height: 12)
                        Text(verbatim: "\(count)")
                            .font(.system(size: Scale.xs, weight: .medium).monospacedDigit())
                            .foregroundStyle(paint(feed, quad))
                    }
                    .padding(.horizontal, 3)
                    .frame(height: Scale.headerHeight)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(verbatim: "\(feed.labels.quads[quad] ?? quad) \(count)"))
            }
        }
    }

    /// 업무 | 일상, drawn as the app's header draws it: panel-2 behind, the
    /// shown one in the accent. Smaller than the app's, since a widget line is.
    private func boardSwitch(_ feed: Feed, _ shown: String) -> some View {
        HStack(spacing: 0) {
            ForEach(spaces, id: \.self) { space in
                Button(intent: ShowBoardIntent(space: space)) {
                    Text(verbatim: feed.labels.spaces[space] ?? space)
                        .font(.system(size: Scale.switchText, weight: .semibold))
                        .lineLimit(1)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .foregroundStyle(paint(feed, space == shown ? "on-accent" : "muted"))
                        .background(
                            Capsule().fill(space == shown ? paint(feed, "accent") : Color.clear)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(Capsule().fill(paint(feed, "panel-2")))
        .overlay(Capsule().strokeBorder(paint(feed, "line"), lineWidth: 0.5))
    }

    @ViewBuilder
    private func pageButton(
        _ feed: Feed, _ symbol: String, _ label: String, by: Int, enabled: Bool
    ) -> some View {
        let face = Image(systemName: symbol)
            .font(.system(size: 12, weight: .semibold))
            .frame(width: 26, height: Scale.titleHeight)
            .contentShape(Rectangle())
        if enabled {
            Button(intent: TurnPageIntent(by: by)) {
                face.foregroundStyle(paint(feed, "muted"))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: label))
        } else {
            // Not a button at the ends: a control that does nothing when
            // pressed is worse than one that is plainly not there to press.
            face.foregroundStyle(paint(feed, "disabled"))
                .accessibilityHidden(true)
        }
    }
}

/// The app's check circle (icons.tsx CheckCircleIcon): a ring, or the same
/// ring filled with a tick. Drawn rather than an SF Symbol so its weight and
/// size match the app's list.
private struct CheckCircle: View {
    let checked: Bool
    let stroke: Color
    let fill: Color
    let tick: Color

    var body: some View {
        ZStack {
            if checked {
                Circle().fill(fill)
                Path { p in
                    p.move(to: CGPoint(x: 4.5, y: 7.6))
                    p.addLine(to: CGPoint(x: 6.6, y: 9.7))
                    p.addLine(to: CGPoint(x: 10, y: 5.5))
                }
                .stroke(tick, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            } else {
                Circle().strokeBorder(stroke, lineWidth: 1.4)
            }
        }
        .frame(width: 15, height: 15)
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
