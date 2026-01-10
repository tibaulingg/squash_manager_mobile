import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Platform } from 'react-native';

interface ImageAsset {
  uri: string;
  name: string;
  type: string;
}

export function useImagePicker() {
  const [image, setImage] = useState<ImageAsset | null>(null);

  const requestPermission = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission requise',
          'Nous avons besoin de votre permission pour accéder à vos photos.'
        );
        return false;
      }
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const imageAsset: ImageAsset = {
          uri: asset.uri,
          name: `profile_${Date.now()}.jpg`,
          type: 'image/jpeg',
        };
        setImage(imageAsset);
        return imageAsset;
      }
    } catch (error) {
      console.error('Erreur lors de la sélection de l\'image:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image');
    }
    return null;
  };

  const clearImage = () => {
    setImage(null);
  };

  return {
    image,
    pickImage,
    clearImage,
  };
}
