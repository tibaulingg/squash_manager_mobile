import React from 'react';
import { ActivityIndicator, Image, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { PlayerAvatar } from '@/components/player-avatar';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type SchedulePreference = 'tot' | 'tard' | 'peu_importe';

interface EditProfileFormProps {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  pictureUrl: string | null;
  schedulePreference: string | null;
  onEmailChange: (email: string) => void;
  onPhoneChange: (phone: string) => void;
  onSchedulePreferenceChange: (preference: SchedulePreference) => void;
  onPickImage: () => void;
  newImageUri: string | null;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export function EditProfileForm({
  firstName,
  lastName,
  email,
  phone,
  pictureUrl,
  schedulePreference,
  onEmailChange,
  onPhoneChange,
  onSchedulePreferenceChange,
  onPickImage,
  newImageUri,
  onCancel,
  onSave,
  isSaving,
}: EditProfileFormProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const currentPreference = (schedulePreference || 'peu_importe') as SchedulePreference;
  const displayImageUri = newImageUri || pictureUrl;

  return (
    <View style={[styles.card, { backgroundColor: colors.background }]}>
      <View style={styles.editHeader}>
        <ThemedText style={styles.sectionTitle}>Modifier le profil</ThemedText>
        <TouchableOpacity onPress={onCancel}>
          <IconSymbol name="xmark.circle.fill" size={24} color={colors.text + '60'} />
        </TouchableOpacity>
      </View>

      {/* Photo de profil */}
      <View style={styles.photoSection}>
        <ThemedText style={[styles.inputLabel, { color: colors.text, opacity: 0.7 }]}>
          Photo de profil
        </ThemedText>
        <View style={styles.photoContainer}>
          {displayImageUri ? (
            <Image
              source={{ uri: displayImageUri }}
              style={styles.profileImage}
            />
          ) : (
            <PlayerAvatar
              firstName={firstName}
              lastName={lastName}
              pictureUrl={null}
              size={80}
            />
          )}
          <TouchableOpacity
            style={[styles.changePhotoButton, { backgroundColor: PRIMARY_COLOR }]}
            onPress={onPickImage}
            activeOpacity={0.7}
          >
            <IconSymbol name="camera.fill" size={20} color="#000" />
            <ThemedText style={styles.changePhotoText}>
              {displayImageUri ? 'Changer' : 'Ajouter'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Préférence de planning */}
      <View style={styles.inputGroup}>
        <ThemedText style={[styles.inputLabel, { color: colors.text, opacity: 0.7 }]}>
          Préférence de planning
        </ThemedText>
        <View style={styles.preferenceButtons}>
          <TouchableOpacity
            style={[
              styles.preferenceButton,
              { 
                backgroundColor: currentPreference === 'tot' ? PRIMARY_COLOR : colors.text + '05',
                borderColor: currentPreference === 'tot' ? PRIMARY_COLOR : colors.text + '15',
              },
            ]}
            onPress={() => onSchedulePreferenceChange('tot')}
            activeOpacity={0.7}
          >
            <View style={styles.preferenceButtonContent}>
              <ThemedText style={styles.preferenceEmoji}>🌅</ThemedText>
              <ThemedText
                style={[
                  styles.preferenceButtonText,
                  { color: currentPreference === 'tot' ? '#000' : colors.text },
                  currentPreference === 'tot' && { fontWeight: '700' },
                ]}
              >
                Tôt
              </ThemedText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.preferenceButton,
              { 
                backgroundColor: currentPreference === 'tard' ? PRIMARY_COLOR : colors.text + '05',
                borderColor: currentPreference === 'tard' ? PRIMARY_COLOR : colors.text + '15',
              },
            ]}
            onPress={() => onSchedulePreferenceChange('tard')}
            activeOpacity={0.7}
          >
            <View style={styles.preferenceButtonContent}>
              <ThemedText style={styles.preferenceEmoji}>🌙</ThemedText>
              <ThemedText
                style={[
                  styles.preferenceButtonText,
                  { color: currentPreference === 'tard' ? '#000' : colors.text },
                  currentPreference === 'tard' && { fontWeight: '700' },
                ]}
              >
                Tard
              </ThemedText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.preferenceButton,
              { 
                backgroundColor: currentPreference === 'peu_importe' ? PRIMARY_COLOR : colors.text + '05',
                borderColor: currentPreference === 'peu_importe' ? PRIMARY_COLOR : colors.text + '15',
              },
            ]}
            onPress={() => onSchedulePreferenceChange('peu_importe')}
            activeOpacity={0.7}
          >
            <View style={styles.preferenceButtonContent}>
              <ThemedText style={styles.preferenceEmoji}>🤷</ThemedText>
              <ThemedText
                style={[
                  styles.preferenceButtonText,
                  { color: currentPreference === 'peu_importe' ? '#000' : colors.text },
                  currentPreference === 'peu_importe' && { fontWeight: '700' },
                ]}
              >
                Flexible
              </ThemedText>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <ThemedText style={[styles.inputLabel, { color: colors.text, opacity: 0.7 }]}>
          Email *
        </ThemedText>
        <TextInput
          style={[styles.input, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
          value={email}
          onChangeText={onEmailChange}
          placeholder="votre@email.com"
          placeholderTextColor={colors.text + '60'}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputGroup}>
        <ThemedText style={[styles.inputLabel, { color: colors.text, opacity: 0.7 }]}>
          Téléphone
        </ThemedText>
        <TextInput
          style={[styles.input, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
          value={phone}
          onChangeText={onPhoneChange}
          placeholder="+32 123 45 67 89"
          placeholderTextColor={colors.text + '60'}
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.editActions}>
        <TouchableOpacity
          style={[styles.editActionButton, styles.cancelButton, { borderColor: colors.text + '20' }]}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <ThemedText style={styles.cancelButtonText}>Annuler</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.editActionButton, styles.saveButton, { backgroundColor: PRIMARY_COLOR }]}
          onPress={onSave}
          disabled={isSaving}
          activeOpacity={0.7}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <ThemedText style={styles.saveButtonText}>Enregistrer</ThemedText>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  photoSection: {
    marginBottom: 20,
  },
  photoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  changePhotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  preferenceButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  preferenceButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceButtonContent: {
    alignItems: 'center',
    gap: 4,
  },
  preferenceEmoji: {
    fontSize: 24,
  },
  preferenceButtonText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  input: {
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  editActionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  saveButton: {
    borderWidth: 0,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
});

