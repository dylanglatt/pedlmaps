import WidgetKit
import SwiftUI

extension Level {
  // Number color, matching the in-app availability badge (green plenty / amber
  // low / gray none).
  var color: Color {
    switch self {
    case .good: return Color(red: 0.20, green: 0.72, blue: 0.47)
    case .low:  return Color(red: 0.96, green: 0.65, blue: 0.14)
    case .none: return Color.secondary
    }
  }
}

private func deepLink(_ id: String) -> URL? {
  URL(string: "pedl://station/\(id)")
}

// Big number for a row, or an em dash when the value is unknown/stale.
private func valueText(_ value: Int?) -> String {
  guard let v = value else { return "—" }
  return "\(v)"
}

private func valueColor(_ value: Int?) -> Color {
  guard let v = value else { return Color.secondary }
  return Level.from(v).color
}

// "Updated 3 min" — `.relative` auto-advances in the widget timeline.
private struct UpdatedLabel: View {
  let date: Date
  let stale: Bool
  var body: some View {
    HStack(spacing: 3) {
      Text("Updated ")
        .foregroundStyle(.secondary)
      + Text(date, style: .relative)
        .foregroundStyle(.secondary)
      if stale {
        Text("· stale").foregroundStyle(.orange)
      }
    }
    .font(.system(size: 11))
    .lineLimit(1)
  }
}

private struct EmptyStateView: View {
  var body: some View {
    VStack(spacing: 6) {
      Image(systemName: "star")
        .font(.title2)
        .foregroundStyle(.secondary)
      Text("Star a station in Pedl")
        .font(.footnote)
        .multilineTextAlignment(.center)
        .foregroundStyle(.secondary)
    }
    .padding(8)
  }
}

// MARK: - Small (one configurable station)

private struct SmallView: View {
  let entry: PedlEntry

  var body: some View {
    let row = entry.rows.first
    VStack(alignment: .leading, spacing: 4) {
      Text(row?.name ?? "Station")
        .font(.system(size: 13, weight: .semibold))
        .lineLimit(2)
        .minimumScaleFactor(0.85)
      Spacer(minLength: 2)
      Text(valueText(row?.value))
        .font(.system(size: 46, weight: .bold, design: .rounded))
        .foregroundStyle(valueColor(row?.value))
        .lineLimit(1)
        .minimumScaleFactor(0.5)
      Text(entry.metric.label)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(.secondary)
      Spacer(minLength: 2)
      UpdatedLabel(date: entry.date, stale: entry.stale)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .widgetURL(row.flatMap { deepLink($0.id) })
  }
}

// MARK: - Medium (up to 4 favorites)

private struct MediumView: View {
  let entry: PedlEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text("Pedl")
          .font(.system(size: 13, weight: .bold))
        Spacer()
        Text(entry.metric.label)
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(.secondary)
      }
      ForEach(entry.rows) { row in
        Link(destination: deepLink(row.id) ?? URL(string: "pedl://")!) {
          HStack {
            Text(row.name)
              .font(.system(size: 14))
              .lineLimit(1)
            Spacer(minLength: 8)
            Text(valueText(row.value))
              .font(.system(size: 17, weight: .bold, design: .rounded))
              .foregroundStyle(valueColor(row.value))
          }
        }
      }
      Spacer(minLength: 0)
      UpdatedLabel(date: entry.date, stale: entry.stale)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

// MARK: - Family router

struct PedlWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: PedlEntry

  var body: some View {
    Group {
      if entry.empty {
        EmptyStateView()
      } else if family == .systemSmall {
        SmallView(entry: entry)
      } else {
        MediumView(entry: entry)
      }
    }
    .containerBackground(.fill.tertiary, for: .widget)
  }
}
