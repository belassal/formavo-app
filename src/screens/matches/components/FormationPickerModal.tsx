/**
 * FormationPickerModal
 *
 * A bottom-sheet style modal that walks the coach through:
 *   Step 1 → pick a match format  (7v7 / 9v9 / 11v11)
 *   Step 2 → pick a formation     (filtered to that format)
 *
 * Usage:
 *   <FormationPickerModal
 *     visible={showPicker}
 *     onClose={() => setShowPicker(false)}
 *     onConfirm={({ format, formation }) => { ... }}
 *   />
 *
 * The component is self-contained — it loads formation data from
 * formationDefaults.ts and has no Firebase dependency.
 */

import React, { useState } from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { DEFAULT_FORMATS, FormationDef } from '../../../services/formationDefaults';

// ─── Mini pitch preview ────────────────────────────────────────────────────
const PITCH_W = 80;
const PITCH_H = 108;

type PitchMiniProps = {
  positions: { x: number; y: number; role: string }[];
  selected?: boolean;
};

function PitchMini({ positions, selected }: PitchMiniProps) {
  return (
    <View
      style={[
        styles.pitch,
        selected && styles.pitchSelected,
      ]}
    >
      {/* Centre line */}
      <View style={styles.pitchCentreLine} />
      {/* Centre circle (approximate with a square border-radius) */}
      <View style={styles.pitchCentreCircle} />
      {/* Top penalty box */}
      <View style={[styles.pitchBox, styles.pitchBoxTop]} />
      {/* Bottom penalty box */}
      <View style={[styles.pitchBox, styles.pitchBoxBottom]} />

      {/* Player dots */}
      {positions.map((p, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === 0 ? styles.dotGK : styles.dotField,
            {
              left: p.x * PITCH_W - 5,
              top: p.y * PITCH_H - 5,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export type FormationPickerResult = {
  format: string;               // "7v7" | "9v9" | "11v11"
  formation: FormationDef;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (result: FormationPickerResult) => void;
};

export default function FormationPickerModal({ visible, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [selectedFormation, setSelectedFormation] = useState<FormationDef | null>(null);

  const enabledFormats = Object.entries(DEFAULT_FORMATS).filter(([, v]) => v.enabled);

  const availableFormations = selectedFormat
    ? (DEFAULT_FORMATS[selectedFormat]?.formations ?? []).filter(f => !f.disabled)
    : [];

  const handleFormatPress = (key: string) => {
    setSelectedFormat(key);
    setSelectedFormation(null);
    setStep(2);
  };

  const handleFormationPress = (f: FormationDef) => {
    setSelectedFormation(f);
  };

  const handleConfirm = () => {
    if (!selectedFormat || !selectedFormation) return;
    onConfirm({ format: selectedFormat, formation: selectedFormation });
    // reset for next time
    setStep(1);
    setSelectedFormat(null);
    setSelectedFormation(null);
  };

  const handleClose = () => {
    setStep(1);
    setSelectedFormat(null);
    setSelectedFormation(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {step === 1 ? 'Select Format' : `Select Formation — ${selectedFormat}`}
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Step indicator */}
          <View style={styles.steps}>
            {['Format', 'Formation'].map((label, i) => (
              <React.Fragment key={label}>
                <View style={styles.stepItem}>
                  <View style={[styles.stepDot, step > i + 1 && styles.stepDotDone, step === i + 1 && styles.stepDotActive]}>
                    <Text style={[styles.stepDotText, (step === i + 1 || step > i + 1) && styles.stepDotTextActive]}>
                      {step > i + 1 ? '✓' : String(i + 1)}
                    </Text>
                  </View>
                  <Text style={[styles.stepLabel, step === i + 1 && styles.stepLabelActive]}>
                    {label}
                  </Text>
                </View>
                {i < 1 && <View style={[styles.stepLine, step > 1 && styles.stepLineDone]} />}
              </React.Fragment>
            ))}
          </View>

          {/* ── Step 1: Format ── */}
          {step === 1 && (
            <View style={styles.body}>
              <Text style={styles.sectionLabel}>MATCH FORMAT</Text>
              <View style={styles.formatRow}>
                {enabledFormats.map(([key, fmt]) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => handleFormatPress(key)}
                    style={styles.formatCard}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.formatCardLabel}>{key}</Text>
                    <Text style={styles.formatCardSub}>
                      {fmt.formations.filter(f => !f.disabled).length} formations
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── Step 2: Formation ── */}
          {step === 2 && (
            <View style={styles.body}>
              <TouchableOpacity onPress={() => { setStep(1); setSelectedFormation(null); }} style={styles.backBtn}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>

              <Text style={styles.sectionLabel}>FORMATION</Text>

              <ScrollView
                horizontal={false}
                contentContainerStyle={styles.formationGrid}
                showsVerticalScrollIndicator={false}
              >
                {availableFormations.map(f => {
                  const isSelected = selectedFormation?.id === f.id;
                  return (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => handleFormationPress(f)}
                      activeOpacity={0.8}
                      style={[styles.formationCard, isSelected && styles.formationCardSelected]}
                    >
                      <PitchMini positions={f.positions} selected={isSelected} />
                      <Text style={[styles.formationName, isSelected && styles.formationNameSelected]}>
                        {f.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Confirm button */}
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={!selectedFormation}
                style={[styles.confirmBtn, !selectedFormation && styles.confirmBtnDisabled]}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmBtnText}>
                  {selectedFormation
                    ? `Use ${selectedFormat} · ${selectedFormation.name}`
                    : 'Pick a formation above'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  closeBtn: {
    fontSize: 18,
    color: '#888',
  },

  // Step indicator
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  stepItem: {
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#16a34a',
  },
  stepDotDone: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  stepDotText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#aaa',
  },
  stepDotTextActive: {
    color: '#16a34a',
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#bbb',
    letterSpacing: 0.5,
  },
  stepLabelActive: {
    color: '#16a34a',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#eee',
    marginBottom: 14,
    marginHorizontal: 6,
  },
  stepLineDone: {
    backgroundColor: '#16a34a',
  },

  body: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#888',
    marginBottom: 12,
    marginTop: 4,
  },

  // Format cards
  formatRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  formatCard: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    minWidth: 90,
    backgroundColor: '#fafafa',
  },
  formatCardLabel: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111',
  },
  formatCardSub: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
    fontWeight: '600',
  },

  // Back button
  backBtn: {
    marginBottom: 8,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
  },

  // Formation grid
  formationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 12,
  },
  formationCard: {
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#fafafa',
    gap: 6,
  },
  formationCardSelected: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  formationName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#333',
  },
  formationNameSelected: {
    color: '#16a34a',
  },

  // Confirm
  confirmBtn: {
    marginTop: 12,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: '#d1d5db',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },

  // ── Pitch ──
  pitch: {
    width: PITCH_W,
    height: PITCH_H,
    backgroundColor: '#2d6a3f',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    position: 'relative',
  },
  pitchSelected: {
    borderColor: '#16a34a',
  },
  pitchCentreLine: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: PITCH_H / 2 - 0.5,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  pitchCentreCircle: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    left: PITCH_W / 2 - 9,
    top: PITCH_H / 2 - 9,
  },
  pitchBox: {
    position: 'absolute',
    left: PITCH_W * 0.25,
    width: PITCH_W * 0.5,
    height: PITCH_H * 0.15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  pitchBoxTop: {
    top: 2,
  },
  pitchBoxBottom: {
    bottom: 2,
  },
  dot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotGK: {
    backgroundColor: '#f59e0b',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  dotField: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
});
