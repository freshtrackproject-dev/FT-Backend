# FreshTrack Backend - React Native Integration Guide

## 🚀 After Render Deployment

Once your backend is deployed to Render, you'll get a URL like:
- **Backend URL**: `https://your-app-name.onrender.com`
- **API Base**: `https://your-app-name.onrender.com/api`

## 📱 React Native Integration

### 1. Install Required Dependencies

```bash
npm install axios react-native-image-picker
# or
yarn add axios react-native-image-picker
```

### 2. Image Picker Setup

#### For iOS (ios/Info.plist):
```xml
<key>NSCameraUsageDescription</key>
<string>This app needs access to camera to take photos of food items</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>This app needs access to photo library to select food images</string>
```

#### For Android (android/app/src/main/AndroidManifest.xml):
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

### 3. API Service Setup

Create `services/api.js`:

```javascript
import axios from 'axios';

// Replace with your Render URL
const API_BASE_URL = 'https://your-app-name.onrender.com';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds for image processing
  headers: {
    'Content-Type': 'application/json',
  },
});

// Health check
export const checkHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
};

// Image detection
export const detectFood = async (imageUri) => {
  try {
    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'food_image.jpg',
    });

    const response = await api.post('/api/detect', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Detection failed:', error);
    throw error;
  }
};

// Get storage info for specific item
export const getStorageInfo = async (itemName) => {
  try {
    const response = await api.get(`/api/storage/${encodeURIComponent(itemName)}`);
    return response.data;
  } catch (error) {
    console.error('Storage info failed:', error);
    throw error;
  }
};

// Get all storage data
export const getAllStorageData = async () => {
  try {
    const response = await api.get('/api/storage');
    return response.data;
  } catch (error) {
    console.error('Storage data failed:', error);
    throw error;
  }
};

export default api;
```

### 4. Image Picker Component

Create `components/FoodImagePicker.js`:

```javascript
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { detectFood } from '../services/api';

const FoodImagePicker = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [detectionResults, setDetectionResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const showImagePicker = () => {
    Alert.alert(
      'Select Image',
      'Choose how you want to add an image',
      [
        { text: 'Camera', onPress: openCamera },
        { text: 'Gallery', onPress: openGallery },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const openCamera = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1024,
      maxHeight: 1024,
    };

    launchCamera(options, handleImageResponse);
  };

  const openGallery = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1024,
      maxHeight: 1024,
    };

    launchImageLibrary(options, handleImageResponse);
  };

  const handleImageResponse = (response) => {
    if (response.didCancel || response.error) {
      return;
    }

    if (response.assets && response.assets[0]) {
      const imageUri = response.assets[0].uri;
      setSelectedImage(imageUri);
      setDetectionResults(null);
    }
  };

  const analyzeImage = async () => {
    if (!selectedImage) {
      Alert.alert('Error', 'Please select an image first');
      return;
    }

    setLoading(true);
    try {
      const results = await detectFood(selectedImage);
      setDetectionResults(results);
    } catch (error) {
      Alert.alert('Error', 'Failed to analyze image. Please try again.');
      console.error('Detection error:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetImage = () => {
    setSelectedImage(null);
    setDetectionResults(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FreshTrack Food Detection</Text>
      
      {selectedImage ? (
        <View style={styles.imageContainer}>
          <Image source={{ uri: selectedImage }} style={styles.image} />
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={analyzeImage} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Analyze Food</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={resetImage}>
              <Text style={styles.secondaryButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.pickerButton} onPress={showImagePicker}>
          <Text style={styles.pickerButtonText}>Select Food Image</Text>
        </TouchableOpacity>
      )}

      {detectionResults && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>Detection Results:</Text>
          {detectionResults.success && detectionResults.detections ? (
            detectionResults.detections.map((detection, index) => (
              <View key={index} style={styles.detectionItem}>
                <Text style={styles.detectionLabel}>
                  {detection.label} ({(detection.confidence * 100).toFixed(1)}%)
                </Text>
                {detection.storage && (
                  <View style={styles.storageInfo}>
                    <Text style={styles.storageText}>
                      Storage: {detection.storage.storage}
                    </Text>
                    <Text style={styles.storageText}>
                      Shelf Life: {detection.storage.shelf_life} days
                    </Text>
                    <Text style={styles.storageText}>
                      Tips: {detection.storage.tips}
                    </Text>
                  </View>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.noResults}>No food items detected</Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  pickerButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 20,
  },
  pickerButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  imageContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  image: {
    width: 300,
    height: 300,
    borderRadius: 10,
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#FF3B30',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultsContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: 'white',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  detectionItem: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  detectionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 5,
  },
  storageInfo: {
    marginTop: 5,
  },
  storageText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  noResults: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default FoodImagePicker;
```

### 5. Main App Integration

Update your main App component:

```javascript
import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import FoodImagePicker from './components/FoodImagePicker';

const App = () => {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      <FoodImagePicker />
    </SafeAreaView>
  );
};

export default App;
```

### 6. Error Handling & Loading States

Add these utility functions to handle errors gracefully:

```javascript
// utils/errorHandler.js
export const handleApiError = (error) => {
  if (error.response) {
    // Server responded with error status
    const status = error.response.status;
    switch (status) {
      case 400:
        return 'Invalid image format. Please try a different image.';
      case 413:
        return 'Image too large. Please select a smaller image.';
      case 500:
        return 'Server error. Please try again later.';
      case 503:
        return 'Service temporarily unavailable. Please try again later.';
      default:
        return 'An error occurred. Please try again.';
    }
  } else if (error.request) {
    // Network error
    return 'Network error. Please check your internet connection.';
  } else {
    // Other error
    return 'An unexpected error occurred.';
  }
};
```

### 7. Environment Configuration

Create `config/api.js`:

```javascript
// Development
const DEV_API_URL = 'http://localhost:3000';

// Production (your Render URL)
const PROD_API_URL = 'https://your-app-name.onrender.com';

export const API_BASE_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;
```

## 🔧 Testing Your Integration

### 1. Test Health Endpoint
```javascript
import { checkHealth } from './services/api';

const testConnection = async () => {
  try {
    const health = await checkHealth();
    console.log('Backend is healthy:', health);
  } catch (error) {
    console.error('Backend connection failed:', error);
  }
};
```

### 2. Test Image Detection
```javascript
import { detectFood } from './services/api';

const testDetection = async (imageUri) => {
  try {
    const results = await detectFood(imageUri);
    console.log('Detection results:', results);
  } catch (error) {
    console.error('Detection failed:', error);
  }
};
```

## 📱 Advanced Features

### 1. Offline Support
```javascript
import NetInfo from '@react-native-community/netinfo';

const checkConnection = async () => {
  const state = await NetInfo.fetch();
  return state.isConnected;
};
```

### 2. Image Compression
```javascript
import ImageResizer from 'react-native-image-resizer';

const compressImage = async (imageUri) => {
  const compressedImage = await ImageResizer.createResizedImage(
    imageUri,
    800, // maxWidth
    600, // maxHeight
    'JPEG',
    80, // quality
    0, // rotation
    null, // outputPath
    false, // keepMeta
    { mode: 'contain', onlyScaleDown: true }
  );
  return compressedImage.uri;
};
```

### 3. Caching Results
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

const cacheDetectionResults = async (imageUri, results) => {
  try {
    await AsyncStorage.setItem(
      `detection_${imageUri}`,
      JSON.stringify(results)
    );
  } catch (error) {
    console.error('Caching failed:', error);
  }
};
```

## 🚀 Deployment Checklist

- [ ] Update API_BASE_URL with your Render URL
- [ ] Test image picker permissions
- [ ] Test network connectivity
- [ ] Test image upload and detection
- [ ] Handle loading states
- [ ] Implement error handling
- [ ] Test on both iOS and Android

## 📞 Support

If you encounter any issues:
1. Check the Render logs for backend errors
2. Verify your API URL is correct
3. Test the health endpoint first
4. Check image format and size requirements

Your FreshTrack backend is now ready to power your React Native app! 🎉
