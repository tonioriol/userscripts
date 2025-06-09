import { franc } from 'franc'
import { iso6393, iso6393To1 } from 'iso-639-3'

// Set up globals that the userscript expects
global.francDetect = franc
global.iso6393To1 = iso6393To1

// Mock LANGUAGE_CONFIG for tests
global.LANGUAGE_CONFIG = {
  targetLang: 'ca',
  altLang: 'va'
}

// Mock DETECTION_CONFIG for tests
global.DETECTION_CONFIG = {
  urlParams: ["lang", "ln", "hl"]
}

// Create and provide the langMap globally
global.langMap = new Map(
  iso6393.flatMap((lang) =>
    [lang.iso6391, lang.iso6392B, lang.iso6392T]
      .filter(Boolean)
      .map((code) => [code.toLowerCase(), lang])
  )
)