import { describe, it, expect } from 'vitest'
import {
  geopointOptions, normaliseGeopoint, roundCoordinate, formatCoordinate, formatGeopoint, parseCoordinate, parsePair, validateGeopoint, validateGeopointText
} from '@u/geopoint'
import { TranslateService } from './helpers/mountField.js'

describe('geopointOptions', () => {
  it('has 6 decimals, a zoom of 12 and no centre by default', () => {
    expect(geopointOptions({})).toEqual({ precision: 6, zoom: 12, center: undefined })
  })

  it('reads the options of the field, and keeps them within what makes sense', () => {
    const options = geopointOptions({ options: { precision: 4, zoom: 30, center: { lat: 31.23, lng: 121.47 } } })
    expect(options).toEqual({ precision: 4, zoom: 20, center: { lat: 31.23, lng: 121.47 } })
    expect(geopointOptions({ options: { precision: 40, zoom: 0 } })).toMatchObject({ precision: 10, zoom: 1 })
    expect(geopointOptions({ options: { precision: 0 } }).precision).toBe(0)
    expect(geopointOptions({ options: { center: { lat: 200, lng: 0 } } }).center).toBeUndefined()
  })
})

describe('normaliseGeopoint', () => {
  it('keeps a latitude and a longitude that are numbers within their limits', () => {
    expect(normaliseGeopoint({ lat: 48.8566, lng: 2.3522 })).toEqual({ lat: 48.8566, lng: 2.3522 })
    expect(normaliseGeopoint({ lat: -90, lng: 180 })).toEqual({ lat: -90, lng: 180 })
    expect(normaliseGeopoint({ lat: 0, lng: 0 })).toEqual({ lat: 0, lng: 0 })
  })

  it('refuses anything else', () => {
    for (const value of [undefined, null, '', '1,2', [1, 2], { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: '1', lng: 2 }, { lat: 1 }, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }]) {
      expect(normaliseGeopoint(value), JSON.stringify(value)).toBeUndefined()
    }
  })
})

describe('writing coordinates', () => {
  it('rounds to the decimals asked', () => {
    expect(roundCoordinate(48.85660001, 6)).toBe(48.8566)
    expect(roundCoordinate(2.3522219, 4)).toBe(2.3522)
    expect(roundCoordinate(2.5, 0)).toBe(3)
    expect(roundCoordinate(-0.00000001, 6)).toBe(0)
  })

  it('writes a coordinate with no zeros at the end', () => {
    expect(formatCoordinate(48.8566)).toBe('48.8566')
    expect(formatCoordinate(2)).toBe('2')
    expect(formatCoordinate(-0.5)).toBe('-0.5')
    expect(formatCoordinate(NaN)).toBe('')
  })

  it('writes a point as a pair, and nothing for no point', () => {
    expect(formatGeopoint({ lat: 48.856601, lng: 2.352222 })).toBe('48.856601, 2.352222')
    expect(formatGeopoint({ lat: 48.856601, lng: 2.352222 }, 2)).toBe('48.86, 2.35')
    expect(formatGeopoint({ lat: 91, lng: 0 })).toBe('')
    expect(formatGeopoint(undefined)).toBe('')
  })
})

describe('parseCoordinate', () => {
  it('reads a decimal, with a point or a comma, with a sign', () => {
    expect(parseCoordinate('48.8566', 'lat')).toBe(48.8566)
    expect(parseCoordinate(' -2.35 ', 'lng')).toBe(-2.35)
    expect(parseCoordinate('+12', 'lat')).toBe(12)
    expect(parseCoordinate('48,8566', 'lat')).toBe(48.8566)
    expect(parseCoordinate('.5', 'lat')).toBe(0.5)
    expect(parseCoordinate('48.8566°', 'lat')).toBe(48.8566)
  })

  it('reads nothing for a text that is empty', () => {
    expect(parseCoordinate('', 'lat')).toBeUndefined()
    expect(parseCoordinate('   ', 'lng')).toBeUndefined()
    expect(parseCoordinate(null, 'lat')).toBeUndefined()
    expect(parseCoordinate(undefined, 'lat')).toBeUndefined()
  })

  it('reads the side as a letter, before or after', () => {
    expect(parseCoordinate('48.8566 N', 'lat')).toBe(48.8566)
    expect(parseCoordinate('48.8566S', 'lat')).toBe(-48.8566)
    expect(parseCoordinate('s 33.9', 'lat')).toBe(-33.9)
    expect(parseCoordinate('W2.35', 'lng')).toBe(-2.35)
    expect(parseCoordinate('2.35 E', 'lng')).toBe(2.35)
    expect(parseCoordinate('2.35° W', 'lng')).toBe(-2.35)
  })

  it('refuses the side of the other axis, and a side with a sign', () => {
    expect(parseCoordinate('48.8566 E', 'lat')).toBeNaN()
    expect(parseCoordinate('2.35 N', 'lng')).toBeNaN()
    expect(parseCoordinate('-48.8566 S', 'lat')).toBeNaN()
    expect(parseCoordinate('N -48', 'lat')).toBeNaN()
  })

  it('reads degrees, minutes and seconds', () => {
    expect(parseCoordinate('48°51\'24"N', 'lat')).toBeCloseTo(48.856667, 5)
    expect(parseCoordinate('2°21\'8"E', 'lng')).toBeCloseTo(2.352222, 5)
    expect(parseCoordinate('73°59\'W', 'lng')).toBeCloseTo(-73.983333, 5)
    expect(parseCoordinate('-48°30\'', 'lat')).toBeCloseTo(-48.5, 5)
    expect(parseCoordinate('48°', 'lat')).toBe(48)
    expect(parseCoordinate('48°51′24″N', 'lat')).toBeCloseTo(48.856667, 5)
    expect(parseCoordinate('48º51\'24\'\'N', 'lat')).toBeCloseTo(48.856667, 5)
  })

  it('refuses minutes or seconds that are 60 or more', () => {
    expect(parseCoordinate('48°60\'', 'lat')).toBeNaN()
    expect(parseCoordinate('48°10\'60"', 'lat')).toBeNaN()
  })

  it('refuses what is not a coordinate, and what is out of the world', () => {
    for (const text of ['abc', '48.8566, 2.3522', '48.8.5', '48 51', '1e3', '--5', '48.8566 N S', '12,3,4']) {
      expect(parseCoordinate(text, 'lat'), text).toBeNaN()
    }
    expect(parseCoordinate('90.0001', 'lat')).toBeNaN()
    expect(parseCoordinate('-91', 'lat')).toBeNaN()
    expect(parseCoordinate('180.5', 'lng')).toBeNaN()
    expect(parseCoordinate('90', 'lat')).toBe(90)
    expect(parseCoordinate('-180', 'lng')).toBe(-180)
    expect(parseCoordinate('91', 'lng')).toBe(91)
  })

  it('does not make a negative zero', () => {
    expect(Object.is(parseCoordinate('-0', 'lat'), 0)).toBe(true)
    expect(Object.is(parseCoordinate('0 S', 'lat'), 0)).toBe(true)
  })
})

describe('parsePair', () => {
  const paris = { lat: 48.8566, lng: 2.3522 }

  it('reads the pair that Google Maps copies, and its neighbours', () => {
    for (const text of ['48.8566, 2.3522', '48.8566,2.3522', '48.8566 2.3522', '(48.8566, 2.3522)', '[48.8566, 2.3522]', '  48.8566 ,  2.3522  ', '48,8566; 2,3522', '48,8566 ; 2,3522']) {
      expect(parsePair(text), text).toEqual(paris)
    }
    expect(parsePair('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 })
    expect(parsePair('48,8566, 2,3522')).toEqual(paris)
  })

  it('reads a pair with its sides, in either order', () => {
    expect(parsePair('N48.8566 E2.3522')).toEqual(paris)
    expect(parsePair('N 48.8566 E 2.3522')).toEqual(paris)
    expect(parsePair('48.8566 N 2.3522 E')).toEqual(paris)
    expect(parsePair('48.8566N, 2.3522E')).toEqual(paris)
    expect(parsePair('33.9 S 18.4 E')).toEqual({ lat: -33.9, lng: 18.4 })
    expect(parsePair('E 2.3522 N 48.8566')).toEqual(paris)
    expect(parsePair('2.3522 E, 48.8566 N')).toEqual(paris)
    expect(parsePair('40.7 N 74 W')).toEqual({ lat: 40.7, lng: -74 })
  })

  it('reads a pair in degrees, minutes and seconds', () => {
    const point = parsePair('48°51\'24"N 2°21\'8"E')
    expect(point.lat).toBeCloseTo(48.856667, 5)
    expect(point.lng).toBeCloseTo(2.352222, 5)
    expect(parsePair('48°51\'24"N, 2°21\'8"E').lng).toBeCloseTo(2.352222, 5)
  })

  it('reads nothing for what is not a pair', () => {
    for (const text of ['', '   ', '48.8566', 'hello', 'a, b', '48.8566, 2.3522, 10', '91, 0', '0, 181', '48.8566 N 2.3522 N', '1 2 3']) {
      expect(parsePair(text), text).toBeUndefined()
    }
    expect(parsePair(null)).toBeUndefined()
    expect(parsePair(undefined)).toBeUndefined()
  })
})

describe('validateGeopointText', () => {
  const t = key => TranslateService.get(key)

  it('is fine with both boxes empty, unless required', () => {
    expect(validateGeopointText({}, '', '')).toBe('')
    expect(validateGeopointText({ required: true }, '', ' ')).toBe(t('TL_FIELD_IS_REQUIRED'))
  })

  it('is fine with a latitude and a longitude', () => {
    expect(validateGeopointText({}, '48.8566', '2.3522')).toBe('')
    expect(validateGeopointText({ required: true }, '0', '0')).toBe('')
  })

  it('says which box is wrong', () => {
    expect(validateGeopointText({}, 'x', '2')).toBe(t('TL_INVALID_LATITUDE'))
    expect(validateGeopointText({}, '95', '2')).toBe(t('TL_INVALID_LATITUDE'))
    expect(validateGeopointText({}, '48', '200')).toBe(t('TL_INVALID_LONGITUDE'))
    expect(validateGeopointText({}, '48', '2 N')).toBe(t('TL_INVALID_LONGITUDE'))
  })

  it('wants both, when one is filled', () => {
    expect(validateGeopointText({}, '48', '')).toBe(t('TL_GEOPOINT_BOTH'))
    expect(validateGeopointText({}, '', '2')).toBe(t('TL_GEOPOINT_BOTH'))
  })

  it('has its words in the dictionary', () => {
    expect(t('TL_INVALID_LATITUDE')).not.toBe('TL_INVALID_LATITUDE')
    expect(t('TL_INVALID_LONGITUDE')).not.toBe('TL_INVALID_LONGITUDE')
    expect(t('TL_GEOPOINT_BOTH')).not.toBe('TL_GEOPOINT_BOTH')
    expect(t('TL_INVALID_GEOPOINT')).not.toBe('TL_INVALID_GEOPOINT')
  })
})

describe('validateGeopoint', () => {
  it('accepts a point, and nothing unless required', () => {
    expect(validateGeopoint({}, { lat: 1, lng: 2 })).toBeNull()
    expect(validateGeopoint({}, undefined)).toBeNull()
    expect(validateGeopoint({}, '')).toBeNull()
    expect(validateGeopoint({ required: true }, undefined)).toBe(TranslateService.get('TL_FIELD_IS_REQUIRED'))
    expect(validateGeopoint({ required: true }, null)).toBe(TranslateService.get('TL_FIELD_IS_REQUIRED'))
  })

  it('refuses what is not a point', () => {
    for (const value of [{ lat: 100, lng: 0 }, { lat: 'a', lng: 0 }, 'x', [1, 2], { lat: 1 }]) {
      expect(validateGeopoint({}, value), JSON.stringify(value)).toBe(TranslateService.get('TL_INVALID_GEOPOINT'))
    }
  })
})
