import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shared } from '../theme'
import type { NativePhoto } from '../types/capture'

type CapturePanelProps = {
  onPhoto: (photo: NativePhoto) => void
  onMessage: (message: string) => void
}

const pickerOptions: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false }

const toNativePhoto = (asset: ImagePicker.ImagePickerAsset): NativePhoto => ({
  uri: asset.uri,
  width: asset.width,
  height: asset.height,
  fileName: asset.fileName,
  mimeType: asset.mimeType,
})

export function CapturePanel({ onPhoto, onMessage }: CapturePanelProps) {
  const [opening, setOpening] = useState<'camera' | 'library' | undefined>()

  useEffect(() => {
    let mounted = true
    void ImagePicker.getPendingResultAsync().then(result => {
      if (!mounted || !result) return
      if ('code' in result) {
        onMessage(result.message || 'The camera result could not be recovered. Please try again.')
        return
      }
      if (!result.canceled && result.assets[0]) onPhoto(toNativePhoto(result.assets[0]))
    }).catch(error => {
      if (mounted) onMessage(error instanceof Error ? error.message : 'The camera result could not be recovered. Please try again.')
    })
    return () => { mounted = false }
  }, [])

  const choose = async (kind: 'camera' | 'library') => {
    setOpening(kind)
    try {
      if (kind === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync()
        if (!permission.granted) {
          onMessage('Camera permission is needed to photograph a board. Choose Photo library or enable it in Settings.')
          return
        }
      }
      const result = kind === 'camera'
        ? await ImagePicker.launchCameraAsync({ ...pickerOptions, cameraType: ImagePicker.CameraType.back })
        : await ImagePicker.launchImageLibraryAsync(pickerOptions)
      if (result.canceled || !result.assets[0]) {
        onMessage('No photo was selected. Choose a complete board photo when you are ready.')
        return
      }
      onPhoto(toNativePhoto(result.assets[0]))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'The photo picker could not open. Please try again.')
    } finally {
      setOpening(undefined)
    }
  }

  return <View style={[shared.card, styles.panel]}>
    <View style={styles.copy}>
      <Text style={shared.eyebrow}>FROM THE REAL BOARD</Text>
      <Text style={styles.title}>See the position.{"\n"}<Text style={styles.emphasis}>Find the line.</Text></Text>
      <Text style={styles.description}>Use a complete board photo. You will mark its outer edges and correct every square before the engine starts.</Text>
    </View>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" style={[styles.primary, opening && styles.disabled]} disabled={Boolean(opening)} onPress={() => choose('library')}>
        {opening === 'library' ? <ActivityIndicator color={colors.canvas} /> : <Text style={styles.primaryText}>Photo library</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" style={[styles.secondary, opening && styles.disabled]} disabled={Boolean(opening)} onPress={() => choose('camera')}>
        {opening === 'camera' ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.secondaryText}>Use camera</Text>}
      </Pressable>
    </View>
  </View>
}

const styles = StyleSheet.create({
  panel: { gap: 18 },
  copy: { gap: 8 },
  title: { color: colors.ink, fontSize: 29, fontWeight: '800', letterSpacing: -0.6, lineHeight: 34 },
  emphasis: { color: colors.green },
  description: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primary: { alignItems: 'center', backgroundColor: colors.green, borderRadius: 8, minHeight: 46, justifyContent: 'center', paddingHorizontal: 17 },
  primaryText: { color: colors.canvas, fontSize: 15, fontWeight: '800' },
  secondary: { alignItems: 'center', borderColor: colors.border, borderRadius: 8, borderWidth: 1, minHeight: 46, justifyContent: 'center', paddingHorizontal: 17 },
  secondaryText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.55 },
})
