import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AuthModal({ visible, onClose }: AuthModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { login, signup } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);

  // Formulaire connexion
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Formulaire inscription
  const [signupFirstName, setSignupFirstName] = useState('');
  const [signupLastName, setSignupLastName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupSchedulePreference, setSignupSchedulePreference] = useState<string>('peu_importe');

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    if (!loginEmail.includes('@')) {
      Alert.alert('Erreur', 'Email invalide');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLoading(true);
      await login(loginEmail.trim().toLowerCase(), loginPassword);
      onClose();
      // Reset form
      setLoginEmail('');
      setLoginPassword('');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Email ou mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!signupFirstName || !signupLastName || !signupEmail || !signupPhone || !signupPassword) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    if (!signupEmail.includes('@')) {
      Alert.alert('Erreur', 'Email invalide');
      return;
    }

    if (signupPassword.length < 6) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLoading(true);
      await signup(
        signupFirstName.trim(),
        signupLastName.trim(),
        signupEmail.trim().toLowerCase(),
        signupPassword,
        signupPhone.trim(),
        '', // desiredBox - paramètre conservé pour compatibilité mais vide
        signupSchedulePreference
      );
      onClose();
      // Reset form
      setSignupFirstName('');
      setSignupLastName('');
      setSignupEmail('');
      setSignupPhone('');
      setSignupPassword('');
      setShowSignupPassword(false);
      setSignupSchedulePreference('peu_importe');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de créer le compte');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(mode === 'login' ? 'signup' : 'login');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <ThemedView style={styles.modalContainer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <IconSymbol name="xmark.circle.fill" size={28} color={colors.text + '60'} />
              </TouchableOpacity>
            </View>

            {/* Logo */}
            <View style={styles.logoContainer}>
              <View style={styles.logoBox}>
                <Image
                  source={require('@/favicon-logo-header.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <ThemedText style={styles.title}>
                {mode === 'login' ? 'Connexion' : 'Inscription'}
              </ThemedText>
            </View>

            {/* Formulaire Connexion */}
            {mode === 'login' && (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: colors.text + '80' }]}>
                    Email
                  </ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
                    value={loginEmail}
                    onChangeText={setLoginEmail}
                    placeholder="email@example.com"
                    placeholderTextColor={colors.text + '40'}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: colors.text + '80' }]}>
                    Mot de passe
                  </ThemedText>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.passwordInput, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
                      value={loginPassword}
                      onChangeText={setLoginPassword}
                      placeholder="••••••••"
                      placeholderTextColor={colors.text + '40'}
                      secureTextEntry={!showLoginPassword}
                      autoCapitalize="none"
                      editable={!loading}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowLoginPassword(!showLoginPassword);
                      }}
                    >
                      <IconSymbol
                        name={showLoginPassword ? 'eye.slash.fill' : 'eye.fill'}
                        size={20}
                        color={colors.text + '60'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: PRIMARY_COLOR }]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <ThemedText style={styles.submitButtonText}>Se connecter</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Formulaire Inscription */}
            {mode === 'signup' && (
              <View style={styles.form}>
                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, styles.inputHalf]}>
                    <ThemedText style={[styles.label, { color: colors.text + '80' }]}>
                      Prénom
                    </ThemedText>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
                      value={signupFirstName}
                      onChangeText={setSignupFirstName}
                      placeholder="Jean"
                      placeholderTextColor={colors.text + '40'}
                      autoCapitalize="words"
                      editable={!loading}
                    />
                  </View>

                  <View style={[styles.inputGroup, styles.inputHalf]}>
                    <ThemedText style={[styles.label, { color: colors.text + '80' }]}>
                      Nom
                    </ThemedText>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
                      value={signupLastName}
                      onChangeText={setSignupLastName}
                      placeholder="Dupont"
                      placeholderTextColor={colors.text + '40'}
                      autoCapitalize="words"
                      editable={!loading}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: colors.text + '80' }]}>
                    Email
                  </ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
                    value={signupEmail}
                    onChangeText={setSignupEmail}
                    placeholder="email@example.com"
                    placeholderTextColor={colors.text + '40'}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: colors.text + '80' }]}>
                    Téléphone
                  </ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
                    value={signupPhone}
                    onChangeText={setSignupPhone}
                    placeholder="06 12 34 56 78"
                    placeholderTextColor={colors.text + '40'}
                    keyboardType="phone-pad"
                    editable={!loading}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: colors.text + '80' }]}>
                    Mot de passe
                  </ThemedText>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.passwordInput, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
                      value={signupPassword}
                      onChangeText={setSignupPassword}
                      placeholder="••••••••"
                      placeholderTextColor={colors.text + '40'}
                      secureTextEntry={!showSignupPassword}
                      autoCapitalize="none"
                      editable={!loading}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowSignupPassword(!showSignupPassword);
                      }}
                    >
                      <IconSymbol
                        name={showSignupPassword ? 'eye.slash.fill' : 'eye.fill'}
                        size={20}
                        color={colors.text + '60'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Préférence de planning - version compacte */}
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.label, { color: colors.text + '80', fontSize: 13 }]}>
                    Préférence de planning
                  </ThemedText>
                  <View style={styles.preferenceButtons}>
                    <TouchableOpacity
                      style={[
                        styles.preferenceButtonSmall,
                        { 
                          backgroundColor: signupSchedulePreference === 'tot' ? PRIMARY_COLOR : colors.text + '05',
                          borderColor: signupSchedulePreference === 'tot' ? PRIMARY_COLOR : colors.text + '15',
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSignupSchedulePreference('tot');
                      }}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={styles.preferenceEmojiSmall}>🌅</ThemedText>
                      <ThemedText
                        style={[
                          styles.preferenceButtonTextSmall,
                          { color: signupSchedulePreference === 'tot' ? '#000' : colors.text },
                          signupSchedulePreference === 'tot' && { fontWeight: '700' },
                        ]}
                      >
                        Tôt
                      </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.preferenceButtonSmall,
                        { 
                          backgroundColor: signupSchedulePreference === 'tard' ? PRIMARY_COLOR : colors.text + '05',
                          borderColor: signupSchedulePreference === 'tard' ? PRIMARY_COLOR : colors.text + '15',
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSignupSchedulePreference('tard');
                      }}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={styles.preferenceEmojiSmall}>🌙</ThemedText>
                      <ThemedText
                        style={[
                          styles.preferenceButtonTextSmall,
                          { color: signupSchedulePreference === 'tard' ? '#000' : colors.text },
                          signupSchedulePreference === 'tard' && { fontWeight: '700' },
                        ]}
                      >
                        Tard
                      </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.preferenceButtonSmall,
                        { 
                          backgroundColor: signupSchedulePreference === 'peu_importe' ? PRIMARY_COLOR : colors.text + '05',
                          borderColor: signupSchedulePreference === 'peu_importe' ? PRIMARY_COLOR : colors.text + '15',
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSignupSchedulePreference('peu_importe');
                      }}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={styles.preferenceEmojiSmall}>🤷</ThemedText>
                      <ThemedText
                        style={[
                          styles.preferenceButtonTextSmall,
                          { color: signupSchedulePreference === 'peu_importe' ? '#000' : colors.text },
                          signupSchedulePreference === 'peu_importe' && { fontWeight: '700' },
                        ]}
                      >
                        Flexible
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: PRIMARY_COLOR }]}
                  onPress={handleSignup}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <ThemedText style={styles.submitButtonText}>S'inscrire</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Basculer entre connexion et inscription */}
            <View style={styles.switchContainer}>
              <ThemedText style={[styles.switchText, { color: colors.text + '60' }]}>
                {mode === 'login' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}
              </ThemedText>
              <TouchableOpacity onPress={switchMode} disabled={loading}>
                <ThemedText style={[styles.switchButton, { color: PRIMARY_COLOR }]}>
                  {mode === 'login' ? 'S\'inscrire' : 'Se connecter'}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 12,
    paddingBottom: 8,
  },
  closeButton: {
    padding: 4,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  logoBox: {
    width: 70,
    height: 70,
    borderRadius: 14,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    padding: 10,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  form: {
    gap: 20,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    gap: 8,
  },
  inputHalf: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: -4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingRight: 48,
    fontSize: 16,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 14,
    padding: 4,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
  },
  switchText: {
    fontSize: 15,
  },
  switchButton: {
    fontSize: 15,
    fontWeight: '600',
  },
  preferenceButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  preferenceButtonSmall: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  preferenceEmojiSmall: {
    fontSize: 18,
  },
  preferenceButtonTextSmall: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

