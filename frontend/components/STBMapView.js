/**
 * STBMapView Component
 * Interactive OpenStreetMap rendering for STB serial number locations & lock status.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';

export default function STBMapView({ latitude, longitude, label, serialNumber, isLocked, lockedBy, customers = [], onSelectCustomer }) {
  // Check if rendering for network map mode (passed customers list)
  const isNetworkMapMode = Array.isArray(customers) && customers.length > 0;
  
  if (isNetworkMapMode) {
    const validCustomers = customers.filter(c => c && c.latitude !== null && c.longitude !== null && !isNaN(parseFloat(c.latitude)) && !isNaN(parseFloat(c.longitude)));
    
    let centerLat = 16.5062;
    let centerLng = 80.6480;
    
    if (validCustomers.length > 0) {
      const sumLat = validCustomers.reduce((acc, curr) => acc + parseFloat(curr.latitude), 0);
      const sumLng = validCustomers.reduce((acc, curr) => acc + parseFloat(curr.longitude), 0);
      centerLat = sumLat / validCustomers.length;
      centerLng = sumLng / validCustomers.length;
    }

    // Build interactive Leaflet HTML for web iframe with individual markers for every mapped STB
    const markersData = JSON.stringify(validCustomers.map(c => ({
      name: c.username || 'Unknown',
      boxNo: c.boxNo || '',
      serial: c.serialNumber || '',
      lat: parseFloat(c.latitude),
      lng: parseFloat(c.longitude),
      rowIndex: c.rowIndex,
    })));

    const leafletHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          .leaflet-popup-content-wrapper { border-radius: 10px; padding: 6px; }
          .popup-title { font-weight: bold; font-size: 14px; color: #1E3A8A; margin-bottom: 2px; }
          .popup-sub { font-size: 11px; color: #475569; margin-bottom: 4px; }
          .popup-badge { display: inline-block; background: #D1FAE5; color: #047857; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const map = L.map('map');
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          const data = ${markersData};
          const bounds = [];

          data.forEach(c => {
            const marker = L.marker([c.lat, c.lng]).addTo(map);
            marker.bindPopup(\`
              <div class="popup-title">\${c.name}</div>
              <div class="popup-sub">\${c.boxNo ? 'Box #' + c.boxNo + ' • ' : ''}STB: \${c.serial || 'No Serial'}</div>
              <div class="popup-sub">GPS: \${c.lat.toFixed(5)}, \${c.lng.toFixed(5)}</div>
              <div class="popup-badge">🔒 LOCKED ON-SITE</div>
            \`);
            bounds.push([c.lat, c.lng]);
          });

          if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
          } else {
            map.setView([16.5062, 80.6480], 12);
          }
        </script>
      </body>
      </html>
    `;

    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.title}>🗺️ Network STB Geolocation Map</Text>
            <View style={[styles.statusBadge, { backgroundColor: validCustomers.length > 0 ? '#D1FAE5' : '#FEF3C7' }]}>
              <Text style={[styles.statusBadgeText, { color: validCustomers.length > 0 ? '#047857' : '#B45309' }]}>
                {validCustomers.length} STB{validCustomers.length === 1 ? '' : 's'} MAPPED
              </Text>
            </View>
          </View>
        </View>

        {validCustomers.length > 0 ? (
          <View style={styles.mapFrameBox}>
            {Platform.OS === 'web' ? (
              <iframe
                title="Network STB Map"
                width="100%"
                height="300"
                frameBorder="0"
                scrolling="no"
                srcDoc={leafletHtml}
                style={{ borderRadius: 12, border: 'none' }}
              />
            ) : (
              <View style={styles.fallbackBox}>
                <Text style={styles.coordsText}>🗺️ {validCustomers.length} STB Locations Mapped</Text>
                <Text style={styles.coordsSub}>Center: {centerLat.toFixed(4)}, {centerLng.toFixed(4)}</Text>
              </View>
            )}

            <View style={styles.metaFooter}>
              <Text style={styles.metaText}>
                STB GPS Registry • All locked on-site locations
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.noCoordsBox}>
            <Text style={styles.noCoordsTitle}>No Network STBs Mapped Yet</Text>
            <Text style={styles.noCoordsSub}>
              Field employees can tap "Log & Lock STB Location On-Site" on customer profiles when visiting premises.
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Single customer map view
  const hasCoordinates = latitude && longitude && !isNaN(latitude) && !isNaN(longitude);
  const mapLat = hasCoordinates ? parseFloat(latitude) : 16.5062;
  const mapLng = hasCoordinates ? parseFloat(longitude) : 80.6480;

  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${mapLng - 0.01}%2C${mapLat - 0.01}%2C${mapLng + 0.01}%2C${mapLat + 0.01}&layer=mapnik&marker=${mapLat}%2C${mapLng}`;

  const openInGoogleMaps = () => {
    if (hasCoordinates) {
      const url = `https://www.google.com/maps/search/?api=1&query=${mapLat},${mapLng}`;
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.title}>STB GPS Location</Text>
          <View style={[styles.statusBadge, { backgroundColor: isLocked ? '#D1FAE5' : '#FEF3C7' }]}>
            <Text style={[styles.statusBadgeText, { color: isLocked ? '#047857' : '#B45309' }]}>
              {isLocked ? 'VERIFIED & LOCKED' : 'UNVERIFIED / PENDING'}
            </Text>
          </View>
        </View>
        {hasCoordinates && (
          <TouchableOpacity onPress={openInGoogleMaps} style={styles.gmapsBtn}>
            <Text style={styles.gmapsBtnText}>Google Maps ↗</Text>
          </TouchableOpacity>
        )}
      </View>

      {hasCoordinates ? (
        <View style={styles.mapFrameBox}>
          {Platform.OS === 'web' ? (
            <iframe
              title="STB Location Map"
              width="100%"
              height="220"
              frameBorder="0"
              scrolling="no"
              marginHeight="0"
              marginWidth="0"
              src={osmEmbedUrl}
              style={{ borderRadius: 12, border: 'none' }}
            />
          ) : (
            <View style={styles.fallbackBox}>
              <Text style={styles.coordsText}>Latitude: {mapLat.toFixed(6)}</Text>
              <Text style={styles.coordsText}>Longitude: {mapLng.toFixed(6)}</Text>
            </View>
          )}

          <View style={styles.metaFooter}>
            <Text style={styles.metaText}>
              {isLocked 
                ? `Logged by: ${lockedBy || 'Field Tech'} • Locked on-site` 
                : 'Initial GPS capture pending for this STB'}
            </Text>
            <Text style={styles.coordsSub}>
              GPS: {mapLat.toFixed(5)}, {mapLng.toFixed(5)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.noCoordsBox}>
          <Text style={styles.noCoordsEmoji}>🗺️</Text>
          <Text style={styles.noCoordsTitle}>No GPS Location Recorded</Text>
          <Text style={styles.noCoordsSub}>
            Field employees can log exact coordinates when visiting customer premises on-site.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  gmapsBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  gmapsBtnText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  mapFrameBox: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  fallbackBox: {
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  coordsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginVertical: 2,
  },
  metaFooter: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  coordsSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  noCoordsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    padding: 20,
    alignItems: 'center',
  },
  noCoordsEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  noCoordsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  noCoordsSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
});
