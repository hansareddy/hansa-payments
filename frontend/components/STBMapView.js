/**
 * STBMapView Component
 * Interactive OpenStreetMap rendering for STB serial number locations & lock status.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';

export default function STBMapView({ latitude, longitude, label, serialNumber, isLocked, lockedBy, customers = [] }) {
  // Check if rendering for network map mode (passed customers list)
  const isNetworkMapMode = Array.isArray(customers) && customers.length > 0;
  
  if (isNetworkMapMode) {
    const validCustomers = customers.filter(c => c && c.latitude && c.longitude && !isNaN(parseFloat(c.latitude)) && !isNaN(parseFloat(c.longitude)));
    
    let centerLat = 16.5062;
    let centerLng = 80.6480;
    
    if (validCustomers.length > 0) {
      const sumLat = validCustomers.reduce((acc, curr) => acc + parseFloat(curr.latitude), 0);
      const sumLng = validCustomers.reduce((acc, curr) => acc + parseFloat(curr.longitude), 0);
      centerLat = sumLat / validCustomers.length;
      centerLng = sumLng / validCustomers.length;
    }

    const networkOsmUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${centerLng - 0.03}%2C${centerLat - 0.03}%2C${centerLng + 0.03}%2C${centerLat + 0.03}&layer=mapnik&marker=${centerLat}%2C${centerLng}`;

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
                height="260"
                frameBorder="0"
                scrolling="no"
                marginHeight="0"
                marginWidth="0"
                src={networkOsmUrl}
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
            <Text style={styles.noCoordsEmoji}>🗺️</Text>
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
          <Text style={styles.title}>📍 STB GPS Location</Text>
          <View style={[styles.statusBadge, { backgroundColor: isLocked ? '#D1FAE5' : '#FEF3C7' }]}>
            <Text style={[styles.statusBadgeText, { color: isLocked ? '#047857' : '#B45309' }]}>
              {isLocked ? '🔒 LOCKED & VERIFIED' : '🟡 UNVERIFIED / PENDING'}
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
              <Text style={styles.coordsText}>📍 Latitude: {mapLat.toFixed(6)}</Text>
              <Text style={styles.coordsText}>📍 Longitude: {mapLng.toFixed(6)}</Text>
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
