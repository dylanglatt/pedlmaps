import Foundation

// Minimal GBFS station_status client for the widget. One lightweight fetch per
// timeline refresh (a few hundred KB). Public feed, no key, CORS not relevant on
// device. NYC system is `bkn`. Station names come from the App Group payload, so
// we never need station_information here.
private let statusURL = "https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_status.json"

struct StationStatus: Decodable {
  let station_id: String
  let num_bikes_available: Int
  let num_ebikes_available: Int?
  let num_docks_available: Int
}

private struct StatusFeed: Decodable {
  struct Payload: Decodable { let stations: [StationStatus] }
  let data: Payload
}

// Fetch station_status and index by station_id. Returns nil on any failure
// (network, decode, timeout) so callers render a stale/em-dash state rather than
// a confident-but-wrong number.
func fetchStatus() async -> [String: StationStatus]? {
  guard let url = URL(string: statusURL) else { return nil }
  var req = URLRequest(url: url)
  req.timeoutInterval = 15
  req.cachePolicy = .reloadIgnoringLocalCacheData
  do {
    let (data, response) = try await URLSession.shared.data(for: req)
    if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
      return nil
    }
    let feed = try JSONDecoder().decode(StatusFeed.self, from: data)
    var map: [String: StationStatus] = [:]
    map.reserveCapacity(feed.data.stations.count)
    for s in feed.data.stations { map[s.station_id] = s }
    return map
  } catch {
    return nil
  }
}

// The four metrics offered in the widget config, mirroring the in-app
// Electric / Classic / Any filter plus the Bikes/Docks toggle.
//   classic = max(0, num_bikes_available - num_ebikes_available)  (matches gbfs.js)
func count(_ s: StationStatus, _ metric: Metric) -> Int {
  switch metric {
  case .ebikes:   return s.num_ebikes_available ?? 0
  case .classic:  return max(0, s.num_bikes_available - (s.num_ebikes_available ?? 0))
  case .anyBikes: return s.num_bikes_available
  case .docks:    return s.num_docks_available
  }
}
