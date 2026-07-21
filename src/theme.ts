import { StyleSheet } from 'react-native'

export const colors = {
  ink: '#f7f5f0',
  muted: '#b9b5ac',
  canvas: '#262421',
  surface: '#312e2b',
  surfaceRaised: '#3b3834',
  border: '#514c45',
  green: '#81b64c',
  greenDark: '#5d8a34',
  cream: '#f0d9b5',
  brown: '#b58863',
  warning: '#f7cb5c',
  danger: '#e76f51',
  whitePiece: '#fff8e8',
  blackPiece: '#3b302b'
} as const

export const shared = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16
  },
  eyebrow: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2
  }
})
