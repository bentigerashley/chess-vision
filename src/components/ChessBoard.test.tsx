import { fireEvent, render } from '@testing-library/react-native'
import { ChessBoard } from './ChessBoard'
import { emptyBoard } from '../lib/position'

describe('ChessBoard', () => {
  it('assigns the chosen piece through an accessible native square control', () => {
    const onAssign = jest.fn()
    const screen = render(<ChessBoard board={emptyBoard()} selected="N" onAssign={onAssign} />)

    fireEvent.press(screen.getByLabelText('e4, empty. Assign White knight.'))

    expect(onAssign).toHaveBeenCalledWith('e4', 'N')
  })
})
