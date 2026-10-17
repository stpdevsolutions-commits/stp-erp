// Se ejecuta con: npx -y tsx --test lib/maps-links.test.ts   (desde stp-landing)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidCoords,
  roundCoord,
  formatCoords,
  parseCoordInput,
  mapLinks,
  geolocationErrorMessage,
} from './maps-links'

test('isValidCoords: rangos y tipos', () => {
  assert.equal(isValidCoords(18.486058, -69.931212), true)
  assert.equal(isValidCoords(0, 0), true)
  assert.equal(isValidCoords(90, 180), true)
  assert.equal(isValidCoords(-90, -180), true)
  assert.equal(isValidCoords(90.0001, 0), false)
  assert.equal(isValidCoords(0, 180.0001), false)
  assert.equal(isValidCoords(NaN, 0), false)
  assert.equal(isValidCoords(Infinity, 0), false)
  assert.equal(isValidCoords('18', '-69'), false)
  assert.equal(isValidCoords(null, undefined), false)
})

test('roundCoord / formatCoords: 6 decimales', () => {
  assert.equal(roundCoord(18.12345678), 18.123457)
  assert.equal(formatCoords(18.4860581234, -69.9312129), '18.486058,-69.931213')
  assert.equal(formatCoords(18, -69), '18.000000,-69.000000')
})

test('parseCoordInput: coma decimal, espacios y basura', () => {
  assert.equal(parseCoordInput(' 18,486 '), 18.486)
  assert.equal(parseCoordInput('-69.93'), -69.93)
  assert.equal(parseCoordInput('+5'), 5)
  assert.equal(parseCoordInput('.5'), 0.5)
  assert.equal(parseCoordInput(''), null)
  assert.equal(parseCoordInput('   '), null)
  assert.equal(parseCoordInput('abc'), null)
  assert.equal(parseCoordInput('1.2.3'), null)
  assert.equal(parseCoordInput('1e5'), null)
  assert.equal(parseCoordInput(null), null)
  assert.equal(parseCoordInput(undefined), null)
})

test('mapLinks: URLs exactas', () => {
  const l = mapLinks(18.486058, -69.931212)
  assert.equal(l.google, 'https://www.google.com/maps/dir/?api=1&destination=18.486058,-69.931212')
  assert.equal(l.waze, 'https://waze.com/ul?ll=18.486058,-69.931212&navigate=yes')
  assert.equal(l.apple, 'https://maps.apple.com/?daddr=18.486058,-69.931212')
})

test('geolocationErrorMessage: un mensaje en español por código', () => {
  assert.match(geolocationErrorMessage(1), /permiso/)
  assert.match(geolocationErrorMessage(2), /GPS/)
  assert.match(geolocationErrorMessage(3), /tiempo/)
  assert.match(geolocationErrorMessage(99), /No se pudo/)
  assert.match(geolocationErrorMessage(1, false), /HTTPS/)
})
