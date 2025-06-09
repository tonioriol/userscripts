import { describe, it, expect } from 'vitest'
import {
  replaceLanguageCodes,
  injectPath,
  injectSubdomain,
  injectParams,
  isTargetLanguage
} from './golocale.user.js'

describe('GoLocale URL Strategies', () => {
  
  describe('Strategy 1: Replace Language Codes', () => {
    it('should replace /es/ with /ca/', () => {
      expect(replaceLanguageCodes('https://example.com/es/page', 'ca'))
        .toBe('https://example.com/ca/page')
    })

    it('should replace /fr/ with /ca/', () => {
      expect(replaceLanguageCodes('https://example.com/fr/page', 'ca'))
        .toBe('https://example.com/ca/page')
    })

    it('should replace subdomain language codes (es at start)', () => {
      expect(replaceLanguageCodes('https://es.wikipedia.org/wiki/test', 'ca'))
        .toBe('https://ca.wikipedia.org/wiki/test')
    })

    it('should NOT replace when language code follows a dot', () => {
      expect(replaceLanguageCodes('https://subdomain.es.example.org/test', 'ca'))
        .toBe('https://subdomain.es.example.org/test')
    })

    it('should replace multiple language codes', () => {
      expect(replaceLanguageCodes('https://example.com/en/docs/fr/guide', 'ca'))
        .toBe('https://example.com/ca/docs/ca/guide')
    })

    it('should preserve ISO format - replace ISO 639-1 with ISO 639-1', () => {
      expect(replaceLanguageCodes('https://example.com/es/page', 'fr'))
        .toBe('https://example.com/fr/page')
    })

    it('should preserve ISO format - replace ISO 639-2 with ISO 639-2', () => {
      expect(replaceLanguageCodes('https://example.com/spa/page', 'fr'))
        .toBe('https://example.com/fre/page')
    })

    it('should replace language codes in query parameters', () => {
      expect(replaceLanguageCodes('https://site.com/page?lang=es', 'ca'))
        .toBe('https://site.com/page?lang=ca')
    })

    it('should replace language codes in hash fragments', () => {
      expect(replaceLanguageCodes('https://site.com/page#section-es', 'ca'))
        .toBe('https://site.com/page#section-ca')
    })

    it('should exclude file extensions correctly', () => {
      expect(replaceLanguageCodes('https://site.com/page.html', 'ca'))
        .toBe('https://site.com/page.html')
      expect(replaceLanguageCodes('https://example.com/es/page.php', 'ca'))
        .toBe('https://example.com/ca/page.php')
    })

  })

  describe('Strategy 2: Inject Path', () => {
    it('should inject language at beginning of path', () => {
      const result = injectPath('https://example.com/page', 'ca')
      expect(result).toBe('https://example.com/ca/page')
    })

    it('should handle trailing slash correctly', () => {
      const result = injectPath('https://example.com/page/', 'ca')
      expect(result).toBe('https://example.com/ca/page/')
    })

    it('should preserve query parameters', () => {
      const result = injectPath('https://example.com/page?q=test', 'ca')
      expect(result).toBe('https://example.com/ca/page?q=test')
    })
  })

  describe('Strategy 3: Inject Subdomain', () => {
    it('should add language subdomain', () => {
      expect(injectSubdomain('https://example.com/page', 'ca'))
        .toBe('https://ca.example.com/page')
    })

    it('should work with http', () => {
      expect(injectSubdomain('http://test.org/path', 'ca'))
        .toBe('http://ca.test.org/path')
    })
  })

  describe('Strategy 4: Inject Parameters', () => {
    it('should add all language parameters', () => {
      const result = injectParams('https://example.com/page', 'ca')
      expect(result).toEqual([
        'https://example.com/page?lang=ca',
        'https://example.com/page?ln=ca',
        'https://example.com/page?hl=ca'
      ])
    })

    it('should preserve existing parameters', () => {
      const result = injectParams('https://example.com/page?existing=value', 'ca')
      expect(result).toEqual([
        'https://example.com/page?existing=value&lang=ca',
        'https://example.com/page?existing=value&ln=ca',
        'https://example.com/page?existing=value&hl=ca'
      ])
    })
  })

  describe('isTargetLanguage', () => {
    it('should detect target language from HTML lang attribute', () => {
      const htmlWithLangAttr = '<html lang="ca"><head><title>Test</title></head><body>Content</body></html>'
      expect(isTargetLanguage(htmlWithLangAttr)).toBe(true)
    })

    it('should detect target language from HTML lang attribute with single quotes', () => {
      const htmlWithLangAttr = '<html lang=\'ca\'><head><title>Test</title></head><body>Content</body></html>'
      expect(isTargetLanguage(htmlWithLangAttr)).toBe(true)
    })

    it('should return false for different language in HTML lang attribute', () => {
      const htmlWithDifferentLang = '<html lang="es"><head><title>Test</title></head><body>Content</body></html>'
      expect(isTargetLanguage(htmlWithDifferentLang)).toBe(false)
    })

    it('should detect target language from Catalan text content when no lang attribute', () => {
      // Use actual Catalan text that franc should detect as Catalan
      const htmlWithCatalanContent = '<html><head><title>Pàgina de prova</title></head><body>Aquest és un text en català amb moltes paraules catalanes com ara: govern, llengua, país, cultura, història, literatura, música, art, ciència, tecnologia, educació, universitat, biblioteca, hospital, restaurant, platja, muntanya, riu, mar, sol, lluna, estrella, núvol, pluja, vent, fred, calor, primavera, estiu, tardor, hivern.</body></html>'
      expect(isTargetLanguage(htmlWithCatalanContent)).toBe(true)
    })

    it('should return false for English content without lang attribute', () => {
      const htmlWithEnglishContent = '<html><head><title>English Title</title></head><body>This is English content with many English words like: government, language, country, culture, history, literature, music, art, science, technology, education, university, library, hospital, restaurant, beach, mountain, river, sea, sun, moon, star, cloud, rain, wind, cold, heat, spring, summer, autumn, winter.</body></html>'
      expect(isTargetLanguage(htmlWithEnglishContent)).toBe(false)
    })

    it('should handle malformed HTML gracefully', () => {
      const malformedHtml = '<html><head><title>Test'
      expect(isTargetLanguage(malformedHtml)).toBe(false)
    })
  })

  describe('Generic Language Support', () => {
    it('should work with French as target language', () => {
      // Mock the LANGUAGE_CONFIG for testing
      const originalConfig = global.LANGUAGE_CONFIG
      global.LANGUAGE_CONFIG = { targetLang: "fr", altLang: null }
      
      expect(replaceLanguageCodes('https://example.com/en/page', 'fr'))
        .toBe('https://example.com/fr/page')
      
      // Restore original config
      global.LANGUAGE_CONFIG = originalConfig
    })

    it('should work with German as target language', () => {
      expect(replaceLanguageCodes('https://example.com/en/page', 'de'))
        .toBe('https://example.com/de/page')
    })

    it('should work with any ISO language code', () => {
      expect(replaceLanguageCodes('https://example.com/it/page', 'pt'))
        .toBe('https://example.com/pt/page')
    })
  })
})