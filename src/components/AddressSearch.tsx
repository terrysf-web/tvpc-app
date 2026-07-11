import { MapPin, Search } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, font, shadows } from '../theme';

export interface AddressSuggestion {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

/** 미국 주 이름 → 2자 코드 */
const STATE_CODES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  'District of Columbia': 'DC',
};

/**
 * 무료 OSM 지오코더(Photon)로 미국 주소 검색 — API 키 불필요.
 * 교회 위치(플레젠튼) 주변 결과를 우선한다.
 */
async function searchAddress(q: string): Promise<AddressSuggestion[]> {
  const url =
    'https://photon.komoot.io/api/?limit=6&lang=en&lat=37.6624&lon=-121.8747&q=' +
    encodeURIComponent(q);
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    features?: {
      properties?: {
        countrycode?: string;
        housenumber?: string;
        street?: string;
        name?: string;
        city?: string;
        county?: string;
        state?: string;
        postcode?: string;
      };
    }[];
  };
  const out: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of json.features ?? []) {
    const p = f.properties ?? {};
    if (p.countrycode !== 'US') continue;
    const street = [p.housenumber, p.street ?? p.name].filter(Boolean).join(' ');
    if (!street) continue;
    const state = STATE_CODES[p.state ?? ''] ?? p.state ?? '';
    const city = p.city ?? p.county ?? '';
    const zip = (p.postcode ?? '').split(';')[0];
    const label = [street, city, [state, zip].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ');
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, address: street, city, state, zip });
  }
  return out;
}

/** 주소 자동 검색 입력창 — 후보 선택 시 onSelect로 주소 4요소 전달 */
export function AddressSearch({ onSelect }: { onSelect: (a: AddressSuggestion) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 3) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        setItems(await searchAddress(q.trim()));
      } catch {
        setItems([]);
      } finally {
        setBusy(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <View style={{ marginBottom: items.length ? 4 : 13 }}>
      <Text style={styles.fieldLabel}>주소 검색</Text>
      <View style={styles.searchBox}>
        <Search size={16} color={colors.faint} strokeWidth={1.9} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="예: 5925 W Las Positas Blvd"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
        />
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>
      {items.length > 0 && (
        <View style={[styles.dropdown, shadows.card]}>
          {items.map((it) => (
            <Pressable
              key={it.label}
              style={styles.item}
              onPress={() => {
                onSelect(it);
                setQ('');
                setItems([]);
              }}
            >
              <MapPin size={13} color={colors.primary} strokeWidth={1.9} />
              <Text style={styles.itemText} numberOfLines={1}>
                {it.label}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.hint}>선택하면 아래 주소 칸이 자동으로 채워집니다</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted, marginBottom: 6 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: colors.screenBg,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontFamily: font.regular,
    fontSize: 14.5,
    color: colors.body,
  },
  dropdown: {
    marginTop: 6,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingVertical: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemText: { flex: 1, fontFamily: font.regular, fontSize: 13, color: colors.body },
  hint: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontFamily: font.regular,
    fontSize: 10.5,
    color: colors.faint,
  },
});
