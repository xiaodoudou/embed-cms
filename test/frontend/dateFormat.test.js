import { describe, it, expect } from 'vitest'
import { toDateFnsFormat, formatHas } from '../../src/utils/dateFormat.js'

describe('date format translation', () => {
  it('turns dayjs tokens into the date-fns tokens the picker parses typed text with', () => {
    expect(toDateFnsFormat('YYYY-MM-DD')).toBe('yyyy-MM-dd')
    expect(toDateFnsFormat('YYYY-MM-DD HH:mm:ss')).toBe('yyyy-MM-dd HH:mm:ss')
    expect(toDateFnsFormat('HH:mm:ss a')).toBe('HH:mm:ss a')
    expect(toDateFnsFormat('D/M/YY A')).toBe('d/M/yy a')
    expect(toDateFnsFormat(undefined)).toBe('')
  })
  it('detects whether a format shows minutes or seconds', () => {
    expect(formatHas('YYYY-MM-DD HH:mm', 'ss')).toBe(false)
    expect(formatHas('YYYY-MM-DD HH:mm:ss', 'ss')).toBe(true)
  })
})
