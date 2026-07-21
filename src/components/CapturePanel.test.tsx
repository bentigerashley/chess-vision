import { fireEvent, render } from '@testing-library/react-native'
import * as ImagePicker from 'expo-image-picker'
import { CapturePanel } from './CapturePanel'

jest.mock('expo-image-picker', () => ({
  CameraType: { back: 'back' },
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  getPendingResultAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))

const imagePicker = ImagePicker as jest.Mocked<typeof ImagePicker>

describe('CapturePanel', () => {
  const onPhoto = jest.fn()
  const onMessage = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    imagePicker.getPendingResultAsync.mockResolvedValue(null)
  })

  it('explains a denied camera permission without opening the camera', async () => {
    imagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as ImagePicker.PermissionResponse)
    const screen = render(<CapturePanel onPhoto={onPhoto} onMessage={onMessage} />)

    fireEvent.press(screen.getByText('Use camera'))
    await screen.findByText('Use camera')

    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('Camera permission'))
    expect(imagePicker.launchCameraAsync).not.toHaveBeenCalled()
  })

  it('uses the system library picker without requesting broad photo access', async () => {
    imagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as ImagePicker.ImagePickerResult)
    const screen = render(<CapturePanel onPhoto={onPhoto} onMessage={onMessage} />)

    fireEvent.press(screen.getByText('Photo library'))
    await screen.findByText('Photo library')

    expect(imagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled()
    expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalled()
  })

  it('recovers a camera result if Android recreates the activity', async () => {
    imagePicker.getPendingResultAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///recovered.jpg', width: 900, height: 900, fileName: 'recovered.jpg', mimeType: 'image/jpeg' }],
    } as ImagePicker.ImagePickerResult)
    render(<CapturePanel onPhoto={onPhoto} onMessage={onMessage} />)

    await Promise.resolve()

    expect(onPhoto).toHaveBeenCalledWith({
      uri: 'file:///recovered.jpg', width: 900, height: 900, fileName: 'recovered.jpg', mimeType: 'image/jpeg',
    })
  })

  it('maps a selected camera asset to the native photo contract', async () => {
    imagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as ImagePicker.PermissionResponse)
    imagePicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///board.jpg', width: 1200, height: 900, fileName: 'board.jpg', mimeType: 'image/jpeg' }],
    } as ImagePicker.ImagePickerResult)
    const screen = render(<CapturePanel onPhoto={onPhoto} onMessage={onMessage} />)

    fireEvent.press(screen.getByText('Use camera'))
    await screen.findByText('Use camera')

    expect(onPhoto).toHaveBeenCalledWith({
      uri: 'file:///board.jpg', width: 1200, height: 900, fileName: 'board.jpg', mimeType: 'image/jpeg',
    })
  })
})
