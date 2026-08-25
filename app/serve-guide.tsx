import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down.mjs';
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up.mjs';
import ExternalLink from 'lucide-react-native/dist/esm/icons/external-link.mjs';
import FileText from 'lucide-react-native/dist/esm/icons/file-text.mjs';
import HeartHandshake from 'lucide-react-native/dist/esm/icons/heart-handshake.mjs';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { SERVE_FORM_URL, SERVE_ROLES, useServeGuides } from '../src/data/serveGuides';
import { openExternal } from '../src/links';
import { colors, font, shadows } from '../src/theme';

/**
 * 더보기 > 섬김이 안내 — 봉사 지원은 구글 폼으로 받고(위쪽 버튼), 이미
 * 봉사 중인 분들을 위해 역할별 실제 사용법(음향·프리젠테이션·방송 등)을
 * 눌러서 펼쳐 볼 수 있게 한다. 안내문은 관리자 화면에서 채워 넣으며,
 * 아직 안 채운 역할은 "준비 중" 문구를 대신 보여준다.
 */
export default function ServeGuideScreen() {
  const { guides } = useServeGuides();
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <View style={styles.screen}>
      <OverlayHeader title="섬김이 안내" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          style={[styles.applyCard, shadows.card]}
          onPress={() => openExternal(SERVE_FORM_URL)}
        >
          <View style={styles.applyChip}>
            <HeartHandshake size={20} color="#FFFFFF" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.applyLabel}>봉사 신청하기</Text>
            <Text style={styles.applySub}>원하는 분야를 골라 신청서를 보내주세요</Text>
          </View>
          <ExternalLink size={17} color={colors.primary} strokeWidth={2} />
        </Pressable>

        <Text style={styles.sectionTitle}>분야별 안내</Text>
        <View style={[styles.listCard, shadows.card]}>
          {SERVE_ROLES.map((role, i) => {
            const isOpen = openKey === role.key;
            const text = guides[role.key]?.text?.trim();
            const pdfUrl = guides[role.key]?.pdfUrl?.trim();
            return (
              <View key={role.key}>
                <Pressable
                  style={[styles.row, i < SERVE_ROLES.length - 1 && !isOpen && styles.rowDivider]}
                  onPress={() => setOpenKey(isOpen ? null : role.key)}
                >
                  <Text style={styles.rowLabel}>{role.label}</Text>
                  {isOpen ? (
                    <ChevronUp size={17} color={colors.faint2} strokeWidth={2} />
                  ) : (
                    <ChevronDown size={17} color={colors.faint2} strokeWidth={2} />
                  )}
                </Pressable>
                {isOpen && (
                  <View
                    style={[styles.panel, i < SERVE_ROLES.length - 1 && styles.rowDivider]}
                  >
                    <Text style={styles.panelText}>
                      {text ||
                        (pdfUrl
                          ? ''
                          : '아직 안내 내용이 준비되지 않았습니다. 담당 교역자·부서장에게 문의해 주세요.')}
                    </Text>
                    {!!pdfUrl && (
                      <Pressable
                        style={[styles.pdfBtn, !!text && { marginTop: 10 }]}
                        onPress={() => openExternal(pdfUrl)}
                      >
                        <FileText size={15} color={colors.primary} strokeWidth={2} />
                        <Text style={styles.pdfBtnText}>PDF 매뉴얼 보기</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },

  applyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 15,
    marginBottom: 20,
  },
  applyChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyLabel: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  applySub: { marginTop: 1, fontFamily: font.regular, fontSize: 12, color: colors.muted },

  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
    marginLeft: 2,
  },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 15,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider2 },
  rowLabel: { flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.body },
  panel: { paddingBottom: 16, paddingRight: 24 },
  panelText: { fontFamily: font.regular, fontSize: 13, lineHeight: 20, color: colors.muted },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: colors.tagBlueBg,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pdfBtnText: { fontFamily: font.bold, fontSize: 12.5, color: colors.primary },
});
